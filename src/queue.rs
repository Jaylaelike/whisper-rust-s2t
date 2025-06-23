use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use actix::prelude::*;
use actix_web_actors::ws;
use redis::{Client as RedisClient, aio::ConnectionManager, AsyncCommands};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use chrono::{DateTime, Utc};

// Custom error type that is Send + Sync
#[derive(Debug)]
pub struct QueueError(pub String);

impl std::fmt::Display for QueueError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "Queue error: {}", self.0)
    }
}

impl std::error::Error for QueueError {}

impl From<redis::RedisError> for QueueError {
    fn from(err: redis::RedisError) -> Self {
        QueueError(err.to_string())
    }
}

impl From<serde_json::Error> for QueueError {
    fn from(err: serde_json::Error) -> Self {
        QueueError(err.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    Transcription,
    RiskAnalysis,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum TaskStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRequest {
    pub id: String,
    pub task_type: TaskType,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub priority: i32,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult {
    pub id: String,
    pub status: TaskStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub result: Option<serde_json::Value>,
    pub error: Option<String>,
    pub progress: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub pending_count: usize,
    pub processing_count: usize,
    pub completed_count: usize,
    pub failed_count: usize,
    pub total_tasks: usize,
}

#[derive(Message, Clone)]
#[rtype(result = "()")]
pub struct WebSocketMessage {
    pub message: String,
}

#[derive(Message)]
#[rtype(result = "Result<String, String>")]
pub struct SubmitTask {
    pub task_type: TaskType,
    pub payload: serde_json::Value,
    pub priority: Option<i32>,
}

#[derive(Message)]
#[rtype(result = "Result<Option<TaskResult>, String>")]
pub struct GetTaskStatus {
    pub task_id: String,
}

#[derive(Message)]
#[rtype(result = "Result<QueueStats, String>")]
pub struct GetQueueStats;

#[derive(Message)]
#[rtype(result = "Result<Vec<TaskResult>, String>")]
pub struct GetTaskHistory {
    pub limit: Option<usize>,
    pub status_filter: Option<TaskStatus>,
}

pub struct TaskQueue {
    redis_manager: ConnectionManager,
    task_results: Arc<RwLock<HashMap<String, TaskResult>>>,
    websocket_sessions: Arc<Mutex<HashMap<Uuid, Recipient<WebSocketMessage>>>>,
    processing_tasks: Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>,
}

impl TaskQueue {
    pub async fn new(redis_url: &str) -> Result<Self, QueueError> {
        let client = RedisClient::open(redis_url)?;
        let redis_manager = ConnectionManager::new(client).await?;
        
        let queue = Self {
            redis_manager,
            task_results: Arc::new(RwLock::new(HashMap::new())),
            websocket_sessions: Arc::new(Mutex::new(HashMap::new())),
            processing_tasks: Arc::new(Mutex::new(HashMap::new())),
        };
        
        // Restore state from Redis on startup
        queue.restore_state().await?;
        
        Ok(queue)
    }
    
    async fn restore_state(&self) -> Result<(), QueueError> {
        let mut conn = self.redis_manager.clone();
        
        // Get all task results from Redis
        let task_keys: Vec<String> = conn.keys("task_result:*").await?;
        let mut task_results = self.task_results.write().await;
        
        for key in task_keys {
            let result_data: String = conn.get(&key).await.unwrap_or_default();
            if !result_data.is_empty() {
                if let Ok(task_result) = serde_json::from_str::<TaskResult>(&result_data) {
                    task_results.insert(task_result.id.clone(), task_result);
                }
            }
        }
        
        // Resume processing tasks that were interrupted
        let processing_tasks: Vec<TaskResult> = task_results
            .values()
            .filter(|t| matches!(t.status, TaskStatus::Processing))
            .cloned()
            .collect();
        
        drop(task_results);
        
        for mut task in processing_tasks {
            log::info!("Resuming interrupted task: {}", task.id);
            task.status = TaskStatus::Pending;
            task.updated_at = Utc::now();
            self.save_task_result(&task).await?;
            self.enqueue_task_request(&task.id).await?;
        }
        
        Ok(())
    }
    
    async fn save_task_result(&self, task_result: &TaskResult) -> Result<(), QueueError> {
        let mut conn = self.redis_manager.clone();
        let key = format!("task_result:{}", task_result.id);
        let data = serde_json::to_string(task_result)?;
        
        conn.set::<_, _, ()>(&key, data).await?;
        
        // Also update in-memory cache
        let mut task_results = self.task_results.write().await;
        task_results.insert(task_result.id.clone(), task_result.clone());
        
        Ok(())
    }
    
    async fn get_task_result(&self, task_id: &str) -> Result<Option<TaskResult>, QueueError> {
        // First check in-memory cache
        {
            let task_results = self.task_results.read().await;
            if let Some(task_result) = task_results.get(task_id) {
                return Ok(Some(task_result.clone()));
            }
        }
        
        // If not in cache, load from Redis
        let mut conn = self.redis_manager.clone();
        let key = format!("task_result:{}", task_id);
        let data: Result<String, redis::RedisError> = conn.get(&key).await;
        
        match data {
            Ok(data) => {
                let task_result: TaskResult = serde_json::from_str(&data)?;
                
                // Update cache
                let mut task_results = self.task_results.write().await;
                task_results.insert(task_id.to_string(), task_result.clone());
                
                Ok(Some(task_result))
            }
            Err(_) => {
                // Key doesn't exist or other error
                Ok(None)
            }
        }
    }
    
    async fn enqueue_task_request(&self, task_id: &str) -> Result<(), QueueError> {
        let mut conn = self.redis_manager.clone();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        // Use sorted set for priority queue
        conn.zadd::<_, _, _, ()>("task_queue", task_id, timestamp as f64).await?;
        
        Ok(())
    }
    
    async fn dequeue_task_request(&self) -> Result<Option<String>, QueueError> {
        let mut conn = self.redis_manager.clone();
        
        // Get the oldest task (lowest score)
        let result: Vec<String> = conn.zrange("task_queue", 0, 0).await?;
        
        if let Some(task_id) = result.first() {
            // Remove from queue
            conn.zrem::<_, _, ()>("task_queue", task_id).await?;
            Ok(Some(task_id.clone()))
        } else {
            Ok(None)
        }
    }
    
    async fn broadcast_to_websockets(&self, message: &str) {
        let sessions = self.websocket_sessions.lock().await;
        let msg = WebSocketMessage {
            message: message.to_string(),
        };
        
        for (_, recipient) in sessions.iter() {
            let _ = recipient.do_send(msg.clone());
        }
    }
    
    pub async fn add_websocket_session(&self, session_id: Uuid, addr: Recipient<WebSocketMessage>) {
        let mut sessions = self.websocket_sessions.lock().await;
        sessions.insert(session_id, addr);
    }
    
    pub async fn remove_websocket_session(&self, session_id: &Uuid) {
        let mut sessions = self.websocket_sessions.lock().await;
        sessions.remove(session_id);
    }
    
    pub async fn start_task_processor(&self) {
        let queue_clone = self.clone();
        
        tokio::spawn(async move {
            loop {
                match queue_clone.process_next_task().await {
                    Ok(processed) => {
                        if !processed {
                            // No tasks to process, wait a bit
                            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                        }
                    }
                    Err(e) => {
                        log::error!("Error processing task: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_millis(5000)).await;
                    }
                }
            }
        });
    }
    
    async fn process_next_task(&self) -> Result<bool, QueueError> {
        if let Some(task_id) = self.dequeue_task_request().await? {
            let task_results = self.task_results.read().await;
            
            if let Some(mut task_result) = task_results.get(&task_id).cloned() {
                drop(task_results);
                
                // Update status to processing
                task_result.status = TaskStatus::Processing;
                task_result.started_at = Some(Utc::now());
                task_result.updated_at = Utc::now();
                self.save_task_result(&task_result).await?;
                
                // Broadcast status update
                let status_msg = serde_json::json!({
                    "type": "task_status_update",
                    "task_id": task_result.id,
                    "status": task_result.status,
                    "progress": task_result.progress
                });
                self.broadcast_to_websockets(&status_msg.to_string()).await;
                
                // Process the task in background
                let queue_clone = self.clone();
                let handle = tokio::spawn(async move {
                    queue_clone.execute_task(task_result).await;
                });
                
                // Store the handle for potential cancellation
                let mut processing_tasks = self.processing_tasks.lock().await;
                processing_tasks.insert(task_id, handle);
                
                Ok(true)
            } else {
                log::warn!("Task {} not found in results cache", task_id);
                Ok(false)
            }
        } else {
            Ok(false)
        }
    }
    
    async fn execute_task(&self, mut task_result: TaskResult) {
        let task_id = task_result.id.clone();
        
        // Get the original request
        let mut conn = self.redis_manager.clone();
        let request_key = format!("task_request:{}", task_id);
        let request_data: Result<String, redis::RedisError> = conn.get(&request_key).await;
        
        let result = if let Ok(request_data) = request_data {
            if let Ok(request) = serde_json::from_str::<TaskRequest>(&request_data) {
                self.process_task(&request, &mut task_result).await
            } else {
                Err("Failed to parse task request".to_string())
            }
        } else {
            Err("Task request not found".to_string())
        };
        
        // Update final status
        match result {
            Ok(result_data) => {
                task_result.status = TaskStatus::Completed;
                task_result.result = Some(result_data);
                task_result.progress = 100.0;
            }
            Err(error) => {
                task_result.status = TaskStatus::Failed;
                task_result.error = Some(error);
            }
        }
        
        task_result.completed_at = Some(Utc::now());
        task_result.updated_at = Utc::now();
        
        // Save final result
        if let Err(e) = self.save_task_result(&task_result).await {
            log::error!("Failed to save task result: {}", e);
        }
        
        // Clean up request data
        let _: Result<(), redis::RedisError> = conn.del(&request_key).await;
        
        // Remove from processing tasks
        let mut processing_tasks = self.processing_tasks.lock().await;
        processing_tasks.remove(&task_id);
        
        // Broadcast completion
        let status_msg = serde_json::json!({
            "type": "task_completed",
            "task_id": task_result.id,
            "status": task_result.status,
            "result": task_result.result,
            "error": task_result.error
        });
        self.broadcast_to_websockets(&status_msg.to_string()).await;
    }
    
    async fn process_task(&self, request: &TaskRequest, task_result: &mut TaskResult) -> Result<serde_json::Value, String> {
        match request.task_type {
            TaskType::Transcription => {
                self.process_transcription_task(&request.payload, task_result).await
            }
            TaskType::RiskAnalysis => {
                self.process_risk_analysis_task(&request.payload, task_result).await
            }
        }
    }
    
    async fn process_transcription_task(&self, payload: &serde_json::Value, task_result: &mut TaskResult) -> Result<serde_json::Value, String> {
        // Extract parameters from payload
        let file_path = payload.get("file_path")
            .and_then(|v| v.as_str())
            .ok_or("Missing file_path in payload")?;
        
        let backend = payload.get("backend")
            .and_then(|v| v.as_str())
            .unwrap_or("auto");
        
        let language = payload.get("language")
            .and_then(|v| v.as_str());
        
        // Update progress
        task_result.progress = 10.0;
        let _ = self.save_task_result(task_result).await;
        
        // Broadcast progress update
        let progress_msg = serde_json::json!({
            "type": "task_progress",
            "task_id": task_result.id,
            "progress": task_result.progress
        });
        self.broadcast_to_websockets(&progress_msg.to_string()).await;
        
        // Update progress before starting heavy computation
        task_result.progress = 20.0;
        let _ = self.save_task_result(task_result).await;
        
        let progress_msg = serde_json::json!({
            "type": "task_progress", 
            "task_id": task_result.id,
            "progress": task_result.progress
        });
        self.broadcast_to_websockets(&progress_msg.to_string()).await;
        
        // Create a channel for communication
        let (tx, mut rx) = tokio::sync::mpsc::channel(1);
        
        // Clone necessary data for the thread
        let file_path_owned = file_path.to_string();
        let backend_owned = backend.to_string();
        let language_owned = language.map(|s| s.to_string());
        let queue_clone = self.clone();
        let task_id = task_result.id.clone();
        
        // Run transcription in a separate thread to avoid blocking the actor
        std::thread::spawn(move || {
            // Create a new Tokio runtime for this thread
            let rt = tokio::runtime::Runtime::new().unwrap();
            let result = rt.block_on(async {
                crate::transcribe_audio_file(&file_path_owned, language_owned.as_deref(), &backend_owned).await
            });
            
            // Send result back
            rt.block_on(async {
                let _ = tx.send(result).await;
            });
        });
        
        // Wait for result while periodically updating progress and allowing other tasks to run
        let mut progress = 30.0f64;
        let progress_increment = 60.0f64 / 30.0f64; // Spread remaining 60% over ~30 seconds max
        
        loop {
            // Check if we have a result (non-blocking)
            match tokio::time::timeout(tokio::time::Duration::from_secs(1), rx.recv()).await {
                Ok(Some(result)) => {
                    // Got the result
                    match result {
                        Ok(transcription_result) => {
                            task_result.progress = 100.0;
                            return Ok(transcription_result);
                        }
                        Err(e) => {
                            return Err(format!("Transcription failed: {}", e));
                        }
                    }
                }
                Ok(None) => {
                    // Channel closed without result - error
                    return Err("Transcription task failed unexpectedly".to_string());
                }
                Err(_) => {
                    // Timeout - continue waiting but update progress
                    progress = (progress + progress_increment).min(90.0);
                    
                    // Update progress in Redis
                    if let Ok(mut current_task) = self.get_task_result(&task_id).await {
                        if let Some(ref mut task) = current_task {
                            task.progress = progress as f32;
                            let _ = self.save_task_result(task).await;
                            
                            // Broadcast progress update
                            let progress_msg = serde_json::json!({
                                "type": "task_progress",
                                "task_id": task_id,
                                "progress": progress as f32
                            });
                            self.broadcast_to_websockets(&progress_msg.to_string()).await;
                        }
                    }
                    
                    // Yield control to allow other tasks to process
                    tokio::task::yield_now().await;
                }
            }
        }
    }
    
    async fn process_risk_analysis_task(&self, payload: &serde_json::Value, task_result: &mut TaskResult) -> Result<serde_json::Value, String> {
        let text = payload.get("text")
            .and_then(|v| v.as_str())
            .ok_or("Missing text in payload")?;
        
        // Update progress
        task_result.progress = 20.0;
        let _ = self.save_task_result(task_result).await;
        
        // Broadcast progress update
        let progress_msg = serde_json::json!({
            "type": "task_progress",
            "task_id": task_result.id,
            "progress": task_result.progress
        });
        self.broadcast_to_websockets(&progress_msg.to_string()).await;
        
        // Call the actual risk analysis function
        match crate::analyze_risk(text).await {
            Ok(result) => {
                task_result.progress = 100.0;
                Ok(result)
            }
            Err(e) => {
                Err(format!("Risk analysis failed: {}", e))
            }
        }
    }
}

impl Clone for TaskQueue {
    fn clone(&self) -> Self {
        Self {
            redis_manager: self.redis_manager.clone(),
            task_results: Arc::clone(&self.task_results),
            websocket_sessions: Arc::clone(&self.websocket_sessions),
            processing_tasks: Arc::clone(&self.processing_tasks),
        }
    }
}

impl Actor for TaskQueue {
    type Context = Context<Self>;
    
    fn started(&mut self, _ctx: &mut Self::Context) {
        log::info!("TaskQueue actor started");
    }
}

impl Handler<SubmitTask> for TaskQueue {
    type Result = ResponseActFuture<Self, Result<String, String>>;
    
    fn handle(&mut self, msg: SubmitTask, _ctx: &mut Self::Context) -> Self::Result {
        let task_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        
        let task_request = TaskRequest {
            id: task_id.clone(),
            task_type: msg.task_type.clone(),
            created_at: now,
            updated_at: now,
            priority: msg.priority.unwrap_or(0),
            payload: msg.payload,
        };
        
        let task_result = TaskResult {
            id: task_id.clone(),
            status: TaskStatus::Pending,
            created_at: now,
            updated_at: now,
            started_at: None,
            completed_at: None,
            result: None,
            error: None,
            progress: 0.0,
        };
        
        let queue_clone = self.clone();
        
        Box::pin(async move {
            // Save task request and result
            let mut conn = queue_clone.redis_manager.clone();
            let request_key = format!("task_request:{}", task_id);
            let request_data = serde_json::to_string(&task_request)
                .map_err(|e| format!("Failed to serialize task request: {}", e))?;
            
            conn.set::<_, _, ()>(&request_key, request_data).await
                .map_err(|e| format!("Failed to save task request: {}", e))?;
            
            queue_clone.save_task_result(&task_result).await
                .map_err(|e| format!("Failed to save task result: {}", e))?;
            
            // Add to queue
            queue_clone.enqueue_task_request(&task_id).await
                .map_err(|e| format!("Failed to enqueue task: {}", e))?;
            
            // Broadcast new task
            let new_task_msg = serde_json::json!({
                "type": "new_task",
                "task_id": task_id,
                "task_type": task_request.task_type,
                "status": task_result.status
            });
            queue_clone.broadcast_to_websockets(&new_task_msg.to_string()).await;
            
            Ok(task_id)
        }.into_actor(self))
    }
}

impl Handler<GetTaskStatus> for TaskQueue {
    type Result = ResponseActFuture<Self, Result<Option<TaskResult>, String>>;
    
    fn handle(&mut self, msg: GetTaskStatus, _ctx: &mut Self::Context) -> Self::Result {
        let task_results = Arc::clone(&self.task_results);
        
        Box::pin(async move {
            let task_results = task_results.read().await;
            Ok(task_results.get(&msg.task_id).cloned())
        }.into_actor(self))
    }
}

impl Handler<GetQueueStats> for TaskQueue {
    type Result = ResponseActFuture<Self, Result<QueueStats, String>>;
    
    fn handle(&mut self, _msg: GetQueueStats, _ctx: &mut Self::Context) -> Self::Result {
        let task_results = Arc::clone(&self.task_results);
        let redis_manager = self.redis_manager.clone();
        
        Box::pin(async move {
            let task_results = task_results.read().await;
            
            let mut pending_count = 0;
            let mut processing_count = 0;
            let mut completed_count = 0;
            let mut failed_count = 0;
            
            for task in task_results.values() {
                match task.status {
                    TaskStatus::Pending => pending_count += 1,
                    TaskStatus::Processing => processing_count += 1,
                    TaskStatus::Completed => completed_count += 1,
                    TaskStatus::Failed => failed_count += 1,
                    TaskStatus::Cancelled => failed_count += 1,
                }
            }
            
            // Also count queued tasks
            let mut conn = redis_manager.clone();
            let queue_size: usize = conn.zcard("task_queue").await.unwrap_or(0);
            pending_count += queue_size;
            
            let total_tasks = task_results.len();
            
            Ok(QueueStats {
                pending_count,
                processing_count,
                completed_count,
                failed_count,
                total_tasks,
            })
        }.into_actor(self))
    }
}

impl Handler<GetTaskHistory> for TaskQueue {
    type Result = ResponseActFuture<Self, Result<Vec<TaskResult>, String>>;
    
    fn handle(&mut self, msg: GetTaskHistory, _ctx: &mut Self::Context) -> Self::Result {
        let task_results = Arc::clone(&self.task_results);
        
        Box::pin(async move {
            let task_results = task_results.read().await;
            let mut tasks: Vec<TaskResult> = task_results.values().cloned().collect();
            
            // Filter by status if specified
            if let Some(status_filter) = msg.status_filter {
                tasks.retain(|t| t.status == status_filter);
            }
            
            // Sort by updated_at desc
            tasks.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            
            // Apply limit if specified
            if let Some(limit) = msg.limit {
                tasks.truncate(limit);
            }
            
            Ok(tasks)
        }.into_actor(self))
    }
}

// WebSocket session actor
pub struct WebSocketSession {
    pub id: Uuid,
    pub queue_addr: Addr<TaskQueue>,
}

impl Actor for WebSocketSession {
    type Context = ws::WebsocketContext<Self>;
    
    fn started(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address().recipient();
        let queue_addr = self.queue_addr.clone();
        let session_id = self.id;
        
        tokio::spawn(async move {
            let _ = queue_addr.send(AddWebSocketSession { session_id, addr }).await;
        });
    }
    
    fn stopped(&mut self, _ctx: &mut Self::Context) {
        let queue_addr = self.queue_addr.clone();
        let session_id = self.id;
        
        tokio::spawn(async move {
            let _ = queue_addr.send(RemoveWebSocketSession { session_id }).await;
        });
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(text)) => {
                // Handle incoming WebSocket messages if needed
                log::debug!("WebSocket message received: {}", text);
            }
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => {}
        }
    }
}

impl Handler<WebSocketMessage> for WebSocketSession {
    type Result = ();
    
    fn handle(&mut self, msg: WebSocketMessage, ctx: &mut Self::Context) {
        ctx.text(msg.message);
    }
}

#[derive(Message)]
#[rtype(result = "()")]
struct AddWebSocketSession {
    session_id: Uuid,
    addr: Recipient<WebSocketMessage>,
}

#[derive(Message)]
#[rtype(result = "()")]
struct RemoveWebSocketSession {
    session_id: Uuid,
}

impl Handler<AddWebSocketSession> for TaskQueue {
    type Result = ResponseActFuture<Self, ()>;
    
    fn handle(&mut self, msg: AddWebSocketSession, _ctx: &mut Self::Context) -> Self::Result {
        let websocket_sessions = Arc::clone(&self.websocket_sessions);
        
        Box::pin(async move {
            let mut sessions = websocket_sessions.lock().await;
            sessions.insert(msg.session_id, msg.addr);
        }.into_actor(self))
    }
}

impl Handler<RemoveWebSocketSession> for TaskQueue {
    type Result = ResponseActFuture<Self, ()>;
    
    fn handle(&mut self, msg: RemoveWebSocketSession, _ctx: &mut Self::Context) -> Self::Result {
        let websocket_sessions = Arc::clone(&self.websocket_sessions);
        
        Box::pin(async move {
            let mut sessions = websocket_sessions.lock().await;
            sessions.remove(&msg.session_id);
        }.into_actor(self))
    }
}

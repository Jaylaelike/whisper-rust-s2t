use actix_web::{web, App, HttpResponse, HttpServer, Result, middleware::Logger, error::ErrorBadRequest};
use actix_web_actors::ws;
use actix_multipart::Multipart;
use futures_util::TryStreamExt;
use serde_json::json;
use clap::{Arg, Command};
use std::io::Write;
use tempfile::NamedTempFile;
use uuid::Uuid;
use serde::{Deserialize, Serialize};
use actix::prelude::*;

// Import our queue system and main functions
use thai_transcriber::queue::*;

// OpenAI Whisper format structures
#[derive(Serialize, Deserialize, Debug, Clone)]
struct WhisperWord {
    text: String,
    start: f64,
    end: f64,
    confidence: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct WhisperSegment {
    id: i32,
    seek: i32,
    start: f64,
    end: f64,
    text: String,
    tokens: Vec<i32>,
    temperature: f64,
    avg_logprob: f64,
    compression_ratio: f64,
    no_speech_prob: f64,
    confidence: f64,
    words: Vec<WhisperWord>,
}

#[derive(Serialize, Deserialize, Debug)]
struct WhisperResult {
    text: String,
    segments: Vec<WhisperSegment>,
    language: String,
}

// Server state to hold the queue system
#[derive(Clone)]
struct AppState {
    task_queue: Addr<TaskQueue>,
}

// Request/response structures
#[derive(serde::Deserialize)]
struct TranscribeRequest {
    language: Option<String>,
    backend: Option<String>, // "cpu", "gpu", "coreml", "auto"
    chunking: Option<bool>,
    risk_analysis: Option<bool>, // Enable risk detection
    priority: Option<i32>, // Queue priority
}

#[derive(serde::Deserialize)]
struct RiskAnalysisRequest {
    text: String,
    priority: Option<i32>, // Queue priority
}

// Simple health check endpoint
async fn health_check(data: web::Data<AppState>) -> Result<HttpResponse> {
    // Get queue statistics
    let queue_stats = match data.task_queue.send(GetQueueStats).await {
        Ok(Ok(stats)) => Some(stats),
        _ => None,
    };
    
    Ok(HttpResponse::Ok().json(json!({
        "status": "healthy",
        "service": "whisper-transcription-api-with-queue",
        "version": "0.2.0",
        "timestamp": chrono::Utc::now(),
        "queue_stats": queue_stats
    })))
}

// Get supported languages endpoint
async fn get_supported_languages() -> Result<HttpResponse> {
    let languages = json!({
        "supported_languages": {
            "th": "Thai",
            "en": "English", 
            "zh": "Chinese",
            "ja": "Japanese",
            "ko": "Korean",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ru": "Russian",
            "ar": "Arabic",
            "hi": "Hindi",
            "auto": "Auto-detect"
        },
        "note": "Language detection quality depends on the model. 'th' (Thai) provides best results for Thai content."
    });
    
    Ok(HttpResponse::Ok().json(languages))
}

// Upload and transcribe endpoint with queue support
async fn transcribe_handler(
    mut payload: Multipart,
    query: web::Query<TranscribeRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    let mut temp_file: Option<NamedTempFile> = None;
    let request_id = Uuid::new_v4().to_string();
    
    println!("📤 Processing transcription request: {}", request_id);
    
    // Process multipart form data
    while let Some(mut field) = payload.try_next().await? {
        let content_disposition = field.content_disposition();
        
        if let Some(name) = content_disposition.get_name() {
            if name == "audio" {
                if let Some(filename) = content_disposition.get_filename() {
                    println!("   📁 Received file: {}", filename);
                    
                    // Create temporary file
                    let mut file = NamedTempFile::new()
                        .map_err(|e| ErrorBadRequest(format!("Failed to create temp file: {}", e)))?;
                    
                    // Stream file data
                    while let Some(chunk) = field.try_next().await? {
                        file.write_all(&chunk)
                            .map_err(|e| ErrorBadRequest(format!("Failed to write chunk: {}", e)))?;
                    }
                    
                    temp_file = Some(file);
                    break;
                }
            }
        }
    }
    
    let temp_file = temp_file.ok_or_else(|| ErrorBadRequest("No audio file found in request"))?;
    let temp_path = temp_file.path().to_string_lossy().to_string();
    
    // Prepare task payload
    let task_payload = json!({
        "file_path": temp_path,
        "backend": query.backend.as_deref().unwrap_or("auto"),
        "language": query.language.as_deref(),
        "risk_analysis": query.risk_analysis.unwrap_or(false),
        "request_id": request_id
    });
    
    // Submit to queue
    let task_type = TaskType::Transcription;
    let priority = query.priority.unwrap_or(0);
    
    match data.task_queue.send(SubmitTask {
        task_type,
        payload: task_payload,
        priority: Some(priority),
    }).await {
        Ok(Ok(task_id)) => {
            println!("   ✅ Task queued with ID: {}", task_id);
            
            // Keep the temp file alive by storing it (in a real app, you'd want better lifecycle management)
            std::mem::forget(temp_file);
            
            Ok(HttpResponse::Accepted().json(json!({
                "status": "queued",
                "task_id": task_id,
                "request_id": request_id,
                "message": "Audio file uploaded and queued for transcription",
                "endpoints": {
                    "status": format!("/api/task/{}/status", task_id),
                    "websocket": "/ws"
                }
            })))
        }
        Ok(Err(e)) => {
            println!("   ❌ Failed to queue task: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to queue transcription task",
                "details": e
            })))
        }
        Err(e) => {
            println!("   ❌ Queue communication error: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Queue communication error",
                "details": e.to_string()
            })))
        }
    }
}

// Risk analysis endpoint with queue support
async fn risk_analysis_handler(
    req: web::Json<RiskAnalysisRequest>,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    let request_id = Uuid::new_v4().to_string();
    
    println!("🔍 Processing risk analysis request: {}", request_id);
    
    // Prepare task payload
    let task_payload = json!({
        "text": req.text,
        "request_id": request_id
    });
    
    // Submit to queue
    let task_type = TaskType::RiskAnalysis;
    let priority = req.priority.unwrap_or(0);
    
    match data.task_queue.send(SubmitTask {
        task_type,
        payload: task_payload,
        priority: Some(priority),
    }).await {
        Ok(Ok(task_id)) => {
            println!("   ✅ Risk analysis queued with ID: {}", task_id);
            
            Ok(HttpResponse::Accepted().json(json!({
                "status": "queued",
                "task_id": task_id,
                "request_id": request_id,
                "message": "Text queued for risk analysis",
                "endpoints": {
                    "status": format!("/api/task/{}/status", task_id),
                    "websocket": "/ws"
                }
            })))
        }
        Ok(Err(e)) => {
            println!("   ❌ Failed to queue risk analysis: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to queue risk analysis task",
                "details": e
            })))
        }
        Err(e) => {
            println!("   ❌ Queue communication error: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Queue communication error",
                "details": e.to_string()
            })))
        }
    }
}

// Get task status endpoint
async fn get_task_status(
    path: web::Path<String>,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    let task_id = path.into_inner();
    
    match data.task_queue.send(GetTaskStatus { task_id: task_id.clone() }).await {
        Ok(Ok(Some(task_result))) => {
            Ok(HttpResponse::Ok().json(json!({
                "task_id": task_id,
                "status": task_result.status,
                "progress": task_result.progress,
                "created_at": task_result.created_at,
                "updated_at": task_result.updated_at,
                "started_at": task_result.started_at,
                "completed_at": task_result.completed_at,
                "result": task_result.result,
                "error": task_result.error
            })))
        }
        Ok(Ok(None)) => {
            Ok(HttpResponse::NotFound().json(json!({
                "error": "Task not found",
                "task_id": task_id
            })))
        }
        Ok(Err(e)) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to get task status",
                "details": e
            })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Queue communication error",
                "details": e.to_string()
            })))
        }
    }
}

// Get queue statistics endpoint
async fn get_queue_stats(data: web::Data<AppState>) -> Result<HttpResponse> {
    match data.task_queue.send(GetQueueStats).await {
        Ok(Ok(stats)) => {
            Ok(HttpResponse::Ok().json(json!({
                "queue_stats": stats,
                "timestamp": chrono::Utc::now()
            })))
        }
        Ok(Err(e)) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to get queue statistics",
                "details": e
            })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Queue communication error",
                "details": e.to_string()
            })))
        }
    }
}

// Get task history endpoint
async fn get_task_history(
    query: web::Query<serde_json::Value>,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    let limit = query.get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);
    
    let status_filter = query.get("status")
        .and_then(|v| v.as_str())
        .and_then(|s| match s {
            "pending" => Some(TaskStatus::Pending),
            "processing" => Some(TaskStatus::Processing),
            "completed" => Some(TaskStatus::Completed),
            "failed" => Some(TaskStatus::Failed),
            "cancelled" => Some(TaskStatus::Cancelled),
            _ => None,
        });
    
    match data.task_queue.send(GetTaskHistory { limit, status_filter }).await {
        Ok(Ok(tasks)) => {
            Ok(HttpResponse::Ok().json(json!({
                "tasks": tasks,
                "count": tasks.len(),
                "timestamp": chrono::Utc::now()
            })))
        }
        Ok(Err(e)) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to get task history",
                "details": e
            })))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Queue communication error",
                "details": e.to_string()
            })))
        }
    }
}

// WebSocket endpoint for real-time updates
async fn websocket_handler(
    req: actix_web::HttpRequest,
    stream: web::Payload,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    let session_id = Uuid::new_v4();
    let resp = ws::start(
        WebSocketSession {
            id: session_id,
            queue_addr: data.task_queue.clone(),
        },
        &req,
        stream,
    );
    
    println!("🔌 WebSocket connection established: {}", session_id);
    resp
}

// Serve static files for the web UI
async fn serve_static() -> Result<HttpResponse> {
    match std::fs::read_to_string("static/index.html") {
        Ok(content) => Ok(HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(content)),
        Err(_) => Ok(HttpResponse::NotFound().json(json!({
            "error": "Web UI not found",
            "suggestion": "Make sure static/index.html exists"
        }))),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    
    let matches = Command::new("Whisper Transcription API Server with Queue")
        .version("0.2.0")
        .about("HTTP API server for audio transcription with Redis queue system")
        .arg(
            Arg::new("port")
                .short('p')
                .long("port")
                .help("Port to run the server on")
                .default_value("8000"),
        )
        .arg(
            Arg::new("host")
                .short('h')
                .long("host")
                .help("Host to bind the server to")
                .default_value("127.0.0.1"),
        )
        .arg(
            Arg::new("redis")
                .short('r')
                .long("redis")
                .help("Redis connection URL")
                .default_value("redis://localhost:6379"),
        )
        .get_matches();

    let port = matches.get_one::<String>("port").unwrap();
    let host = matches.get_one::<String>("host").unwrap();
    let redis_url = matches.get_one::<String>("redis").unwrap();
    
    println!("🚀 Starting Whisper Transcription API Server with Queue System");
    println!("   📊 Version: 0.2.0");
    println!("   🌐 Address: http://{}:{}", host, port);
    println!("   🗄️  Redis: {}", redis_url);
    
    // Initialize the task queue
    let task_queue = match TaskQueue::new(redis_url).await {
        Ok(queue) => {
            println!("   ✅ Redis connection established");
            queue
        }
        Err(e) => {
            eprintln!("   ❌ Failed to connect to Redis: {}", e);
            eprintln!("   💡 Make sure Redis is running: redis-server");
            std::process::exit(1);
        }
    };
    
    // Start the task processor on the same instance before starting the actor
    task_queue.start_task_processor().await;
    
    // Start the task queue actor
    let queue_addr = task_queue.start();
    
    let app_state = AppState {
        task_queue: queue_addr,
    };
    
    println!("   � Task processor started");
    println!("   📡 WebSocket support enabled");
    println!("   🎯 Available endpoints:");
    println!("      GET  /                     - Web UI");
    println!("      GET  /api/health           - Health check with queue stats");
    println!("      GET  /api/languages        - Supported languages");
    println!("      POST /api/transcribe       - Upload audio for transcription");
    println!("      POST /api/risk-analysis    - Submit text for risk analysis");
    println!("      GET  /api/task/:id/status  - Get task status");
    println!("      GET  /api/queue/stats      - Queue statistics");
    println!("      GET  /api/queue/history    - Task history");
    println!("      WS   /ws                   - Real-time updates");
    
    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(app_state.clone()))
            .wrap(Logger::default())
            .route("/", web::get().to(serve_static))
            .route("/api/health", web::get().to(health_check))
            .route("/api/languages", web::get().to(get_supported_languages))
            .route("/api/transcribe", web::post().to(transcribe_handler))
            .route("/api/risk-analysis", web::post().to(risk_analysis_handler))
            .route("/api/task/{id}/status", web::get().to(get_task_status))
            .route("/api/queue/stats", web::get().to(get_queue_stats))
            .route("/api/queue/history", web::get().to(get_task_history))
            .route("/ws", web::get().to(websocket_handler))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}

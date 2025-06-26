use actix_multipart::Multipart;
use actix_web::{
    error::ErrorBadRequest, middleware::Logger, web, App, HttpResponse, HttpServer, Result,
};
use clap::{Arg, Command};
use futures_util::TryStreamExt;
use llamaedge::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tempfile::NamedTempFile;
use tokio::sync::RwLock;
use uuid::Uuid;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

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

// Risk detection structures
#[derive(Serialize, Deserialize, Debug)]
struct RiskDetectionResult {
    is_risky: bool,
    raw_response: String,
    confidence: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct RiskAnalysisResponse {
    text: String,
    risk_analysis: RiskDetectionResult,
    metadata: serde_json::Value,
}

// Server state to hold the whisper context and llamaedge client
#[derive(Clone)]
struct AppState {
    model_path: String,
    whisper_ctx: Arc<RwLock<Option<Arc<whisper_rs::WhisperContext>>>>,
    llama_client: Arc<RwLock<Option<Client>>>,
    llama_server_url: String,
}

// Request/response structures
#[derive(serde::Deserialize)]
struct TranscribeRequest {
    language: Option<String>,
    backend: Option<String>, // "cpu", "gpu", "coreml"
    chunking: Option<bool>,
    risk_analysis: Option<bool>, // Enable risk detection
}

// Simple health check endpoint
async fn health_check() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "status": "healthy",
        "service": "whisper-transcription-api",
        "version": "0.1.0",
        "timestamp": chrono::Utc::now()
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
            "ru": "Russian",
            "ar": "Arabic",
            "it": "Italian",
            "pt": "Portuguese",
            "hi": "Hindi",
            "tr": "Turkish",
            "pl": "Polish",
            "ca": "Catalan",
            "nl": "Dutch",
            "sv": "Swedish",
            "he": "Hebrew",
            "ms": "Malay"
        },
        "default_language": "th",
        "auto_detect": "auto"
    });

    Ok(HttpResponse::Ok().json(languages))
}

// Helper function to save uploaded file
async fn save_uploaded_file(mut payload: Multipart) -> Result<(PathBuf, String), actix_web::Error> {
    let mut file_path = None;
    let mut original_filename = String::new();

    while let Some(mut field) = payload.try_next().await.map_err(ErrorBadRequest)? {
        let content_disposition = field.content_disposition();

        if let Some(name) = content_disposition.get_name() {
            if name == "audio" {
                if let Some(filename) = content_disposition.get_filename() {
                    original_filename = filename.to_string();

                    // Create a temporary file with the original extension
                    let extension = Path::new(filename)
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .unwrap_or("tmp");

                    let temp_file = NamedTempFile::with_suffix(&format!(".{}", extension))
                        .map_err(ErrorBadRequest)?;

                    let mut file = fs::File::create(temp_file.path()).map_err(ErrorBadRequest)?;

                    // Write file data
                    while let Some(chunk) = field.try_next().await.map_err(ErrorBadRequest)? {
                        file.write_all(&chunk).map_err(ErrorBadRequest)?;
                    }

                    file_path = Some(temp_file.into_temp_path().keep().map_err(ErrorBadRequest)?);
                    break;
                }
            }
        }
    }

    match file_path {
        Some(path) => Ok((path, original_filename)),
        None => Err(ErrorBadRequest("No audio file found in request")),
    }
}

// Core transcription functions (simplified from main.rs)
fn initialize_whisper_context(
    model_path: &str,
    language: &str,
    use_gpu: bool,
    use_coreml: bool,
) -> Result<WhisperContext, Box<dyn std::error::Error>> {
    println!("🔍 Initializing Whisper...");
    println!("   - Model path: {}", model_path);
    println!("   - Language: {}", language);
    println!("   - Use GPU: {}", use_gpu);
    println!("   - Use CoreML: {}", use_coreml);

    // First try with the requested backend
    let mut ctx_params = WhisperContextParameters::default();

    if use_gpu || use_coreml {
        println!("   - Attempting hardware acceleration...");

        if use_gpu {
            ctx_params.use_gpu(true);
            println!("   - GPU (Metal) acceleration enabled");
        }

        match WhisperContext::new_with_params(model_path, ctx_params) {
            Ok(ctx) => {
                println!(
                    "   ✅ Whisper context initialized successfully with hardware acceleration"
                );
                return Ok(ctx);
            }
            Err(e) => {
                println!("   ⚠️  Hardware acceleration failed: {}", e);
                println!("   � Note: 'ggml_metal_free: deallocating' messages below are NORMAL");
                println!(
                    "   📝 These indicate proper Metal cleanup during fallback - not an error!"
                );
                println!("   �🔄 Falling back to CPU-only mode...");

                // Give a brief moment for Metal cleanup to complete
                std::thread::sleep(std::time::Duration::from_millis(50));

                // Fall back to CPU-only
                let cpu_params = WhisperContextParameters::default();
                match WhisperContext::new_with_params(model_path, cpu_params) {
                    Ok(ctx) => {
                        println!(
                            "   ✅ Whisper context initialized successfully with CPU fallback"
                        );
                        println!(
                            "   📝 Metal deallocation completed - now using stable CPU backend"
                        );
                        return Ok(ctx);
                    }
                    Err(cpu_err) => {
                        return Err(format!("Failed to initialize Whisper with both hardware acceleration ({}) and CPU fallback ({})", e, cpu_err).into());
                    }
                }
            }
        }
    } else {
        // CPU-only mode
        println!("   - CPU-only mode requested");
        let ctx = WhisperContext::new_with_params(model_path, ctx_params)
            .map_err(|e| format!("Failed to load model in CPU mode: {}", e))?;

        println!("   ✅ Whisper context initialized successfully in CPU mode");
        Ok(ctx)
    }
}

fn simple_load_audio(path: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    println!("🔍 Loading audio file: {}", path);

    if !Path::new(path).exists() {
        return Err(format!("Audio file not found: {}", path).into());
    }

    use rodio::{Decoder, Source};
    use rubato::{
        Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
    };

    let file = fs::File::open(path)?;
    let decoder = Decoder::new(std::io::BufReader::new(file))?;

    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();

    println!("   - Original sample rate: {} Hz", sample_rate);
    println!("   - Channels: {}", channels);

    let mut samples: Vec<f32> = decoder.convert_samples::<f32>().collect();

    // Convert stereo to mono if necessary
    if channels == 2 {
        println!("   - Converting stereo to mono");
        samples = samples
            .chunks(2)
            .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
            .collect();
    }

    // Resample to 16kHz if necessary (Whisper's expected sample rate)
    const TARGET_SAMPLE_RATE: u32 = 16000;

    let final_samples = if sample_rate != TARGET_SAMPLE_RATE {
        println!(
            "   - Resampling: {} Hz → {} Hz",
            sample_rate, TARGET_SAMPLE_RATE
        );

        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: WindowFunction::BlackmanHarris2,
        };

        let mut resampler = SincFixedIn::<f32>::new(
            TARGET_SAMPLE_RATE as f64 / sample_rate as f64,
            2.0,
            params,
            samples.len(),
            1,
        )?;

        let output = resampler.process(&[samples], None)?;
        output[0].clone()
    } else {
        samples
    };

    println!(
        "   ✅ Audio loaded: {} samples at {} Hz",
        final_samples.len(),
        TARGET_SAMPLE_RATE
    );
    Ok(final_samples)
}

fn simple_transcribe(
    ctx: &WhisperContext,
    audio_data: Vec<f32>,
    language: &str,
) -> Result<Vec<WhisperSegment>, Box<dyn std::error::Error>> {
    println!("🔍 Starting transcription...");
    println!("   - Audio samples: {}", audio_data.len());
    println!("   - Language: {}", language);

    // Set up transcription parameters
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_translate(false);
    params.set_language(Some(language));
    params.set_progress_callback_safe(|progress| {
        println!("🔄 Transcription progress: {:.1}%", progress as f64 * 100.0);
    });

    // Create state and run transcription with error handling
    let mut state = ctx.create_state().map_err(|e| {
        let error_msg = format!("Failed to create state: {}", e);
        if error_msg.contains("buffer is nil") || error_msg.contains("metal") {
            format!(
                "Metal/GPU buffer error: {}. Try using CPU backend instead.",
                e
            )
        } else {
            error_msg
        }
    })?;

    println!("   - State created, starting transcription...");

    // Run transcription with enhanced error handling
    state.full(params, &audio_data).map_err(|e| {
        let error_msg = format!("Failed to run model: {}", e);
        if error_msg.contains("buffer is nil") || error_msg.contains("metal") {
            format!("Metal/GPU transcription error: {}. This is a known issue with GPU acceleration. Please try using CPU backend instead.", e)
        } else {
            error_msg
        }
    })?;

    let num_segments = state
        .full_n_segments()
        .map_err(|e| format!("Failed to get segment count: {}", e))?;
    println!("🔍 Transcription completed with {} segments", num_segments);

    let mut segments = Vec::new();

    for i in 0..num_segments {
        let segment_text = state
            .full_get_segment_text(i)
            .map_err(|e| format!("Failed to get segment text: {}", e))?;
        let start_timestamp = state
            .full_get_segment_t0(i)
            .map_err(|e| format!("Failed to get segment start: {}", e))?;
        let end_timestamp = state
            .full_get_segment_t1(i)
            .map_err(|e| format!("Failed to get segment end: {}", e))?;

        // Convert timestamps from centiseconds to seconds
        let start_time = start_timestamp as f64 / 100.0;
        let end_time = end_timestamp as f64 / 100.0;

        println!(
            "   - Segment {}: [{:.2}s - {:.2}s] '{}'",
            i,
            start_time,
            end_time,
            segment_text.trim()
        );

        // Create segment
        let segment = WhisperSegment {
            id: i as i32,
            seek: (start_timestamp / 100) as i32 * 2,
            start: start_time,
            end: end_time,
            text: segment_text,
            tokens: Vec::new(),
            temperature: 0.0,
            avg_logprob: -0.3,
            compression_ratio: 1.5,
            no_speech_prob: 0.1,
            confidence: 0.8,
            words: Vec::new(),
        };

        segments.push(segment);
    }

    Ok(segments)
}

// Risk detection function using LlamaEdge with simple string approach
async fn detect_text_risk(
    text: &str,
    _: &(),
) -> Result<RiskDetectionResult, Box<dyn std::error::Error>> {
    println!("🔍 Analyzing text for risk content...");
    println!("   - Text length: {} characters", text.len());

    //Create a simple prompt for risk detection
    // let prompt = format!(
    //     "คุณเป็นผู้เชี่ยวชาญในการตรวจสอบเนื้อหาที่เสี่ยงต่อการทำผิดกฎหมาย โดยเฉพาะเรื่องการพนัน การลงทุนที่มีความเสี่ยงสูง และกิจกรรมผิดกฎหมายอื่นๆ\n\nประโยคเหล่านี้ มีข้อความที่เสี่ยงต่อการทำผิดกฎหมายหรือไม่\n\n```{}```\n\nตอบแค่เข้าข่าย 'ผิด' หรือ 'ไม่ผิด' เท่านั้น",
    //     text
    // );



let prompt: String = format!(
    "วิเคราะห์เนื้อหาต่อไปนี้ทีละขั้นตอน:

```{}```

ขั้นตอนที่ 1: ตรวจสอบเนื้อหา
1.1 มีการเชิญชวนเล่นการพนันออนไลน์หรือไม่? (ใช่/ไม่)
1.2 มีการเสนอขายสินค้าต้องห้าม เช่น ยาเสพติด อาวุธปืน หรือไม่? (ใช่/ไม่)
1.3 มีการเชิญชวนลงทุนหรือโครงการลงทุนผิดกฎหมายหรือไม่? (ใช่/ไม่)
1.4 มีการสอนวิธีฟอกเงินหรือทำธุรกรรมผิดกฎหมายหรือไม่? (ใช่/ไม่)

ขั้นตอนที่ 2: ระบุประเภทเนื้อหา
2.1 เป็นการสนทนาทั่วไป การซื้อขายสินค้าปกติ หรือไม่? (ใช่/ไม่)
2.2 เป็นการปรึกษาด้านสุขภาพ การรักษาโรค หรือไม่? (ใช่/ไม่)
2.3 เป็นบทความข่าว เนื้อหาการศึกษา หรือไม่? (ใช่/ไม่)

ขั้นตอนที่ 3: สรุปผล
- หากขั้นตอนที่ 1 ตอบ 'ไม่' ทั้งหมด และขั้นตอนที่ 2 มีอย่างน้อย 1 ข้อที่เป็น 'ใช่' = ไม่ผิด
- หากขั้นตอนที่ 1 มีข้อใดตอบ 'ใช่' = ผิด
- หรือถ้าไม่มั่นใจให้ตอบ ไม่ผิด ไว้ก่อน

คำตอบขั้นสุดท้าย (ตอบเพียงคำเดียว):",
    text
);

    // Create simple message structure
    let messages = vec![serde_json::json!({
        "role": "user",
        "content": prompt
    })];

    // Convert to the format expected by llamaedge
    let _messages_str: Vec<_> = messages.iter().map(|m| m.to_string()).collect();

    // For now, let's use a simple HTTP request approach instead of the complex chat API
    // This is a simplified implementation that should work
    println!("   - Sending risk analysis request...");

    // Use reqwest to make a direct HTTP call to the LlamaEdge server
    let client_http = reqwest::Client::new();
    let response = client_http
        .post("http://localhost:8080/v1/chat/completions")
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "model": "qwen",
            "temperature": 0.1,
            "max_tokens": 10,
            "stream": false
        }))
        .send()
        .await?;

    let response_text = response.text().await?;
    let response_json: serde_json::Value = serde_json::from_str(&response_text)?;

    // Extract the response content
    let raw_response = response_json
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .unwrap_or("error")
        .trim()
        .to_lowercase();

    println!("   - Raw LLM response: '{}'", raw_response);

    // Parse response to determine risk
    let is_risky = raw_response.contains("ผิด") && !raw_response.contains("ไม่ผิด");
    let confidence = if raw_response == "ผิด" || raw_response == "ไม่ผิด" {
        0.95
    } else if raw_response.contains("ผิด") || raw_response.contains("ไม่ผิด") {
        0.8
    } else {
        0.5
    };

    println!("   - Risk detected: {}", is_risky);
    println!("   - Confidence: {:.2}", confidence);

    Ok(RiskDetectionResult {
        is_risky,
        raw_response: raw_response.to_string(),
        confidence,
    })
}

// Main transcription endpoint
async fn transcribe_audio(
    payload: Multipart,
    data: web::Data<AppState>,
    query: web::Query<TranscribeRequest>,
) -> Result<HttpResponse> {
    println!("📝 Received transcription request");

    // Extract request parameters
    let language = query.language.as_deref().unwrap_or("th");
    let backend = query.backend.as_deref().unwrap_or("cpu");
    let use_chunking = query.chunking.unwrap_or(true);
    let enable_risk_analysis = query.risk_analysis.unwrap_or(false);

    println!("   - Language: {}", language);
    println!("   - Backend: {}", backend);
    println!("   - Chunking: {}", use_chunking);
    println!("   - Risk analysis: {}", enable_risk_analysis);

    // Parse backend settings
    let use_gpu = backend == "gpu";
    let use_coreml = backend == "coreml";

    // Save uploaded file
    let (audio_path, original_filename) = save_uploaded_file(payload).await?;
    println!(
        "   - Saved audio file: {} (original: {})",
        audio_path.display(),
        original_filename
    );

    // Get or initialize whisper context
    let whisper_ctx = {
        let ctx_lock = data.whisper_ctx.read().await;
        if let Some(ctx) = ctx_lock.as_ref() {
            // Use existing context
            println!("   - Using existing Whisper context");
            ctx.clone()
        } else {
            drop(ctx_lock); // Release read lock

            // Initialize new context with error handling
            println!("   - Initializing new Whisper context");

            let ctx = match initialize_whisper_context(
                &data.model_path,
                language,
                use_gpu,
                use_coreml,
            ) {
                Ok(ctx) => Arc::new(ctx),
                Err(e) => {
                    let error_msg = format!("Failed to initialize Whisper: {}", e);
                    if error_msg.contains("metal") || error_msg.contains("buffer is nil") {
                        return Ok(HttpResponse::BadRequest().json(json!({
                            "error": "GPU/Metal acceleration failed",
                            "message": "The Metal backend encountered a buffer error. This is a known issue with GPU acceleration on some systems.",
                            "suggestion": "Please try again using 'cpu' backend instead of 'gpu' or 'coreml'",
                            "details": error_msg
                        })));
                    } else {
                        return Err(ErrorBadRequest(error_msg));
                    }
                }
            };

            let mut ctx_lock = data.whisper_ctx.write().await;
            *ctx_lock = Some(ctx.clone());
            ctx
        }
    };

    // Load audio
    println!("   - Loading audio file...");
    let audio_data = simple_load_audio(audio_path.to_str().unwrap())
        .map_err(|e| ErrorBadRequest(format!("Failed to load audio: {}", e)))?;

    println!("   - Audio loaded: {} samples", audio_data.len());

    // Perform transcription (simplified - no chunking for now)
    println!("   - Using single-pass transcription");
    let segments = simple_transcribe(&whisper_ctx, audio_data, language)
        .map_err(|e| ErrorBadRequest(format!("Transcription failed: {}", e)))?;

    // Create result in OpenAI Whisper format
    let full_text = segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let result = WhisperResult {
        text: full_text,
        segments,
        language: language.to_string(),
    };

    // Generate task ID for tracking
    let task_id = Uuid::new_v4().to_string();

    // Perform risk analysis if requested
    let risk_analysis = if enable_risk_analysis {
        let client_available = {
            let client_lock = data.llama_client.read().await;
            client_lock.is_some()
        };

        if client_available {
            println!("   - Performing risk analysis on transcribed text...");
            match detect_text_risk(&result.text, &()).await {
                Ok(risk_result) => {
                    println!(
                        "   ✅ Risk analysis completed: {}",
                        if risk_result.is_risky {
                            "RISKY"
                        } else {
                            "SAFE"
                        }
                    );
                    Some(risk_result)
                }
                Err(e) => {
                    println!("   ⚠️  Risk analysis failed: {}", e);
                    None
                }
            }
        } else {
            println!("   ⚠️  Risk analysis requested but LlamaEdge client not available");
            None
        }
    } else {
        None
    };

    // Clean up temporary file
    let _ = fs::remove_file(&audio_path);

    println!("   ✅ Transcription completed successfully");
    println!("   - Total segments: {}", result.segments.len());
    println!("   - Total characters: {}", result.text.len());

    // Create response with optional risk analysis
    let mut response = json!({
        "task_id": task_id,
        "status": "completed",
        "result": result,
        "metadata": {
            "original_filename": original_filename,
            "language": language,
            "backend": backend,
            "chunking_used": false,
            "processing_time": "N/A",
            "model": data.model_path,
            "risk_analysis_enabled": enable_risk_analysis
        }
    });

    // Add risk analysis results if available
    if let Some(risk_result) = risk_analysis {
        response["risk_analysis"] = json!({
            "is_risky": risk_result.is_risky,
            "raw_response": risk_result.raw_response,
            "confidence": risk_result.confidence
        });
    }

    // Return OpenAI Whisper-compatible response with optional risk analysis
    Ok(HttpResponse::Ok().json(response))
}

// Risk detection endpoint
async fn analyze_text_risk(
    body: web::Json<serde_json::Value>,
    data: web::Data<AppState>,
) -> Result<HttpResponse> {
    println!("🔍 Received risk analysis request");

    // Extract text from request body
    let text = match body.get("text") {
        Some(serde_json::Value::String(text)) => text,
        _ => {
            return Err(ErrorBadRequest(
                "Missing or invalid 'text' field in request body",
            ))
        }
    };

    println!("   - Text to analyze: {} characters", text.len());

    // Check if LlamaEdge client is available
    let client_available = {
        let client_lock = data.llama_client.read().await;
        client_lock.is_some()
    };

    if !client_available {
        return Ok(HttpResponse::ServiceUnavailable().json(json!({
            "error": "Risk detection service unavailable",
            "message": "LlamaEdge client is not configured. Please check the server configuration.",
            "suggestion": "Ensure the LlamaEdge server is running and accessible"
        })));
    }

    // Perform risk detection
    match detect_text_risk(text, &()).await {
        Ok(risk_result) => {
            println!("   ✅ Risk analysis completed");

            Ok(HttpResponse::Ok().json(json!({
                "text": text,
                "risk_analysis": {
                    "is_risky": risk_result.is_risky,
                    "raw_response": risk_result.raw_response,
                    "confidence": risk_result.confidence
                },
                "metadata": {
                    "llama_server": data.llama_server_url,
                    "analysis_timestamp": chrono::Utc::now()
                }
            })))
        }
        Err(e) => {
            println!("   ❌ Risk analysis failed: {}", e);
            Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Risk analysis failed",
                "message": format!("Failed to analyze text: {}", e),
                "suggestion": "Check if the LlamaEdge server is running and accessible"
            })))
        }
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let matches = Command::new("Whisper Transcription API Server")
        .version("0.1.0")
        .about("HTTP API server for speech-to-text transcription using whisper-rs")
        .arg(
            Arg::new("model")
                .help("Path to the Whisper model file")
                .required(true)
                .index(1),
        )
        .arg(
            Arg::new("host")
                .short('h')
                .long("host")
                .help("Host address to bind the server to")
                .default_value("127.0.0.1"),
        )
        .arg(
            Arg::new("port")
                .short('p')
                .long("port")
                .help("Port number to bind the server to")
                .default_value("8080"),
        )
        .arg(
            Arg::new("llama-url")
                .long("llama-url")
                .help("LlamaEdge server URL for risk detection")
                .default_value("http://localhost:8080"),
        )
        .get_matches();

    let model_path = matches.get_one::<String>("model").unwrap().to_string();
    let host = matches.get_one::<String>("host").unwrap();
    let port: u16 = matches
        .get_one::<String>("port")
        .unwrap()
        .parse()
        .expect("Invalid port number");
    let llama_url = matches.get_one::<String>("llama-url").unwrap().to_string();

    // Validate model path
    if !Path::new(&model_path).exists() {
        eprintln!("❌ Model file '{}' not found", model_path);
        std::process::exit(1);
    }

    // Try to create LlamaEdge client
    let (llama_client, llama_status) = match Client::new(&llama_url) {
        Ok(client) => {
            println!("✅ LlamaEdge client connected to: {}", llama_url);
            (Some(client), llama_url.as_str())
        }
        Err(e) => {
            println!(
                "⚠️  Warning: Could not connect to LlamaEdge server at {}: {}",
                llama_url, e
            );
            println!("   Risk detection features will be disabled");
            (None, "Disabled")
        }
    };

    // Create shared application state
    let app_state = web::Data::new(AppState {
        model_path: model_path.clone(),
        whisper_ctx: Arc::new(RwLock::new(None)),
        llama_client: Arc::new(RwLock::new(llama_client)),
        llama_server_url: llama_url.clone(),
    });

    println!("🚀 Starting Whisper Transcription API Server");
    println!("   📍 Address: http://{}:{}", host, port);
    println!("   🧠 Model: {}", model_path);
    println!("   🦙 LlamaEdge: {}", llama_status);
    println!("   📋 Endpoints:");
    println!("      POST /transcribe?language=th&backend=cpu&chunking=true&risk_analysis=false - Transcribe audio file");
    println!("      POST /risk-analysis - Analyze text for risk content");
    println!("      GET  /health     - Health check");
    println!("      GET  /languages  - Get supported languages");
    println!("      GET  /           - Web interface");
    println!();
    println!("   🎯 Backend options: cpu, gpu, coreml");
    println!("   🌍 Language options: th, en, zh, ja, ko, es, fr, de, ru, ar, auto");
    println!("   📦 Chunking: true (recommended for long audio), false");
    println!("   ⚠️  Risk analysis: true (requires LlamaEdge server), false");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(Logger::default())
            .service(web::resource("/transcribe").route(web::post().to(transcribe_audio)))
            .service(web::resource("/risk-analysis").route(web::post().to(analyze_text_risk)))
            .service(web::resource("/health").route(web::get().to(health_check)))
            .service(web::resource("/languages").route(web::get().to(get_supported_languages)))
            // Serve static files for web interface
            .service(actix_files::Files::new("/", "./static").index_file("index.html"))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}


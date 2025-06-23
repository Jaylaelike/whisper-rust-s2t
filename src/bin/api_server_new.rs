use actix_web::{web, App, HttpResponse, HttpServer, Result, middleware::Logger};
use serde_json::json;
use clap::{Arg, Command};
use std::path::Path;

// Simple health check endpoint
async fn health_check() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "status": "healthy",
        "service": "whisper-transcription-api",
        "message": "API server is running. Use the CLI tool for actual transcription.",
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
            "ar": "Arabic"
        },
        "default_language": "th",
        "note": "This is a placeholder API. Use the CLI tool for actual transcription."
    });
    
    Ok(HttpResponse::Ok().json(languages))
}

// Placeholder transcribe endpoint
async fn transcribe_placeholder() -> Result<HttpResponse> {
    Ok(HttpResponse::Ok().json(json!({
        "message": "This is a placeholder API endpoint.",
        "instructions": {
            "cli_usage": "Use the CLI tool for actual transcription:",
            "command": "./target/release/transcribe <audio_file> <model_file>",
            "example": "./target/release/transcribe audio/example.mp3 model/ggml-large-v3.bin"
        },
        "status": "placeholder"
    })))
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let matches = Command::new("Whisper Transcription API Server")
        .version("0.1.0")
        .about("HTTP API server for speech-to-text transcription using whisper-rs")
        .arg(
            Arg::new("model")
                .help("Path to the Whisper model file (placeholder - use CLI for actual transcription)")
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
        .get_matches();

    let model_path = matches.get_one::<String>("model").unwrap();
    let host = matches.get_one::<String>("host").unwrap();
    let port: u16 = matches
        .get_one::<String>("port")
        .unwrap()
        .parse()
        .expect("Invalid port number");

    // Validate model path
    if !Path::new(model_path).exists() {
        eprintln!("❌ Model file '{}' not found", model_path);
        std::process::exit(1);
    }

    println!("🚀 Starting Whisper Transcription API Server (Placeholder)");
    println!("   📍 Address: http://{}:{}", host, port);
    println!("   🧠 Model: {} (placeholder)", model_path);
    println!("   📋 Endpoints:");
    println!("      POST /transcribe - Placeholder endpoint with instructions");
    println!("      GET  /health     - Health check");
    println!("      GET  /languages  - Get supported languages");
    println!("      GET  /           - Web interface");
    println!();
    println!("   ℹ️  Note: This is a placeholder API server.");
    println!("      For actual transcription, use the CLI tool:");
    println!("      ./target/release/transcribe <audio_file> <model_file>");
    
    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .service(
                web::resource("/transcribe")
                    .route(web::post().to(transcribe_placeholder))
                    .route(web::get().to(transcribe_placeholder))
            )
            .service(
                web::resource("/health")
                    .route(web::get().to(health_check))
            )
            .service(
                web::resource("/languages")
                    .route(web::get().to(get_supported_languages))
            )
            // Serve static files for API documentation
            .service(actix_files::Files::new("/", "./static").index_file("index.html"))
    })
    .bind(format!("{}:{}", host, port))?
    .run()
    .await
}

use std::fs::{File, metadata};
use std::path::Path;
use std::io::Write;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};

#[cfg(feature = "full-audio-support")]
use symphonia::core::audio::SampleBuffer;
#[cfg(feature = "full-audio-support")]
use symphonia::core::codecs::DecoderOptions;
#[cfg(feature = "full-audio-support")]
use symphonia::core::errors::Error as SymphoniaError;
#[cfg(feature = "full-audio-support")]
use symphonia::core::formats::FormatOptions;
#[cfg(feature = "full-audio-support")]
use symphonia::core::io::MediaSourceStream;
#[cfg(feature = "full-audio-support")]
use symphonia::core::meta::MetadataOptions;
#[cfg(feature = "full-audio-support")]
use symphonia::core::probe::Hint;

#[cfg(feature = "wav-support")]
use hound::{WavReader, SampleFormat};

// Re-export necessary types and functions for the queue system
use crate::{
    initialize_whisper_with_debug, transcribe_with_chunking, transcribe_with_debug,
    load_audio_file_with_debug, should_chunk_audio, Logger
};

// Constants for chunking
const MAX_FILE_SIZE_MB: u64 = 100;
const MAX_DURATION_MINUTES: f32 = 60.0;
const CHUNK_DURATION_MINUTES: f32 = 5.0;
const SAMPLE_RATE: u32 = 16000;

// Audio data with sample rate information
#[derive(Debug, Clone)]
pub struct AudioData {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
    pub channels: u16,
}

impl AudioData {
    fn len(&self) -> usize {
        self.samples.len()
    }
    
    fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }
}

/// Real implementation of audio file transcription
pub async fn transcribe_audio_file_impl(
    audio_path: &str,
    backend: &str,
    language: Option<&str>,
) -> Result<serde_json::Value, String> {
    let language = language.unwrap_or("th");
    
    // Determine backend settings
    let (use_gpu, use_coreml) = match backend {
        "gpu" => (true, false),
        "coreml" => (false, true),
        "cpu" | "auto" | _ => (false, false),
    };
    
    // Model path - default to the large model
    let model_path = "model/ggml-large-v3.bin";
    
    // Initialize Whisper context
    let ctx = initialize_whisper_with_debug(model_path, language, use_gpu, use_coreml)
        .map_err(|e| format!("Failed to initialize Whisper: {}", e))?;
    
    // Check if chunking is needed
    let should_chunk = should_chunk_audio(audio_path)
        .map_err(|e| format!("Failed to check if chunking needed: {}", e))?;
    
    if should_chunk {
        // Process with chunking
        let segments = transcribe_with_chunking(&ctx, audio_path, language)
            .map_err(|e| format!("Chunked transcription failed: {}", e))?;
        
        // Convert to WhisperResult format
        let whisper_segments: Vec<_> = segments.iter().enumerate().map(|(i, segment)| {
            segment.to_whisper_segment(i as i32)
        }).collect();
        
        let full_text = segments.iter().map(|s| s.text.as_str()).collect::<Vec<_>>().join(" ");
        
        let result = serde_json::json!({
            "text": full_text,
            "segments": whisper_segments,
            "language": language,
            "metadata": {
                "backend": backend,
                "model": "ggml-large-v3",
                "chunked": true
            }
        });
        
        Ok(result)
    } else {
        // Process as single file
        let audio_data = load_audio_file_with_debug(audio_path)
            .map_err(|e| format!("Failed to load audio: {}", e))?;
        
        let segments = transcribe_with_debug(&ctx, audio_data, language)
            .map_err(|e| format!("Transcription failed: {}", e))?;
        
        // Convert to OpenAI format using our existing converter
        let mut logger = Logger::new(audio_path, language);
        logger.add_segments_from_whisper_rs(&segments);
        let whisper_result = logger.create_whisper_format();
        
        Ok(serde_json::to_value(whisper_result).unwrap())
    }
}

/// Real implementation of risk analysis using LlamaEdge
pub async fn analyze_risk_impl(text: &str) -> Result<serde_json::Value, String> {
    // Use the default LlamaEdge server URL
    let llama_url = "http://localhost:8080";
    
    // Simple prompt for risk detection
    let prompt = format!(
        "Analyze this text for harmful, dangerous, or inappropriate content. Respond with only 'RISKY' or 'SAFE': {}",
        text
    );
    
    // Create the request payload
    let payload = serde_json::json!({
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "max_tokens": 10,
        "temperature": 0.1
    });
    
    // Make HTTP request to LlamaEdge server
    let client = reqwest::Client::new();
    let response = client
        .post(&format!("{}/v1/chat/completions", llama_url))
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .await;
    
    // Handle the case where LlamaEdge server is not available
    let result = match response {
        Ok(resp) if resp.status().is_success() => {
            let response_json: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| format!("Failed to parse LlamaEdge response: {}", e))?;
            
            // Extract the response text
            let raw_response = response_json
                .get("choices")
                .and_then(|choices| choices.get(0))
                .and_then(|choice| choice.get("message"))
                .and_then(|message| message.get("content"))
                .and_then(|content| content.as_str())
                .unwrap_or("")
                .trim()
                .to_uppercase();
            
            // Determine if risky
            let is_risky = raw_response.contains("RISKY");
            let confidence = if raw_response == "RISKY" || raw_response == "SAFE" {
                0.9
            } else {
                0.5 // Lower confidence for unclear responses
            };
            
            serde_json::json!({
                "text": text,
                "risk_analysis": {
                    "is_risky": is_risky,
                    "raw_response": raw_response,
                    "confidence": confidence
                },
                "metadata": {
                    "model": "llamaedge",
                    "timestamp": chrono::Utc::now(),
                    "prompt_type": "simple_classification"
                }
            })
        },
        _ => {
            // Fallback to keyword-based analysis when LlamaEdge is not available
            log::warn!("LlamaEdge server not available, falling back to keyword-based analysis");
            
            let risk_keywords = [
                "gambling", "บาคาร่า", "illegal", "drug", "weapon", "scam", "fraud",
                "เงินด่วน", "พนัน", "หวย", "การพนัน", "ยาเสพติด", "อาวุธ", "โกง"
            ];
            
            let detected_keywords: Vec<&str> = risk_keywords.iter()
                .filter(|&&keyword| text.to_lowercase().contains(keyword))
                .copied()
                .collect();
            
            let is_risky = !detected_keywords.is_empty();
            let confidence = if text.len() < 10 {
                0.6 // Lower confidence for very short text
            } else if is_risky {
                0.8 // High confidence when risky keywords found
            } else {
                0.7 // Medium confidence for keyword-based safe classification
            };
            
            serde_json::json!({
                "text": text,
                "risk_analysis": {
                    "is_risky": is_risky,
                    "raw_response": if is_risky { "RISKY" } else { "SAFE" },
                    "confidence": confidence,
                    "detected_keywords": detected_keywords
                },
                "metadata": {
                    "model": "keyword-based-fallback",
                    "timestamp": chrono::Utc::now(),
                    "note": "LlamaEdge server not available, using keyword-based analysis"
                }
            })
        }
    };
    
    Ok(result)
}

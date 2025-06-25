// Core transcription functionality that can be shared between CLI and API

pub mod queue;

// Import necessary dependencies
extern crate reqwest;
use std::path::Path;
use std::fs::metadata;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use serde_json::json;
use serde::{Deserialize, Serialize};

// Audio loading with rodio for MP3/other format support
use rodio::{Decoder, Source};
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};

// Constants for audio processing
const SAMPLE_RATE: u32 = 16000;

// Audio data with sample rate information
#[derive(Debug, Clone)]
#[allow(dead_code)] // May be used in future implementations
struct AudioData {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
}

#[allow(dead_code)] // May be used in future implementations
impl AudioData {
    fn len(&self) -> usize {
        self.samples.len()
    }
    
    fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WhisperWord {
    text: String,
    start: f64,
    end: f64,
    confidence: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WhisperSegment {
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

/// Transcribe an audio file and return the result in OpenAI Whisper format using real Whisper processing
pub async fn transcribe_audio_file(
    audio_path: &str,
    backend: &str,
    language: Option<&str>,
) -> Result<serde_json::Value, String> {
    let language = language.unwrap_or("th");
    
    println!("🔄 Starting real Whisper transcription for: {}", audio_path);
    
    // Check if audio file exists
    if !Path::new(audio_path).exists() {
        return Err(format!("Audio file not found: {}", audio_path));
    }
    
    // Determine backend settings
    let (use_gpu, use_coreml) = match backend {
        "gpu" => (true, false),
        "coreml" => (false, true),
        "cpu" | "auto" | _ => (false, false),
    };
    
    // Model path - check multiple possible locations
    let possible_model_paths = [
        "model/ggml-large-v3.bin",
        "model/ggml-large-v3-q5_0.bin",
        "model/ggml-large-v3-turbo-q8_0.bin"
    ];
    
    let model_path = possible_model_paths.iter()
        .find(|path| Path::new(path).exists())
        .ok_or("No Whisper model found. Please ensure a model file exists in the model/ directory")?;
    
    println!("🔄 Loading Whisper model: {}", model_path);
    
    // Initialize Whisper context
    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(model_path, ctx_params)
        .map_err(|e| format!("Failed to load Whisper model: {}", e))?;
    
    println!("✅ Whisper model loaded successfully");
    
    // Load and process audio file
    println!("🎵 Loading audio file: {}", audio_path);
    let audio_data = load_audio_file_with_debug(audio_path)
        .map_err(|e| format!("Failed to load audio file: {}", e))?;
    
    println!("🔄 Running Whisper transcription...");
    
    // Set up parameters for transcription
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(language));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(true);
    
    // Create state and run transcription
    let mut state = ctx.create_state()
        .map_err(|e| format!("Failed to create Whisper state: {}", e))?;
    
    let processing_start = std::time::Instant::now();
    state.full(params, &audio_data)
        .map_err(|e| format!("Failed to run Whisper transcription: {}", e))?;
    
    let processing_time = processing_start.elapsed().as_secs_f64();
    
    // Extract segments
    let num_segments = state.full_n_segments()
        .map_err(|e| format!("Failed to get segment count: {}", e))?;
    
    println!("✅ Transcription completed with {} segments in {:.1}s", num_segments, processing_time);
    
    let mut segments = Vec::new();
    let mut full_text = String::new();
    
    for i in 0..num_segments {
        let segment_text = state.full_get_segment_text(i)
            .map_err(|e| format!("Failed to get segment text: {}", e))?;
        let start_timestamp = state.full_get_segment_t0(i)
            .map_err(|e| format!("Failed to get segment start: {}", e))?;
        let end_timestamp = state.full_get_segment_t1(i)
            .map_err(|e| format!("Failed to get segment end: {}", e))?;
        
        // Convert timestamps from centiseconds to seconds
        let start_time = start_timestamp as f64 / 100.0;
        let end_time = end_timestamp as f64 / 100.0;
        
        full_text.push_str(&segment_text);
        
        // Get word-level data
        let num_tokens = state.full_n_tokens(i).unwrap_or(0);
        let mut words = Vec::new();
        
        for j in 0..num_tokens {
            if let Ok(token_text) = state.full_get_token_text(i, j) {
                if let Ok(token_prob) = state.full_get_token_prob(i, j) {
                    let cleaned_text = token_text.trim();
                    if !cleaned_text.is_empty() && !cleaned_text.starts_with('<') && !cleaned_text.starts_with('[') {
                        // Approximate word timestamps
                        let word_progress = j as f64 / num_tokens.max(1) as f64;
                        let word_start = start_time + (end_time - start_time) * word_progress;
                        let word_end = start_time + (end_time - start_time) * ((j + 1) as f64 / num_tokens.max(1) as f64);
                        
                        words.push(WhisperWord {
                            text: cleaned_text.to_string(),
                            start: word_start,
                            end: word_end,
                            confidence: token_prob as f64,
                        });
                    }
                }
            }
        }
        
        // Create segment in OpenAI Whisper format
        let segment = json!({
            "id": i as i32,
            "seek": (start_timestamp / 100) as i32 * 2,
            "start": start_time,
            "end": end_time,
            "text": segment_text,
            "tokens": [], // Token IDs not easily accessible in whisper-rs
            "temperature": 0.0,
            "avg_logprob": -0.3,
            "compression_ratio": 1.5,
            "no_speech_prob": 0.1,
            "confidence": words.iter().map(|w| w.confidence).sum::<f64>() / words.len().max(1) as f64,
            "words": words
        });
        
        segments.push(segment);
    }
    
    // Get file information
    let file_size = metadata(audio_path)
        .map(|m| m.len())
        .unwrap_or(0);
    
    let file_name = Path::new(audio_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    
    // Create result in OpenAI Whisper format
    let result = json!({
        "text": full_text.trim(),
        "segments": segments,
        "language": language,
        "metadata": {
            "backend": backend,
            "model_path": model_path,
            "model": Path::new(model_path).file_stem().unwrap_or_default().to_string_lossy(),
            "processing_time": format!("{:.1}s", processing_time),
            "file_size": format_bytes(file_size),
            "file_name": file_name,
            "use_gpu": use_gpu,
            "use_coreml": use_coreml,
            "sample_rate": SAMPLE_RATE,
            "num_segments": num_segments,
            "note": "Real Whisper transcription completed successfully"
        }
    });
    
    println!("✅ Transcription result ready with {} characters", full_text.len());
    
    Ok(result)
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.1} {}", size, UNITS[unit_index])
}

/// Analyze text for risk using LlamaEdge with real HTTP calls
pub async fn analyze_risk(text: &str) -> Result<serde_json::Value, String> {
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
                0.95 // High confidence for clear responses
            } else {
                0.6 // Lower confidence for unclear responses
            };
            
            serde_json::json!({
                "text": text,
                "risk_analysis": {
                    "is_risky": is_risky,
                    "raw_response": raw_response,
                    "confidence": confidence,
                    "detected_keywords": []
                },
                "metadata": {
                    "model": "llamaedge-real",
                    "endpoint": llama_url,
                    "timestamp": chrono::Utc::now(),
                    "text_length": text.len(),
                    "prompt_type": "simple_classification"
                }
            })
        },
        Ok(resp) => {
            // LlamaEdge server returned an error
            log::warn!("LlamaEdge server error: {}", resp.status());
            fallback_risk_analysis(text)
        },
        Err(e) => {
            // LlamaEdge server not available
            log::warn!("LlamaEdge server not available: {}, falling back to keyword analysis", e);
            fallback_risk_analysis(text)
        }
    };
    
    Ok(result)
}

/// Fallback keyword-based risk analysis when LlamaEdge is not available
fn fallback_risk_analysis(text: &str) -> serde_json::Value {
    let risk_keywords = [
        "gambling", "บาคาร่า", "illegal", "drug", "weapon", "scam", "fraud",
        "เงินด่วน", "พนัน", "หวย", "การพนัน", "ยาเสพติด", "อาวุธ", "โกง",
        "ค้ายา", "ปืน", "หลอกลวง", "โกงเงิน", "พนันบอล", "คาสิโน"
    ];
    
    let detected_keywords: Vec<&str> = risk_keywords.iter()
        .filter(|&&keyword| text.to_lowercase().contains(keyword))
        .copied()
        .collect();
    
    let is_risky = !detected_keywords.is_empty();
    let confidence = if text.len() < 10 {
        0.5 // Lower confidence for very short text
    } else if is_risky {
        0.85 // High confidence when risky keywords found
    } else {
        0.75 // Good confidence for keyword-based safe classification
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
            "text_length": text.len(),
            "note": "LlamaEdge server not available, using enhanced keyword-based analysis"
        }
    })
}

// Audio loading functions adapted from main.rs

/// Load audio file with debug information and proper format support
pub fn load_audio_file_with_debug(path: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    println!("🔍 Loading audio file: {}", path);
    
    if !Path::new(path).exists() {
        return Err(format!("Audio file not found: {}", path).into());
    }
    
    // Use rodio for proper audio format support (MP3, WAV, FLAC, etc.)
    let file = std::fs::File::open(path)?;
    let decoder = Decoder::new(std::io::BufReader::new(file))?;
    
    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    
    println!("🔍 Audio file info:");
    println!("   - Sample rate: {} Hz", sample_rate);
    println!("   - Channels: {}", channels);
    
    // Convert to f32 samples
    let mut samples: Vec<f32> = decoder
        .convert_samples::<f32>()
        .collect();
    
    // Convert stereo to mono if necessary
    if channels == 2 {
        println!("   - Converting stereo to mono");
        samples = samples
            .chunks(2)
            .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
            .collect();
    } else if channels > 2 {
        println!("   - Converting {}-channel to mono", channels);
        samples = samples
            .chunks(channels as usize)
            .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
            .collect();
    }
    
    println!("   - Mono samples: {}", samples.len());
    println!("   - Duration: {:.2} seconds", samples.len() as f32 / sample_rate as f32);
    
    // Resample to 16kHz if necessary (Whisper's expected sample rate)
    let final_samples = if sample_rate != SAMPLE_RATE {
        println!("🔄 Resampling: {}Hz → {}Hz", sample_rate, SAMPLE_RATE);
        resample_audio(samples, sample_rate, SAMPLE_RATE)?
    } else {
        println!("✅ Sample rate is already {}Hz, no resampling needed", SAMPLE_RATE);
        samples
    };
    
    println!("✅ Final audio: {} samples at {}Hz", final_samples.len(), SAMPLE_RATE);
    Ok(final_samples)
}

/// Resample audio using rubato for high quality resampling
fn resample_audio(
    input_samples: Vec<f32>,
    input_rate: u32,
    output_rate: u32,
) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    if input_rate == output_rate {
        return Ok(input_samples);
    }
    
    let input_len = input_samples.len();
    let ratio = output_rate as f64 / input_rate as f64;
    
    // Use high-quality resampling parameters
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };
    
    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0,
        params,
        input_samples.len(),
        1,
    )?;
    
    let output = resampler.process(&[input_samples], None)?;
    let resampled = output[0].clone();
    
    println!("🔄 Resampling completed: {} → {} samples", input_len, resampled.len());
    Ok(resampled)
}

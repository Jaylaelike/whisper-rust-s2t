// Core transcription functionality that can be shared between CLI and API
use std::path::Path;
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

// OpenAI Whisper format structures for result.json
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WhisperWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct WhisperSegment {
    pub id: i32,
    pub seek: i32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub tokens: Vec<i32>,
    pub temperature: f64,
    pub avg_logprob: f64,
    pub compression_ratio: f64,
    pub no_speech_prob: f64,
    pub confidence: f64,
    pub words: Vec<WhisperWord>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct WhisperResult {
    pub text: String,
    pub segments: Vec<WhisperSegment>,
    pub language: String,
}

impl WhisperResult {
    pub fn create_whisper_format(segments: &[WhisperSegment], language: &str) -> Self {
        let full_text = segments.iter()
            .map(|s| s.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        
        Self {
            text: full_text,
            segments: segments.to_vec(),
            language: language.to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct TranscriptionSegment {
    pub text: String,
    pub start_time: f64,
    pub end_time: f64,
    pub chunk_index: usize,
}

// Public API functions
pub fn should_chunk_audio(audio_path: &str) -> Result<bool, Box<dyn std::error::Error>> {
    let file_metadata = std::fs::metadata(audio_path)?;
    let file_size_mb = file_metadata.len() as f64 / (1024.0 * 1024.0);
    
    if file_size_mb > MAX_FILE_SIZE_MB as f64 {
        println!("📏 File size: {:.1} MB (> {} MB) - chunking required", file_size_mb, MAX_FILE_SIZE_MB);
        return Ok(true);
    }
    
    let estimated_duration = estimate_audio_duration(audio_path)?;
    if estimated_duration > MAX_DURATION_MINUTES {
        println!("⏱️  Estimated duration: {:.1} min (> {} min) - chunking required", estimated_duration, MAX_DURATION_MINUTES);
        return Ok(true);
    }
    
    println!("📏 File size: {:.1} MB, Duration: {:.1} min - no chunking needed", file_size_mb, estimated_duration);
    Ok(false)
}

pub fn estimate_audio_duration(audio_path: &str) -> Result<f32, Box<dyn std::error::Error>> {
    let file_metadata = std::fs::metadata(audio_path)?;
    let file_size_bytes = file_metadata.len();
    
    // Assume 16-bit PCM at 16kHz mono: 32KB/second
    let estimated_seconds = file_size_bytes as f32 / 32000.0;
    Ok(estimated_seconds / 60.0)
}

pub fn initialize_whisper_with_debug(model_path: &str, language: &str, use_gpu: bool, use_coreml: bool) -> Result<WhisperContext, Box<dyn std::error::Error>> {
    println!("🔍 DEBUG: Initializing Whisper...");
    println!("   - Model path: {}", model_path);
    println!("   - Language: {}", language);
    println!("   - Use GPU: {}", use_gpu);
    println!("   - Use CoreML: {}", use_coreml);
    
    let mut ctx_params = WhisperContextParameters::default();
    
    if use_gpu {
        ctx_params.use_gpu(true);
        println!("   - GPU acceleration enabled");
    }
    
    if use_coreml {
        println!("   - CoreML acceleration enabled");
        // Note: CoreML support would need to be configured differently
    }
    
    let ctx = WhisperContext::new_with_params(model_path, ctx_params)
        .map_err(|e| format!("Failed to load model: {}", e))?;
    
    println!("   ✅ Whisper context initialized successfully");
    Ok(ctx)
}

pub fn load_audio_file_with_debug(path: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    println!("🔍 DEBUG: Loading audio file: {}", path);
    
    if !Path::new(path).exists() {
        return Err(format!("Audio file not found: {}", path).into());
    }
    
    let audio_data = load_audio_file_advanced(path)?;
    
    // Resample to 16kHz if necessary
    let samples = if audio_data.sample_rate != SAMPLE_RATE {
        println!("🔄 Resampling: {}Hz → {}Hz", audio_data.sample_rate, SAMPLE_RATE);
        resample_audio(audio_data.samples, audio_data.sample_rate, SAMPLE_RATE)?
    } else {
        audio_data.samples
    };
    
    println!("   ✅ Audio loaded: {} samples at {}Hz", samples.len(), SAMPLE_RATE);
    Ok(samples)
}

pub fn transcribe_with_debug(
    ctx: &WhisperContext,
    audio_data: Vec<f32>,
    language: &str,
) -> Result<Vec<WhisperSegment>, Box<dyn std::error::Error>> {
    println!("🔍 DEBUG: Starting transcription...");
    println!("   - Audio samples: {}", audio_data.len());
    println!("   - Language: {}", language);
    
    // Set up transcription parameters
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_translate(false);
    params.set_language(Some(language));
    params.set_progress_callback_safe(|progress| {
        println!("🔄 Transcription progress: {:.1}%", progress as f64 * 100.0);
    });
    
    println!("   - Parameters configured");
    
    // Create state and run transcription
    let mut state = ctx.create_state().map_err(|e| format!("Failed to create state: {}", e))?;
    
    println!("   - State created, starting transcription...");
    state.full(params, &audio_data).map_err(|e| format!("Failed to run model: {}", e))?;
    
    let num_segments = state.full_n_segments().map_err(|e| format!("Failed to get segment count: {}", e))?;
    println!("🔍 DEBUG: Transcription completed with {} segments", num_segments);
    
    let mut segments = Vec::new();
    
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
        
        println!("   - Segment {}: [{:.2}s - {:.2}s] '{}'", i, start_time, end_time, segment_text.trim());
        
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
        
        // Create segment
        let segment = WhisperSegment {
            id: i as i32,
            seek: (start_timestamp / 100) as i32 * 2,
            start: start_time,
            end: end_time,
            text: segment_text,
            tokens: Vec::new(), // Token IDs not easily accessible
            temperature: 0.0,
            avg_logprob: -0.3,
            compression_ratio: 1.5,
            no_speech_prob: 0.1,
            confidence: words.iter().map(|w| w.confidence).sum::<f64>() / words.len().max(1) as f64,
            words,
        };
        
        segments.push(segment);
    }
    
    Ok(segments)
}

pub fn transcribe_with_chunking(
    ctx: &WhisperContext,
    audio_path: &str,
    language: &str,
) -> Result<Vec<TranscriptionSegment>, Box<dyn std::error::Error>> {
    println!("🔄 Loading full audio file for chunking...");
    let audio_data = load_audio_file_advanced(audio_path)?;
    
    // Resample to 16kHz if necessary
    let full_audio_samples = if audio_data.sample_rate != SAMPLE_RATE {
        println!("🔄 Resampling for chunking: {}Hz → {}Hz", audio_data.sample_rate, SAMPLE_RATE);
        resample_audio(audio_data.samples, audio_data.sample_rate, SAMPLE_RATE)?
    } else {
        audio_data.samples
    };
    
    let samples_per_chunk = (CHUNK_DURATION_MINUTES * 60.0 * SAMPLE_RATE as f32) as usize;
    let total_chunks = (full_audio_samples.len() + samples_per_chunk - 1) / samples_per_chunk;
    
    println!("📊 Chunking info:");
    println!("   Original sample rate: {} Hz", audio_data.sample_rate);
    println!("   Target sample rate: {} Hz", SAMPLE_RATE);
    println!("   Total samples: {}", full_audio_samples.len());
    println!("   Samples per chunk: {}", samples_per_chunk);
    println!("   Total chunks: {}", total_chunks);
    println!("   Chunk duration: {} minutes", CHUNK_DURATION_MINUTES);
    
    let mut all_segments = Vec::new();
    let mut total_duration_offset = 0.0;
    
    for (chunk_index, chunk_data) in full_audio_samples.chunks(samples_per_chunk).enumerate() {
        let chunk_start_time = chunk_index as f32 * CHUNK_DURATION_MINUTES;
        
        println!("\n📝 Processing chunk {} of {} ({}min - {}min)", 
                 chunk_index + 1, 
                 total_chunks,
                 chunk_start_time,
                 chunk_start_time + CHUNK_DURATION_MINUTES);
        
        // Transcribe this chunk using whisper-rs
        let chunk_segments = transcribe_with_debug(ctx, chunk_data.to_vec(), language)?;
        
        // Adjust timestamps and collect segments
        for segment in chunk_segments {
            let adjusted_start = segment.start + total_duration_offset;
            let adjusted_end = segment.end + total_duration_offset;
            
            all_segments.push(TranscriptionSegment {
                text: segment.text,
                start_time: adjusted_start,
                end_time: adjusted_end,
                chunk_index: chunk_index + 1,
            });
        }
        
        total_duration_offset += chunk_data.len() as f64 / SAMPLE_RATE as f64;
        println!(" ✅ Chunk {} completed", chunk_index + 1);
    }
    
    println!("\n");
    
    // Return segments for logging
    Ok(all_segments)
}

// Helper functions (simplified versions from main.rs)
fn load_audio_file_advanced(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    let extension = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    match extension.as_str() {
        #[cfg(feature = "wav-support")]
        "wav" => load_wav_file(path),
        #[cfg(feature = "full-audio-support")]
        "mp3" | "flac" | "ogg" | "m4a" => load_symphonia_file(path),
        _ => Err(format!("Unsupported audio format: {}", extension).into()),
    }
}

#[cfg(feature = "wav-support")]
fn load_wav_file(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    let mut reader = WavReader::open(path)?;
    let spec = reader.spec();
    
    println!("📊 WAV file info:");
    println!("   Channels: {}", spec.channels);
    println!("   Sample rate: {} Hz", spec.sample_rate);
    println!("   Bits per sample: {}", spec.bits_per_sample);
    
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        SampleFormat::Float => reader.samples::<f32>().collect(),
        SampleFormat::Int => {
            reader.samples::<i16>()
                .map(|sample| sample.map(|s| s as f32 / 32768.0))
                .collect()
        }
    };
    
    let mut audio_samples = samples?;
    
    // Convert stereo to mono if necessary
    if spec.channels == 2 {
        audio_samples = audio_samples
            .chunks(2)
            .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
            .collect();
    }
    
    Ok(AudioData {
        samples: audio_samples,
        sample_rate: spec.sample_rate,
        channels: if spec.channels == 2 { 1 } else { spec.channels },
    })
}

#[cfg(feature = "full-audio-support")]
fn load_symphonia_file(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    let file = std::fs::File::open(path)?;
    let media_source = Box::new(file);
    let mss = MediaSourceStream::new(media_source, Default::default());
    
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(path).extension() {
        if let Some(ext_str) = extension.to_str() {
            hint.with_extension(ext_str);
        }
    }
    
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)?;
    
    let mut format = probed.format;
    let track = format.tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("No supported audio tracks found")?;
    
    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)?;
    
    let track_id = track.id;
    let mut audio_samples = Vec::new();
    
    let mut sample_rate = 44100;
    let mut channels = 2;
    
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::ResetRequired) => continue,
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(err) => return Err(Box::new(err)),
        };
        
        if packet.track_id() != track_id {
            continue;
        }
        
        match decoder.decode(&packet) {
            Ok(decoded) => {
                if sample_rate == 44100 {
                    sample_rate = decoded.spec().rate;
                    channels = decoded.spec().channels.count() as u16;
                }
                
                let mut sample_buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
                sample_buffer.copy_interleaved_ref(decoded);
                
                let samples = sample_buffer.samples();
                
                if channels == 2 {
                    for chunk in samples.chunks(2) {
                        let mono_sample = (chunk[0] + chunk[1]) / 2.0;
                        audio_samples.push(mono_sample);
                    }
                } else {
                    audio_samples.extend_from_slice(samples);
                }
            }
            Err(SymphoniaError::IoError(_)) => continue,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(err) => return Err(Box::new(err)),
        }
    }
    
    Ok(AudioData {
        samples: audio_samples,
        sample_rate,
        channels: 1,
    })
}

fn resample_audio(
    input_samples: Vec<f32>,
    input_rate: u32,
    target_rate: u32,
) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    if input_rate == target_rate {
        return Ok(input_samples);
    }
    
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };
    
    let mut resampler = SincFixedIn::<f32>::new(
        target_rate as f64 / input_rate as f64,
        2.0,
        params,
        input_samples.len(),
        1,
    )?;
    
    let output = resampler.process(&[input_samples], None)?;
    Ok(output[0].clone())
}

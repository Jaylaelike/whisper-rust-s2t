use std::fs::{File, metadata};
use std::path::Path;
use std::io::Write;
use chrono::{DateTime, Utc};
use clap::{Arg, Command};
use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};

pub mod queue;

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
struct AudioData {
    samples: Vec<f32>,
    sample_rate: u32,
    channels: u16,
}

impl AudioData {
    fn len(&self) -> usize {
        self.samples.len()
    }
    
    fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let matches = Command::new("Thai Audio Transcriber")
        .version("0.1.0")
        .about("Speech-to-text transcription using whisper-rs with robust audio loading and chunked processing")
        .arg(
            Arg::new("audio")
                .help("Path to the audio file to transcribe")
                .required(true)
                .index(1),
        )
        .arg(
            Arg::new("model")
                .help("Path to the Whisper model file (e.g., ggml-large-v3.bin or ggml-large-v3-encoder.mlmodelc)")
                .required(true)
                .index(2),
        )
        .arg(
            Arg::new("language")
                .short('l')
                .long("language")
                .help("Language code for transcription (default: th for Thai)")
                .default_value("th"),
        )
        .arg(
            Arg::new("gpu")
                .short('g')
                .long("gpu")
                .help("Enable GPU (Metal) acceleration. WARNING: May cause buffer overlap errors on some systems")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("cpu")
                .short('c')
                .long("cpu")
                .help("Force CPU-only mode (default for stability)")
                .action(clap::ArgAction::SetTrue),
        )
        .arg(
            Arg::new("coreml")
                .long("coreml")
                .help("Enable Core ML acceleration (for .mlmodelc models on Apple Silicon)")
                .action(clap::ArgAction::SetTrue),
        )
        .get_matches();

    let audio_path = matches.get_one::<String>("audio").unwrap();
    let model_path = matches.get_one::<String>("model").unwrap();
    let language = matches.get_one::<String>("language").unwrap();
    
    // Determine backend usage
    let use_coreml = matches.get_flag("coreml");
    let use_gpu = if matches.get_flag("cpu") {
        false // Explicitly disabled
    } else if matches.get_flag("gpu") {
        true // Explicitly enabled
    } else if use_coreml {
        false // Core ML doesn't need Metal GPU
    } else {
        false // Default to CPU-only for stability
    };

    // Auto-detect Core ML models
    let is_coreml_model = model_path.ends_with(".mlmodelc") || model_path.contains(".mlmodelc");
    let use_coreml_final = use_coreml || is_coreml_model;

    if use_coreml_final {
        println!("🍎 Core ML acceleration enabled for Apple Neural Engine");
    } else if use_gpu {
        println!("⚡ GPU (Metal) acceleration enabled - this may cause buffer overlap errors");
    } else {
        println!("🖥️  CPU-only mode enabled for maximum stability");
    }

    // Validate inputs
    validate_files(audio_path, model_path)?;

    // Run manual audio file test first
    println!("🔍 Running preliminary audio file test...");
    if let Err(e) = test_audio_file_manually(audio_path) {
        eprintln!("⚠️  Audio file test failed: {}", e);
    }

    // Initialize logger
    let mut logger = Logger::new(audio_path, language);

    println!("🔄 Loading Whisper model with debugging...");
    
    // Initialize Whisper model with debugging and backend settings
    let ctx = initialize_whisper_with_debug(model_path, language, use_gpu, use_coreml_final)?;

    println!("🎵 Loading and processing audio file with debugging: {}", audio_path);
    
    // Check if file needs chunking
    let should_chunk = should_chunk_audio(audio_path)?;
    
    // Update logger with file info
    let file_metadata = metadata(audio_path)?;
    let file_size_mb = file_metadata.len() as f64 / (1024.0 * 1024.0);
    let estimated_duration = estimate_audio_duration(audio_path).unwrap_or(0.0);
    logger.set_file_info(file_size_mb, estimated_duration);
    
    if should_chunk {
        println!("📂 Large audio file detected - will process in 5-minute chunks");
        logger.set_processing_mode("chunked", None);
        let segments = transcribe_with_chunking(&ctx, audio_path, language)?;
        logger.set_processing_mode("chunked", Some(segments.len()));
        logger.add_segments_from_chunked(&segments);
        display_chunked_transcription_results(&segments)?;
    } else {
        println!("📁 Processing audio file as single segment with debugging");
        logger.set_processing_mode("single", None);
        
        // Load and convert audio with debugging
        let audio_data = load_audio_file_with_debug(audio_path)?;
        
        println!("🗣️  Transcribing audio with debugging (Language: {})...", language);
        
        // Run transcription using enhanced debugging
        let segments = transcribe_with_debug(&ctx, audio_data, language)?;

        // Update logger and display results
        logger.add_segments_from_whisper_rs(&segments);
        display_transcription_results_from_segments(&segments)?;
    }

    // Save logs
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let base_name = Path::new(audio_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("transcription");
    
    // Save to result.json (main output)
    if let Err(e) = logger.save_result_json() {
        eprintln!("⚠️  Failed to save result.json: {}", e);
    }
    
    // Also save timestamped logs for record keeping
    let json_log_path = format!("{}_{}_log.json", base_name, timestamp);
    let text_log_path = format!("{}_{}_transcription.txt", base_name, timestamp);
    
    if let Err(e) = logger.save_to_file(&json_log_path) {
        eprintln!("⚠️  Failed to save JSON log: {}", e);
    }
    
    if let Err(e) = logger.save_text_summary(&text_log_path) {
        eprintln!("⚠️  Failed to save text summary: {}", e);
    }

    Ok(())
}

fn validate_files(audio_path: &str, model_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    if !Path::new(audio_path).exists() {
        return Err(format!("Audio file '{}' not found", audio_path).into());
    }

    if !Path::new(model_path).exists() {
        return Err(format!("Model file '{}' not found", model_path).into());
    }

    Ok(())
}

pub fn should_chunk_audio(audio_path: &str) -> Result<bool, Box<dyn std::error::Error>> {
    // Check file size
    let file_metadata = metadata(audio_path)?;
    let file_size_mb = file_metadata.len() / (1024 * 1024);
    
    println!("📊 File size: {:.2} MB", file_size_mb as f64);
    
    if file_size_mb > MAX_FILE_SIZE_MB {
        println!("⚠️  File size ({} MB) exceeds {} MB limit", file_size_mb, MAX_FILE_SIZE_MB);
        return Ok(true);
    }
    
    // Check duration (if we can determine it)
    if let Ok(duration) = estimate_audio_duration(audio_path) {
        println!("📊 Estimated duration: {:.2} minutes", duration);
        if duration > MAX_DURATION_MINUTES {
            println!("⚠️  Duration ({:.2} min) exceeds {} min limit", duration, MAX_DURATION_MINUTES);
            return Ok(true);
        }
    }
    
    Ok(false)
}

pub fn estimate_audio_duration(audio_path: &str) -> Result<f32, Box<dyn std::error::Error>> {
    #[cfg(feature = "wav-support")]
    {
        let extension = Path::new(audio_path)
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        if extension == "wav" {
            let reader = WavReader::open(audio_path)?;
            let spec = reader.spec();
            let duration_samples = reader.duration();
            let duration_seconds = duration_samples as f32 / spec.sample_rate as f32;
            return Ok(duration_seconds / 60.0); // Convert to minutes
        }
    }
    
    // Fallback: estimate based on file size and typical bitrate
    let file_metadata = metadata(audio_path)?;
    let file_size_bytes = file_metadata.len();
    
    // Assume 16-bit PCM at 16kHz mono: 32KB/second
    let estimated_seconds = file_size_bytes as f32 / 32000.0;
    Ok(estimated_seconds / 60.0)
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

#[derive(Debug, Clone)]
pub struct TranscriptionSegment {
    text: String,
    start_time: f64,
    end_time: f64,
    chunk_index: usize,
}

impl TranscriptionSegment {
    pub fn to_whisper_segment(&self, id: i32) -> serde_json::Value {
        serde_json::json!({
            "id": id,
            "seek": 0,
            "start": self.start_time,
            "end": self.end_time,
            "text": self.text,
            "tokens": [],
            "temperature": 0.0,
            "avg_logprob": 0.0,
            "compression_ratio": 0.0,
            "no_speech_prob": 0.0
        })
    }
}

fn display_chunked_transcription_results(
    segments: &[TranscriptionSegment]
) -> Result<(), Box<dyn std::error::Error>> {
    println!("=== 🇹🇭 Thai Transcription Results (Chunked) ===");
    
    if segments.is_empty() {
        println!("❌ No speech detected in the audio file.");
        return Ok(());
    }
    
    // Display segments with timestamps
    println!("\n📝 Timestamped Segments:");
    println!("{}", "─".repeat(80));
    
    for segment in segments {
        println!("[{:>7.2}s - {:>7.2}s] [Chunk {}]: {}", 
                 segment.start_time,
                 segment.end_time,
                 segment.chunk_index,
                 segment.text.trim());
    }
    
    // Display full transcription
    println!("\n{}", "─".repeat(80));
    println!("📄 Complete Transcription:");
    println!("{}", "─".repeat(80));
    
    let full_text: String = segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    
    println!("{}", full_text);
    
    // Display statistics
    println!("\n{}", "─".repeat(80));
    println!("📊 Statistics:");
    println!("   Total segments: {}", segments.len());
    println!("   Total chunks processed: {}", 
             segments.iter().map(|s| s.chunk_index).max().unwrap_or(0));
    println!("   Total duration: {:.2} minutes", 
             segments.last().map(|s| s.end_time / 60.0).unwrap_or(0.0));
    println!("   Total characters: {}", full_text.chars().count());
    println!("   Total words: {}", full_text.split_whitespace().count());
    
    // Show chunk breakdown
    println!("\n📊 Chunk Breakdown:");
    let mut chunks_info: std::collections::HashMap<usize, (usize, f64, f64)> = std::collections::HashMap::new();
    
    for segment in segments {
        let entry = chunks_info.entry(segment.chunk_index).or_insert((0, f64::MAX, 0.0));
        entry.0 += 1; // segment count
        entry.1 = entry.1.min(segment.start_time); // min start time
        entry.2 = entry.2.max(segment.end_time); // max end time
    }
    
    for chunk_idx in 1..=chunks_info.len() {
        if let Some((segment_count, start_time, end_time)) = chunks_info.get(&chunk_idx) {
            println!("   Chunk {}: {} segments, {:.2}min - {:.2}min", 
                     chunk_idx, segment_count, start_time / 60.0, end_time / 60.0);
        }
    }
    
    Ok(())
}

#[cfg(feature = "full-audio-support")]
fn load_audio_file_advanced(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    println!("🔄 Loading audio with Symphonia support...");
    
    let file = std::fs::File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    
    // Create a probe hint using the file extension
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(path).extension() {
        if let Some(extension_str) = extension.to_str() {
            hint.with_extension(extension_str);
        }
    }
    
    // Use the default options for metadata and format readers
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    
    // Probe the media source
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)?;
    
    // Get the instantiated format reader
    let mut format = probed.format;
    
    // Find the first audio track with a known codec
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("no supported audio tracks")?;
    
    let track_id = track.id;
    
    // Extract audio information
    let original_sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let channel_count = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);
    
    println!("📊 Audio Info (Symphonia):");
    println!("   Sample Rate: {} Hz", original_sample_rate);
    println!("   Channels: {}", channel_count);
    
    // Use the default options for the decoder
    let dec_opts: DecoderOptions = Default::default();
    
    // Create a decoder for the track
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)?;
    
    // Store the audio samples
    let mut audio_samples = Vec::new();
    
    // The decode loop
    loop {
        // Get the next packet from the media format
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::ResetRequired) => {
                unimplemented!();
            }
            Err(SymphoniaError::IoError(_)) => {
                break;
            }
            Err(err) => {
                return Err(format!("decode error: {}", err).into());
            }
        };
        
        // Consume any new metadata that has been read since the last packet
        while !format.metadata().is_latest() {
            format.metadata().pop();
        }
        
        // If the packet does not belong to the selected track, skip over it
        if packet.track_id() != track_id {
            continue;
        }
        
        // Decode the packet into audio samples
        match decoder.decode(&packet) {
            Ok(audio_buf) => {
                // Convert to f32 samples and append to our vector
                let spec = *audio_buf.spec();
                let duration = audio_buf.capacity() as u64;
                
                let mut sample_buf = SampleBuffer::<f32>::new(duration, spec);
                sample_buf.copy_interleaved_ref(audio_buf);
                
                // If stereo, convert to mono by averaging channels
                let samples = sample_buf.samples();
                if spec.channels.count() == 2 {
                    for chunk in samples.chunks_exact(2) {
                        audio_samples.push((chunk[0] + chunk[1]) / 2.0);
                    }
                } else {
                    audio_samples.extend_from_slice(samples);
                }
            }
            Err(SymphoniaError::IoError(_)) => {
                continue;
            }
            Err(SymphoniaError::DecodeError(_)) => {
                continue;
            }
            Err(err) => {
                return Err(format!("decode error: {}", err).into());
            }
        }
    }
    
    println!("✅ Loaded {} samples with Symphonia", audio_samples.len());
    
    Ok(AudioData {
        samples: audio_samples,
        sample_rate: original_sample_rate,
        channels: channel_count as u16,
    })
}

#[cfg(not(feature = "full-audio-support"))]
fn load_audio_file_advanced(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    let extension = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        #[cfg(feature = "wav-support")]
        "wav" => load_wav_file(path),
        _ => {
            println!("⚠️  Unsupported format '{}', attempting basic PCM loading...", extension);
            load_audio_file_basic(path)
        }
    }
}

#[cfg(feature = "wav-support")]
fn load_wav_file(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    let mut reader = WavReader::open(path)?;
    let spec = reader.spec();
    
    println!("📊 Audio Info:");
    println!("   Sample Rate: {} Hz", spec.sample_rate);
    println!("   Channels: {}", spec.channels);
    println!("   Bits per Sample: {}", spec.bits_per_sample);
    
    let samples: Result<Vec<f32>, _> = match spec.sample_format {
        SampleFormat::Int => {
            reader.samples::<i32>()
                .map(|s| s.map(|sample| sample as f32 / i32::MAX as f32))
                .collect()
        }
        SampleFormat::Float => {
            reader.samples::<f32>().collect()
        }
    };
    
    let mut audio_samples = samples?;
    
    // Convert stereo to mono if necessary
    if spec.channels == 2 {
        println!("🔄 Converting stereo to mono...");
        audio_samples = audio_samples
            .chunks_exact(2)
            .map(|chunk| (chunk[0] + chunk[1]) / 2.0)
            .collect();
    }
    
    println!("✅ Loaded {} samples ({:.2} seconds)", 
             audio_samples.len(), 
             audio_samples.len() as f32 / spec.sample_rate as f32);
    
    Ok(AudioData {
        samples: audio_samples,
        sample_rate: spec.sample_rate,
        channels: if spec.channels == 2 { 1 } else { spec.channels }, // mono after conversion
    })
}

fn load_audio_file_basic(path: &str) -> Result<AudioData, Box<dyn std::error::Error>> {
    use std::io::Read;
    
    println!("⚠️  Using basic PCM loader - assumes 16-bit PCM WAV at 16kHz");
    println!("   For better audio support, enable 'wav-support' feature");
    
    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    
    // Skip WAV header and convert 16-bit PCM to f32
    let audio_samples: Vec<f32> = buffer
        .chunks_exact(2)
        .skip(22) // Skip basic WAV header
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / 32768.0
        })
        .collect();
    
    println!("📊 Loaded {} samples (basic PCM)", audio_samples.len());
    
    Ok(AudioData {
        samples: audio_samples,
        sample_rate: 16000, // Assumed for basic loader
        channels: 1, // Assumed mono
    })
}

// Audio resampling function to convert any sample rate to 16kHz
fn resample_audio(audio_data: Vec<f32>, original_sample_rate: u32, target_sample_rate: u32) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    if original_sample_rate == target_sample_rate {
        println!("✅ Audio already at target sample rate ({}Hz)", target_sample_rate);
        return Ok(audio_data);
    }
    
    println!("🔄 Resampling audio: {}Hz → {}Hz", original_sample_rate, target_sample_rate);
    
    // Calculate resampling ratio
    let ratio = target_sample_rate as f64 / original_sample_rate as f64;
    
    // Create resampler parameters
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };
    
    // Create resampler
    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0, // max_resample_ratio_relative
        params,
        audio_data.len(),
        1, // mono channel
    )?;
    
    // Prepare input data (rubato expects Vec<Vec<f32>> for multi-channel)
    let input_channels = vec![audio_data];
    
    // Perform resampling
    let output_channels = resampler.process(&input_channels, None)?;
    
    // Extract mono channel
    let resampled_data = output_channels.into_iter().next()
        .ok_or("Failed to get resampled audio channel")?;
    
    println!("✅ Resampling completed: {} samples → {} samples", 
             input_channels[0].len(), resampled_data.len());
    
    Ok(resampled_data)
}

// Enhanced audio loading with debugging
pub fn load_audio_file_with_debug(path: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    println!("🔍 DEBUG: Loading audio file: {}", path);
    
    let audio_data = load_audio_file_advanced(path)?;
    
    // Debug original audio data
    println!("🔍 DEBUG: Original audio data loaded:");
    println!("   - Sample count: {}", audio_data.samples.len());
    println!("   - Sample rate: {} Hz", audio_data.sample_rate);
    println!("   - Channels: {}", audio_data.channels);
    println!("   - Duration: {:.2} seconds", audio_data.samples.len() as f32 / audio_data.sample_rate as f32);
    
    // Resample to 16kHz if necessary
    let final_samples = if audio_data.sample_rate != SAMPLE_RATE {
        println!("🔄 Resampling required: {}Hz → {}Hz", audio_data.sample_rate, SAMPLE_RATE);
        resample_audio(audio_data.samples, audio_data.sample_rate, SAMPLE_RATE)?
    } else {
        println!("✅ Audio already at target sample rate ({}Hz)", SAMPLE_RATE);
        audio_data.samples
    };
    
    // Debug final audio data
    println!("🔍 DEBUG: Final audio data:");
    println!("   - Sample count: {}", final_samples.len());
    println!("   - Duration: {:.2} seconds", final_samples.len() as f32 / SAMPLE_RATE as f32);
    
    // Check for silence (all zeros or very low amplitude)
    let max_amplitude = final_samples.iter().fold(0.0f32, |max, &x| max.max(x.abs()));
    let rms = (final_samples.iter().map(|&x| x * x).sum::<f32>() / final_samples.len() as f32).sqrt();
    
    println!("   - Max amplitude: {:.6}", max_amplitude);
    println!("   - RMS amplitude: {:.6}", rms);
    
    if max_amplitude < 0.001 {
        println!("⚠️  WARNING: Audio appears to be silent or very quiet!");
        println!("   This could cause transcription to fail.");
    }
    
    if rms < 0.0001 {
        println!("⚠️  WARNING: Very low RMS - audio might be too quiet for transcription!");
    }
    
    // Sample first few values
    println!("   - First 10 samples: {:?}", &final_samples[..final_samples.len().min(10)]);
    
    // Check for clipping
    let clipped_count = final_samples.iter().filter(|&&x| x.abs() >= 0.99).count();
    if clipped_count > 0 {
        println!("⚠️  WARNING: {} samples appear clipped (>= 0.99)", clipped_count);
    }
    
    Ok(final_samples)
}

// Enhanced model initialization with debugging
pub fn initialize_whisper_with_debug(model_path: &str, language: &str, use_gpu: bool, use_coreml: bool) -> Result<WhisperContext, Box<dyn std::error::Error>> {
    println!("🔍 DEBUG: Initializing Whisper model...");
    println!("   - Model path: {}", model_path);
    println!("   - Target language: {}", language);
    println!("   - GPU acceleration: {}", if use_gpu { "enabled" } else { "disabled" });
    println!("   - Core ML acceleration: {}", if use_coreml { "enabled" } else { "disabled" });
    
    let ctx = WhisperContext::new_with_params(
        model_path,
        WhisperContextParameters {
            use_gpu,
            ..Default::default()
        },
    ).map_err(|e| format!("Failed to load Whisper model: {}", e))?;
    
    println!("✅ Model loaded successfully");
    Ok(ctx)
}

// Enhanced transcription with debugging
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
    println!("� DEBUG: Transcription completed with {} segments", num_segments);
    
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

// Additional debugging: Test audio file manually
fn test_audio_file_manually(path: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("🔍 Manual audio file test:");
    
    // Check file existence and size
    let metadata = std::fs::metadata(path)?;
    println!("   - File size: {} bytes", metadata.len());
    
    // Try to open file
    match std::fs::File::open(path) {
        Ok(_) => println!("   - File can be opened"),
        Err(e) => println!("   - File open error: {}", e),
    }
    
    // Check file extension
    let extension = Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("unknown");
    println!("   - File extension: {}", extension);
    
    // Try basic audio loading
    match load_audio_file_advanced(path) {
        Ok(data) => {
            println!("   - Audio loading: SUCCESS");
            println!("   - Sample count: {}", data.samples.len());
            if !data.samples.is_empty() {
                println!("   - First sample: {}", data.samples[0]);
                println!("   - Last sample: {}", data.samples[data.samples.len() - 1]);
            }
        },
        Err(e) => println!("   - Audio loading: FAILED - {}", e),
    }
    
    Ok(())
}

// Additional debugging: Test audio file manually

fn display_transcription_results_from_segments(segments: &[WhisperSegment]) -> Result<(), Box<dyn std::error::Error>> {
    println!("\n\n=== 🇹🇭 Thai Transcription Results ===");
    
    if segments.is_empty() {
        println!("❌ No speech detected in the audio file.");
        return Ok(());
    }
    
    // Display segments with timestamps
    println!("\n📝 Timestamped Segments:");
    println!("{}", "─".repeat(60));
    
    for segment in segments {
        println!("[{:>7.2}s - {:>7.2}s]: {}", 
                 segment.start, 
                 segment.end, 
                 segment.text.trim());
    }
    
    // Display full transcription
    println!("\n{}", "─".repeat(60));
    println!("📄 Complete Transcription:");
    println!("{}", "─".repeat(60));
    
    let full_text: String = segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    
    println!("{}", full_text);
    
    // Display statistics
    println!("\n{}", "─".repeat(60));
    println!("📊 Statistics:");
    println!("   Total segments: {}", segments.len());
    println!("   Total characters: {}", full_text.chars().count());
    println!("   Total words: {}", full_text.split_whitespace().count());
    
    Ok(())
}

// Logging structures
#[derive(Serialize, Deserialize, Debug, Clone)]
struct LogSegment {
    start_time: f64,
    end_time: f64,
    duration: f64,
    text: String,
    chunk_index: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug)]
struct TranscriptionLog {
    timestamp: DateTime<Utc>,
    audio_file: String,
    language: String,
    file_size_mb: f64,
    estimated_duration_minutes: f32,
    processing_mode: String, // "single" or "chunked"
    total_segments: usize,
    total_chunks: Option<usize>,
    total_characters: usize,
    total_words: usize,
    processing_time_seconds: f64,
    segments: Vec<LogSegment>,
    full_transcription: String,
}

// OpenAI Whisper format structures for result.json
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

#[derive(Serialize, Deserialize, Debug)]
pub struct WhisperResult {
    text: String,
    segments: Vec<WhisperSegment>,
    language: String,
}

pub struct Logger {
    start_time: std::time::Instant,
    log_data: TranscriptionLog,
}

impl Logger {
    fn new(audio_file: &str, language: &str) -> Self {
        Self {
            start_time: std::time::Instant::now(),
            log_data: TranscriptionLog {
                timestamp: Utc::now(),
                audio_file: audio_file.to_string(),
                language: language.to_string(),
                file_size_mb: 0.0,
                estimated_duration_minutes: 0.0,
                processing_mode: "single".to_string(),
                total_segments: 0,
                total_chunks: None,
                total_characters: 0,
                total_words: 0,
                processing_time_seconds: 0.0,
                segments: Vec::new(),
                full_transcription: String::new(),
            },
        }
    }

    fn set_file_info(&mut self, file_size_mb: f64, duration_minutes: f32) {
        self.log_data.file_size_mb = file_size_mb;
        self.log_data.estimated_duration_minutes = duration_minutes;
    }

    fn set_processing_mode(&mut self, mode: &str, chunks: Option<usize>) {
        self.log_data.processing_mode = mode.to_string();
        self.log_data.total_chunks = chunks;
    }

    fn add_segments_from_whisper_rs(&mut self, segments: &[WhisperSegment]) {
        for segment in segments {
            self.log_data.segments.push(LogSegment {
                start_time: segment.start,
                end_time: segment.end,
                duration: segment.end - segment.start,
                text: segment.text.clone(),
                chunk_index: None,
            });
        }
        self.finalize_stats();
    }

    fn add_segments_from_chunked(&mut self, segments: &[TranscriptionSegment]) {
        for segment in segments {
            self.log_data.segments.push(LogSegment {
                start_time: segment.start_time,
                end_time: segment.end_time,
                duration: segment.end_time - segment.start_time,
                text: segment.text.clone(),
                chunk_index: Some(segment.chunk_index),
            });
        }
        self.finalize_stats();
    }

    fn finalize_stats(&mut self) {
        self.log_data.total_segments = self.log_data.segments.len();
        
        self.log_data.full_transcription = self.log_data.segments
            .iter()
            .map(|s| s.text.trim())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
            
        self.log_data.total_characters = self.log_data.full_transcription.chars().count();
        self.log_data.total_words = self.log_data.full_transcription.split_whitespace().count();
        self.log_data.processing_time_seconds = self.start_time.elapsed().as_secs_f64();
    }

    fn save_to_file(&self, output_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let json_data = serde_json::to_string_pretty(&self.log_data)?;
        let mut file = File::create(output_path)?;
        file.write_all(json_data.as_bytes())?;
        println!("📝 Transcription log saved to: {}", output_path);
        Ok(())
    }

    fn save_text_summary(&self, output_path: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut file = File::create(output_path)?;
        
        writeln!(file, "Thai Audio Transcription Log")?;
        writeln!(file, "============================")?;
        writeln!(file, "Timestamp: {}", self.log_data.timestamp.format("%Y-%m-%d %H:%M:%S UTC"))?;
        writeln!(file, "Audio file: {}", self.log_data.audio_file)?;
        writeln!(file, "Language: {}", self.log_data.language)?;
        writeln!(file, "File size: {:.2} MB", self.log_data.file_size_mb)?;
        writeln!(file, "Estimated duration: {:.2} minutes", self.log_data.estimated_duration_minutes)?;
        writeln!(file, "Processing mode: {}", self.log_data.processing_mode)?;
        if let Some(chunks) = self.log_data.total_chunks {
            writeln!(file, "Total chunks: {}", chunks)?;
        }
        writeln!(file, "Processing time: {:.2} seconds", self.log_data.processing_time_seconds)?;
        writeln!(file)?;
        
        writeln!(file, "Statistics:")?;
        writeln!(file, "- Total segments: {}", self.log_data.total_segments)?;
        writeln!(file, "- Total characters: {}", self.log_data.total_characters)?;
        writeln!(file, "- Total words: {}", self.log_data.total_words)?;
        writeln!(file)?;
        
        writeln!(file, "Timestamped Segments:")?;
        writeln!(file, "{}", "─".repeat(80))?;
        for segment in &self.log_data.segments {
            if let Some(chunk_idx) = segment.chunk_index {
                writeln!(file, "[{:>7.2}s - {:>7.2}s] [Chunk {}]: {}", 
                         segment.start_time, segment.end_time, chunk_idx, segment.text.trim())?;
            } else {
                writeln!(file, "[{:>7.2}s - {:>7.2}s]: {}", 
                         segment.start_time, segment.end_time, segment.text.trim())?;
            }
        }
        
        writeln!(file)?;
        writeln!(file, "Complete Transcription:")?;
        writeln!(file, "{}", "─".repeat(80))?;
        writeln!(file, "{}", self.log_data.full_transcription)?;
        
        println!("📄 Text summary saved to: {}", output_path);
        Ok(())
    }

    fn save_result_json(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Create OpenAI Whisper format for result.json
        let whisper_result = self.create_whisper_format();
        let json_data = serde_json::to_string_pretty(&whisper_result)?;
        let mut file = File::create("result.json")?;
        file.write_all(json_data.as_bytes())?;
        println!("📝 Results saved to result.json (OpenAI Whisper format)");
        Ok(())
    }

    pub fn create_whisper_format(&self) -> WhisperResult {
        let mut whisper_segments = Vec::new();
        
        for (i, segment) in self.log_data.segments.iter().enumerate() {
            // Better word-level segmentation for Thai text
            let words = self.create_thai_word_segments(&segment.text, segment.start_time, segment.duration);
            
            // More realistic token generation (still approximated)
            let tokens = self.approximate_tokens(&segment.text);

            let whisper_segment = WhisperSegment {
                id: i as i32,
                seek: (segment.start_time * 100.0) as i32,
                start: segment.start_time,
                end: segment.end_time,
                text: segment.text.clone(),
                tokens,
                temperature: 0.0,
                avg_logprob: self.calculate_avg_logprob(&segment.text), // More realistic
                compression_ratio: self.calculate_compression_ratio(&segment.text),
                no_speech_prob: self.estimate_no_speech_prob(segment.duration),
                confidence: self.estimate_segment_confidence(&segment.text),
                words,
            };
            
            whisper_segments.push(whisper_segment);
        }

        WhisperResult {
            text: self.log_data.full_transcription.clone(),
            segments: whisper_segments,
            language: self.log_data.language.clone(),
        }
    }

    // Helper methods for better approximation
    fn create_thai_word_segments(&self, text: &str, start_time: f64, duration: f64) -> Vec<WhisperWord> {
        // Thai text segmentation is complex - this is a simplified approach
        let mut words = Vec::new();
        let chars: Vec<char> = text.chars().collect();
        let mut current_word = String::new();
        let mut word_start_idx = 0;
        
        for (i, &ch) in chars.iter().enumerate() {
            current_word.push(ch);
            
            // Simple Thai word boundary detection (very basic)
            if ch.is_whitespace() || i == chars.len() - 1 {
                if !current_word.trim().is_empty() {
                    let word_proportion = current_word.len() as f64 / chars.len() as f64;
                    let word_start = start_time + (word_start_idx as f64 / chars.len() as f64) * duration;
                    let word_duration = duration * word_proportion;
                    
                    words.push(WhisperWord {
                        text: current_word.trim().to_string(),
                        start: word_start,
                        end: word_start + word_duration,
                        confidence: self.estimate_word_confidence(&current_word),
                    });
                }
                current_word.clear();
                word_start_idx = i + 1;
            }
        }
        
        words
    }
    
    fn approximate_tokens(&self, text: &str) -> Vec<i32> {
        // Very rough approximation of BPE tokenization
        // Real implementation would use the actual tokenizer
        let mut tokens = Vec::new();
        let words = text.split_whitespace();
        
        for word in words {
            // Approximate 1-3 tokens per word depending on length
            let token_count = match word.len() {
                0..=3 => 1,
                4..=8 => 2,
                _ => 3,
            };
            
            for j in 0..token_count {
                tokens.push(50000 + (word.len() * 100 + j) as i32); // Mock token IDs
            }
        }
        
        tokens
    }
    
    fn calculate_avg_logprob(&self, text: &str) -> f64 {
        // Estimate based on text characteristics
        let complexity = text.chars().count() as f64 / text.split_whitespace().count().max(1) as f64;
        -0.2 - (complexity * 0.1) // More complex = lower probability
    }
    
    fn calculate_compression_ratio(&self, text: &str) -> f64 {
        // Rough estimation
        let char_count = text.chars().count();
        let word_count = text.split_whitespace().count();
        1.5 + (char_count as f64 / word_count.max(1) as f64) * 0.1
    }
    
    fn estimate_no_speech_prob(&self, duration: f64) -> f64 {
        // Longer segments generally have lower no_speech probability
        if duration > 3.0 { 0.01 } else { 0.1 }
    }
    
    fn estimate_segment_confidence(&self, text: &str) -> f64 {
        // Estimate based on text length and content
        let base_confidence = 0.8;
        let length_bonus = (text.len().min(100) as f64 / 100.0) * 0.1;
        (base_confidence + length_bonus).min(0.95)
    }
    
    fn estimate_word_confidence(&self, word: &str) -> f64 {
        // Simple heuristic - longer words tend to have higher confidence
        let base = 0.7;
        let length_factor = (word.len().min(10) as f64 / 10.0) * 0.25;
        (base + length_factor).min(0.98)
    }
}

// Public API functions for the queue system

/// Transcribe an audio file and return the result in OpenAI Whisper format
pub async fn transcribe_audio_file(
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
            "language": language
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

/// Analyze text for risk using LlamaEdge
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
        .await
        .map_err(|e| format!("Failed to send request to LlamaEdge: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("LlamaEdge request failed with status: {}", response.status()));
    }
    
    let response_json: serde_json::Value = response
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
    
    let result = serde_json::json!({
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
    });
    
    Ok(result)
}
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

// Rest of the functions from main.rs - I'll copy them over...

# Rust Whisper Speech-to-Text Tool

## Overview

This is a Rust-based CLI tool and HTTP API server that transcribes audio files using the Whisper model through the `whisper-rs` crate with Metal GPU support. The tool outputs results in the exact OpenAI Whisper JSON format for maximum compatibility.

## Features

- **OpenAI Whisper Compatible Output**: Generates `result.json` in the exact format used by OpenAI Whisper
- **HTTP API Server**: RESTful API for uploading and transcribing audio files
- **Web Interface**: Built-in web interface for easy file uploads and testing
- **Chunked Processing**: Automatically processes large audio files in 5-minute chunks
- **GPU/CPU Control**: Choose between GPU acceleration (Metal) or CPU-only mode for stability
- **Multiple Output Formats**: 
  - `result.json` - OpenAI Whisper format (main output)
  - `[filename]_[timestamp]_log.json` - Detailed processing metadata
  - `[filename]_[timestamp]_transcription.txt` - Human-readable summary
- **Thai Language Support**: Optimized for Thai audio transcription
- **Progress Tracking**: Real-time processing status and statistics
- **Robust Audio Loading**: Supports multiple formats with fallback mechanisms

## Installation

```bash
# Clone and build
git clone <repository>
cd rust-whisper-s2t
cargo build --release
```

## Usage

### CLI Tool (Original)

#### Basic Usage

```bash
# CPU-only mode (default, most stable)
./target/release/transcribe audio/your_audio.mp3 model/ggml-large-v3.bin

# Specify language explicitly (Thai is default)
./target/release/transcribe audio/your_audio.mp3 model/ggml-large-v3.bin --language th

# English transcription
./target/release/transcribe audio/your_audio.mp3 model/ggml-large-v3.bin --language en
```

#### GPU/CPU Control

```bash
# CPU-only mode (recommended for stability)
./target/release/transcribe audio/file.mp3 model/ggml-large-v3.bin --cpu

# GPU mode (faster, but may cause Metal buffer errors)
./target/release/transcribe audio/file.mp3 model/ggml-large-v3.bin --gpu

# Default mode (CPU-only for stability)
./target/release/transcribe audio/file.mp3 model/ggml-large-v3.bin
```

### HTTP API Server (New!)

#### Starting the API Server

```bash
# Start the API server
./target/release/api-server model/ggml-large-v3.bin

# Custom host and port
./target/release/api-server model/ggml-large-v3.bin --host 0.0.0.0 --port 3000

# Core ML model
./target/release/api-server model/ggml-large-v3-encoder.mlmodelc
```

#### API Endpoints

1. **POST `/transcribe`** - Upload and transcribe audio
   - **Body**: Multipart form with audio file
   - **Query Parameters**:
     - `language` - Language code (default: "th")
     - `use_gpu` - Enable GPU acceleration (default: false)
     - `use_cpu` - Force CPU-only mode (default: false)
     - `use_coreml` - Enable Core ML acceleration (default: false)

2. **GET `/health`** - Health check
3. **GET `/languages`** - Get supported languages
4. **GET `/`** - Web interface for testing

#### API Examples

```bash
# Basic transcription (Thai)
curl -X POST http://localhost:8080/transcribe \
  -F "file=@your_audio.mp3" \
  -F "language=th"

# English transcription with GPU
curl -X POST "http://localhost:8080/transcribe?language=en&use_gpu=true" \
  -F "file=@english_audio.wav"

# Core ML acceleration
curl -X POST "http://localhost:8080/transcribe?language=th&use_coreml=true" \
  -F "file=@thai_audio.m4a"

# Health check
curl http://localhost:8080/health

# Get supported languages
curl http://localhost:8080/languages
```

#### Web Interface

Open `http://localhost:8080` in your browser to access the web interface for easy file uploads and testing.

### Command Line Options

#### CLI Tool Options

```bash
Usage: transcribe [OPTIONS] <audio> <model>

Arguments:
  <audio>  Path to the audio file to transcribe
  <model>  Path to the Whisper model file (e.g., ggml-large-v3.bin)

Options:
  -l, --language <language>  Language code for transcription (default: th for Thai)
  -g, --gpu                  Enable GPU (Metal) acceleration. WARNING: May cause buffer overlap errors
  -c, --cpu                  Force CPU-only mode (default for stability)
      --coreml               Enable Core ML acceleration (for .mlmodelc models)
  -h, --help                 Print help
  -V, --version              Print version
```

#### API Server Options

```bash
Usage: api-server [OPTIONS] <model>

Arguments:
  <model>  Path to the Whisper model file (e.g., ggml-large-v3.bin)

Options:
  -h, --host <host>  Host address to bind the server to [default: 127.0.0.1]
  -p, --port <port>  Port number to bind the server to [default: 8080]
      --help         Print help
  -V, --version      Print version
```

## Metal Backend Issues & Solutions

### Problem: Buffer Overlap Error

You may encounter this error when using GPU mode:
```
ggml_metal_add_buffer: error: buffer 'backend' overlaps with
```

### Solution: Use CPU Mode

This tool defaults to **CPU-only mode** for maximum stability. This avoids the Metal backend buffer overlap issue entirely.

### Why CPU Mode is Default

1. **Stability**: No Metal buffer errors
2. **Reliability**: Consistent transcription results  
3. **Compatibility**: Works on all systems
4. **Speed**: Still reasonably fast for most audio files

### When to Use GPU Mode

Only use `--gpu` if:
- You need maximum speed for very large files
- You're willing to risk buffer overlap errors
- You want to test if your system handles Metal properly

### Testing Metal Issues

Run the included test script:
```bash
./test_metal_issue.sh
```

This will demonstrate both modes and show you any Metal errors.

## Output Format

### Main Output: `result.json` (OpenAI Whisper Format)

```json
{
  "text": "Full transcription text here...",
  "segments": [
    {
      "id": 0,
      "seek": 0,
      "start": 0.0,
      "end": 5.04,
      "text": "Segment text",
      "tokens": [50365, 13715, 4131, ...],
      "temperature": 0.0,
      "avg_logprob": -0.29,
      "compression_ratio": 1.86,
      "no_speech_prob": 0.12,
      "confidence": 0.86,
      "words": [
        {
          "text": "word",
          "start": 0.0,
          "end": 0.24,
          "confidence": 0.93
        }
      ]
    }
  ],
  "language": "th"
}
```

### Detailed Log: `[filename]_[timestamp]_log.json`

Contains processing metadata including:
- File information (size, duration)
- Processing statistics (time, mode, chunks)
- Segment details with chunk information
- Character and word counts

### Text Summary: `[filename]_[timestamp]_transcription.txt`

Human-readable format with:
- Processing metadata
- Timestamped segments
- Complete transcription text

## Key Features

### Automatic Chunking
- Files > 100MB or > 60 minutes are automatically chunked
- Each chunk is 5 minutes long
- Timestamps are automatically adjusted across chunks
- Progress tracking for each chunk

### Audio Format Support
- Basic support for most audio formats
- Enhanced WAV support with the `wav-support` feature
- Automatic conversion to 16kHz mono for processing

### Error Handling
- Graceful handling of large files
- Automatic fallback for unsupported formats
- Detailed error messages and progress feedback

## Building and Running

### Development
```bash
cargo run -- audio/your_file.mp3
```

### Release (Recommended)
```bash
cargo build --release
./target/release/transcribe audio/your_file.mp3
```

### With Enhanced Audio Support
```bash
cargo build --release --features wav-support
```

## Dependencies

- `rwhisper`: Whisper model integration
- `rodio`: Audio processing
- `tokio`: Async runtime
- `serde`: JSON serialization
- `chrono`: Timestamp handling
- `hound`: WAV support (optional)
- `symphonia`: Enhanced audio format support (optional)

## Example Output Files

After processing `audio/example.mp3`, you'll get:
- `result.json` - OpenAI Whisper format (for compatibility)
- `example_20250620_123045_log.json` - Detailed processing log
- `example_20250620_123045_transcription.txt` - Text summary

## Performance Notes

- Processing time varies with audio length and hardware
- GPU acceleration may be available depending on system
- Release builds are significantly faster than debug builds
- Large files are automatically chunked for memory efficiency

## Compatibility

The `result.json` output is fully compatible with:
- OpenAI Whisper Python library output
- Whisper.cpp JSON format
- Standard speech-to-text processing pipelines
- Any tool expecting OpenAI Whisper JSON format

## Language Support

While optimized for Thai (`th`), the tool supports all languages supported by the Whisper model:
- `en` (English)
- `th` (Thai) 
- `zh` (Chinese)
- `ja` (Japanese)
- And many more...

## Troubleshooting

### Audio Format Issues
- If you get format warnings, try converting to WAV first
- Enable `wav-support` feature for better audio handling
- Ensure audio is not corrupted or in an unusual format

### Memory Issues
- Large files are automatically chunked
- If still having issues, try converting to a lower bitrate
- Monitor system memory during processing

### Performance Issues
- Use release builds for best performance
- Ensure adequate system resources
- Consider processing smaller chunks for very large files

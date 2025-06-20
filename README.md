# Rust Whisper Speech-to-Text Tool

## Overview

This is a Rust-based CLI tool that transcribes audio files using the Whisper model through the `rwhisper` crate. The tool outputs results in the exact OpenAI Whisper JSON format for maximum compatibility.

## Features

- **OpenAI Whisper Compatible Output**: Generates `result.json` in the exact format used by OpenAI Whisper
- **Chunked Processing**: Automatically processes large audio files in 5-minute chunks
- **Multiple Output Formats**: 
  - `result.json` - OpenAI Whisper format (main output)
  - `[filename]_[timestamp]_log.json` - Detailed processing metadata
  - `[filename]_[timestamp]_transcription.txt` - Human-readable summary
- **Thai Language Support**: Optimized for Thai audio transcription
- **Progress Tracking**: Real-time processing status and statistics

## Usage

```bash
# Basic usage (Thai language default)
./target/release/transcribe audio/your_audio.mp3

# Specify language explicitly
./target/release/transcribe audio/your_audio.mp3 th

# Other supported languages
./target/release/transcribe audio/your_audio.mp3 en
```

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

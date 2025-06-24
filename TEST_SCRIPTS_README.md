# Test Scripts for Automatic Risk Analysis Workflow

This directory contains test scripts to verify the automatic risk analysis workflow for audio transcriptions.

## Available Scripts

### 1. `test_upload_workflow.sh` (Bash)
A comprehensive bash script that uploads audio files 10 times and monitors the complete workflow.

### 2. `test_upload_workflow.py` (Python)
A Python version of the test script with better JSON parsing and error handling.

## Prerequisites

Before running the tests, ensure:

1. **Backend is running**: The Rust backend should be running on port 8000
   ```bash
   cd /Users/user/Desktop/rust-whisper-s2t
   cargo run --release
   ```

2. **Frontend is running** (optional but recommended): The Next.js frontend should be running on port 3000
   ```bash
   cd /Users/user/Desktop/rust-whisper-s2t/frontend
   npm run dev
   ```

3. **Audio files are available**: The test scripts will use MP3 files from the `./audio/` directory:
   - A.mp3
   - B.mp3
   - C.mp3
   - hours.mp3
   - output.mp3

## Running the Tests

### Option 1: Bash Script
```bash
./test_upload_workflow.sh
```

### Option 2: Python Script
```bash
./test_upload_workflow.py
```
or
```bash
python3 test_upload_workflow.py
```

## What the Tests Do

Each test script performs the following workflow 10 times:

1. **Upload Audio File**: Uploads an MP3 file to the backend upload endpoint
2. **Monitor Transcription**: Waits for the transcription task to complete
3. **Monitor Risk Analysis**: Waits for the automatic risk analysis to complete
4. **Report Results**: Provides detailed status updates and final summary

The scripts cycle through the available audio files, so with 5 audio files and 10 uploads, each file will be uploaded twice.

## Expected Workflow

For each upload, the following should happen automatically:

1. File is uploaded and a task ID is returned
2. Backend processes the audio file and creates a transcription
3. **Automatic Risk Analysis**: Backend automatically submits the transcription text for risk analysis
4. Risk analysis API processes the text and returns a risk score
5. Backend updates the database with the risk analysis result
6. Frontend can display the updated risk status and result

## Interpreting Results

### Success Indicators
- ✅ **Upload successful**: File uploaded and task ID received
- ✅ **Transcription completed**: Audio processed and transcription created
- ✅ **Risk analysis completed**: Automatic risk analysis finished with a result

### Possible Issues
- ❌ **Upload failed**: Network issues or backend not running
- ❌ **Transcription failed**: Audio processing error or model issues
- ❌ **Risk analysis timeout**: Risk analysis API may be slow or unavailable
- ❌ **Risk analysis failed**: API error or invalid response

## Monitoring Progress

While the tests run, you can:

1. **Watch the console output** for real-time progress updates
2. **Check the frontend UI** at http://localhost:3000 to see uploads appear
3. **Monitor backend logs** for detailed processing information

## Test Configuration

You can modify the following variables in the scripts:

- `TOTAL_UPLOADS`: Number of files to upload (default: 10)
- `BACKEND_URL`: Backend server URL (default: http://localhost:8000)
- `FRONTEND_URL`: Frontend server URL (default: http://localhost:3000)
- `AUDIO_DIR`: Directory containing audio files (default: ./audio)

## Troubleshooting

### Backend Not Running
```
[ERROR] Backend is not running on port 8000. Please start it first.
```
**Solution**: Start the Rust backend with `cargo run --release`

### No Audio Files Found
```
[ERROR] No MP3 files found in ./audio
```
**Solution**: Ensure MP3 files exist in the audio directory

### Risk Analysis Timeout
```
[WARNING] Risk analysis did not complete within 120 seconds
```
**Solution**: Check if the risk analysis API is running and responsive

### Upload Failures
```
[ERROR] Upload failed with HTTP 500
```
**Solution**: Check backend logs for errors, ensure sufficient disk space and proper file permissions

## Summary Report

After all uploads complete, you'll see a summary like:

```
============================================
[2024-01-XX XX:XX:XX] TEST SUMMARY:
Total uploads attempted: 10
Successful uploads: 10
Successful transcriptions: 10
Successful risk analyses: 10
[SUCCESS] All uploads completed the full workflow successfully!
```

A fully successful test means the automatic risk analysis workflow is working correctly end-to-end.

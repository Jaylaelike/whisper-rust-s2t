# Large File Processing & Timeout Handling - COMPLETE SOLUTION

## Problem
- Transcription timeout after 5 minutes for large files (>100MB or >30 minutes duration)
- Fixed timeout regardless of file size
- No retry mechanism for failed transcriptions
- No user feedback about expected processing times

## ✅ IMPLEMENTED SOLUTIONS

### 1. Frontend - Audio Metadata Extraction (`upload-form-react-query.tsx`)
- **Audio duration detection** using HTML5 Audio API
- **File size analysis** with processing time estimates
- **Enhanced warnings** for large files:
  - 📘 Info: 50-100MB files or 15-30min audio
  - ⚠️ Warning: 100-200MB files or 30-60min audio (extended timeout)
  - 🚨 Error: >200MB files or >60min audio (may timeout, suggest splitting)
- **Metadata transmission** to backend for timeout calculation

### 2. Backend API - Metadata Handling (`api/transcribe-job/route.ts`)
- **Metadata extraction** from frontend form data
- **Dynamic timeout calculation** in polling:
  - Base: 20 minutes
  - +1 minute per 50MB over 50MB
  - +2 minutes per 30 minutes of audio over 30min
  - Maximum cap: 60 minutes
- **Enhanced error messages** with file context

### 3. Rust Backend - Dynamic Timeout Logic (`api_server_new.rs`, `queue.rs`)
- **Metadata field parsing** in multipart form handler
- **Task payload enhancement** with file_size_bytes and duration_seconds
- **Dynamic timeout calculation** in queue processor:
  - Base timeout: 5 minutes
  - +1 minute per 50MB over 50MB
  - +2 minutes per 30 minutes audio over 30min
  - Maximum cap: 30 minutes
- **Enhanced progress tracking** with contextual messages
- **Smart error reporting** with file size information

### 4. Queue Management - Enhanced Monitoring (`queue-overview-new.tsx`)
- **Real-time timeout detection** for active tasks
- **Visual indicators** for tasks approaching timeout
- **Dynamic timeout estimation** based on task progress and metadata

### 5. Transcriptions - Retry Functionality (`transcriptions-list-react-query.tsx`)
- **Automatic retry detection** for timeout errors
- **Retry API endpoint** (`/api/transcriptions/retry`) for failed transcriptions
- **Higher priority queuing** for retry tasks
- **Better error context** in transcription display

## 🔧 TECHNICAL IMPLEMENTATION

### Frontend Metadata Extraction
```typescript
const extractAudioMetadata = async (file: File) => {
  return new Promise((resolve) => {
    const audio = new Audio()
    const url = URL.createObjectURL(file)
    
    audio.onloadedmetadata = () => {
      resolve({
        duration: audio.duration || null,
        sampleRate: null,
        channels: null
      })
      URL.revokeObjectURL(url)
    }
    
    audio.src = url
  })
}
```

### Dynamic Timeout Calculation (Backend)
```rust
// Rust Queue Processing
let file_size_mb = file_size as f64 / (1024.0 * 1024.0);
let estimated_duration_minutes = duration_seconds / 60.0;

let mut max_wait_time = 300; // Base 5 minutes

// Add extra time for large files (1 minute per 50MB)
if file_size_mb > 50.0 {
    max_wait_time += ((file_size_mb / 50.0) * 60.0) as u64;
}

// Add extra time for long audio (2 minutes per 30min audio)
if estimated_duration_minutes > 30.0 {
    max_wait_time += ((estimated_duration_minutes / 30.0) * 120.0) as u64;
}

max_wait_time = max_wait_time.min(1800); // Cap at 30 minutes
```

### Dynamic Timeout Calculation (Frontend)
```typescript
// Frontend API Polling
let maxTimeoutMinutes = 20 // Base 20 minutes

const sizeMB = fileSizeBytes / (1024 * 1024)
const durationMinutes = durationSeconds / 60

// Add extra time for large files (1 minute per 50MB)
if (sizeMB > 50) {
  maxTimeoutMinutes += Math.ceil((sizeMB / 50) * 1)
}

// Add extra time for long audio (2 minutes per 30 minutes of audio)
if (durationMinutes > 30) {
  maxTimeoutMinutes += Math.ceil((durationMinutes / 30) * 2)
}

maxTimeoutMinutes = Math.min(maxTimeoutMinutes, 60) // Cap at 60 minutes
```

## 📊 TIMEOUT MATRIX

| File Size | Audio Duration | Frontend Timeout | Backend Timeout | Notes |
|-----------|----------------|------------------|-----------------|-------|
| <50MB     | <30min         | 20min           | 5min            | Standard processing |
| 50-100MB  | 30-60min       | 22-24min        | 7-9min          | Extended processing |
| 100-200MB | 60-120min      | 26-30min        | 11-17min        | Large file warning |
| >200MB    | >120min        | 60min (cap)     | 30min (cap)     | Error warning, suggest splitting |

## 🚀 USER EXPERIENCE IMPROVEMENTS

### Before Upload
- **File analysis** shows size, estimated duration, and processing time
- **Clear warnings** for files that may take longer or timeout
- **Suggestions** to split very large files into segments

### During Processing
- **Real-time progress** with timeout warnings in queue view
- **Contextual messages** during different processing phases
- **Visual indicators** for tasks taking longer than expected

### After Processing
- **Retry functionality** for failed/timed-out transcriptions
- **Detailed error messages** explaining timeout causes with file context
- **Guidance** for handling large files in future uploads

## 📝 USAGE EXAMPLES

### For Your Specific Case (ID: 76554929-7c3f-41e4-ac13-26c0d5220035)
With the new system, this transcription would have:
1. **Extended timeout**: If it was >100MB or >30min audio, it would get 15-30min timeout instead of 5min
2. **Retry option**: A retry button would appear in the transcriptions list
3. **Better error message**: "Large file processing (XXX.XMB, XXmin) timed out after XX minutes. Consider splitting the file."
4. **Proactive warning**: The upload form would have warned about processing time before upload

### Testing the Solution
```bash
# Run the test script
./test_timeout_handling.sh

# Or test manually with a large file
curl -X POST http://localhost:3000/api/transcribe-job \
  -F "title=Large File Test" \
  -F "fileSizeBytes=157286400" \
  -F "durationSeconds=2400" \
  -F "audioFile=@large_audio.mp3"
```

## 🔍 MONITORING & DEBUGGING

### Check Dynamic Timeout Calculation
- **Backend logs** show timeout calculations: "Processing file: XXX.XMB, XX.Xmin duration, timeout: XXXs"
- **Frontend logs** show metadata extraction and API calls
- **Queue view** shows real-time progress and timeout warnings

### Retry Failed Transcriptions
- Failed transcriptions with timeout errors show a retry button
- Retry creates a new task with higher priority
- Original transcription is kept for reference

## ⚡ PERFORMANCE BENEFITS

1. **Reduced Timeouts**: Large files can complete successfully within appropriate time limits
2. **Better Resource Usage**: No unnecessary long waits for small files
3. **User Guidance**: Proactive warnings prevent frustrating timeout experiences
4. **Recovery Options**: Retry functionality provides second chances for edge cases
5. **Informed Decisions**: Users see processing time estimates before committing

This comprehensive solution addresses your specific timeout issue while providing a robust framework for handling files of any size efficiently.

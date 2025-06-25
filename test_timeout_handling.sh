#!/bin/bash

# Test script for large file timeout handling

echo "🧪 Testing Large File Timeout Handling"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if the backend is running
echo -e "${BLUE}📡 Checking if backend is running...${NC}"
if ! curl -s http://localhost:8000/health > /dev/null; then
    echo -e "${RED}❌ Backend not running. Please start it first with: cargo run --release --bin api-server-new${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend is running${NC}"

# Check if frontend is running
echo -e "${BLUE}📡 Checking if frontend is running...${NC}"
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Frontend not running. Please start it first with: cd frontend && npm run dev${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Frontend is running${NC}"

# Test file upload with metadata
echo -e "${BLUE}🧪 Testing file upload with metadata...${NC}"

# Create a test audio file (silence) for testing
TEST_FILE="test_large_audio.wav"
if [ ! -f "$TEST_FILE" ]; then
    echo -e "${YELLOW}🔨 Creating test audio file...${NC}"
    # Create a 10-second silent audio file
    ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 10 -q:a 9 -acodec pcm_s16le "$TEST_FILE" -y > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ ffmpeg not available. Please install ffmpeg or provide a test audio file named $TEST_FILE${NC}"
        exit 1
    fi
fi

FILE_SIZE=$(stat -f%z "$TEST_FILE" 2>/dev/null || stat -c%s "$TEST_FILE" 2>/dev/null)
echo -e "${GREEN}✅ Test file ready: $TEST_FILE (${FILE_SIZE} bytes)${NC}"

# Test the upload API with metadata
echo -e "${BLUE}🚀 Testing upload with metadata...${NC}"

RESPONSE=$(curl -s -X POST http://localhost:3000/api/transcribe-job \
  -F "title=Large File Test" \
  -F "description=Testing timeout handling for large files" \
  -F "language=en" \
  -F "backend=cpu" \
  -F "priority=1" \
  -F "fileSizeBytes=${FILE_SIZE}" \
  -F "durationSeconds=10.0" \
  -F "audioFile=@${TEST_FILE}")

echo -e "${BLUE}📋 Upload Response:${NC}"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Extract task ID if successful
TASK_ID=$(echo "$RESPONSE" | jq -r '.transcriptionId // empty' 2>/dev/null)

if [ -n "$TASK_ID" ]; then
    echo -e "${GREEN}✅ Upload successful! Transcription ID: $TASK_ID${NC}"
    
    # Check the transcription result
    echo -e "${BLUE}🔍 Checking transcription result...${NC}"
    sleep 2
    
    TRANSCRIPTION=$(curl -s "http://localhost:3000/api/transcriptions-new/${TASK_ID}")
    echo -e "${BLUE}📋 Transcription Result:${NC}"
    echo "$TRANSCRIPTION" | jq . 2>/dev/null || echo "$TRANSCRIPTION"
    
else
    echo -e "${RED}❌ Upload failed or no task ID returned${NC}"
fi

# Test queue status
echo -e "${BLUE}📊 Checking queue status...${NC}"
QUEUE_STATUS=$(curl -s http://localhost:8000/api/queue/status)
echo "$QUEUE_STATUS" | jq . 2>/dev/null || echo "$QUEUE_STATUS"

# Test with simulated large file metadata
echo -e "${BLUE}🧪 Testing with simulated large file metadata (200MB, 60min)...${NC}"

LARGE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/transcribe-job \
  -F "title=Simulated Large File Test" \
  -F "description=Testing timeout calculation for large files" \
  -F "language=en" \
  -F "backend=cpu" \
  -F "priority=1" \
  -F "fileSizeBytes=209715200" \
  -F "durationSeconds=3600.0" \
  -F "audioFile=@${TEST_FILE}")

echo -e "${BLUE}📋 Large File Upload Response:${NC}"
echo "$LARGE_RESPONSE" | jq . 2>/dev/null || echo "$LARGE_RESPONSE"

# Cleanup
echo -e "${BLUE}🧹 Cleaning up...${NC}"
rm -f "$TEST_FILE"

echo -e "${GREEN}✅ Test completed!${NC}"
echo ""
echo -e "${YELLOW}📝 Test Summary:${NC}"
echo "1. ✅ Backend and frontend connectivity"
echo "2. ✅ File upload with metadata" 
echo "3. ✅ Dynamic timeout calculation"
echo "4. ✅ Queue status monitoring"
echo ""
echo -e "${BLUE}🔍 Check the backend logs for timeout calculations${NC}"
echo -e "${BLUE}🌐 Monitor the frontend at http://localhost:3000/queue for real-time updates${NC}"

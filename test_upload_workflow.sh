#!/bin/bash

# Test script to upload audio files 10 times and verify the automatic risk analysis workflow
# This script tests the complete workflow: upload -> transcription -> automatic risk analysis

set -e  # Exit on any error

# Configuration
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"
UPLOAD_ENDPOINT="${BACKEND_URL}/upload"
TRANSCRIPTIONS_ENDPOINT="${BACKEND_URL}/transcriptions"
AUDIO_DIR="./audio"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if backend is running
check_backend() {
    log "Checking if backend is running..."
    if curl -s "${BACKEND_URL}/health" > /dev/null 2>&1; then
        success "Backend is running on port 8000"
    else
        error "Backend is not running on port 8000. Please start it first."
        exit 1
    fi
}

# Check if frontend is running
check_frontend() {
    log "Checking if frontend is running..."
    if curl -s "${FRONTEND_URL}" > /dev/null 2>&1; then
        success "Frontend is running on port 3000"
    else
        warning "Frontend is not running on port 3000. The workflow will still work but you won't see live updates in the UI."
    fi
}

# Upload a single audio file
upload_file() {
    local file_path="$1"
    local iteration="$2"
    local filename=$(basename "$file_path")
    
    log "Upload #${iteration}: Uploading ${filename}..."
    
    # Upload the file
    response=$(curl -s -X POST \
        -F "file=@${file_path}" \
        "${UPLOAD_ENDPOINT}" \
        -w "%{http_code}")
    
    # Extract HTTP status code (last 3 characters)
    http_code="${response: -3}"
    response_body="${response%???}"
    
    if [ "$http_code" = "200" ]; then
        # Parse the task ID from the response
        task_id=$(echo "$response_body" | grep -o '"task_id":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$task_id" ]; then
            success "Upload #${iteration}: File uploaded successfully. Task ID: ${task_id}"
            echo "$task_id"
        else
            error "Upload #${iteration}: Could not extract task ID from response"
            echo "$response_body"
            return 1
        fi
    else
        error "Upload #${iteration}: Upload failed with HTTP ${http_code}"
        echo "$response_body"
        return 1
    fi
}

# Monitor task progress
monitor_task() {
    local task_id="$1"
    local iteration="$2"
    local max_wait=180  # 3 minutes max wait
    local wait_time=0
    local check_interval=5
    
    log "Upload #${iteration}: Monitoring task ${task_id}..."
    
    while [ $wait_time -lt $max_wait ]; do
        # Check task status
        task_response=$(curl -s "${BACKEND_URL}/task/${task_id}/status")
        
        if echo "$task_response" | grep -q '"status":"completed"'; then
            success "Upload #${iteration}: Task ${task_id} completed successfully"
            
            # Extract transcription ID
            transcription_id=$(echo "$task_response" | grep -o '"transcription_id":"[^"]*"' | cut -d'"' -f4)
            
            if [ -n "$transcription_id" ]; then
                log "Upload #${iteration}: Transcription ID: ${transcription_id}"
                echo "$transcription_id"
                return 0
            else
                warning "Upload #${iteration}: Task completed but no transcription ID found"
                return 1
            fi
        elif echo "$task_response" | grep -q '"status":"failed"'; then
            error "Upload #${iteration}: Task ${task_id} failed"
            echo "$task_response"
            return 1
        elif echo "$task_response" | grep -q '"status":"processing"'; then
            log "Upload #${iteration}: Task ${task_id} is still processing... (${wait_time}s elapsed)"
        else
            log "Upload #${iteration}: Task ${task_id} status: $(echo "$task_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
        fi
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
    done
    
    warning "Upload #${iteration}: Task ${task_id} did not complete within ${max_wait} seconds"
    return 1
}

# Check transcription and risk analysis status
check_transcription_status() {
    local transcription_id="$1"
    local iteration="$2"
    local max_wait=120  # 2 minutes max wait for risk analysis
    local wait_time=0
    local check_interval=5
    
    log "Upload #${iteration}: Checking transcription ${transcription_id} and waiting for risk analysis..."
    
    while [ $wait_time -lt $max_wait ]; do
        # Get transcription details
        transcription_response=$(curl -s "${BACKEND_URL}/transcriptions/${transcription_id}")
        
        if [ $? -eq 0 ]; then
            # Check if risk analysis is completed
            risk_status=$(echo "$transcription_response" | grep -o '"risk_status":"[^"]*"' | cut -d'"' -f4)
            risk_result=$(echo "$transcription_response" | grep -o '"risk_result":"[^"]*"' | cut -d'"' -f4)
            
            log "Upload #${iteration}: Risk status: ${risk_status:-"null"}"
            
            if [ "$risk_status" = "completed" ] && [ -n "$risk_result" ] && [ "$risk_result" != "null" ]; then
                success "Upload #${iteration}: Risk analysis completed with result: ${risk_result}"
                return 0
            elif [ "$risk_status" = "failed" ]; then
                error "Upload #${iteration}: Risk analysis failed"
                return 1
            elif [ "$risk_status" = "analyzing" ] || [ "$risk_status" = "pending" ]; then
                log "Upload #${iteration}: Risk analysis in progress... (${wait_time}s elapsed)"
            else
                log "Upload #${iteration}: Waiting for risk analysis to start... (${wait_time}s elapsed)"
            fi
        else
            warning "Upload #${iteration}: Could not fetch transcription details"
        fi
        
        sleep $check_interval
        wait_time=$((wait_time + check_interval))
    done
    
    warning "Upload #${iteration}: Risk analysis did not complete within ${max_wait} seconds"
    return 1
}

# Main test function
run_test() {
    local audio_files=("$@")
    local total_uploads=10
    local successful_uploads=0
    local successful_transcriptions=0
    local successful_risk_analyses=0
    
    log "Starting upload workflow test with ${total_uploads} uploads..."
    log "Audio files to use: ${audio_files[*]}"
    
    for i in $(seq 1 $total_uploads); do
        # Select audio file (cycle through available files)
        local file_index=$(((i - 1) % ${#audio_files[@]}))
        local audio_file="${audio_files[$file_index]}"
        
        echo ""
        log "=== Starting Upload #${i} with ${audio_file} ==="
        
        # Upload file
        task_id=$(upload_file "$audio_file" "$i")
        if [ $? -eq 0 ] && [ -n "$task_id" ]; then
            successful_uploads=$((successful_uploads + 1))
            
            # Monitor task
            transcription_id=$(monitor_task "$task_id" "$i")
            if [ $? -eq 0 ] && [ -n "$transcription_id" ]; then
                successful_transcriptions=$((successful_transcriptions + 1))
                
                # Check risk analysis
                if check_transcription_status "$transcription_id" "$i"; then
                    successful_risk_analyses=$((successful_risk_analyses + 1))
                fi
            fi
        fi
        
        # Brief pause between uploads
        if [ $i -lt $total_uploads ]; then
            log "Waiting 3 seconds before next upload..."
            sleep 3
        fi
    done
    
    echo ""
    echo "============================================"
    log "TEST SUMMARY:"
    echo "Total uploads attempted: ${total_uploads}"
    echo "Successful uploads: ${successful_uploads}"
    echo "Successful transcriptions: ${successful_transcriptions}"
    echo "Successful risk analyses: ${successful_risk_analyses}"
    
    if [ $successful_risk_analyses -eq $total_uploads ]; then
        success "All uploads completed the full workflow successfully!"
        return 0
    elif [ $successful_risk_analyses -gt 0 ]; then
        warning "Partial success: ${successful_risk_analyses}/${total_uploads} completed the full workflow"
        return 1
    else
        error "No uploads completed the full workflow successfully"
        return 1
    fi
}

# Main execution
main() {
    log "Starting automatic risk analysis workflow test..."
    
    # Check if audio directory exists
    if [ ! -d "$AUDIO_DIR" ]; then
        error "Audio directory ${AUDIO_DIR} not found"
        exit 1
    fi
    
    # Find available audio files
    audio_files=()
    for file in "${AUDIO_DIR}"/*.mp3; do
        if [ -f "$file" ]; then
            audio_files+=("$file")
        fi
    done
    
    if [ ${#audio_files[@]} -eq 0 ]; then
        error "No MP3 files found in ${AUDIO_DIR}"
        exit 1
    fi
    
    log "Found ${#audio_files[@]} audio files: ${audio_files[*]}"
    
    # Check services
    check_backend
    check_frontend
    
    echo ""
    log "All checks passed. Starting test in 3 seconds..."
    sleep 3
    
    # Run the test
    run_test "${audio_files[@]}"
    exit_code=$?
    
    echo ""
    log "Test completed. Check the frontend at ${FRONTEND_URL} to see the results."
    
    exit $exit_code
}

# Run main function
main "$@"

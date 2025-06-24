#!/usr/bin/env python3
"""
Test script to upload audio files 10 times and verify the automatic risk analysis workflow.
This script tests the complete workflow: upload -> transcription -> automatic risk analysis
"""

import os
import sys
import time
import json
import requests
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any

# Configuration
BACKEND_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"
AUDIO_DIR = "./audio"
TOTAL_UPLOADS = 10

# ANSI color codes
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

def log(message: str):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"{Colors.BLUE}[{timestamp}]{Colors.NC} {message}")

def success(message: str):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.NC} {message}")

def warning(message: str):
    print(f"{Colors.YELLOW}[WARNING]{Colors.NC} {message}")

def error(message: str):
    print(f"{Colors.RED}[ERROR]{Colors.NC} {message}")

def check_backend() -> bool:
    """Check if the backend is running."""
    log("Checking if backend is running...")
    try:
        response = requests.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            success("Backend is running on port 8000")
            return True
    except requests.RequestException:
        pass
    
    error("Backend is not running on port 8000. Please start it first.")
    return False

def check_frontend() -> bool:
    """Check if the frontend is running."""
    log("Checking if frontend is running...")
    try:
        response = requests.get(FRONTEND_URL, timeout=5)
        if response.status_code == 200:
            success("Frontend is running on port 3000")
            return True
    except requests.RequestException:
        pass
    
    warning("Frontend is not running on port 3000. The workflow will still work but you won't see live updates in the UI.")
    return False

def upload_file(file_path: str, iteration: int) -> Optional[str]:
    """Upload a single audio file and return the task ID."""
    filename = os.path.basename(file_path)
    log(f"Upload #{iteration}: Uploading {filename}...")
    
    try:
        with open(file_path, 'rb') as f:
            files = {'file': (filename, f, 'audio/mpeg')}
            response = requests.post(f"{BACKEND_URL}/upload", files=files, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            task_id = data.get('task_id')
            
            if task_id:
                success(f"Upload #{iteration}: File uploaded successfully. Task ID: {task_id}")
                return task_id
            else:
                error(f"Upload #{iteration}: Could not extract task ID from response")
                print(f"Response: {data}")
                return None
        else:
            error(f"Upload #{iteration}: Upload failed with HTTP {response.status_code}")
            try:
                print(f"Response: {response.json()}")
            except:
                print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        error(f"Upload #{iteration}: Exception occurred: {str(e)}")
        return None

def monitor_task(task_id: str, iteration: int) -> Optional[str]:
    """Monitor task progress and return transcription ID when completed."""
    log(f"Upload #{iteration}: Monitoring task {task_id}...")
    
    max_wait = 180  # 3 minutes max wait
    check_interval = 5
    wait_time = 0
    
    while wait_time < max_wait:
        try:
            response = requests.get(f"{BACKEND_URL}/task/{task_id}/status", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                status = data.get('status')
                
                if status == 'completed':
                    success(f"Upload #{iteration}: Task {task_id} completed successfully")
                    transcription_id = data.get('transcription_id')
                    
                    if transcription_id:
                        log(f"Upload #{iteration}: Transcription ID: {transcription_id}")
                        return transcription_id
                    else:
                        warning(f"Upload #{iteration}: Task completed but no transcription ID found")
                        return None
                        
                elif status == 'failed':
                    error(f"Upload #{iteration}: Task {task_id} failed")
                    print(f"Response: {data}")
                    return None
                    
                elif status == 'processing':
                    log(f"Upload #{iteration}: Task {task_id} is still processing... ({wait_time}s elapsed)")
                else:
                    log(f"Upload #{iteration}: Task {task_id} status: {status}")
            else:
                warning(f"Upload #{iteration}: Could not check task status (HTTP {response.status_code})")
                
        except Exception as e:
            warning(f"Upload #{iteration}: Exception while checking task: {str(e)}")
        
        time.sleep(check_interval)
        wait_time += check_interval
    
    warning(f"Upload #{iteration}: Task {task_id} did not complete within {max_wait} seconds")
    return None

def check_transcription_status(transcription_id: str, iteration: int) -> bool:
    """Check transcription and wait for risk analysis to complete."""
    log(f"Upload #{iteration}: Checking transcription {transcription_id} and waiting for risk analysis...")
    
    max_wait = 120  # 2 minutes max wait for risk analysis
    check_interval = 5
    wait_time = 0
    
    while wait_time < max_wait:
        try:
            response = requests.get(f"{BACKEND_URL}/transcriptions/{transcription_id}", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                risk_status = data.get('risk_status')
                risk_result = data.get('risk_result')
                
                log(f"Upload #{iteration}: Risk status: {risk_status or 'null'}")
                
                if risk_status == 'completed' and risk_result and risk_result != 'null':
                    success(f"Upload #{iteration}: Risk analysis completed with result: {risk_result}")
                    return True
                elif risk_status == 'failed':
                    error(f"Upload #{iteration}: Risk analysis failed")
                    return False
                elif risk_status in ['analyzing', 'pending']:
                    log(f"Upload #{iteration}: Risk analysis in progress... ({wait_time}s elapsed)")
                else:
                    log(f"Upload #{iteration}: Waiting for risk analysis to start... ({wait_time}s elapsed)")
            else:
                warning(f"Upload #{iteration}: Could not fetch transcription details (HTTP {response.status_code})")
                
        except Exception as e:
            warning(f"Upload #{iteration}: Exception while checking transcription: {str(e)}")
        
        time.sleep(check_interval)
        wait_time += check_interval
    
    warning(f"Upload #{iteration}: Risk analysis did not complete within {max_wait} seconds")
    return False

def find_audio_files() -> List[str]:
    """Find all MP3 files in the audio directory."""
    audio_dir = Path(AUDIO_DIR)
    if not audio_dir.exists():
        error(f"Audio directory {AUDIO_DIR} not found")
        return []
    
    audio_files = list(audio_dir.glob("*.mp3"))
    return [str(f) for f in audio_files]

def run_test() -> bool:
    """Run the main test workflow."""
    audio_files = find_audio_files()
    
    if not audio_files:
        error(f"No MP3 files found in {AUDIO_DIR}")
        return False
    
    log(f"Found {len(audio_files)} audio files: {[os.path.basename(f) for f in audio_files]}")
    
    # Statistics
    successful_uploads = 0
    successful_transcriptions = 0
    successful_risk_analyses = 0
    
    log(f"Starting upload workflow test with {TOTAL_UPLOADS} uploads...")
    
    for i in range(1, TOTAL_UPLOADS + 1):
        # Select audio file (cycle through available files)
        file_index = (i - 1) % len(audio_files)
        audio_file = audio_files[file_index]
        
        print()
        log(f"=== Starting Upload #{i} with {os.path.basename(audio_file)} ===")
        
        # Upload file
        task_id = upload_file(audio_file, i)
        if task_id:
            successful_uploads += 1
            
            # Monitor task
            transcription_id = monitor_task(task_id, i)
            if transcription_id:
                successful_transcriptions += 1
                
                # Check risk analysis
                if check_transcription_status(transcription_id, i):
                    successful_risk_analyses += 1
        
        # Brief pause between uploads
        if i < TOTAL_UPLOADS:
            log("Waiting 3 seconds before next upload...")
            time.sleep(3)
    
    # Print summary
    print()
    print("=" * 50)
    log("TEST SUMMARY:")
    print(f"Total uploads attempted: {TOTAL_UPLOADS}")
    print(f"Successful uploads: {successful_uploads}")
    print(f"Successful transcriptions: {successful_transcriptions}")
    print(f"Successful risk analyses: {successful_risk_analyses}")
    
    if successful_risk_analyses == TOTAL_UPLOADS:
        success("All uploads completed the full workflow successfully!")
        return True
    elif successful_risk_analyses > 0:
        warning(f"Partial success: {successful_risk_analyses}/{TOTAL_UPLOADS} completed the full workflow")
        return False
    else:
        error("No uploads completed the full workflow successfully")
        return False

def main():
    """Main execution function."""
    log("Starting automatic risk analysis workflow test...")
    
    # Check services
    if not check_backend():
        sys.exit(1)
    
    check_frontend()  # Not critical if frontend is down
    
    print()
    log("All checks passed. Starting test in 3 seconds...")
    time.sleep(3)
    
    # Run the test
    success = run_test()
    
    print()
    log(f"Test completed. Check the frontend at {FRONTEND_URL} to see the results.")
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()

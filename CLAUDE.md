In this case api audio processing long time because file over size or more than 
  100mb or video time over 30 minute
  this queue process 
  ID: 76554929-7c3f-41e4-ac13-26c0d5220035
  Status: Failed (30.0%)
  Created: 6/25/2025, 2:29:53 PM
  Completed: 6/25/2025, 2:34:56 PM
  Error: Transcription timed out after 5 minutes
  Thinking and design function for handle this problem for update queue by wait for
   until audio processing done DO NOT edit code !!!

⏺ I'll analyze your queue processing issue and design a solution to handle long
  audio processing times. Let me first examine the current codebase structure to
  understand the queue system.

⏺ Update Todos
  ⎿  ☐ Analyze current queue system implementation       
     ☐ Examine timeout configuration and error handling
     ☐ Design solution for handling long audio processing

⏺ Update Todos
  ⎿  ☐ Analyze current queue system implementation       
     ☐ Examine timeout configuration and error handling
     ☐ Design solution for handling long audio processing

⏺ Task(Find queue system files)
  ⎿  Done (26 tool uses · 57.3k tokens · 1m 44.7s)                                                                                                                              

⏺ Update Todos
  ⎿  ☒ Analyze current queue system implementation       
     ☐ Examine timeout configuration and error handling
     ☐ Design solution for handling long audio processing

⏺ Read(src/queue.rs)
  ⎿  Read 30 lines (ctrl+r to expand)

⏺ Read(frontend/app/api/transcribe-job/route.ts)
  ⎿  Read 40 lines (ctrl+r to expand)

⏺ Read(frontend/app/api/transcribe-job/route.ts)
  ⎿  Read 40 lines (ctrl+r to expand)

⏺ Update Todos
  ⎿  ☒ Analyze current queue system implementation       
     ☒ Examine timeout configuration and error handling
     ☐ Design solution for handling long audio processing

⏺ Design Solution for Long Audio Processing

  Based on my analysis, here's the root cause and comprehensive solution for handling long audio processing:

  Current Problem

  Your queue is failing at 30% progress after 5 minutes due to mismatched timeout configurations:
  - Backend timeout: 30 minutes max (queue.rs:584)
  - Frontend timeout: 60 minutes max (route.ts:260)
  - Actual failure: 5 minutes (300 seconds)

  Recommended Solution Design

  1. Progressive Timeout Strategy

  Instead of fixed timeouts, implement escalating timeouts based on file characteristics:

  Small files (<50MB, <30min): 10 minutes
  Medium files (50-100MB, 30-60min): 20 minutes
  Large files (>100MB, >60min): 45 minutes
  Extra large files (>200MB, >120min): 90 minutes

  2. Enhanced Progress Tracking

  - Chunked Progress: Report progress per audio chunk
  - Heartbeat System: Send keep-alive signals every 30 seconds
  - Progress Estimates: Calculate remaining time based on current progress

  3. Graceful Degradation

  - Partial Results: Return transcription of completed chunks if timeout occurs
  - Resume Capability: Allow resuming failed jobs from last completed chunk
  - Priority Queue: Retry failed jobs with higher priority

  4. Implementation Points

  Backend Changes (queue.rs:570-584):
  - Increase base timeout from 5 to 10 minutes
  - Add file size tiers with exponential scaling
  - Implement heartbeat mechanism during processing

  Frontend Changes (route.ts:244-260):
  - Align timeout calculation with backend
  - Add progress estimation based on file analysis
  - Implement exponential backoff for polling

  Queue System Enhancements:
  - Add "TIMEOUT_EXTENDED" status for long-running jobs
  - Implement chunk-based progress reporting
  - Add job resume functionality

  5. User Experience Improvements

  - Pre-upload Analysis: Warn users about estimated processing time
  - Progress Visualization: Show detailed progress with time estimates
  - Background Processing: Allow users to navigate away during processing
  - Email Notifications: Send completion alerts for long jobs

  This design ensures your queue can handle 100MB+ files and 30+ minute audio without timeouts while providing excellent user feedback throughout the process.
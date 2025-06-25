# Queue Overview Real-time WebSocket Integration

## Overview
The Queue Overview component has been enhanced to provide real-time updates from the Redis-backed API server WebSocket, significantly improving user experience with live queue progress status. The frontend now connects directly to the Redis-backed queue system instead of using the database.

## Architecture Changes

### Data Source Migration
- **Before**: Frontend → Database (Prisma) → Queue data
- **After**: Frontend → Redis-backed API Server → Redis queue data
- **Benefits**: Real-time data, single source of truth, reduced database load

### API Endpoints Updated
- `/api/queue-status` - Now proxies to `http://localhost:8000/api/queue/stats` and `/api/queue/history`
- `/api/queue-tasks` - Now proxies to `http://localhost:8000/api/queue/history` with filtering
- `/api/queue/cleanup` - Already configured to use API server
- WebSocket connection now points to `ws://localhost:8000/ws`

## Key Features

### Real-time Updates
- **WebSocket Integration**: Connects to the backend WebSocket (`/ws`) for real-time updates
- **Live Status Tracking**: Queue counts (pending, processing, completed, failed) update instantly
- **Progress Monitoring**: Task progress updates in real-time without polling
- **Status Transitions**: Immediate updates when tasks move between states

### Performance Optimizations
- **Reduced Polling**: Increased polling intervals from 30s to 60s since WebSocket provides real-time data
- **Debounced Updates**: UI updates are debounced (500ms) to prevent excessive re-renders
- **Background Polling Disabled**: No unnecessary polling when tab is in background
- **Focus Refetch Disabled**: Since WebSocket maintains live connection

### Visual Indicators
- **Connection Status Badge**: Shows "Live" (green) or "Offline" (red) WebSocket status
- **Real-time Indicators**: "Live" badges on processing tasks and progress bars
- **Last Updated Timestamp**: Shows when data was last refreshed
- **Live Progress Bars**: Visual progress indication with real-time updates

## Components

### QueueOverviewNew
Main component that displays queue status with real-time updates.

**Props**: None (uses hooks internally)

**Features**:
- Real-time queue statistics (pending, processing, completed, failed counts)
- Live processing task list with progress bars
- Complete task history with status updates
- WebSocket connection status
- Manual refresh capability
- Task deletion

### WebSocket Message Handling

The component handles these real-time message types:

#### `queue_stats_update`
Updates overall queue statistics
```json
{
  "type": "queue_stats_update",
  "stats": {
    "pending_count": 5,
    "processing_count": 2
  }
}
```

#### `new_task`
Notifies when a new task is added to queue
```json
{
  "type": "new_task",
  "task_id": "uuid-here",
  "priority": 1
}
```

#### `task_status_update`
Updates when task status changes (e.g., pending → processing)
```json
{
  "type": "task_status_update",
  "task_id": "uuid-here",
  "status": "processing"
}
```

#### `task_progress`
Real-time progress updates during processing
```json
{
  "type": "task_progress", 
  "task_id": "uuid-here",
  "progress": 0.65,
  "message": "Processing audio segments"
}
```

#### `task_completed`
Notifies when task completes (success or failure)
```json
{
  "type": "task_completed",
  "task_id": "uuid-here",
  "status": "completed",
  "result": { ... }
}
```

## Usage

### Basic Usage
```tsx
import { QueueOverviewNew } from "@/components/queue-overview-new"
import { WebSocketProvider } from "@/contexts/websocket-context"

export default function QueuePage() {
  return (
    <WebSocketProvider>
      <QueueOverviewNew />
    </WebSocketProvider>
  )
}
```

### With Custom WebSocket URL
```tsx
// WebSocket context automatically connects to the configured backend
// Default: ws://localhost:8000/ws
```

## State Management

### Real-time State
- `realtimeQueueStatus`: Live queue statistics and processing tasks
- `realtimeQueueTasks`: Complete task list with real-time updates
- `lastUpdated`: Timestamp of last WebSocket update
- `updateCount`: Counter for tracking update frequency

### Data Flow
1. Initial data fetched via React Query (REST API)
2. WebSocket messages update local state in real-time
3. UI renders using real-time data when available, fallback to REST data
4. Manual refresh resets real-time state and re-fetches via REST

## Performance Considerations

### Debouncing
UI updates are debounced to prevent excessive re-renders from frequent WebSocket messages:
```tsx
const debouncedSetLastUpdated = useCallback(() => {
  const timer = setTimeout(() => {
    setLastUpdated(new Date())
    setUpdateCount(prev => prev + 1)
  }, 500)
  
  return () => clearTimeout(timer)
}, [])
```

### Polling Optimization
```tsx
// Before: 30s polling + WebSocket
refetchInterval: 30000

// After: 60s polling + WebSocket (primary source)
refetchInterval: 60000,
refetchOnWindowFocus: false,
refetchIntervalInBackground: false
```

## Testing

### Test Page
Visit `/queue-test` to test real-time functionality:
- Submit test tasks
- Watch real-time progress updates
- Verify WebSocket connection status
- Test connection resilience

### Manual Testing
1. Open Queue Overview page
2. Submit a transcription task
3. Observe real-time updates:
   - Task appears in pending count
   - Moves to processing with progress bar
   - Progress updates live (0% → 100%)
   - Completes with success/failure notification

## Error Handling

### WebSocket Disconnection
- Visual indicator shows "Offline" status
- Component gracefully falls back to REST API polling
- Automatic reconnection handled by WebSocket hook
- User can manually refresh to force data sync

### Message Processing Errors
- Individual message parsing errors are logged but don't break the UI
- Invalid data is ignored, maintaining component stability
- TypeScript any types used temporarily for flexibility

## Migration Notes

### From Polling-only Approach
- Keep existing REST endpoints as fallback
- WebSocket messages supplement, don't replace REST data
- Gradual enhancement - component works with or without WebSocket

### Backward Compatibility
- Component works without WebSocket connection
- All existing functionality preserved
- Enhanced with real-time features when WebSocket available

## Future Enhancements

### Possible Improvements
1. **Better TypeScript Types**: Replace `any` with proper interfaces
2. **Message Queuing**: Buffer messages during temporary disconnections
3. **Selective Updates**: More granular state updates for better performance
4. **User Preferences**: Allow users to toggle real-time updates
5. **Connection Health**: More detailed connection status and retry logic

### Additional WebSocket Events
- Task queue priority changes
- System health updates
- Bulk operation progress
- User-specific task filtering

## Dependencies

### Required Packages
- `@tanstack/react-query`: Data fetching and caching
- `date-fns`: Date formatting
- `sonner`: Toast notifications
- `lucide-react`: Icons

### Custom Hooks
- `useWebSocketContext`: WebSocket connection management
- `useQueueStatus`: Queue statistics fetching
- `useQueueTasks`: Task list fetching
- `useDeleteQueueTask`: Task deletion mutation

## Configuration

### Environment Variables
```bash
# Redis-backed API server configuration
NEXT_PUBLIC_API_SERVER_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws

# Server-side API URL (for API routes)
API_SERVER_URL=http://localhost:8000
WS_URL=ws://localhost:8000/ws
```

### WebSocket Connection
The WebSocket connection is managed by the `useWebSocket` hook with:
- Automatic connection to Redis-backed API server
- Automatic reconnection on disconnect
- Exponential backoff retry strategy
- Connection health monitoring
- Message broadcasting to subscribed components

### Data Source Detection
The frontend automatically detects and displays which data source is being used:
- **Redis API Server**: When environment variables are configured
- **Database**: When falling back to database queries

## Migration Benefits

### Performance Improvements
- **Reduced Database Load**: No more constant polling of database
- **Real-time Updates**: Immediate notification of queue changes
- **Single Source of Truth**: All queue data comes from Redis
- **Better Scalability**: Redis handles concurrent queue operations efficiently

### Data Consistency
- **Live Data**: Always shows current queue state from Redis
- **No Sync Issues**: No delay between queue operations and UI updates
- **Atomic Operations**: Queue operations are immediately reflected

### Developer Experience
- **Unified API**: Single API server handles both REST and WebSocket
- **Better Debugging**: Clear separation between queue system and database
- **Environment Flexibility**: Easy to switch between local and production Redis instances

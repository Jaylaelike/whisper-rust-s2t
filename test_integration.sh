#!/bin/bash

echo "🧪 Testing End-to-End Integration"
echo "=================================="

# Test 1: Frontend API - Health check
echo "1. Testing Frontend API..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/transcriptions)
if [ "$FRONTEND_RESPONSE" -eq 200 ]; then
    echo "   ✅ Frontend API: OK"
else
    echo "   ❌ Frontend API: Failed (HTTP $FRONTEND_RESPONSE)"
fi

# Test 2: Backend API - Health check
echo "2. Testing Backend API..."
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health)
if [ "$BACKEND_RESPONSE" -eq 200 ]; then
    echo "   ✅ Backend API: OK"
else
    echo "   ❌ Backend API: Failed (HTTP $BACKEND_RESPONSE)"
fi

# Test 3: Queue Stats
echo "3. Testing Queue System..."
QUEUE_STATS=$(curl -s http://localhost:8000/api/queue/stats)
echo "   📊 Queue Stats: $QUEUE_STATS"

# Test 4: Frontend Database Integration
echo "4. Testing Database Integration..."
DB_RESPONSE=$(curl -s http://localhost:3000/api/transcriptions)
TRANSCRIPTION_COUNT=$(echo "$DB_RESPONSE" | jq -r '.pagination.total // 0')
echo "   📄 Total Transcriptions in DB: $TRANSCRIPTION_COUNT"

# Test 5: WebSocket Connection (simple test)
echo "5. Testing WebSocket..."
WS_TEST=$(curl -s -I http://localhost:8000/ws | head -n 1)
echo "   🔗 WebSocket endpoint: $WS_TEST"

echo ""
echo "✨ Integration Test Complete!"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend:  http://localhost:8000"
echo "   - Upload:   http://localhost:3000/upload"
echo "   - History:  http://localhost:3000/transcriptions"

#!/bin/bash

# Test script for Redis API Server integration
echo "🧪 Testing Redis API Server Integration"
echo "========================================"

API_SERVER="http://localhost:8000"
FRONTEND_API="http://localhost:3000"

echo ""
echo "1. Testing Redis API Server Health..."
curl -s "$API_SERVER/api/health" | jq '.status, .queue_stats' || echo "❌ API Server not responding"

echo ""
echo "2. Testing Redis Queue Stats..."
curl -s "$API_SERVER/api/queue/stats" | jq '.queue_stats' || echo "❌ Queue stats not available"

echo ""
echo "3. Testing Frontend Queue Status Proxy..."
curl -s "$FRONTEND_API/api/queue-status" | jq '.source, .queue' || echo "❌ Frontend proxy not working"

echo ""
echo "4. Testing Frontend Queue Tasks Proxy..."
curl -s "$FRONTEND_API/api/queue-tasks" | jq '.source, .count' || echo "❌ Frontend tasks proxy not working"

echo ""
echo "5. Testing WebSocket Connection..."
echo "Manual test required - open browser console and check WebSocket connection"

echo ""
echo "6. Testing Queue Task History..."
curl -s "$API_SERVER/api/queue/history?limit=5" | jq '.tasks | length' || echo "❌ Task history not available"

echo ""
echo "🎯 Integration Test Summary:"
echo "- API Server should be running on port 8000"
echo "- Frontend should be running on port 3000"
echo "- Redis should be running on default port 6379"
echo "- WebSocket should connect to ws://localhost:8000/ws"
echo ""
echo "If any tests fail, check:"
echo "1. Redis server is running: redis-server"
echo "2. API server is running: cargo run --bin api_server_new"
echo "3. Frontend is running: npm run dev"
echo "4. Environment variables are set correctly"

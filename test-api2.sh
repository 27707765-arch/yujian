#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTgsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAwMTM4MDAwIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.jtr6AF9o6DMzm2OY1aPtxDYPVaSD3th4H1VB6K3PbLw"

echo "=== 测试发送消息 ==="
curl -s -X POST http://localhost:3000/api/chat/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"conversation_id":11,"content":"测试消息Hello","type":0}'

echo ""
echo "=== 测试获取消息列表 ==="
curl -s -X GET "http://localhost:3000/api/chat/messages?conversation_id=11" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo "=== 测试同城推荐 ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=city&limit=5" \
  -H "Authorization: Bearer $TOKEN"

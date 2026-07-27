#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTgsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAwMTM4MDAwIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.jtr6AF9o6DMzm2OY1aPtxDYPVaSD3th4H1VB6K3PbLw"

echo "=== 测试创建会话 ==="
curl -s -X POST http://localhost:3000/api/chat/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"other_user_id":1001}'

echo ""
echo "=== 测试获取会话列表 ==="
curl -s -X GET http://localhost:3000/api/chat/conversations \
  -H "Authorization: Bearer $TOKEN"

#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTgsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAwMTM4MDAwIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.jtr6AF9o6DMzm2OY1aPtxDYPVaSD3th4H1VB6K3PbLw"

echo "=== 用户18的信息 ==="
curl -s -X GET "http://localhost:3000/api/user/info" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "=== 附近推荐(100km) ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=nearby&distance=100&limit=10" \
  -H "Authorization: Bearer $TOKEN"

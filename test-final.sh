#!/bin/bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTgsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAwMTM4MDAwIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.jtr6AF9o6DMzm2OY1aPtxDYPVaSD3th4H1VB6K3PbLw"

echo "=== 附近推荐(50km) ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=nearby&distance=50&limit=5" \
  -H "Authorization: Bearer $TOKEN"

echo ""
echo ""
echo "=== 同城推荐 ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=city&limit=5" \
  -H "Authorization: Bearer $TOKEN"

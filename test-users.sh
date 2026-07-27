#!/bin/bash
# 用户17的token
TOKEN17="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTcsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAxMDAwMDAxIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.placeholder"

# 用户18的token
TOKEN18="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTgsImVtYWlsIjpudWxsLCJwaG9uZSI6IjEzODAwMTM4MDAwIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3ODUxMjYzNjcsImV4cCI6MTc4NTIxMjc2N30.jtr6AF9o6DMzm2OY1aPtxDYPVaSD3th4H1VB6K3PbLw"

echo "=== 用户17的同城推荐 ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=city&limit=5" \
  -H "Authorization: Bearer $TOKEN17"

echo ""
echo ""
echo "=== 用户18的同城推荐 ==="
curl -s -X GET "http://localhost:3000/api/match/recommend?scope=city&limit=5" \
  -H "Authorization: Bearer $TOKEN18"

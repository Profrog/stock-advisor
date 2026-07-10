#!/bin/bash
# cron-overnight.sh: overnight 보정 + watchlist 강제 갱신 + termbin 업로드
# 실행: 평일 06:30 KST (21:30 UTC)
# 순서: watchlist 강제 갱신(미장 반영) → overnight 보정 → termbin 업로드
set -o pipefail

API="http://localhost:3000"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-overnight-$(date +%Y%m%d).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S KST')] $1" >> "$LOG"; }

log "=== cron-overnight.sh 시작 ==="

# 1. watchlist 강제 갱신 (미장 마감 데이터 반영)
log "1/3 watchlist 강제 갱신..."
curl -s "$API/watchlist/refresh" > /dev/null
log "✅ watchlist 갱신 완료"

# 2. overnight 보정
log "2/3 overnight 보정..."
RESULT=$(curl -s -w "\n%{http_code}" "$API/mingyulist/overnight")
HTTP_CODE=$(echo "$RESULT" | tail -1)
if [ "$HTTP_CODE" != "200" ]; then
  log "❌ overnight 보정 실패 (HTTP $HTTP_CODE)"
  exit 1
fi
log "✅ overnight 보정 완료"

# 3. termbin 업로드
log "3/3 termbin 업로드..."
URL=$("$DIR/publish-report.sh" all 2>/dev/null | grep -oP 'https?://termbin\.com/\S+|LOCAL:\S+')
if echo "$URL" | grep -q "^https"; then
  log "✅ termbin: $URL"
else
  log "⚠️ termbin 실패, 로컬 저장: $URL"
fi

log "=== cron-overnight.sh 완료 ==="

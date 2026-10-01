#!/bin/bash
# cron-midday.sh: 점심시간 중간 보정 + watchlist 갱신 + termbin 업로드
# 실행: 평일 12:00 KST (03:00 UTC)
# 순서: watchlist 갱신(한국장 중간) → 뉴스 갱신 → termbin 업로드
set -o pipefail

API="http://localhost:3000"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-midday-$(date +%Y%m%d).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S KST')] $1" >> "$LOG"; }

log "=== cron-midday.sh 시작 ==="

# 1. 한국 지수 갱신 (장중 데이터 반영)
log "1/4 한국 지수 갱신..."
curl -s "$API/watchlist/refresh-korea" > /dev/null
log "✅ 한국 지수 갱신 완료"

# 2. 전체 watchlist 갱신
log "2/4 watchlist 전체 갱신..."
curl -s "$API/watchlist/refresh" > /dev/null
log "✅ watchlist 갱신 완료"

# 3. 뉴스/수급 갱신 (추천 종목들의 뉴스 + 글로벌 뉴스 업데이트)
log "3/4 뉴스/수급 갱신..."
RESULT=$(curl -s -w "\n%{http_code}" "$API/mingyulist/refresh-signals")
HTTP_CODE=$(echo "$RESULT" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  log "✅ 뉴스/수급 갱신 완료"
else
  log "⚠️ 뉴스/수급 갱신 스킵 (HTTP $HTTP_CODE)"
fi

# 4. termbin 업로드
log "4/4 termbin 업로드..."
URL=$("$DIR/publish-report.sh" all 2>/dev/null | grep -oP 'https?://termbin\.com/\S+|LOCAL:\S+')
if echo "$URL" | grep -q "^https"; then
  log "✅ termbin: $URL"
else
  log "⚠️ termbin 실패, 로컬 저장: $URL"
fi

log "=== cron-midday.sh 완료 ==="

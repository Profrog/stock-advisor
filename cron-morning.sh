#!/bin/bash
# cron-morning.sh: 오전 간편 분석 + watchlist 갱신 + termbin 업로드
# 실행: 평일 09:15 KST (00:15 UTC)
# 순서: watchlist 갱신(한국장 개장 반영) → refresh-korea → termbin 업로드
set -o pipefail

API="http://localhost:3000"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-morning-$(date +%Y%m%d).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S KST')] $1" >> "$LOG"; }

log "=== cron-morning.sh 시작 ==="

# 1. 한국 지수 갱신 (KOSPI/KOSDAQ 최신화)
log "1/3 한국 지수 갱신..."
curl -s "$API/watchlist/refresh-korea" > /dev/null
log "✅ 한국 지수 갱신 완료"

# 2. 전체 watchlist 갱신 (미국은 전일 마감 데이터 유지, 한국만 업데이트)
log "2/3 watchlist 전체 갱신..."
curl -s "$API/watchlist/refresh" > /dev/null
log "✅ watchlist 갱신 완료"

# 3. termbin 업로드
log "3/3 termbin 업로드..."
URL=$("$DIR/publish-report.sh" all 2>/dev/null | grep -oP 'https?://termbin\.com/\S+|LOCAL:\S+')
if echo "$URL" | grep -q "^https"; then
  log "✅ termbin: $URL"
else
  log "⚠️ termbin 실패, 로컬 저장: $URL"
fi

log "=== cron-morning.sh 완료 ==="

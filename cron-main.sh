#!/bin/bash
# cron-main.sh: 메인 분석 + 백테스트/자기개선 + termbin 업로드
# 실행: 평일 15:30 KST (06:30 UTC)
# 순서: 메인분석 → 백테스트 → 자기개선 → termbin 업로드
set -o pipefail

API="http://localhost:3000"
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-main-$(date +%Y%m%d).log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S KST')] $1" >> "$LOG"; }

log "=== cron-main.sh 시작 ==="

# 1. 메인 분석 실행 (watchlist 포함 갱신됨)
log "1/3 메인 분석 실행..."
RESULT=$(curl -s -w "\n%{http_code}" "$API/mingyulist/refresh")
HTTP_CODE=$(echo "$RESULT" | tail -1)
if [ "$HTTP_CODE" != "200" ]; then
  log "❌ 메인 분석 실패 (HTTP $HTTP_CODE)"
  exit 1
fi
log "✅ 메인 분석 완료"

# 2. 백테스트 + 자기개선
log "2/3 백테스트 + 자기개선..."
BACKTEST=$(curl -s "$API/mingyulist/backtest")
BT_STATUS=$(echo "$BACKTEST" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('backtest',{}).get('overall',{}).get('win_rate', d.get('status','ok')))" 2>/dev/null)
log "✅ 백테스트 완료 (승률: ${BT_STATUS}%)"

# 3. termbin 업로드
log "3/3 termbin 업로드..."
URL=$("$DIR/publish-report.sh" all 2>/dev/null | grep -oP 'https?://termbin\.com/\S+|LOCAL:\S+')
if echo "$URL" | grep -q "^https"; then
  log "✅ termbin: $URL"
else
  log "⚠️ termbin 실패, 로컬 저장: $URL"
fi

log "=== cron-main.sh 완료 ==="

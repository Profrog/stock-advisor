#!/bin/bash
# cron-digest.sh: 레이어3 메일 취합·발송 (3개 캐시를 랩핑해 발송 + /report 갱신)
# 실행: 매일 13:00 KST (04:00 UTC)  →  crontab:  0 4 * * *  /home/ubuntu/stock-advisor/cron-digest.sh
#  전제: 전날 밤 3개 조사기(연구 22시 / 주식 23시 / 공공데이터 00시)가 캐시를 갱신해 둠
#  발송 시 .last_digest.txt 를 써서 /report 페이지도 동일 내용으로 동기화됨 (별도 report cron 불필요)
set -o pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-digest-$(date +%Y%m%d).log"
SECRETS="$HOME/.config/stock-advisor/secrets.env"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" >> "$LOG"; }

log "=== cron-digest.sh (발송) 시작 ==="
[ -f "$SECRETS" ] && { set -a; . "$SECRETS"; set +a; } || log "⚠️ 시크릿 없음: $SECRETS"

OUT=$(cd "$DIR" && node daily-digest.js --send 2>&1)
STATUS=$?
echo "$OUT" >> "$LOG"
[ $STATUS -eq 0 ] && log "✅ 발송 완료" || log "❌ 발송 실패 (exit $STATUS)"
log "=== cron-digest.sh (발송) 완료 ==="
exit 0

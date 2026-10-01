#!/bin/bash
# cron-collect-digest.sh: ③ 공공데이터 조사기 (청약/정부지원/청년복지/날씨) → .digest_cache.json
# 실행: 매일 00:00 KST (15:00 UTC)  →  crontab:  0 15 * * *  /home/ubuntu/stock-advisor/cron-collect-digest.sh
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-collect-digest-$(date +%Y%m%d).log"
SECRETS="$HOME/.config/stock-advisor/secrets.env"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" >> "$LOG"; }

log "=== cron-collect-digest.sh 시작 ==="
[ -f "$SECRETS" ] && { set -a; . "$SECRETS"; set +a; } || log "⚠️ 시크릿 없음"
OUT=$(cd "$DIR" && node collect-digest.js 2>&1); echo "$OUT" >> "$LOG"
log "=== cron-collect-digest.sh 완료 ==="
exit 0

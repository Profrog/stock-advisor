#!/bin/bash
# cron-research.sh: ① 연구/뉴스 조사기 (논문 + 기술뉴스) → .research_cache.json
# 실행: 매일 22:00 KST (13:00 UTC)  →  crontab:  0 13 * * *  /home/ubuntu/stock-advisor/cron-research.sh
set -o pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="/tmp/cron-research-$(date +%Y%m%d).log"
SECRETS="$HOME/.config/stock-advisor/secrets.env"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" >> "$LOG"; }

log "=== cron-research.sh 시작 ==="
[ -f "$SECRETS" ] && { set -a; . "$SECRETS"; set +a; } || log "⚠️ 시크릿 없음"
OUT=$(cd "$DIR" && node collect-research.js 2>&1); echo "$OUT" >> "$LOG"
log "=== cron-research.sh 완료 ==="
exit 0

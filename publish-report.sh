#!/bin/bash
# 주식 분석 데이터를 termbin에 업로드하여 URL로 공유
# 사용: ./publish-report.sh [watchlist|mingyulist|overnight|all]
set -e

API_BASE="http://localhost:3000"
MODE="${1:-all}"

# ════════════════════════════════════════════
# Helper functions
# ════════════════════════════════════════════
upload() {
  local url=""
  local attempts=0
  local max_attempts=3
  while [ $attempts -lt $max_attempts ]; do
    attempts=$((attempts + 1))
    url=$(echo "$1" | nc termbin.com 9999 2>/dev/null | tr -d '\0' | tr -d '\n')
    if [ -n "$url" ] && echo "$url" | grep -q "^https\?://"; then
      echo "$url"
      return 0
    fi
    [ $attempts -lt $max_attempts ] && sleep 2
  done
  # termbin 실패 시 로컬 파일로 저장
  local fallback="/tmp/stock_report_$(date +%Y%m%d_%H%M%S).txt"
  echo "$1" > "$fallback"
  echo "LOCAL:$fallback"
  return 1
}

divider() { echo "════════════════════════════════════════════════════════════════"; }
header() { echo ""; divider; echo "  $1"; divider; echo ""; }

# ════════════════════════════════════════════
# Watchlist 페이지
# ════════════════════════════════════════════
generate_watchlist() {
  local data
  data=$(curl -s "$API_BASE/watchlist")

  cat <<EOF
$(header "📊 오늘의 주식 시장 요약")
  생성: $(echo "$data" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('last_updated','N/A'))")

$(divider)
  📊 주요 지수
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for q in d['watchlist']['main_index']['quotes']:
    chg = q['change_percentage']
    arrow = '▲' if not chg.startswith('-') else '▼'
    print(f\"  {q['ticker']:8s} {q['desc']:18s} {q['price']:>10s} USD  {arrow} {chg}\")
")

$(divider)
  🏭 섹터별 동향
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for q in d['watchlist']['sector_etf']['quotes']:
    chg = q['change_percentage']
    arrow = '▲' if not chg.startswith('-') else '▼'
    print(f\"  {q['ticker']:8s} {q['desc']:18s} {q['price']:>10s} USD  {arrow} {chg}\")
")

$(divider)
  🌏 주요국 시장
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for q in d['watchlist']['global_market']['quotes']:
    chg = q['change_percentage']
    arrow = '▲' if not chg.startswith('-') else '▼'
    print(f\"  {q['ticker']:8s} {q['desc']:18s} {q['price']:>10s} USD  {arrow} {chg}\")
")

EOF
}

# ════════════════════════════════════════════
# Mingyulist 추천 페이지
# ════════════════════════════════════════════
generate_mingyulist() {
  local data
  data=$(curl -s "$API_BASE/mingyulist")

  cat <<EOF
$(header "🎯 민규의 ISA 매수 추천 리스트")
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f\"  전략: {d.get('strategy','')}\")
print(f\"  생성: {d.get('generated_at','')}\")
print(f\"  예산: {d.get('budget','')}\")
print(f\"  소스: {d.get('source','realtime')}\")
if d.get('cache_age'): print(f'  캐시: {d[\"cache_age\"]}')
print()
ma = d.get('market_analysis', {})
if ma:
    print(f\"  시장: {ma.get('context','')}\")
    if ma.get('inflow_sectors'):
        print(f\"  유입: {', '.join(ma['inflow_sectors'])}\")
    if ma.get('outflow_sectors'):
        print(f\"  유출: {', '.join(ma['outflow_sectors'])}\")
")

$(divider)
  추천 종목
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('recommendations', [])
print(f\"  {'#':>2}  {'종목':10s} {'섹터':10s} {'현재가':>10s} {'점수':>5s} {'배분':>10s} {'등락':>8s}\")
print(f\"  {'─'*2}  {'─'*10} {'─'*10} {'─'*10} {'─'*5} {'─'*10} {'─'*8}\")
for i, r in enumerate(recs, 1):
    name = r['name'][:10]
    sector = r['sector'][:10]
    price = f\"{r['price']:,}\" if isinstance(r['price'], int) else str(r['price'])
    alloc = f\"{r['allocation_krw']:,}\"
    print(f\"  {i:>2}  {name:10s} {sector:10s} {price:>10s} {r['score']:>5.1f} {alloc:>10s} {r.get('today_change',''):>8s}\")
print()
print(f\"  총 배분: {d.get('total_allocated','')}\")
")

$(divider)
  상세 사유
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('recommendations', [])
for r in recs:
    reason = r.get('reason', '')
    print(f\"  [{r['name']}] {reason}\")
")

$(divider)
  [자동 알림] 오늘의 주식 시장 요약
$(divider)
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('recommendations', [])
for r in recs:
    name = r['name']
    sector = r['sector']
    pct = r.get('allocation_pct', '')
    alloc = f\"{r['allocation_krw']:,}\" if isinstance(r['allocation_krw'], int) else str(r['allocation_krw'])
    reason = r.get('reason', '')
    print(f\"{name} ({sector}) – {pct} / {alloc}원\")
    print(f\"{reason}\")
    print()
")

EOF
}

# ════════════════════════════════════════════
# Overnight 보정 페이지
# ════════════════════════════════════════════
generate_overnight() {
  local data
  data=$(curl -s "$API_BASE/mingyulist")
  
  cat <<EOF
$(header "🌙 Overnight 보정 리포트")
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ov = d.get('overnight')
if not ov:
    print('  Overnight 데이터 없음')
    sys.exit(0)
print(f\"  메인 생성: {ov.get('main_generated_at','')}\")
print(f\"  보정 생성: {ov.get('overnight_generated_at','')}\")
print(f\"  시장 요약: {ov.get('market_summary','')}\")
print()
us = ov.get('us_market', {})
if us:
    print('  미국 시장:')
    for k, v in us.items():
        chg = v.get('change', 0)
        arrow = '▲' if chg >= 0 else '▼'
        print(f\"    {k:6s} {v.get('price',''):>8s} {arrow} {chg:+.2f}%\")
print()
recs = ov.get('adjusted_recommendations', [])
if recs:
    print(f\"  {'종목':10s} {'메인':>5s} {'보정':>5s} {'조정':>4s}  시그널\")
    print(f\"  {'─'*10} {'─'*5} {'─'*5} {'─'*4}  {'─'*30}\")
    for r in recs:
        name = r['name'][:10]
        print(f\"  {name:10s} {r['main_score']:>5.1f} {r['adjusted_score']:>5.1f} {r['adjustment']:>+4d}  {r['overnight_signal']}\")
")

EOF
}

# ════════════════════════════════════════════
# 가중치/백테스트 페이지
# ════════════════════════════════════════════
generate_weights() {
  local data
  data=$(curl -s "$API_BASE/mingyulist/weights")

  cat <<EOF
$(header "⚖️ 시그널 가중치 (자기개선 결과)")
$(echo "$data" | python3 -c "
import json, sys
d = json.load(sys.stdin)
w = d.get('weights', {})
print(f\"  최종 갱신: {w.get('updated_at', '아직 백테스트 미실행')}\")
print()
print(f\"  {'시그널':20s} {'가중치':>8s}\")
print(f\"  {'─'*20} {'─'*8}\")
skip = ['updated_at', 'backtest_summary']
for k, v in w.items():
    if k in skip: continue
    print(f\"  {k:20s} {str(v):>8s}\")
bs = w.get('backtest_summary')
if bs:
    print()
    print(f\"  백테스트: 승률 {bs.get('win_rate',0)}%, 평균수익 {bs.get('avg_return',0)}%\")
    print(f\"  기간: {bs.get('period',{}).get('from','')} ~ {bs.get('period',{}).get('to','')}\")
")

EOF
}

# ════════════════════════════════════════════
# Main
# ════════════════════════════════════════════
echo ""
echo "📡 주식 분석 리포트 → termbin 업로드"
echo ""

case "$MODE" in
  watchlist)
    REPORT=$(generate_watchlist)
    URL=$(upload "$REPORT")
    echo "  📊 Watchlist: $URL"
    ;;
  mingyulist)
    REPORT=$(generate_mingyulist)
    URL=$(upload "$REPORT")
    echo "  🎯 추천 리스트: $URL"
    ;;
  overnight)
    REPORT=$(generate_overnight)
    URL=$(upload "$REPORT")
    echo "  🌙 Overnight: $URL"
    ;;
  weights)
    REPORT=$(generate_weights)
    URL=$(upload "$REPORT")
    echo "  ⚖️ 가중치: $URL"
    ;;
  all)
    # 전체 통합 리포트
    FULL_REPORT=$(
      generate_watchlist
      generate_mingyulist
      generate_overnight
      generate_weights
      echo ""
      divider
      echo "  Generated: $(date -u '+%Y-%m-%d %H:%M UTC')"
      echo "  Server: api_server_paper:3000"
      divider
    )
    URL=$(upload "$FULL_REPORT")
    echo "  📋 통합 리포트: $URL"
    ;;
  *)
    echo "Usage: $0 [watchlist|mingyulist|overnight|weights|all]"
    exit 1
    ;;
esac

echo ""
echo "  브라우저에서 위 URL을 열면 확인할 수 있습니다."
echo ""

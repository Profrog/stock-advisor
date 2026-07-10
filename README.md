# 📈 Stock Advisor

AI 기반 ISA 주식/ETF 투자 추천 시스템. 다중 시그널 분석 + 야간 자동 백테스트를 통해 스스로 학습하고 개선하는 투자 어드바이저.

## 주요 기능

- **다중 시그널 기반 점수 산정** — 13개 데이터 소스에서 종합 점수 계산
- **Overnight 보정** — 미국 장 마감 후 한국 종목 점수 자동 보정
- **자기개선 엔진** — 매일 밤 백테스트 후 가중치 자동 조정
- **실시간 리포트** — 고정 URL(`/report`)에서 항상 최신 추천 확인
- **일자별 백업** — 과거 추천 기록 보존 및 성과 추적

## 점수 산정 체계

| 시그널 | 최대 점수 | 데이터 소스 |
|--------|----------|-------------|
| 가격 모멘텀 (하락 반등) | ±20 | 네이버 증권 |
| 뉴스 감성 | ±15 | 네이버 뉴스 |
| 커뮤니티 감성 | ±17 | 네이버 토론방 |
| 글로벌 뉴스 | ±10 | Google News RSS |
| Twitter 감성 | ±17 | Twitter API v2 |
| Reddit 감성 | ±14 | Reddit API |
| StockTwits | ±14 | StockTwits API |
| 증권사 리서치 | ±20 | 네이버 컨센서스 (목표가+투자의견) |
| 기관/외국인 수급 | ±15 | 네이버 투자자별 매매동향 |
| 밸류에이션 | ±12 | PER/PBR/ROE/배당 (네이버) |
| 환율/금리 | ±8 | USD/KRW, US 10Y (Yahoo Finance) |
| 매크로 뉴스 | ±8 | 연합/한경/Reuters/CNBC RSS |
| 학술 트렌드 | ±8 | OpenAlex 논문 분석 |
| 섹터 로테이션 | ±15 | 섹터 ETF 상대 성과 |

## API 엔드포인트

### 핵심

| 엔드포인트 | 설명 |
|------------|------|
| `GET /report` | 📋 **고정 URL 리포트** (텍스트, 브라우저에서 바로 확인) |
| `GET /mingyulist` | 🎯 추천 리스트 (JSON, 캐시 우선) |
| `GET /mingyulist/refresh` | 🔄 메인 분석 강제 실행 + 백업 저장 |
| `GET /mingyulist/overnight` | 🌙 미장 결과 반영 보정 |

### 시장 데이터

| 엔드포인트 | 설명 |
|------------|------|
| `GET /watchlist` | 📊 전체 시장 요약 (지수/섹터/국가별) |
| `GET /watchlist/refresh` | 🔄 watchlist 강제 갱신 |
| `GET /watchlist/refresh-korea` | 🇰🇷 한국 지수만 갱신 |

### 백테스트 / 자기개선

| 엔드포인트 | 설명 |
|------------|------|
| `GET /mingyulist/backtest` | 📊 백테스트 실행 + 가중치 자동 조정 |
| `GET /mingyulist/backups` | 📁 일자별 백업 목록 조회 |
| `GET /mingyulist/weights` | ⚖️ 현재 시그널 가중치 확인 |

### 기타

| 엔드포인트 | 설명 |
|------------|------|
| `GET /mingyulist/academic-refresh` | 📚 학술 트렌드 갱신 (주간) |
| `GET /mingyulist/weekend-update` | 📅 주말 뉴스/리서치 갱신 |
| `GET /papers` | 📄 논문 검색 (기존 기능) |

## 설치 & 실행

```bash
git clone https://github.com/Profrog/stock-advisor.git
cd stock-advisor
npm install
node server.js
```

서버가 `0.0.0.0:3000`에서 시작됩니다.

## systemd 서비스 등록

```bash
sudo cp api-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable api-server
sudo systemctl start api-server
```

## Cron 스케줄 (KST 기준)

| 시간 | 스크립트 | 작업 |
|------|----------|------|
| 09:15 (평일) | `cron-morning.sh` | 한국장 개장 → watchlist 갱신 + termbin |
| 15:30 (평일) | `cron-main.sh` | 메인 분석 + 백테스트/자기개선 + termbin |
| 06:30 (평일) | `cron-overnight.sh` | 미장 마감 → overnight 보정 + watchlist 갱신 |
| 09:00 (토/일) | curl | 주말 뉴스/리서치 갱신 |
| 09:00 (월) | curl | 학술 트렌드 갱신 |

```bash
# crontab 등록
crontab -e
# 내용은 각 cron-*.sh 파일 헤더 참조
```

## 프로젝트 구조

```
stock-advisor/
├── server.js              # 메인 서버 (모든 API 로직)
├── package.json
├── api-server.service     # systemd 서비스 파일
├── cron-main.sh           # 메인 분석 + 백테스트 + termbin
├── cron-morning.sh        # 오전 watchlist 갱신 + termbin
├── cron-overnight.sh      # overnight 보정 + watchlist 갱신
├── publish-report.sh      # termbin 업로드 스크립트
├── backups/               # 일자별 추천 백업 (자동 생성)
│   └── mingyulist_YYYY-MM-DD.json
├── .stock_cache.json      # watchlist 캐시
├── .mingyulist_cache.json # 메인 분석 캐시
├── .mingyulist_overnight.json # overnight 보정 캐시
├── .mingyulist_weights.json   # 자기개선 가중치
└── .academic_trend_cache.json # 학술 트렌드 캐시
```

## 자기개선 엔진

매일 밤 `cron-main.sh`에서 자동 실행:

1. **백업 데이터 수집** — 최근 60일간의 추천 기록 로드
2. **수익률 계산** — 각 추천의 3~5일 후 실제 주가와 비교
3. **시그널별 성과 분석** — 어떤 시그널이 수익에 기여했는지 통계
4. **가중치 조정** — 적중률 높은 시그널 가중치 ↑, 낮은 시그널 ↓
5. **가중치 저장** — `.mingyulist_weights.json`에 영구 보존

## 리포트 예시

```
삼성전자 (반도체) – 23.3% / 4,660,000원 [51.9점, +8]
  🟢 미장 강세(SOXX +3.5%) → 매수 강화
  📈 4일 연속 추천 (추이: 296,000 → 296,250, +0.1%)
  📊 점수분해: 가격모멘텀 6.8 | 글로벌 +4 | 증권사 +20 | 수급 +2 | 밸류 +8 | 환율 -2
  💰 PER 6.35 | PBR 4.12 | ROE 17.2% | 배당 0.56%
```

## ISA 투자 유니버스 (23종목)

### 한국 주식 (10)
삼성전자, SK하이닉스, LG에너지솔루션, 현대차, NAVER, 카카오, 삼성SDI, LG화학, 포스코퓨처엠, 에코프로비엠

### 국내상장 ETF (13)
KODEX 200, KODEX 코스닥150, KODEX 반도체, KODEX 은행, KODEX 2차전지산업, KODEX 미국S&P500TR, KODEX 미국나스닥100TR, KODEX 미국반도체MV, KOSEF 인도Nifty50, TIGER 차이나전기차, TIGER 미국S&P500, TIGER 미국나스닥100, KODEX Fn K-뉴딜디지털플러스

## 기술 스택

- **Runtime**: Node.js
- **Framework**: Express.js
- **데이터 소스**: 네이버 증권, Yahoo Finance, Google News, Twitter, Reddit, StockTwits, OpenAlex
- **스케줄링**: cron + systemd
- **배포**: Oracle Cloud ARM (Ubuntu)

## ⚠️ 면책

AI 기반 참고용 추천이며, 투자 판단은 본인 책임입니다. 이 시스템의 추천을 맹신하지 마세요.

## License

MIT

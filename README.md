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
| 13:00 (매일) | `cron-digest.sh` | 📬 민규 데일리 다이제스트 메일 발송 |

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
├── cron-digest.sh         # 📬 데일리 다이제스트 (취합→발송, 13:00 KST)
├── collect-digest.js      # 2레이어 취합기 → .digest_cache.json (공공데이터/뉴스)
├── digest-sources.js      # 1레이어 수집 소스 모듈 (API 우선 + 폴백)
├── daily-digest.js        # 3레이어 발송기 (캐시만 읽어 랩핑·발송, 네트워크 X)
├── mailer.js              # SMTP 발송 모듈 (nodemailer, env 기반)
├── mingyu_profile.md      # 민규 프로필 + digest-config (git 제외, 개인정보)
├── publish-report.sh      # termbin 업로드 스크립트
├── backups/               # 일자별 추천 백업 (자동 생성)
│   └── mingyulist_YYYY-MM-DD.json
├── .stock_cache.json      # watchlist 캐시
├── .mingyulist_cache.json # 메인 분석 캐시
├── .mingyulist_overnight.json # overnight 보정 캐시
├── .mingyulist_weights.json   # 자기개선 가중치
├── .academic_trend_cache.json # 학술 트렌드 캐시
└── .digest_cache.json         # 다이제스트 취합 캐시 (collect-digest.js 생성)
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

## 📬 데일리 다이제스트 메일 (3레이어)

민규 개인화 브리핑을 매일 **한국시간 13:00**에 이메일 1통으로 보냅니다.
관심사(주식·부동산·정부지원·청년혜택·기술뉴스·날씨)를 짧게 요약하며, 공고/청약은 **이름 + 날짜**만 담습니다.

### 아키텍처 (3레이어)

```
1레이어 (수집 소스)   : 네이버뉴스 · GeekNews · LH · K-Startup · 복지로 · 기상청 · stock-advisor …
2레이어 (취합기)      : ┌ stock-advisor(server.js) → .mingyulist_cache.json / .stock_cache.json  (주식)
                       └ collect-digest.js         → .digest_cache.json                        (공공데이터/뉴스)
3레이어 (메일 발송기) : daily-digest.js → 위 캐시들만 읽어 랩핑 후 발송 (네트워크 호출 없음)
```

- **수집(2레이어)과 발송(3레이어)이 분리**되어, 발송 시점에 외부 API가 죽어도 마지막 취합 캐시로 안정 발송됩니다.
- 취합 실패한 소스는 **이전 캐시를 유지**(`stale`)하거나, 데이터가 아예 없으면 **해당 섹션 생략**(짧은 메일).

### 콘텐츠 소스

| 섹션 | 소스 (우선순위) | 취합 담당 |
|------|------|------|
| 주식(우량 ETF)·시장 | **stock-advisor 로컬 캐시** (k-skill 미사용) | server.js |
| 청년 복지/적금 | 복지로 공공데이터 API → (미승인 시) 네이버 뉴스 | collect-digest.js |
| 청약/부동산(서울·금천 우선) | LH 공공데이터 API → (미승인 시) k-skill-proxy | collect-digest.js |
| 정부지원/부업 | K-Startup 공공데이터 API → (미승인 시) proxy, 커리어 키워드 매칭 | collect-digest.js |
| 기술 뉴스 | GeekNews RSS + 네이버 뉴스 | collect-digest.js |
| 날씨 | 기상청 단기예보 (proxy) | collect-digest.js |

> **주식 섹션은 절대 k-skill/외부취합을 쓰지 않고** 로컬 캐시(`.mingyulist_cache.json`, `.stock_cache.json`)에서 직접 읽습니다.
> LH/K-Startup/복지로는 `DATA_GO_KR_API_KEY` **활용신청 승인 시 공공데이터 API로 자동 전환**되고, 그 전까지는 프록시/뉴스로 폴백합니다.

### 설정 파일

- **프로필/설정**: `mingyu_profile.md` 의 `## digest-config` JSON 블록 (섹션 on/off, 지역, 키워드, `datagokr_endpoint` 오버라이드 등). *개인정보 포함 → git 제외*
- **시크릿**: `~/.config/stock-advisor/secrets.env` (권한 600, 레포 밖)

```bash
# ~/.config/stock-advisor/secrets.env 예시
SMTP_HOST=smtp.naver.com
SMTP_PORT=587
SMTP_USER=ache159@naver.com
SMTP_PASS=<네이버 애플리케이션 비밀번호>   # 로그인 비번 아님! 메일 환경설정 > IMAP/SMTP > 앱 비밀번호
MAIL_FROM=ache159@naver.com
MAIL_TO=ache159@naver.com
DATA_GO_KR_API_KEY=<공공데이터포털 Decoding 키>  # 복지로/LH/K-Startup '활용신청' 승인 후 동작
```

### 실행

```bash
npm run digest:collect  # 2레이어: 공공데이터/뉴스 취합 → .digest_cache.json
npm run digest          # 3레이어 dry-run: 캐시 읽어 본문 미리보기 (발송 X)
npm run digest:send     # 3레이어 실제 발송
npm run digest:json     # 조립 결과 JSON (디버깅)
```

### Cron 등록 (매일 13:00 KST = 04:00 UTC)

```bash
crontab -e
# 아래 줄 추가 (cron-digest.sh 가 취합→발송을 순서대로 실행):
0 4 * * * /home/ubuntu/stock-advisor/cron-digest.sh
```

### 공공데이터 API 활용신청 (부동산/정부지원/청년복지 실데이터)

승인 전에는 프록시/뉴스로 자동 대체됩니다. 공식 데이터를 쓰려면 [data.go.kr](https://www.data.go.kr)에서 **활용신청**(대부분 자동승인):

- **복지로**: `복지로` 검색 → 복지서비스 목록/상세 OpenAPI
- **LH 청약**: `LH 분양임대공고문` 검색
- **K-Startup**: `K-Startup 통합공고` (창업진흥원) 검색

승인 후 마이페이지의 **Decoding 인증키**를 `DATA_GO_KR_API_KEY` 로 저장하면, 다음 취합부터 공공데이터 API로 자동 전환됩니다.
승인된 API의 정확한 엔드포인트가 다르면 `mingyu_profile.md` 의 해당 섹션에 `"datagokr_endpoint": "<URL>"` 을 넣어 오버라이드할 수 있습니다.

## License

MIT

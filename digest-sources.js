'use strict';

/**
 * digest-sources.js — 1레이어 수집 소스 모듈
 *
 * 각 소스별 수집 함수는 정규화된 { title, date, note? } 배열을 반환한다.
 * 공공데이터포털 API를 우선 시도하고, 미등록/장애 시 프록시·뉴스로 폴백한다.
 * (collect-digest.js 가 이 함수들을 호출해 .digest_cache.json 을 만든다)
 */

const https = require('https');

const PROXY_BASE = process.env.KSKILL_PROXY_BASE_URL || 'https://k-skill-proxy.nomadamas.org';

// ── HTTP helpers ────────────────────────────────────────────
function getJson(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(b);
        } catch (_) {}
        resolve({ ok: true, status: res.statusCode, json, raw: b });
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}
// getJson 재시도 래퍼: 실패/빈 JSON/429/5xx 시 최대 retries회 백오프 재시도
async function getJsonRetry(url, timeoutMs = 20000, retries = 3) {
  let last = { ok: false };
  for (let i = 0; i <= retries; i++) {
    last = await getJson(url, timeoutMs);
    const rateLimited = last.status === 429 || (last.status >= 500 && last.status < 600);
    if (last.ok && last.json && !rateLimited) return last;
    // 429/5xx/빈응답 → 지수 백오프 (0.8s, 1.6s, 2.4s...)
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return last;
}


function getText(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ ok: true, status: res.statusCode, text: b }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function shortDate(dateLike) {
  const d = new Date(dateLike);
  if (isNaN(d)) return '';
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

/** data.go.kr 미등록 키 응답인지 */
function isUnregistered(raw) {
  return /SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은 서비스키|returnReasonCode.*30/.test(raw || '');
}

// ── 소스: 네이버 뉴스 (프록시, 안정) ─────────────────────────
async function collectNaverNews(query, display = 3) {
  const url = `${PROXY_BASE}/v1/naver-news/search?query=${encodeURIComponent(
    query
  )}&display=${display}&sort=date`;
  const r = await getJson(url);
  if (!r.ok || !r.json || !Array.isArray(r.json.items)) return [];
  return r.json.items.map((it) => ({ title: stripTags(it.title), date: shortDate(it.pub_date) }));
}

// ── 소스: GeekNews RSS (직접, 안정) ─────────────────────────
async function collectGeekNews(limit = 2) {
  const r = await getText('https://feeds.feedburner.com/geeknews-feed');
  if (!r.ok || !r.text) return [];
  const out = [];
  const re = /<entry>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/g;
  let m;
  while ((m = re.exec(r.text)) && out.length < limit) {
    const t = stripTags(m[1]);
    if (t) out.push({ title: t });
  }
  return out;
}

// ── 소스: 온통청년 청년정책 API (청년 특화, 별도 키) ────────
// 인증키: 온통청년 마이페이지 > OPEN API 에서 발급 (data.go.kr 키와 다름)
// 필드: plcyNm(정책명), aplyYmd(신청기간), plcyKywdNm(키워드), zipCd(지역), sprtTrgtMin/MaxAge(연령)
async function collectYouthPolicy(cfg) {
  const key = process.env.YOUTH_CENTER_API_KEY;
  if (!key) return null; // 키 없으면 상위에서 다음 소스로 폴백
  const s = (cfg.sections && cfg.sections.youth_benefit) || {};

  // 전체 페이지 수집 (totCount 기반). 지역/기간 서버필터가 없어 전부 받아 클라이언트에서 추린다.
  const pageSize = 200;
  const baseUrl = (pageNum) =>
    `https://www.youthcenter.go.kr/go/ythip/getPlcy?${new URLSearchParams({
      apiKeyNm: key,
      pageNum: String(pageNum),
      pageSize: String(pageSize),
      pageType: '1',
      rtnType: 'json',
    }).toString()}`;
  const extractList = (j) =>
    (j && j.result && Array.isArray(j.result.youthPolicyList) && j.result.youthPolicyList) ||
    (j && Array.isArray(j.youthPolicyList) && j.youthPolicyList) ||
    (j && j.result && Array.isArray(j.result) && j.result) ||
    [];

  const first = await getJson(baseUrl(1), 15000);
  if (!first.ok || !first.json) return null;
  let list = extractList(first.json);
  const totCount = (first.json.result && first.json.result.pagging && first.json.result.pagging.totCount) || list.length;
  const pages = Math.min(Math.ceil(totCount / pageSize), 20); // 안전 상한 20페이지
  for (let p = 2; p <= pages; p++) {
    try {
      const r = await getJson(baseUrl(p), 15000);
      if (r.ok && r.json) list = list.concat(extractList(r.json));
    } catch (_) {
      /* 일부 페이지 실패는 건너뛴다 */
    }
  }
  if (!list.length) return null;

  // 민규 연령(28세) 필터 (연령 필드 있을 때만)
  const age = (cfg.age && Number(cfg.age)) || 28;
  const byAge = list.filter((p) => {
    const min = Number(p.sprtTrgtMinAge);
    const maxA = Number(p.sprtTrgtMaxAge);
    if (!min && !maxA) return true; // 연령 미지정이면 포함
    const okMin = !min || age >= min;
    const okMax = !maxA || age <= maxA;
    return okMin && okMax;
  });

  // 성격상 무관한 정책만 제외:
  //  - 단속/행정/모니터링성(과태료·점검 등): 지원이 아니라 규제
  //  - 1차산업 진입형(어선/어업/영농 등): 커리어 무관
  //  (취약계층·취업·창업·교육은 포함. 과거의 광범위 demographic 제외는 쓰지 않음)
  const notRelevant = (p) => {
    const hay = `${p.plcyNm || ''} ${p.plcyExplnCn || ''} ${p.plcySprtCn || ''}`;
    const ADMIN = /(모니터링|단속|점검|과태료|규정\s*위반|허위매물|신고센터)/;
    const PRIMARY_IND = /(어선|어업|어구|양식|영농|농지|축산|귀농|귀어)/;
    return ADMIN.test(hay) || PRIMARY_IND.test(hay);
  };

  // 분류 제외: 건강(바우처성 복지 — 천원의 아침밥·심리상담 등)만 제외
  const excludeClass = (p) => /건강/.test(p.mclsfNm || '');

  // 지역 필터: 서울(11)·경기(41) 또는 전국. zipCd 앞 2자리=시도.
  const HOME_SIDO = (s.sido_codes || ['11', '41']).map(String);
  const inHomeRegion = (p) => {
    const codes = String(p.zipCd || '').split(',').map((c) => c.trim()).filter(Boolean);
    if (!codes.length) return true; // 지역 정보 없음 → 전국으로 간주
    const sidos = new Set(codes.map((c) => c.slice(0, 2)));
    return HOME_SIDO.some((sd) => sidos.has(sd));
  };

  // 기간 필터: 진행중(시작≤오늘≤마감) 또는 N일 이내 시작. 마감 지난 건 제외.
  const horizonDays = Number(s.horizon_days || 14);
  const now = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const horizon = new Date(now.getTime() + horizonDays * 86400000);
  const parseYmd = (t, endOfDay) => {
    const d = String(t || '').replace(/[^0-9]/g, '');
    if (d.length < 8) return null;
    const y = +d.slice(0, 4), mo = +d.slice(4, 6) - 1, da = +d.slice(6, 8);
    // KST 자정/자정끝을 UTC로
    return new Date(Date.UTC(y, mo, da, endOfDay ? 14 : -9, endOfDay ? 59 : 0, endOfDay ? 59 : 0));
  };
  const inPeriod = (p) => {
    const parts = String(p.aplyYmd || '').split('~').map((x) => x.trim());
    if (!parts[0]) return false;
    const start = parseYmd(parts[0], false);
    const end = parseYmd(parts[parts.length - 1], true);
    if (!end || end < now) return false; // 마감 지남/파싱불가
    const ongoing = (!start || start <= now) && end >= now;
    const startingSoon = start && start > now && start <= horizon;
    return ongoing || startingSoon;
  };

  const picked = byAge
    .filter((p) => !notRelevant(p) && !excludeClass(p) && inHomeRegion(p) && inPeriod(p));

  // 마감 임박순 정렬
  const endOf = (p) => {
    const parts = String(p.aplyYmd || '').split('~').map((x) => x.trim());
    return parseYmd(parts[parts.length - 1], true) || new Date(8640000000000000);
  };
  picked.sort((a, b) => endOf(a) - endOf(b));

  const items = picked
    .map((p) => ({
      id: String(p.plcyNo || p.plcyNm || '').trim(), // 안정 키(정책번호) → 증분 병합/중복제거용
      title: stripTags(p.plcyNm || '청년정책'),
      date: fmtYouthDate(p.aplyYmd || ''), // 신청기간만 신뢰(사업기간은 placeholder 다수)
      desc: oneLineDesc(p.plcyExplnCn || p.plcySprtCn || ''), // 뭐 하는 건지 한 줄
    }))
    .filter((it) => it.date); // 신청기간(마감일) 있는 공고만 — 상시는 제외
  return { items, source: 'youthcenter-api', reason: null };
}

// 정책 설명을 한 줄로 축약: 태그 제거 → 공백 정리 → 첫 문장/최대 60자
function oneLineDesc(v) {
  let s = stripTags(String(v || '')).replace(/\s+/g, ' ').trim();
  if (!s) return '';
  // 첫 문장 우선(마침표/줄바꿈), 없으면 통째로
  const first = s.split(/(?<=다)\.|[.\n]/)[0].trim() || s;
  const out = first.length > 60 ? first.slice(0, 59) + '…' : first;
  return out;
}

// 온통청년 신청기간 정규화: "20261007 ~ 20261016" → "10/7~10/16", 공백만 → ''
function fmtYouthDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  const parts = s.split('~').map((x) => x.trim()).filter(Boolean);
  const fmt = (t) => {
    const d = String(t).replace(/[^0-9]/g, '');
    if (d.length >= 8) return `${parseInt(d.slice(4, 6), 10)}/${parseInt(d.slice(6, 8), 10)}`;
    return '';
  };
  const out = parts.map(fmt).filter(Boolean);
  return out.length ? out.join('~') : '';
}

// ── 소스: 청년 복지/적금 (온통청년 → 복지로 → 뉴스 폴백) ─────
async function collectYouthWelfare(cfg) {
  const key = process.env.DATA_GO_KR_API_KEY;
  const max = cfg.max_items_per_section || 3;
  const queries = (cfg.sections.youth_benefit && cfg.sections.youth_benefit.queries) || ['청년 지원금'];

  // 1순위: 온통청년 청년정책 API (청년 특화)
  try {
    const yp = await collectYouthPolicy(cfg);
    if (yp && yp.items && yp.items.length) return yp;
  } catch (_) {
    /* 폴백 진행 */
  }

  async function newsFallback(reason) {
    let items = [];
    for (const q of queries) {
      items = items.concat(await collectNaverNews(q, 2));
      if (items.length >= max) break;
    }
    const seen = new Set();
    const out = [];
    for (const it of items) {
      if (seen.has(it.title)) continue;
      seen.add(it.title);
      out.push(it);
      if (out.length >= max) break;
    }
    return { items: out, source: 'naver-news', reason };
  }

  if (!key) return newsFallback('복지로 API 키 없음 → 뉴스 대체');

  // 승인된 복지로 서비스: odcloud (한글 필드명). endpoint는 config로 오버라이드 가능.
  const base =
    (cfg.sections.youth_benefit && cfg.sections.youth_benefit.bokjiro_endpoint) ||
    'https://api.odcloud.kr/api/15083323/v1/uddi:e02ed092-d46d-4bf2-8e7e-c3441e950fef';
  const params = new URLSearchParams({ serviceKey: key, page: '1', perPage: '200' });
  const r = await getJson(`${base}?${params.toString()}`);
  if (isUnregistered(r.raw)) return newsFallback('복지로 활용신청 대기중 → 뉴스 대체');
  if (!r.ok || r.status !== 200 || !r.json || !Array.isArray(r.json.data))
    return newsFallback('복지로 일시오류 → 뉴스 대체');

  // odcloud는 서버 검색이 약함 → 클라이언트에서 "청년" 관련만 필터
  const kw = /청년|월세|전세|주거|적금|자립|창업/;
  // 직장인 민규 무관(취약계층/특수대상) 제외
  const EXCLUDE = /(장애|국가유공|보훈|기초생활|수급|차상위|취약계층|자립준비|보호종료|한부모|다문화|북한이탈|새터민|농어업|어촌|귀농|귀어|고령|어르신|노인)/;
  const hit = r.json.data.filter((it) => {
    const hay = `${it['서비스명'] || ''} ${it['서비스요약'] || ''}`;
    return kw.test(hay) && !EXCLUDE.test(hay);
  });
  const pick = (hit.length ? hit : r.json.data).slice(0, max);
  const items = pick.map((it) => ({
    title: it['서비스명'] || '복지서비스',
    date: it['소관부처명'] || it['최종수정일'] || '',
  }));
  return { items, source: 'bokjiro-odcloud', reason: null };
}

// ── 소스: 부동산 (LH 공공데이터 API + SH 게시판 스크래핑 통합) ─
// 민규 = 서울 가산 근무 직장인(28세, 미혼). 서울(금천 우선)만, 주거형만.
// 임대상가/토지/신혼·신생아/고령자 등 민규 무관 유형은 제외.
// LH(공식 API) + SH(공개 게시판)를 "🏠 청약/부동산(서울)" 한 섹션으로 통합.
async function collectRealty(cfg) {
  const max = cfg.max_items_per_section || 3;
  // LH 먼저 (공식 API). 실패해도 SH로 보완.
  let lh = { items: [], source: 'lh', reason: null };
  try {
    lh = await collectRealtyLh(cfg);
  } catch (e) {
    lh = { items: [], source: 'lh', reason: e.message };
  }
  // SH 게시판 (경량 스크래핑). 실패해도 LH만.
  let sh = { items: [], source: 'sh-scrape', reason: null };
  try {
    sh = await collectShNotice(cfg);
  } catch (e) {
    sh = { items: [], source: 'sh-scrape', reason: e.message };
  }

  // 통합: LH + SH 제목 중복 제거.
  const seen = new Set();
  const merged = [];
  for (const it of [...(lh.items || []), ...(sh.items || [])]) {
    const k = it.title;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(it);
  }
  // 표시 날짜(월/일) 기준 최신순 정렬. "등록 9/17" / "~10/16" / "9/30~" 등에서 마지막 월/일을 추출.
  // 연말↔연초 경계 보정: 현재월보다 많이 과거면 작년으로 보고 뒤로 보냄.
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const curMon = now.getUTCMonth() + 1;
  const dateKey = (it) => {
    const ms = String(it.date || '').match(/(\d{1,2})\/(\d{1,2})/g);
    if (!ms || !ms.length) return -1;
    const last = ms[ms.length - 1].split('/').map(Number);
    let [mon, day] = last;
    let yearAdj = 0;
    if (mon > curMon + 2) yearAdj = -1; // 많이 미래면 작년 공고로 간주(경계)
    return yearAdj * 10000 + mon * 100 + day; // 월/일 내림차순 키
  };
  merged.sort((a, b) => dateKey(b) - dateKey(a));
  const cap = Number((cfg.sections.realty && cfg.sections.realty.max_items) || 20);
  const items = merged.slice(0, cap);
  const source = `${lh.source || 'lh'}${sh.items && sh.items.length ? '+sh' : ''}`;
  const reason = items.length ? null : (lh.reason || sh.reason || '서울 주거 공고 없음');
  return { items, source, reason };
}

// LH 전용 수집 (기존 로직)
async function collectRealtyLh(cfg) {
  const key = process.env.DATA_GO_KR_API_KEY;

  // 1) 공공데이터포털 LH API (승인됨). 응답: [{dsSch:[...]},{dsList:[{...}]}]
  if (key) {
    const ep =
      (cfg.sections.realty && cfg.sections.realty.datagokr_endpoint) ||
      'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
    // 전국이 섞여 와서 서울이 페이지당 소수 → 여러 페이지 받아 서울 공고 누락 방지
    const pages = Number((cfg.sections.realty && cfg.sections.realty.lh_pages) || 5);
    let collected = [];
    let anyOk = false;
    for (let p = 1; p <= pages; p++) {
      const params = new URLSearchParams({ serviceKey: key, PG_SZ: '100', PAGE: String(p) });
      const r = await getJson(`${ep}?${params.toString()}`);
      if (isUnregistered(r.raw)) break; // 미등록 키 → API 경로 포기
      if (!r.ok || !r.json) break;
      anyOk = true;
      const arr = extractLhList(r.json);
      if (!arr.length) break;
      collected = collected.concat(arr);
    }
    if (anyOk) {
      let arr = collected.filter((it) => isSeoulRealty(it) && isEligibleRealtyType(it));
      // 중복 제거: 정정공고 등 동일 공고 → PAN_ID 우선, 없으면 (유형+공고명) 키
      const seen = new Set();
      arr = arr.filter((it) => {
        const k = it.PAN_ID || `${it.AIS_TP_CD_NM}|${(it.PAN_NM || '').replace(/\[정정공고\]/g, '').trim()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      // 청년 관련 공고 우선 → 금천/서울 지역 우선
      arr.sort((a, b) => rankRealty(b) - rankRealty(a) || rankRegion(b) - rankRegion(a));
      const cap = Number((cfg.sections.realty && cfg.sections.realty.lh_max) || 10);
      const items = arr.slice(0, cap).map((it) => ({
        title: buildRealtyTitle(it),
        date: fmtLhDate(it.CLSG_DT) || fmtLhDate(it.PAN_NT_ST_DT) || '',
        link: lhDetailUrl(it),
      }));
      // 서울 적합 공고가 없어도 빈 배열 반환(엉뚱한 지역/유형 노출 방지)
      return { items, source: 'lh-datagokr', reason: items.length ? null : '서울 청년/주거 공고 없음' };
    }
  }
  // 2) 프록시 폴백 (서울 기준)
  const url = `${PROXY_BASE}/v1/lh-notice/search?cnpCdNm=${encodeURIComponent('서울특별시')}&pageSize=30`;
  const r = await getJson(url, 20000);
  let arr = r.ok && r.json ? extractList(r.json) : [];
  if (!arr.length) return { items: [], source: 'lh-proxy', reason: '조회 실패' };
  arr = arr.filter((it) => isSeoulRealty(it) && isEligibleRealtyType(it));
  arr.sort((a, b) => rankRegion(b) - rankRegion(a));
  const cap = Number((cfg.sections.realty && cfg.sections.realty.lh_max) || 10);
  const items = arr.slice(0, cap).map((it) => ({
    title: buildRealtyTitle({
      CNP_CD_NM: it.cnpCdNm,
      AIS_TP_CD_NM: it.aisTpCdNm,
      PAN_NM: it.panNm || it.title,
    }),
    date: fmtLhDate(it.clsgDt || it.rceptEndDe || it.panDt || ''),
    link: lhDetailUrl(it),
  }));
  return { items, source: 'lh-proxy', reason: items.length ? null : '서울 청년/주거 공고 없음' };
}

// LH 공고 상세 URL: DTL_URL(또는 dtlUrl). 상대경로면 LH 도메인 보정.
function lhDetailUrl(it) {
  let u = it.DTL_URL || it.dtlUrl || it.DTL_URL_MOB || it.dtlUrlMob || '';
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//.test(u)) return u;
  if (u.startsWith('/')) return `https://apply.lh.or.kr${u}`;
  return '';
}

// 서울 공고 여부: 시도명 또는 공고명에 서울 흔적
function isSeoulRealty(it) {
  const s = `${it.CNP_CD_NM || it.cnpCdNm || ''} ${it.PAN_NM || it.panNm || it.title || ''}`;
  return /서울/.test(s);
}
// 민규(직장인·미혼·28세)에게 무관한 유형 제외
function isEligibleRealtyType(it) {
  const type = `${it.AIS_TP_CD_NM || it.aisTpCdNm || ''}`;
  const name = `${it.PAN_NM || it.panNm || it.title || ''}`;
  const hay = `${type} ${name}`;
  // 제외: 상가/토지/주차장/신혼·신생아·다자녀/고령자·영구임대(취약계층)/상업·근린
  const EXCLUDE = /(상가|토지|주차장|근린생활|상업|점포|신혼|신생아|다자녀|고령자|영구임대|어르신|장애)/;
  if (EXCLUDE.test(hay)) return false;
  return true;
}
// 공고명에서 서울 자치구를 뽑아 제목 앞에 붙임 (구 정보가 title에 드러나게)
const SEOUL_GU = ['강남','강동','강북','강서','관악','광진','구로','금천','노원','도봉','동대문','동작','마포','서대문','서초','성동','성북','송파','양천','영등포','용산','은평','종로','중랑','중구'];
function extractSeoulGu(name) {
  const s = String(name || '');
  // "강서구" 또는 "강서염창"처럼 구명이 접두로 등장하는 경우 모두 매칭
  for (const g of SEOUL_GU) {
    if (s.includes(g)) return g === '중구' ? '중구' : g + '구';
  }
  return '';
}
// 청년(3) > 통합공공/공공임대(2) > 행복주택(2) > 일반(1)
function rankRealty(it) {
  const hay = `${it.AIS_TP_CD_NM || it.aisTpCdNm || ''} ${it.PAN_NM || it.panNm || it.title || ''}`;
  if (/청년|역세권/.test(hay)) return 3;
  if (/행복주택/.test(hay)) return 2;
  if (/통합공공임대|공공임대/.test(hay)) return 2;
  return 1;
}
function buildRealtyTitle(it) {
  const type = stripTags(it.AIS_TP_CD_NM || 'LH 공고');
  const name = stripTags(it.PAN_NM || '');
  const gu = extractSeoulGu(name);
  const loc = gu ? `서울 ${gu}` : '서울';
  // 청년 공고면 강조
  const youth = /청년|역세권/.test(name) ? ' (청년)' : '';
  return `${loc} · ${type}${youth}`;
}

// ── 소스: SH(서울주택도시공사) 모집공고 게시판 스크래핑 ──────
// 공식 오픈API가 없어 공개 게시판(로그인 불필요)의 목록만 긁는다. 상세페이지는 접근 안 함(경량).
// 서버 필터 isRecrnoti=Y = "모집중 공고만" (당첨자발표·입주안내·심사결과 등 사후공지가 서버에서 제외됨).
// 거기에 관심유형(행복주택/청년안심/매입임대/장기전세/국민임대/청년)만, 미혼 민규 무관(신혼·신생아) 제외.
async function collectShNotice(cfg) {
  const s = (cfg.sections && cfg.sections.realty) || {};
  const base =
    s.sh_board_url ||
    'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/list.do';
  const pages = Number(s.sh_pages || 3);
  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; digest-bot/1.0)' };

  const parseRows = (html) => {
    const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    const out = [];
    for (const row of rows) {
      const titleCell = row.match(/<td class="txtL">([\s\S]*?)<\/td>/);
      if (!titleCell) continue;
      const title = stripTags(titleCell[1].replace(/<span class="icoNew">NEW<\/span>/g, ''));
      if (!title) continue;
      const dateM = row.match(/(\d{4})-(\d{2})-(\d{2})/);
      const seqM = row.match(/getDetailView\('(\d+)'\)/);
      out.push({
        title,
        regDate: dateM ? `${dateM[1]}-${dateM[2]}-${dateM[3]}` : '',
        seq: seqM ? seqM[1] : '',
      });
    }
    return out;
  };

  // isRecrnoti=Y: 모집중 공고만 (서버 필터) · notType1=2: 주택임대
  let all = [];
  for (let p = 1; p <= pages; p++) {
    const r = await getTextH(`${base}?isRecrnoti=Y&notType1=2&page=${p}`, 15000, headers);
    if (!r.ok || !r.text) break;
    const rows = parseRows(r.text);
    if (!rows.length) break;
    all = all.concat(rows);
  }
  if (!all.length) return { items: [], source: 'sh-scrape', reason: 'SH 목록 조회 실패' };

  // 서버가 이미 "모집중"만 주므로, 관심유형 + 미혼 민규 무관 제외만 클라이언트에서 처리.
  const INTEREST = /(행복주택|청년안심|매입임대|장기전세|국민임대|역세권|청년|공공임대|희망하우징)/;
  const UNFIT = /(신혼|신생아|다자녀|고령자|어르신|장애)/; // 미혼 직장인 민규 무관
  // 안전망: 혹시 섞여 들어오는 발표/안내성 제목은 제외
  const RESULT = /(당첨자|발표|경쟁률|접수결과|접수마감|심사결과|재계약|커트라인|입주 ?안내|안내문)/;

  // 등록일 최근 N일 컷: isRecrnoti=Y가 모집중을 표시하지만 접수가 끝난 오래된 공고가
  // 남아있을 수 있어, 등록 N일 지난 공고는 "마감 추정"으로 제외(기본 45일).
  const recentDays = Number(s.sh_recent_days || 45);
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const cutoff = new Date(now.getTime() - recentDays * 86400000);

  const seen = new Set();
  const items = [];
  for (const it of all) {
    if (!INTEREST.test(it.title) || UNFIT.test(it.title) || RESULT.test(it.title)) continue;
    if (it.regDate) {
      const d = new Date(it.regDate + 'T00:00:00+09:00');
      if (!isNaN(d) && d < cutoff) continue; // 오래된 공고(마감 추정) 제외
    }
    // 제목 정리: 날짜괄호/머리말 제거해 간결하게
    const clean = it.title.replace(/\s*\(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*(?:공고)?\)\s*$/, '').trim();
    if (seen.has(clean)) continue;
    seen.add(clean);
    const gu = extractSeoulGu(clean); // 제목 단지명에서 자치구 추론(있으면)
    const guTag = gu ? `서울 ${gu} · ` : '';
    const link = it.seq
      ? `https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_247/view.do?seq=${it.seq}`
      : '';
    items.push({
      // 날짜는 "등록"임을 명시(마감일 아님). 지역(구) 있으면 앞에 표기.
      title: `SH · ${guTag}${clean}`,
      date: it.regDate ? `등록 ${shortDate(it.regDate)}` : '',
      link,
    });
  }
  return { items, source: 'sh-scrape', reason: items.length ? null : 'SH 해당 모집공고 없음' };
}

// HTML GET (헤더 지정 가능). getText는 헤더 미지원이라 별도.
function getTextH(url, timeoutMs = 15000, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs, headers }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ ok: true, status: res.statusCode, text: b }));
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

// ── 소스: 교육/세미나 (기업마당 bizinfo 행사정보 API) ────────
// 서울/경기(용인) 개최 또는 온라인 + 주식/부동산/AI/IT 주제의 교육·세미나만.
// 양식: 행사기간 + 제목 + 한 줄 설명 + 링크. 마감 임박순.
function bizField(block, tag) {
  const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
  return m ? stripTags(m[1]) : '';
}
async function collectEduEvents(cfg) {
  const key = process.env.BIZINFO_API_KEY;
  if (!key) return { items: [], source: 'bizinfo', reason: 'BIZINFO_API_KEY 없음' };
  const s = (cfg.sections && cfg.sections.edu_events) || {};
  const pages = Number(s.pages || 5);

  let all = [];
  for (let p = 1; p <= pages; p++) {
    const url = `https://apis.data.go.kr/B554618/bizinfo/eventService?serviceKey=${encodeURIComponent(
      key
    )}&numOfRows=100&pageNo=${p}`;
    const r = await getTextH(url, 15000, { 'User-Agent': 'Mozilla/5.0 (compatible; digest-bot/1.0)' });
    if (!r.ok || !r.text) break;
    const items = r.text.match(/<item>[\s\S]*?<\/item>/g) || [];
    if (!items.length) break;
    for (const b of items) {
      all.push({
        title: bizField(b, 'nttNm'),
        area: bizField(b, 'areaNm'),
        type: bizField(b, 'eventInfoTyNm'),
        realm: bizField(b, 'pldirSportRealmLclasCodeNm'),
        span: bizField(b, 'eventBeginEndDe'),
        tags: bizField(b, 'hashtags'),
        cn: bizField(b, 'nttCn'),
        url: bizField(b, 'orginlUrlAdres') || bizField(b, 'bizinfoUrl'),
      });
    }
  }
  if (!all.length) return { items: [], source: 'bizinfo', reason: '행사 조회 실패' };

  // 개최지 필터: 민규 거주지(서울/경기) 또는 전국/온라인만.
  //  - 서울/경기 → 포함
  //  - 전국 또는 온라인/비대면 → 포함 (지역 무관하게 참여 가능)
  //  - 그 외 특정 타지역(부산/대구/대전/인천/… )은 제목에 '온라인'이 있어도 지역사업이므로 제외
  const OTHER_REGION = /(부산|대구|대전|광주|울산|인천|세종|강원|충북|충남|충청|전북|전남|경북|경남|제주|전남광주)/;
  const localArea = (e) => {
    const area = e.area || '';
    if (/(서울|경기)/.test(area)) return true;
    if (/전국/.test(area)) return true;
    // areaNm이 특정 타지역이면 제외 (온라인 표기 있어도 해당 지역민 대상)
    if (OTHER_REGION.test(area)) return false;
    // areaNm이 애매하면 온라인/비대면 키워드로 판단
    return /(온라인|비대면|웨비나|메타버스|유튜브|zoom)/i.test(`${e.title} ${e.tags} ${e.cn}`);
  };
  // 주제: 주식/투자/금융/부동산 + AI/IT/데이터/개발
  const TOPIC =
    /(주식|투자|증권|자산|금융|핀테크|부동산|청약|주택|AI|인공지능|머신러닝|딥러닝|데이터|빅데이터|디지털|소프트웨어|SW|SaaS|클라우드|코딩|개발|프로그래밍|블록체인|반도체|양자|5G|LLM|IT)/i;
  // 민규 무관 노이즈 제외
  const EXCLUDE =
    /(장애인|화장품|농업|농식품|K-FOOD|수출상담|수출붐업|해외마케팅|비관세|FTA|원산지|조달|섬유|재활용|환경성평가|바이오 전문인력|친환경차|콘텐츠아카데미|여성CEO|엑셀|OA\(|근로자 경영|중장년)/i;

  // 행사기간 파싱: "20261105 ~ 20261105" → 종료 Date
  const parseSpanEnd = (span) => {
    const parts = String(span || '').split('~').map((x) => x.replace(/[^0-9]/g, '').trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (!last || last.length < 8) return null;
    return new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8), 14, 59, 59));
  };
  const fmtSpan = (span) => {
    const parts = String(span || '').split('~').map((x) => x.replace(/[^0-9]/g, '').trim()).filter(Boolean);
    const f = (d) => (d.length >= 8 ? `${parseInt(d.slice(4, 6), 10)}/${parseInt(d.slice(6, 8), 10)}` : '');
    const out = parts.map(f).filter(Boolean);
    return out.length ? out.join('~') : '';
  };

  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const seen = new Set();
  let hit = [];
  for (const e of all) {
    if (!localArea(e)) continue;
    if (!TOPIC.test(`${e.title} ${e.tags} ${e.realm} ${e.cn}`)) continue;
    if (EXCLUDE.test(e.title)) continue;
    const end = parseSpanEnd(e.span);
    if (end && end < now) continue; // 이미 끝난 행사 제외
    const title = e.title.replace(/^\[[^\]]*\]\s*/, '').trim(); // 머리말 [전국] 등 제거
    if (seen.has(title)) continue;
    seen.add(title);
    const desc = e.cn ? (e.cn.length > 60 ? e.cn.slice(0, 59) + '…' : e.cn) : '';
    hit.push({
      _end: end ? end.getTime() : Infinity,
      title: `${e.area} · ${title}`,
      date: fmtSpan(e.span),
      desc,
    });
  }
  hit.sort((a, b) => a._end - b._end); // 마감 임박순
  const items = hit.map(({ _end, ...rest }) => rest);
  return { items, source: 'bizinfo', reason: items.length ? null : '해당 교육/세미나 없음' };
}


// ── 소스: 정부지원 K-Startup (공공데이터 API → 프록시 폴백) ──
async function collectGov(cfg) {
  const key = process.env.DATA_GO_KR_API_KEY;
  const max = cfg.max_items_per_section || 3;
  const kws = cfg.career_keywords || [];

  const score = (arr) =>
    arr
      .map((it) => ({ it, hit: kws.filter((k) => JSON.stringify(it).includes(k)).length }))
      .sort((a, b) => b.hit - a.hit);

  if (key) {
    const ep =
      (cfg.sections.gov_support && cfg.sections.gov_support.datagokr_endpoint) ||
      'https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01';
    const params = new URLSearchParams({
      serviceKey: key,
      page: '1',
      perPage: '15',
      returnType: 'json',
    });
    const r = await getJson(`${ep}?${params.toString()}`);
    if (!isUnregistered(r.raw) && r.ok && r.json) {
      const arr = extractList(r.json);
      if (arr.length) {
        const items = score(arr).slice(0, max).map(({ it }) => ({
          title: stripTags(it.biz_pbanc_nm || it.intg_pbanc_biz_nm || it.title || '지원사업'),
          date: it.pbanc_rcpt_end_dt || it.rcpt_end_dt || '',
        }));
        return { items, source: 'kstartup-datagokr', reason: null };
      }
    }
  }
  const url = `${PROXY_BASE}/v1/kstartup/announcements?rcrt_prgs_yn=Y&perPage=15`;
  const r = await getJson(url, 20000);
  const arr = r.ok && r.json ? extractList(r.json) : [];
  if (!arr.length) return { items: [], source: 'kstartup-proxy', reason: '조회 실패' };
  const items = score(arr).slice(0, max).map(({ it }) => ({
    title: stripTags(it.biz_pbanc_nm || it.pbanc_ntrp_nm || it.title || '지원사업 공고'),
    date: it.pbanc_rcpt_end_dt || it.rcpt_end_dt || it.endDate || '',
  }));
  return { items, source: 'kstartup-proxy', reason: null };
}

// ── 소스: 날씨 (프록시) ─────────────────────────────────────
async function collectWeather(cfg) {
  const s = cfg.sections.weather || {};
  const url = `${PROXY_BASE}/v1/korea-weather/forecast?nx=${s.nx || 64}&ny=${s.ny || 119}`;
  const r = await getJson(url, 15000);
  if (!r.ok || !r.json || r.json.error) return { items: [], source: 'kma-proxy', reason: '조회 실패' };
  const j = r.json;
  const temp = j.temperature || j.tmp || (j.summary && j.summary.temperature);
  const sky = j.sky || j.weather || (j.summary && j.summary.sky);
  const pop = j.pop || j.rainProb || (j.summary && j.summary.pop);
  const bits = [];
  if (sky) bits.push(String(sky));
  if (temp) bits.push(`${temp}°`);
  if (pop != null) bits.push(`강수 ${pop}%`);
  const loc = s.location || '용인';
  return { items: bits.length ? [{ title: `${loc}: ${bits.join(' · ')}` }] : [], source: 'kma-proxy', reason: null };
}

// ── 소스: 뉴스 (민규 커리어 관련성 높은 것만) ───────────────
// 커리어 키워드(AI/LLM/에이전트/5G/통신/테스트자동화/클라우드/Python)로 검색·필터.
// GeekNews(기술)와 네이버뉴스(커리어 키워드)를 모아 관련성 점수로 정렬.
async function collectTechNews(cfg) {
  const s = cfg.sections.tech_news || {};
  const n = s.top_n || cfg.max_items_per_section || 3;
  const careerKws = cfg.career_keywords || ['AI', 'LLM', '에이전트', '5G', '통신', '클라우드', 'Python'];
  const queries = s.queries || careerKws;

  // 관련성 매칭에 쓸 확장 키워드(한/영)
  const REL = [
    ...careerKws,
    'AI', '인공지능', 'LLM', 'GPT', '생성형', '에이전트', 'agent',
    '반도체', 'GPU', '엔비디아', 'Nvidia', 'MCP', 'RAG',
    '5G', '6G', '통신', '네트워크', 'Ericsson', '에릭슨',
    '클라우드', 'Kubernetes', '쿠버네티스', 'Docker', 'DevOps',
    'Python', '오픈소스', '데이터센터',
  ];
  const relScore = (title) => {
    const t = String(title || '');
    let hit = 0;
    for (const k of REL) if (t.includes(k)) hit++;
    return hit;
  };

  // 후보 수집: 네이버(커리어 키워드) + GeekNews
  let cand = [];
  for (const q of queries.slice(0, 4)) {
    cand = cand.concat(await collectNaverNews(q, 4));
  }
  cand = cand.concat(await collectGeekNews(5).then((arr) => arr));

  // 중복 제거 + 관련성 점수
  const seen = new Set();
  const scored = [];
  for (const it of cand) {
    const key = (it.title || '').toLowerCase().replace(/\s+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sc = relScore(it.title);
    if (sc <= 0) continue; // 커리어와 무관한 뉴스 제외
    scored.push({ ...it, _s: sc });
  }
  scored.sort((a, b) => b._s - a._s);
  const items = scored.slice(0, n).map(({ title, date }) => ({ title, date }));
  return { items, source: 'news:naver+geeknews', reason: items.length ? null : '관련 뉴스 없음' };
}

// ── 소스: 연구 논문 (OpenAlex, AI 중심 최근 임팩트 Top-N) ─
// 민규 관심: AI/LLM/에이전트 (+ 통신/5G와의 접점). 최근 임팩트 큰 논문 위주.
async function collectResearchPapers(cfg) {
  const s = (cfg.sections && cfg.sections.research) || {};
  const max = s.top_n || cfg.max_items_per_section || 3;
  const terms = s.keywords || [
    'large language model',
    'LLM agent',
    'retrieval augmented generation',
    'AI networking 5G',
  ];
  const to = new Date().toISOString().slice(0, 10);
  const windowDays = s.window_days || 180; // 최근 6개월
  const from = new Date(Date.now() - windowDays * 86400 * 1000).toISOString().slice(0, 10);

  // OpenAlex는 익명 동시요청 시 429가 잘 뜬다 → mailto(polite pool) + 순차 호출로 회피
  const mailto = process.env.MAIL_FROM || process.env.MAIL_TO || 'digest@example.com';
  const results = [];
  for (const t of terms) {
    const p = new URLSearchParams({
      search: t,
      filter: `from_publication_date:${from},to_publication_date:${to}`,
      sort: 'cited_by_count:desc',
      per_page: '12',
      select: 'id,title,display_name,publication_date,cited_by_count',
      mailto,
    });
    const r = await getJsonRetry(`https://api.openalex.org/works?${p.toString()}`, 25000, 3);
    results.push(r);
    await new Promise((res) => setTimeout(res, 300)); // 요청 간 간격
  }
  const seen = new Set();
  const papers = [];
  // AI 관련성 검증(제목에 AI 계열 용어) — 통신 논문만 튀어나오는 것 방지
  const AI_RE = /\b(AI|LLM|GPT|transformer|neural|deep learning|machine learning|agent|RAG|diffusion|generative|foundation model|reinforcement)\b/i;
  // 엔지니어 민규와 거리가 먼 비기술 논문(인문/윤리/법/의료 임상 등) 제외
  const NONTECH_RE = /(fetish|epistemic|truth|ethic|philosoph|law|legal|juris|clinic|genome|chromatin|nursing|sociolog|theolog)/i;
  const now = Date.now();
  for (const r of results) {
    const arr = (r.ok && r.json && Array.isArray(r.json.results) && r.json.results) || [];
    for (const w of arr) {
      const title = (w.display_name || w.title || '').trim();
      if (!title || seen.has(title.toLowerCase())) continue;
      if (!AI_RE.test(title)) continue; // AI 관련만
      if (NONTECH_RE.test(title)) continue; // 비기술 담론 제외
      seen.add(title.toLowerCase());
      const cited = w.cited_by_count || 0;
      const pub = w.publication_date ? new Date(w.publication_date).getTime() : now;
      const months = Math.max(1, (now - pub) / (30 * 86400 * 1000));
      // 임팩트 = 월평균 인용수 (최근이면서 많이 인용될수록 높음)
      const impact = cited / months;
      papers.push({ title, date: (w.publication_date || '').slice(5), cited, impact });
    }
  }
  // 임팩트(월평균 인용) 우선, 동률이면 총 인용수
  papers.sort((a, b) => b.impact - a.impact || b.cited - a.cited);
  const items = papers.slice(0, max).map((p) => ({
    title: p.title,
    date: p.date ? p.date.replace('-', '/') : '',
  }));
  return { items, source: 'openalex', reason: null };
}

// ── helpers: 공공데이터/프록시 응답에서 리스트 추출 ──────────
function extractList(json) {
  if (!json) return [];
  return (
    (Array.isArray(json.items) && json.items) ||
    (Array.isArray(json.list) && json.list) ||
    (Array.isArray(json.data) && json.data) ||
    (json.data && Array.isArray(json.data.list) && json.data.list) ||
    (json.response && json.response.body && json.response.body.items &&
      (Array.isArray(json.response.body.items.item) ? json.response.body.items.item : [])) ||
    []
  );
}
function rankGeumcheon(it) {
  return /금천/.test(JSON.stringify(it)) ? 1 : 0;
}
// 서울(2) > 금천 포함(3) > 그 외(0) 우선순위
function rankRegion(it) {
  const s = JSON.stringify(it);
  if (/금천/.test(s)) return 3;
  if (/서울/.test(s)) return 2;
  return 0;
}
// LH 응답 [{dsSch:[...]},{dsList:[...]}] 에서 dsList 추출
function extractLhList(json) {
  if (Array.isArray(json)) {
    const seg = json.find((x) => x && Array.isArray(x.dsList));
    if (seg) return seg.dsList;
  }
  if (json && Array.isArray(json.dsList)) return json.dsList;
  return extractList(json);
}
// LH 날짜(YYYYMMDD 또는 YYYY.MM.DD) → M/D
function fmtLhDate(v) {
  if (!v) return '';
  const digits = String(v).replace(/[^0-9]/g, '');
  if (digits.length >= 8) {
    return `${parseInt(digits.slice(4, 6), 10)}/${parseInt(digits.slice(6, 8), 10)}`;
  }
  return String(v);
}

module.exports = {
  collectNaverNews,
  collectGeekNews,
  collectYouthPolicy,
  collectYouthWelfare,
  collectRealty,
  collectEduEvents,
  collectGov,
  collectWeather,
  collectTechNews,
  collectResearchPapers,
  _util: { stripTags, shortDate, PROXY_BASE },
};

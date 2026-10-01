'use strict';

/**
 * collect-digest.js — 2레이어 취합기
 *
 * 1레이어 수집 소스(공공데이터 API 우선 + 뉴스/프록시 폴백)를 호출·정규화해
 * 통합 캐시 `.digest_cache.json` 을 만든다. 주식은 stock-advisor가 별도 캐시를 만드므로
 * 여기서는 다루지 않는다(3레이어에서 두 캐시를 함께 읽음).
 *
 * 소스 하나가 실패해 결과가 비면, 이전 캐시의 해당 섹션을 유지한다(신선도 라벨과 함께).
 *
 * 사용법:  node collect-digest.js        # .digest_cache.json 생성/갱신
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const src = require('./digest-sources');

const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'mingyu_profile.md');
const SECRETS_PATH = path.join(os.homedir(), '.config', 'stock-advisor', 'secrets.env');
const CACHE_PATH = path.join(ROOT, '.digest_cache.json');

function loadSecrets(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function loadProfileConfig(file) {
  const md = fs.readFileSync(file, 'utf8');
  const m = md.match(/##\s*digest-config\s*```json\s*([\s\S]*?)```/i);
  if (!m) throw new Error('mingyu_profile.md 에서 ## digest-config JSON 블록을 찾지 못했습니다.');
  return JSON.parse(m[1]);
}

function readCacheSafe() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch (_) {
    return { sections: {}, collected_at: null };
  }
}

// "10/7~10/16" / "10/16" → 종료일(Date). "상시"/파싱불가 → null(=만료 안 함).
// 연도 없음 → 올해 기준, 종료월이 현재월보다 많이 과거면 내년으로 간주(연말↔연초 경계).
function parseEndDate(dateStr, now) {
  const s = String(dateStr || '').trim();
  if (!s || s === '상시') return null;
  const parts = s.split('~').map((x) => x.trim()).filter(Boolean);
  const last = parts[parts.length - 1];
  const m = last.match(/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  const mon = parseInt(m[1], 10) - 1;
  const day = parseInt(m[2], 10);
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  let year = kstNow.getUTCFullYear();
  // 종료월이 현재월보다 6개월 이상 과거면 내년도 공고로 해석
  if (mon < kstNow.getUTCMonth() - 6) year += 1;
  // 종료일 23:59 KST = 그 날 끝까지 유효 (UTC로 환산)
  return new Date(Date.UTC(year, mon, day, 14, 59, 59)); // 23:59 KST
}

// 증분 병합: 이전 캐시 + 신규를 id로 합치고, 마감 지난 항목만 제거.
// 신규 데이터가 날짜/설명을 갱신(win). first_seen로 신규 추가분 추적.
function mergeYouthIncremental(prevItems, newItems, collectedAt) {
  const now = new Date(collectedAt);
  const byId = new Map();
  const keyOf = (it) => String(it.id || it.title || '').trim();
  const newIds = new Set((newItems || []).map(keyOf).filter(Boolean));

  // 이전 캐시: 오늘 수집(권위 목록)에 여전히 있거나, 아직 마감 안 지난 "기간한정" 공고만 유지.
  // (오늘 목록에서 빠졌고 상시/파싱불가면 → 더 이상 제공 안 함 or 필터 대상 → 제거)
  for (const it of prevItems || []) {
    const k = keyOf(it);
    if (!k) continue;
    const end = parseEndDate(it.date, now);
    const keep = newIds.has(k) || (end && end.getTime() >= now.getTime());
    if (keep) byId.set(k, { ...it });
  }
  for (const it of newItems || []) {
    const k = keyOf(it);
    if (!k) continue;
    const prev = byId.get(k);
    byId.set(k, {
      ...prev,
      ...it, // 신규가 date/desc 갱신
      first_seen: (prev && prev.first_seen) || collectedAt,
    });
  }
  // 신청기간 없는(상시/날짜없음) 항목 제거 + 마감 지난 항목 제거
  const alive = [];
  let dropped = 0;
  for (const it of byId.values()) {
    const d = String(it.date || '').trim();
    if (!d || d === '상시') {
      dropped++;
      continue; // 상시/날짜없음 → 제외
    }
    const end = parseEndDate(it.date, now);
    if (end && end.getTime() < now.getTime()) {
      dropped++;
      continue;
    }
    alive.push(it);
  }
  // 정렬: 마감 임박(날짜 있는 것) 먼저, 그 안에서 종료일 오름차순 / 상시는 뒤로
  alive.sort((a, b) => {
    const ea = parseEndDate(a.date, now);
    const eb = parseEndDate(b.date, now);
    if (ea && eb) return ea - eb;
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    return 0;
  });
  return { items: alive, dropped };
}

async function main() {
  loadSecrets(SECRETS_PATH);
  const cfg = loadProfileConfig(PROFILE_PATH);
  const S = cfg.sections;
  const prev = readCacheSafe();
  const out = { collected_at: new Date().toISOString(), sections: {} };

  // 각 섹션 정의: key → {title, collector}
  const jobs = [];
  if (S.realty && S.realty.enabled)
    jobs.push(['realty', '🏠 청약/부동산(서울)', () => src.collectRealty(cfg)]);
  if (S.gov_support && S.gov_support.enabled)
    jobs.push(['gov_support', '🏛️ 정부지원/부업', () => src.collectGov(cfg)]);
  if (S.youth_benefit && S.youth_benefit.enabled)
    jobs.push(['youth_benefit', '🎁 청년 복지/적금', () => src.collectYouthWelfare(cfg)]);
  if (S.edu_events && S.edu_events.enabled)
    jobs.push(['edu_events', '🎓 교육/세미나', () => src.collectEduEvents(cfg)]);
  // 기술뉴스는 ① 연구/뉴스 조사기(collect-research.js)가 담당 → 여기서 제외
  if (S.weather && S.weather.enabled)
    jobs.push(['weather', '🌤️ 날씨', () => src.collectWeather(cfg)]);

  for (const [key, title, fn] of jobs) {
    let res;
    try {
      res = await fn();
    } catch (e) {
      res = { items: [], source: 'error', reason: e.message };
    }
    if (res.items && res.items.length) {
      let items = res.items;
      let mergeNote = '';
      // 청년 섹션은 증분 병합(이전 캐시 누적 + 마감 지난 것만 제거)
      if (key === 'youth_benefit') {
        const prevItems = (prev.sections && prev.sections[key] && prev.sections[key].items) || [];
        const merged = mergeYouthIncremental(prevItems, res.items, out.collected_at);
        items = merged.items;
        const added = items.filter((it) => it.first_seen === out.collected_at).length;
        mergeNote = ` [신규 ${added} · 만료제거 ${merged.dropped} · 누적 ${items.length}]`;
      }
      out.sections[key] = {
        title,
        items,
        source: res.source,
        note: res.reason || null,
        stale: false,
        as_of: out.collected_at,
      };
      console.log(`  ✓ ${key}: ${items.length}건 (${res.source})${mergeNote}`);
    } else if (prev.sections && prev.sections[key] && prev.sections[key].items.length) {
      // 이전 캐시 유지 (stale)
      out.sections[key] = { ...prev.sections[key], stale: true };
      console.log(`  ↺ ${key}: 수집 실패 → 이전 캐시 유지 (stale)`);
    } else {
      out.sections[key] = { title, items: [], source: res.source, note: res.reason || '데이터 없음', stale: false, as_of: out.collected_at };
      console.log(`  ✗ ${key}: 데이터 없음 (${res.reason || res.source})`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(out, null, 2));
  console.log(`\n📦 취합 완료 → ${CACHE_PATH}`);
}

main().catch((e) => {
  console.error('❌ 취합 실패:', e.message);
  process.exit(1);
});

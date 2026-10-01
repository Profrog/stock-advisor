'use strict';

/**
 * collect-research.js — ① 연구/뉴스 조사기 (레이어2)
 *
 * 논문(OpenAlex, 민규 연구분야) + 기술뉴스(GeekNews/네이버)를 수집·정규화해
 * `.research_cache.json` 을 만든다. 주식 조사기·공공데이터 조사기와 영역이 분리된다.
 * (주식 분석이 논문을 참조하는 등 약한 상호참조는 허용)
 *
 * 사용법:  node collect-research.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const src = require('./digest-sources');

const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'mingyu_profile.md');
const SECRETS_PATH = path.join(os.homedir(), '.config', 'stock-advisor', 'secrets.env');
const CACHE_PATH = path.join(ROOT, '.research_cache.json');

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

async function main() {
  loadSecrets(SECRETS_PATH);
  const cfg = loadProfileConfig(PROFILE_PATH);
  const S = cfg.sections || {};
  const prev = readCacheSafe();
  const out = { collected_at: new Date().toISOString(), sections: {} };

  const jobs = [];
  if (S.research && S.research.enabled)
    jobs.push(['research', '📄 연구 논문', () => src.collectResearchPapers(cfg)]);
  if (S.tech_news && S.tech_news.enabled)
    jobs.push(['tech_news', '📰 뉴스', () => src.collectTechNews(cfg)]);

  for (const [key, title, fn] of jobs) {
    let res;
    try {
      res = await fn();
    } catch (e) {
      res = { items: [], source: 'error', reason: e.message };
    }
    if (res.items && res.items.length) {
      out.sections[key] = { title, items: res.items, source: res.source, note: res.reason || null, stale: false, as_of: out.collected_at };
      console.log(`  ✓ ${key}: ${res.items.length}건 (${res.source})`);
    } else if (prev.sections && prev.sections[key] && prev.sections[key].items.length) {
      out.sections[key] = { ...prev.sections[key], stale: true };
      console.log(`  ↺ ${key}: 수집 실패 → 이전 캐시 유지 (stale)`);
    } else {
      out.sections[key] = { title, items: [], source: res.source, note: res.reason || '데이터 없음', stale: false, as_of: out.collected_at };
      console.log(`  ✗ ${key}: 데이터 없음 (${res.reason || res.source})`);
    }
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(out, null, 2));
  console.log(`\n📦 연구/뉴스 취합 완료 → ${CACHE_PATH}`);
}

main().catch((e) => {
  console.error('❌ 연구/뉴스 취합 실패:', e.message);
  process.exit(1);
});

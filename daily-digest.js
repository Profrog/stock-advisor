'use strict';

/**
 * daily-digest.js — 3레이어 메일 발송기 (캐시 소비 전용, 네트워크 없음)
 *
 * 읽는 캐시:
 *   - 주식/시장 : .mingyulist_cache.json, .stock_cache.json  (stock-advisor가 생성)
 *   - 그 외 섹션: .digest_cache.json                          (collect-digest.js가 생성)
 *
 * 이 스크립트는 외부 API를 호출하지 않는다. 수집은 collect-digest.js(2레이어)가 담당.
 * 따라서 발송 시점에 외부 소스가 죽어 있어도 마지막 취합 캐시로 안정적으로 발송된다.
 *
 * 사용법:
 *   node daily-digest.js            # dry-run (미리보기)
 *   node daily-digest.js --send     # 실제 발송
 *   node daily-digest.js --json     # 조립 결과 JSON
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PROFILE_PATH = path.join(ROOT, 'mingyu_profile.md');
const SECRETS_PATH = path.join(os.homedir(), '.config', 'stock-advisor', 'secrets.env');
const MINGYULIST_CACHE = path.join(ROOT, '.mingyulist_cache.json');
const STOCK_CACHE = path.join(ROOT, '.stock_cache.json');
const DIGEST_CACHE = path.join(ROOT, '.digest_cache.json');
const RESEARCH_CACHE = path.join(ROOT, '.research_cache.json');
const LAST_DIGEST = path.join(ROOT, '.last_digest.txt');

// ── 유틸 ────────────────────────────────────────────────────
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
function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}
function loadProfileConfig(file) {
  if (!fs.existsSync(file)) throw new Error(`프로필 파일이 없습니다: ${file}`);
  const md = fs.readFileSync(file, 'utf8');
  const m = md.match(/##\s*digest-config\s*```json\s*([\s\S]*?)```/i);
  if (!m) throw new Error('mingyu_profile.md 에서 ## digest-config JSON 블록을 찾지 못했습니다.');
  return JSON.parse(m[1]);
}
function kstDateStr() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

// ── 섹션: 주식/시장 (로컬 캐시, k-skill 미사용) ──────────────
function buildStockSection(cfg) {
  const cache = readJsonSafe(MINGYULIST_CACHE);
  const data = cache && cache.data ? cache.data : null;
  if (!data || !Array.isArray(data.recommendations)) {
    return { title: '📈 오늘의 ETF/주식 추천', lines: [], empty: true };
  }
  const focus = (cfg.sections.stock && cfg.sections.stock.focus) || [];
  const topN = (cfg.sections.stock && cfg.sections.stock.top_n) || 3;
  // 점수 최고 종목을 반드시 포함 (점수 우선, focus는 동점 시 가점 타이브레이커)
  const scored = data.recommendations
    .map((r) => ({ r, focusHit: focus.some((f) => `${r.name} ${r.sector}`.includes(f)) ? 1 : 0 }))
    .sort((a, b) => (b.r.score || 0) - (a.r.score || 0) || b.focusHit - a.focusHit)
    .slice(0, topN);
  const lines = scored.map(({ r }) => {
    const chg = r.today_change ? ` (${r.today_change})` : '';
    return `- ${r.name} · ${r.sector} · ${Number(r.price).toLocaleString()}원${chg} · 점수 ${r.score}`;
  });
  // 시장 한줄을 같은 섹션 하단에 덧붙임 (주식+시장 병합)
  const market = marketOneLine();
  if (market) lines.push(`- 📊 ${market}`);
  return { title: '📈 오늘의 ETF/주식 추천', lines, empty: !lines.length };
}
// 시장 지수 한 줄 문자열 (없으면 빈 문자열)
function marketOneLine() {
  const cache = readJsonSafe(STOCK_CACHE);
  const wl = cache && cache.data && cache.data.watchlist;
  if (!wl) return '';
  const pick = [];
  const idx = wl.main_index && wl.main_index.quotes;
  if (Array.isArray(idx)) {
    for (const q of idx) {
      if (['SPY', 'QQQ', 'KOSPI'].includes(q.ticker)) pick.push(`${q.desc} ${q.change_percentage}`);
    }
  }
  return pick.length ? pick.join(' | ') : '';
}

// ── 섹션: .digest_cache.json 에서 읽기 ──────────────────────
function sectionFromDigest(digest, key) {
  const s = digest && digest.sections && digest.sections[key];
  if (!s || !Array.isArray(s.items) || !s.items.length) {
    return { title: (s && s.title) || key, lines: [], empty: true };
  }
  const lines = s.items.map((it) => {
    const date = it.date ? `${it.date} ` : '';
    const desc = it.desc ? ` — ${it.desc}` : '';
    const link = it.link ? ` ${it.link}` : '';
    return `- ${date}${it.title}${desc}${link}`;
  });
  if (s.stale) lines.push('  ※ (이전 취합 데이터)');
  else if (s.note) lines.push(`  ※ ${s.note}`);
  return { title: s.title, lines, empty: false };
}

// ── 조립 ────────────────────────────────────────────────────
function buildDigest(cfg) {
  const S = cfg.sections;
  const digest = readJsonSafe(DIGEST_CACHE) || { sections: {} };
  const research = readJsonSafe(RESEARCH_CACHE) || { sections: {} };
  const sections = [];
  if (S.stock && S.stock.enabled) sections.push(buildStockSection(cfg));
  // market 섹션은 주식 섹션 하단에 병합됨 (buildStockSection 내부)
  if (S.realty && S.realty.enabled) sections.push(sectionFromDigest(digest, 'realty'));
  if (S.gov_support && S.gov_support.enabled) sections.push(sectionFromDigest(digest, 'gov_support'));
  if (S.youth_benefit && S.youth_benefit.enabled) sections.push(sectionFromDigest(digest, 'youth_benefit'));
  if (S.edu_events && S.edu_events.enabled) sections.push(sectionFromDigest(digest, 'edu_events'));
  // 연구/뉴스는 ① 연구 조사기 캐시(.research_cache.json)에서
  if (S.research && S.research.enabled) sections.push(sectionFromDigest(research, 'research'));
  if (S.tech_news && S.tech_news.enabled) sections.push(sectionFromDigest(research, 'tech_news'));
  if (S.weather && S.weather.enabled) sections.push(sectionFromDigest(digest, 'weather'));
  return {
    sections,
    digestAge: digest.collected_at || null,
    researchAge: research.collected_at || null,
  };
}

// ── 렌더 (빈 섹션 생략 → 짧은 메일) ──────────────────────────
// limitPerSection: 양수면 섹션별 상위 N개만(요약). null이면 전체(풀버전).
// reportUrl: 요약일 때 "전체 보기" 링크를 덧붙임.
function clampSections(sections, limitPerSection) {
  if (!limitPerSection) return sections.map((s) => ({ ...s, _more: 0 }));
  return sections.map((s) => {
    const lines = s.lines || [];
    // 섹션 말미의 주석(※)은 유지하면서 항목만 제한
    const notes = lines.filter((l) => l.trim().startsWith('※'));
    const entries = lines.filter((l) => !l.trim().startsWith('※'));
    const shown = entries.slice(0, limitPerSection);
    const more = Math.max(0, entries.length - shown.length);
    return { ...s, lines: [...shown, ...notes], _more: more };
  });
}
function renderText(cfg, sections, limitPerSection, reportUrl) {
  const name = cfg.recipient_name || '민규';
  const clamped = clampSections(sections, limitPerSection);
  const visible = clamped.filter((s) => !s.empty && s.lines.length);
  const header = `${name}님 데일리 브리핑 — ${kstDateStr()} (KST 13:00)`;
  const body = visible
    .map((s) => {
      const more = s._more ? `\n  … 외 ${s._more}건 (전체는 리포트에서)` : '';
      return `【${s.title}】\n${s.lines.join('\n')}${more}`;
    })
    .join('\n\n');
  const link = reportUrl ? `\n\n📄 전체 리포트: ${reportUrl}` : '';
  const footer = '\n— 주식 참고용(투자 책임 본인). 공고/청약은 이름·날짜만. 상세는 검색.';
  return `${header}\n\n${body}${link}\n${footer}`;
}
function renderHtml(cfg, sections, limitPerSection, reportUrl) {
  const name = cfg.recipient_name || '민규';
  const clamped = clampSections(sections, limitPerSection);
  const visible = clamped.filter((s) => !s.empty && s.lines.length);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const liHtml = (l) => {
    const text = l.replace(/^-\s*/, '');
    // 끝에 붙은 URL은 "바로가기" 링크로 변환
    const m = text.match(/^(.*?)\s+(https?:\/\/\S+)$/);
    if (m) {
      return `${esc(m[1])} <a href="${esc(m[2])}" style="color:#2563eb">바로가기</a>`;
    }
    return esc(text);
  };
  const secHtml = visible
    .map((s) => {
      const more = s._more
        ? `<li style="margin:2px 0;color:#999;list-style:none">… 외 ${s._more}건 (전체는 리포트에서)</li>`
        : '';
      return (
        `<h3 style="margin:14px 0 4px;font-size:15px">${esc(s.title)}</h3>` +
        `<ul style="margin:0;padding-left:18px">${s.lines
          .map((l) => `<li style="margin:2px 0">${liHtml(l)}</li>`)
          .join('')}${more}</ul>`
      );
    })
    .join('');
  const link = reportUrl
    ? `<p style="margin:14px 0 0"><a href="${esc(reportUrl)}" style="color:#2563eb">📄 전체 리포트 보기</a></p>`
    : '';
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;max-width:600px;font-size:14px;line-height:1.5">
<h2 style="font-size:17px;margin:0 0 8px">${esc(name)}님 데일리 브리핑</h2>
<div style="color:#888;font-size:12px;margin-bottom:8px">${kstDateStr()} · KST 13:00</div>
${secHtml}${link}
<p style="color:#999;font-size:11px;margin-top:16px">주식 참고용(투자 책임 본인). 공고/청약은 이름·날짜만, 상세는 검색.</p>
</div>`;
}

// ── main ────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doSend = args.includes('--send');
  const asJson = args.includes('--json');

  loadSecrets(SECRETS_PATH);
  const cfg = loadProfileConfig(PROFILE_PATH);
  const { sections, digestAge, researchAge } = buildDigest(cfg);

  if (asJson) {
    console.log(JSON.stringify({ date: kstDateStr(), digestAge, researchAge, sections }, null, 2));
    return;
  }

  const reportUrl = cfg.report_url || process.env.REPORT_URL || 'http://152.69.227.31:3000/report';
  const summaryTopN = Number(cfg.summary_top_n || 3);

  // 풀버전(전체) — /report 스냅샷용
  const fullText = renderText(cfg, sections, null, null);
  // 요약(섹션별 상위 N개 + 전체 리포트 링크) — 메일 발송용
  const text = renderText(cfg, sections, summaryTopN, reportUrl);
  const html = renderHtml(cfg, sections, summaryTopN, reportUrl);
  const subject = `📬 ${cfg.recipient_name || '민규'} 데일리 브리핑 ${kstDateStr()}`;

  // /report 페이지가 보여줄 최신 다이제스트 스냅샷 저장(=풀버전). 발송/미발송 모두 갱신.
  try {
    fs.writeFileSync(
      LAST_DIGEST,
      JSON.stringify({ generated_at: new Date().toISOString(), subject, text: fullText }, null, 2)
    );
  } catch (_) {}

  if (!doSend) {
    console.log('─'.repeat(60));
    console.log('[DRY-RUN] 발송하지 않음. --send 로 실제 발송. (.last_digest.txt=풀버전 갱신됨)');
    if (!digestAge) console.log('⚠️ .digest_cache.json 없음 → 먼저 `node collect-digest.js` 실행 권장');
    console.log('SUBJECT:', subject);
    console.log('TO:', process.env.MAIL_TO || cfg.recipient_email || '(MAIL_TO 미설정)');
    console.log('─'.repeat(60));
    console.log('[메일 요약본]');
    console.log(text);
    return;
  }

  const { sendMail } = require('./mailer');
  const to = process.env.MAIL_TO || cfg.recipient_email;
  const info = await sendMail({ subject, text, html }, to ? { to } : {});
  console.log('✅ 발송 완료(요약):', info.messageId, '→', info.accepted.join(', '));
  console.log('📄 /report 스냅샷(풀버전) 갱신:', LAST_DIGEST);
}

main().catch((e) => {
  console.error('❌ 다이제스트 실패:', e.message);
  process.exit(1);
});

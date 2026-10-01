'use strict';

/**
 * send-youth-test.js — 청년 복지/적금 섹션만 테스트 발송 (일회성)
 * .digest_cache.json 의 youth_benefit 섹션만 읽어 메일로 보낸다.
 * 메인 다이제스트 흐름은 건드리지 않음.
 *
 * 사용법: node send-youth-test.js            # dry-run
 *         node send-youth-test.js --send     # 실제 발송
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const SECRETS_PATH = path.join(os.homedir(), '.config', 'stock-advisor', 'secrets.env');
const DIGEST_CACHE = path.join(ROOT, '.digest_cache.json');

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
function kstDateStr() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

async function main() {
  const doSend = process.argv.includes('--send');
  loadSecrets(SECRETS_PATH);

  const digest = JSON.parse(fs.readFileSync(DIGEST_CACHE, 'utf8'));
  const sec = digest.sections && digest.sections.youth_benefit;
  if (!sec || !Array.isArray(sec.items) || !sec.items.length) {
    console.error('❌ youth_benefit 섹션이 비어있습니다. 먼저 node collect-digest.js 실행');
    process.exit(1);
  }

  const lines = sec.items.map(
    (it) => `- ${it.date ? it.date + ' ' : ''}${it.title}${it.desc ? ' — ' + it.desc : ''}`
  );
  const title = sec.title || '🎁 청년 복지/적금';
  const header = `[테스트] 청년 정책 ${kstDateStr()} — ${sec.items.length}건`;
  const text = `${header}\n\n【${title}】\n${lines.join('\n')}\n\n— 공고명·신청기간 참고용. 상세는 온통청년/주관기관 공고 확인.`;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;max-width:600px;font-size:14px;line-height:1.5">
<h2 style="font-size:17px;margin:0 0 8px">[테스트] 청년 정책 브리핑</h2>
<div style="color:#888;font-size:12px;margin-bottom:8px">${kstDateStr()} · ${sec.items.length}건</div>
<h3 style="margin:14px 0 4px;font-size:15px">${esc(title)}</h3>
<ul style="margin:0;padding-left:18px">${sec.items
    .map(
      (it) =>
        `<li style="margin:2px 0">${esc((it.date ? it.date + ' ' : '') + it.title)}` +
        `${it.desc ? ` <span style="color:#888">— ${esc(it.desc)}</span>` : ''}</li>`
    )
    .join('')}</ul>
<p style="color:#999;font-size:11px;margin-top:16px">공고명·신청기간 참고용. 상세는 온통청년/주관기관 공고 확인.</p>
</div>`;

  const subject = `📬 [테스트] 청년 정책 ${kstDateStr()}`;

  if (!doSend) {
    console.log('─'.repeat(60));
    console.log('[DRY-RUN] --send 로 실제 발송');
    console.log('TO:', process.env.MAIL_TO || '(MAIL_TO 미설정)');
    console.log('SUBJECT:', subject);
    console.log('─'.repeat(60));
    console.log(text);
    return;
  }

  const { sendMail } = require('./mailer');
  const info = await sendMail({ subject, text, html });
  console.log('✅ 발송 완료:', info.messageId, '→', info.accepted.join(', '));
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});

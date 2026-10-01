'use strict';

/**
 * mailer.js — SMTP 이메일 발송 모듈
 *
 * 자격증명은 모두 환경변수에서 읽습니다. (코드/레포에 비밀번호를 넣지 않음)
 *
 *   SMTP_HOST   기본값 smtp.gmail.com
 *   SMTP_PORT   기본값 465 (SSL) / 587이면 STARTTLS
 *   SMTP_USER   SMTP 로그인 사용자 (예: your@gmail.com)
 *   SMTP_PASS   SMTP 비밀번호 / Gmail 앱 비밀번호
 *   MAIL_FROM   보내는 사람 (기본값 SMTP_USER)
 *   MAIL_TO     받는 사람 (콤마로 여러 명)
 *
 * Gmail 사용 시: 2단계 인증을 켠 뒤 "앱 비밀번호"를 발급해 SMTP_PASS 로 사용하세요.
 * https://support.google.com/accounts/answer/185833
 */

const nodemailer = require('nodemailer');

function readConfig(overrides = {}) {
  const cfg = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
    to: process.env.MAIL_TO || '',
    ...overrides,
  };
  cfg.secure = cfg.port === 465; // 465=SSL, 587/25=STARTTLS
  return cfg;
}

function validateConfig(cfg) {
  const missing = [];
  if (!cfg.user) missing.push('SMTP_USER');
  if (!cfg.pass) missing.push('SMTP_PASS');
  if (!cfg.to) missing.push('MAIL_TO');
  return missing;
}

function createTransport(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/**
 * 메일 발송.
 * @param {{subject:string, text?:string, html?:string}} message
 * @param {object} [overrides] SMTP 설정 오버라이드 (테스트용)
 * @returns {Promise<{messageId:string, accepted:string[]}>}
 */
async function sendMail(message, overrides = {}) {
  const cfg = readConfig(overrides);
  const missing = validateConfig(cfg);
  if (missing.length) {
    throw new Error(
      `SMTP 설정이 부족합니다. 환경변수를 설정하세요: ${missing.join(', ')}`
    );
  }

  const transport = createTransport(cfg);
  const info = await transport.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  return { messageId: info.messageId, accepted: info.accepted || [] };
}

/** SMTP 연결/자격증명 확인 (실제 발송 없이). */
async function verify(overrides = {}) {
  const cfg = readConfig(overrides);
  const missing = validateConfig(cfg);
  if (missing.length) {
    throw new Error(`SMTP 설정이 부족합니다: ${missing.join(', ')}`);
  }
  const transport = createTransport(cfg);
  await transport.verify();
  return true;
}

module.exports = { sendMail, verify, readConfig, validateConfig };

function now_() { return new Date(); }
function tz_() { return getSetting_('TIMEZONE') || APP.TIMEZONE; }
function fmtDate_(d, pattern) { return Utilities.formatDate(new Date(d), tz_(), pattern || 'yyyy-MM-dd HH:mm:ss'); }
function toDateOnly_(d) { return Utilities.formatDate(new Date(d), tz_(), 'yyyy-MM-dd'); }
function uuid_(prefix) { return (prefix ? prefix + '-' : '') + Utilities.getUuid().replace(/-/g, '').slice(0, 18).toUpperCase(); }
function digest_(value, len) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  const hex = bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  return hex.slice(0, len || 24).toUpperCase();
}
function normalizeText_(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
function toBool_(v) { return String(v).toUpperCase() === 'TRUE' || v === true || v === 1 || String(v) === '1'; }
function safeJson_(obj) { try { return JSON.stringify(obj || {}); } catch (err) { return '{}'; } }
function parseJson_(s, fallback) { try { return JSON.parse(s || ''); } catch (err) { return fallback || {}; } }
function getUserEmail_() { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'unknown'; }
function cleanId_(v) { return String(v || '').trim().replace(/\.0$/, ''); }
function extractDriveFileId_(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  let m = s.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  m = s.match(/([a-zA-Z0-9_-]{25,})/);
  return m ? m[1] : '';
}
function makePreviewUrl_(url) {
  const id = extractDriveFileId_(url);
  return id ? 'https://drive.google.com/uc?export=view&id=' + id : '';
}
function classTextToCode_(classText) {
  const s = String(classText || '').trim();
  const m = s.match(/(?:ม\.|ม|M)?\s*(\d+)\s*\/\s*(\d+)/i);
  if (!m) return '';
  return String(Number(m[1]) * 100 + Number(m[2]));
}
function classCodeToText_(code) {
  const n = Number(code);
  if (!n) return String(code || '');
  const grade = Math.floor(n / 100);
  const room = n % 100;
  return 'ม.' + grade + '/' + room;
}
function numericOrZero_(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function lock_(timeoutMs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(timeoutMs || 30000);
  return lock;
}
function ok_(data, message) { return { ok: true, message: message || 'success', data: data || null }; }
function fail_(message, data) { return { ok: false, message: message || 'error', data: data || null }; }

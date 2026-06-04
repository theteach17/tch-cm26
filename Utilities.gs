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

/**
 * Normalize RFID/card scan values. Many school ID/RFID readers send fixed-width
 * numeric strings with leading zeros (e.g. 0009832237) while the Students sheet
 * stores the same card as a number/string without leading zeros (9832237).
 * Do NOT use this for student_id storage; use it only for card/scan matching.
 */
function normalizeCardCode_(v) {
  let s = cleanId_(v).replace(/[​-‍﻿]/g, '').replace(/\s+/g, '');
  if (/^\d+$/.test(s)) {
    s = s.replace(/^0+/, '');
    if (!s) s = '0';
  }
  return s;
}
function addCardLookupKey_(map, code, student) {
  const exact = cleanId_(code);
  const normalized = normalizeCardCode_(code);
  if (exact) map[exact] = student;
  if (normalized) map[normalized] = student;
}

function cleanString_(v, maxLen) { return String(v === undefined || v === null ? '' : v).trim().slice(0, maxLen || 500); }
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
  // Google Drive thumbnail is more reliable inside HtmlService than uc?export=view,
  // especially when files are private but visible to the signed-in teacher.
  return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600' : '';
}
function makeDriveViewUrl_(url) {
  const id = extractDriveFileId_(url);
  return id ? 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk' : String(url || '');
}

/**
 * Build an authenticated, browser-safe image data URL for review display.
 * Direct Google Drive thumbnail URLs can sometimes render as corrupted/noisy
 * images inside HtmlService.  The safer approach is to fetch the Drive thumbnail
 * server-side with the Apps Script OAuth token, then send a data URL to the
 * browser for the single item currently being reviewed.
 */
function getDriveFileMetadataForImage_(fileId) {
  fileId = validateSpreadsheetId_(fileId, 'file_id');
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) +
    '?fields=id,name,mimeType,size,thumbnailLink,webViewLink&supportsAllDrives=true';
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Drive metadata fetch failed (' + code + '): ' + res.getContentText().slice(0, 200));
  }
  return JSON.parse(res.getContentText());
}

function resizeDriveThumbnailLink_(link, size) {
  let url = String(link || '');
  if (!url) return '';
  size = Number(size || 1600);
  size = Math.max(400, Math.min(2400, size));
  // Common Drive thumbnail links end with =s220 or =s220-k.  Preserve suffixes.
  if (/=s\d+(-[a-z])?$/i.test(url)) return url.replace(/=s\d+(-[a-z])?$/i, '=s' + size + '$1');
  if (/[?&]sz=w\d+/i.test(url)) return url.replace(/([?&]sz=w)\d+/i, '$1' + size);
  return url;
}

function fetchUrlAsDataUrl_(url) {
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Image fetch failed (' + code + ')');
  const blob = res.getBlob();
  const contentType = String(blob.getContentType() || res.getHeaders()['Content-Type'] || 'image/jpeg').split(';')[0];
  if (contentType.indexOf('image/') !== 0) throw new Error('Fetched content is not an image: ' + contentType);
  const bytes = blob.getBytes();
  if (bytes.length > 12 * 1024 * 1024) throw new Error('Image is too large to embed safely: ' + bytes.length + ' bytes');
  return 'data:' + contentType + ';base64,' + Utilities.base64Encode(bytes);
}

function getDriveImageDataForClient_(payload) {
  payload = payload || {};
  const fileId = extractDriveFileId_(payload.file_id || payload.file_url || payload.preview_url || payload.url);
  if (!fileId) throw new Error('ไม่พบ file_id ของรูปภาพ');
  const preferredSize = Number(payload.preferred_size || 1600);
  const meta = getDriveFileMetadataForImage_(fileId);
  const viewUrl = meta.webViewLink || makeDriveViewUrl_(fileId);
  const fallbackPreviewUrl = makePreviewUrl_(fileId);

  // 1) Preferred: authenticated Drive thumbnail proxy.  This normally converts
  // HEIC/large camera uploads into a browser-safe JPEG thumbnail.
  if (meta.thumbnailLink) {
    try {
      const thumbUrl = resizeDriveThumbnailLink_(meta.thumbnailLink, preferredSize);
      const dataUrl = fetchUrlAsDataUrl_(thumbUrl);
      return ok_({
        file_id: fileId,
        name: meta.name || '',
        mime_type: meta.mimeType || '',
        size: meta.size || '',
        source: 'drive_thumbnail_proxy',
        data_url: dataUrl,
        view_url: viewUrl,
        fallback_preview_url: fallbackPreviewUrl
      }, 'Image loaded via Drive thumbnail proxy');
    } catch (thumbErr) {
      console.warn('thumbnail proxy failed, fallback to original blob', thumbErr);
    }
  }

  // 2) Fallback: original file blob if the browser can display the mime type.
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const contentType = String(blob.getContentType() || meta.mimeType || '').split(';')[0];
    const browserSafe = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'].indexOf(contentType.toLowerCase()) >= 0;
    if (browserSafe && blob.getBytes().length <= 12 * 1024 * 1024) {
      return ok_({
        file_id: fileId,
        name: file.getName(),
        mime_type: contentType,
        size: blob.getBytes().length,
        source: 'drive_original_blob',
        data_url: 'data:' + contentType + ';base64,' + Utilities.base64Encode(blob.getBytes()),
        view_url: viewUrl,
        fallback_preview_url: fallbackPreviewUrl
      }, 'Image loaded via original Drive blob');
    }
  } catch (blobErr) {
    console.warn('original image blob fallback failed', blobErr);
  }

  // 3) Last resort: return URLs only.  The frontend will show a warning and the
  // teacher can open the native Drive preview.
  return ok_({
    file_id: fileId,
    name: meta.name || '',
    mime_type: meta.mimeType || '',
    size: meta.size || '',
    source: 'url_fallback_only',
    data_url: '',
    view_url: viewUrl,
    fallback_preview_url: fallbackPreviewUrl,
    warning: 'ไม่สามารถสร้างรูป preview แบบปลอดภัยได้ กรุณาเปิดไฟล์ต้นฉบับใน Google Drive'
  }, 'Image URL fallback only');
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
/**
 * HtmlService / google.script.run cannot reliably return Date objects or other
 * non-plain values to the browser.  In v1.6 the startup diagnostic showed that
 * the server could read 9 CourseOfferings, but the browser select stayed empty.
 * The root cause is that rows read from Google Sheets can contain Date objects
 * such as created_at, and returning those rows inside api_bootstrap/api_listOfferings
 * can make google.script.run fail before the frontend receives offerings.
 *
 * Every API response must therefore be sanitized into JSON-safe primitives.
 */
function sanitizeForClient_(value) {
  if (value === null || value === undefined) return value;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(value, APP.TIMEZONE || Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  }
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeForClient_);
  if (t === 'object') {
    const out = {};
    Object.keys(value).forEach(function (k) {
      const v = value[k];
      if (typeof v !== 'function') out[k] = sanitizeForClient_(v);
    });
    return out;
  }
  return String(value);
}
function ok_(data, message) { return { ok: true, message: message || 'success', data: sanitizeForClient_(data || null) }; }
function fail_(message, data) { return { ok: false, message: message || 'error', data: sanitizeForClient_(data || null) }; }

function validate_(payload, rules) {
  payload = payload || {};
  const errors = [];
  Object.keys(rules || {}).forEach(field => {
    const rule = rules[field] || {};
    const val = payload[field];
    if (rule.required && (val === undefined || val === null || String(val).trim() === '')) errors.push(field + ' is required');
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      if (rule.type === 'number' && isNaN(Number(val))) errors.push(field + ' must be numeric');
      if (rule.type === 'boolean' && ['TRUE','FALSE','true','false','1','0',true,false,1,0].indexOf(val) < 0) errors.push(field + ' must be boolean');
      if (rule.maxLen && String(val).length > rule.maxLen) errors.push(field + ' too long');
      if (rule.pattern && !rule.pattern.test(String(val))) errors.push(field + ' has invalid format');
      if (rule.allowed && rule.allowed.indexOf(String(val)) < 0) errors.push(field + ' has unsupported value');
    }
  });
  if (errors.length) throw new Error('Validation failed: ' + errors.join(', '));
  return payload;
}
function validateSpreadsheetId_(id, fieldName) {
  const value = cleanString_(id, 200);
  if (!value) throw new Error((fieldName || 'spreadsheet_id') + ' is required');
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(value)) throw new Error((fieldName || 'spreadsheet_id') + ' has invalid format');
  return value;
}

function cacheGetJson_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) { return null; }
}
function cachePutJson_(key, value, seconds) {
  try {
    const raw = JSON.stringify(value || null);
    if (raw.length < 95000) CacheService.getScriptCache().put(key, raw, seconds || 300);
  } catch (err) { console.warn('cachePut skipped for ' + key, err); }
}
function cacheRemove_(key) { try { CacheService.getScriptCache().remove(key); } catch (err) {} }
function cacheKey_(prefix, parts) { return prefix + ':' + (Array.isArray(parts) ? parts.join('|') : String(parts || '')); }

function getCachedStudentMap_() {
  const key = 'STUDENT_MAP_V2';
  const cached = cacheGetJson_(key);
  if (cached) return cached;
  const map = buildStudentMap_();
  cachePutJson_(key, map, 300);
  return map;
}
function invalidateStudentCache_() { cacheRemove_('STUDENT_MAP_V2'); }

function getCachedEnrollmentsByOffering_(offeringId) {
  const key = cacheKey_('ENROLLMENTS_BY_OFFERING_V2', offeringId);
  const cached = cacheGetJson_(key);
  if (cached) return cached;
  const rows = getRows_(SHEETS.ENROLLMENTS).filter(r => String(r.offering_id) === String(offeringId) && String(r.enrollment_status) === 'ACTIVE');
  cachePutJson_(key, rows, 300);
  return rows;
}
function invalidateEnrollmentCache_(offeringId) { if (offeringId) cacheRemove_(cacheKey_('ENROLLMENTS_BY_OFFERING_V2', offeringId)); }

function getCachedAttendanceIndexBySession_(sessionId) {
  const key = cacheKey_('ATTENDANCE_INDEX_SESSION_V2', sessionId);
  const cached = cacheGetJson_(key);
  if (cached) return cached;
  const rows = getRows_(SHEETS.ATTENDANCE_INDEX).filter(r => String(r.session_id) === String(sessionId));
  cachePutJson_(key, rows, 120);
  return rows;
}
function updateAttendanceIndexCache_(sessionId, rows) { cachePutJson_(cacheKey_('ATTENDANCE_INDEX_SESSION_V2', sessionId), rows || [], 120); }
function invalidateAttendanceIndexCache_(sessionId) { if (sessionId) cacheRemove_(cacheKey_('ATTENDANCE_INDEX_SESSION_V2', sessionId)); }

function defaultPeriodSchedule_() {
  return (APP.DEFAULT_PERIOD_SCHEDULE || []).map(function (p) {
    return { period_no: Number(p.period_no), start: String(p.start), end: String(p.end) };
  });
}
function getPeriodSchedule_() {
  const raw = getSetting_('PERIOD_SCHEDULE_JSON');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(function (p) {
        return { period_no: Number(p.period_no), start: String(p.start), end: String(p.end) };
      });
    } catch (err) {
      console.warn('Invalid PERIOD_SCHEDULE_JSON, fallback to default', err);
    }
  }
  return defaultPeriodSchedule_();
}
function hhmmToMinutes_(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
function minutesToHHMM_(mins) {
  mins = Math.max(0, Number(mins || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2);
}
function getCurrentPeriodInfo_() {
  const now = now_();
  const schedule = getPeriodSchedule_();
  const hm = Utilities.formatDate(now, tz_(), 'HH:mm');
  const currentMin = hhmmToMinutes_(hm);
  let selected = schedule[0] || { period_no: '', start: '', end: '' };
  let state = 'UPCOMING';

  for (let i = 0; i < schedule.length; i++) {
    const p = schedule[i];
    const start = hhmmToMinutes_(p.start);
    const end = hhmmToMinutes_(p.end);
    if (currentMin >= start && currentMin < end) {
      selected = p;
      state = 'IN_PERIOD';
      break;
    }
    if (currentMin < start) {
      selected = p;
      state = 'BEFORE_NEXT_PERIOD';
      break;
    }
    selected = p;
    state = 'AFTER_LAST_PERIOD';
  }

  return {
    now: fmtDate_(now, 'yyyy-MM-dd HH:mm:ss'),
    date: toDateOnly_(now),
    current_time: hm,
    period_no: selected ? selected.period_no : '',
    period_start: selected ? selected.start : '',
    period_end: selected ? selected.end : '',
    period_label: selected ? ('คาบ ' + selected.period_no + ' (' + selected.start + '-' + selected.end + ')') : '',
    state: state,
    schedule: schedule
  };
}
function getSessionDefaults() {
  return ok_(getCurrentPeriodInfo_(), 'Session defaults loaded');
}

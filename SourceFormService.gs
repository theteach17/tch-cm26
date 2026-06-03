/**
 * SourceFormService.gs
 * v1.1.0 hotfix: chunked sync + batched normalization to prevent Web App timeout.
 */

const SYNC_CHUNK_DEFAULT = 80;
const SYNC_CHUNK_MAX = 200;

function openSourceSpreadsheet_(source) {
  return SpreadsheetApp.openById(source.spreadsheet_id);
}

function detectFormHeaders() {
  assertRole_(['ADMIN','TEACHER']);
  const source = getActiveSource_();
  if (!source) throw new Error('No active source form configured');
  const ss = openSourceSpreadsheet_(source);
  const sh = ss.getSheetByName(source.sheet_name);
  if (!sh) throw new Error('Source sheet not found: ' + source.sheet_name);
  const headerRow = Number(source.header_row || 1);
  const headers = sh.getRange(headerRow, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h || '').trim());
  const maps = [];
  headers.forEach((header, idx) => {
    if (!header) return;
    const detected = detectHeaderField_(header);
    if (!detected) return;
    maps.push({
      header_map_id: digest_([source.source_id, detected.class_code, detected.field_type, header, idx+1].join('|'), 18),
      source_id: source.source_id,
      class_code: detected.class_code,
      field_type: detected.field_type,
      header_name: header,
      column_index: idx + 1,
      is_active: true,
      note: detected.note || 'auto-detected'
    });
  });
  maps.forEach(m => upsertByKey_(SHEETS.FORM_HEADER_MAP, 'header_map_id', m));
  audit_('DETECT_FORM_HEADERS', SHEETS.FORM_HEADER_MAP, source.source_id, {}, { count: maps.length }, 'Detected form header map');
  return ok_({ count: maps.length, maps }, 'Form headers detected');
}

function detectHeaderField_(header) {
  const original = header;
  const h = header.toLowerCase().replace(/\s+/g, ' ');
  let classCode = 'GENERIC';
  let fieldText = h;
  const m = original.match(/^\s*(\d{3})\s*-\s*(.+)$/);
  if (m) { classCode = m[1]; fieldText = m[2].toLowerCase(); }
  const f = fieldText;
  if (/name|lastname|ชื่อ/.test(f) && !/email/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.NAME };
  if (/student\s*id|เลขประจำตัว|เลขประจําตัว|5\s*digits/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.STUDENT_ID };
  if (/topic|หัวข้อ/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.TOPIC };
  if (/first submission|รูปภาพงาน รูปที่ 1|รูปที่ 1|submission 1|upload/.test(f) && !/second|third|รูปที่ 2|รูปที่ 3/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.FILE_1 };
  if (/second submission|รูปที่ 2|submission 2/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.FILE_2 };
  if (/third submission|the third|รูปที่ 3|submission 3/.test(f)) return { class_code: classCode, field_type: FIELD_TYPES.FILE_3 };
  return null;
}

function getHeaderMaps_(sourceId) {
  return getRows_(SHEETS.FORM_HEADER_MAP).filter(r => String(r.source_id) === String(sourceId) && toBool_(r.is_active));
}

function syncNewFormRows() {
  const lock = lock_(30000);
  try {
    const source = getActiveSource_();
    if (!source) throw new Error('No active source form configured');
    ensureHeaderMapForSource_(source);
    const fromRow = Math.max(Number(source.last_sync_row || 1) + 1, Number(source.header_row || 1) + 1);
    const result = syncFormRows_(source, fromRow, null, { chunkSize: SYNC_CHUNK_MAX, advanceCursor: true });
    return ok_(result, 'Sync completed');
  } finally { lock.releaseLock(); }
}

function syncAllFormRowsForActiveSource() {
  assertRole_(['ADMIN']);
  return syncAllFormRowsChunk({ start_row: null, chunk_size: SYNC_CHUNK_DEFAULT, reset_cursor: true });
}

function syncAllFormRowsChunk(payload) {
  assertRole_(['ADMIN']);
  payload = payload || {};
  const lock = lock_(30000);
  try {
    const source = getActiveSource_();
    if (!source) throw new Error('No active source form');
    ensureHeaderMapForSource_(source);
    const headerRow = Number(source.header_row || 1);
    const chunkSize = Math.max(1, Math.min(Number(payload.chunk_size || SYNC_CHUNK_DEFAULT), SYNC_CHUNK_MAX));
    let startRow = Number(payload.start_row || 0);
    if (!startRow) startRow = toBool_(payload.reset_cursor) ? headerRow + 1 : Math.max(Number(source.last_sync_row || headerRow) + 1, headerRow + 1);
    const result = syncFormRows_(source, startRow, null, { chunkSize, advanceCursor: true });
    return ok_(result, result.hasMore ? 'Chunk synced; more rows remain' : 'Sync completed');
  } finally { lock.releaseLock(); }
}

function ensureHeaderMapForSource_(source) {
  if (!getRows_(SHEETS.FORM_HEADER_MAP).some(r => String(r.source_id) === String(source.source_id))) detectFormHeaders();
}

function syncFormRows_(source, startRow, endRow, options) {
  options = options || {};
  const ss = openSourceSpreadsheet_(source);
  const src = ss.getSheetByName(source.sheet_name);
  if (!src) throw new Error('Source sheet not found: ' + source.sheet_name);
  const headerRow = Number(source.header_row || 1);
  const lastRow = src.getLastRow();
  if (lastRow < startRow) {
    return { imported: 0, normalized: 0, files: 0, scores: 0, errors: 0, startRow, endRow: startRow - 1, lastRow, lastRowProcessed: Number(source.last_sync_row || headerRow), nextStartRow: null, hasMore: false, percent: 100 };
  }
  const chunkSize = Math.max(1, Math.min(Number(options.chunkSize || SYNC_CHUNK_DEFAULT), SYNC_CHUNK_MAX));
  const boundedEnd = endRow ? Math.min(Number(endRow), lastRow) : Math.min(lastRow, Number(startRow) + chunkSize - 1);
  const lastCol = src.getLastColumn();
  const headers = src.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const values = src.getRange(startRow, 1, boundedEnd - startRow + 1, lastCol).getValues();
  const context = buildSyncContext_(source);
  let rawRows = [], submissions = [], files = [], scores = [], errorRows = [];

  values.forEach((row, i) => {
    const sourceRow = Number(startRow) + i;
    const rowObj = {};
    headers.forEach((h, c) => rowObj[h || ('COL_' + (c+1))] = row[c]);
    const rowHash = digest_(source.source_id + '|' + sourceRow + '|' + safeJson_(rowObj), 30);
    if (!context.existingRaw.has(rowHash)) {
      rawRows.push({
        raw_id: uuid_('RAW'), term_id: source.term_id, source_id: source.source_id, source_row: sourceRow,
        timestamp: findGlobalValue_(headers, row, ['Timestamp','ประทับเวลา']) || '',
        email: findGlobalValue_(headers, row, ['Email Address','อีเมล','Email']) || '',
        class_text: findGlobalValue_(headers, row, ['ระดับชั้น','ห้อง']) || '',
        raw_json: safeJson_(rowObj), row_hash: rowHash, sync_time: now_(), sync_status: 'SYNCED', note: ''
      });
      context.existingRaw.add(rowHash);
    }
    const normalized = normalizeSourceRow_(source, headers, row, sourceRow, context);
    normalized.forEach(n => {
      if (!context.existingSub.has(n.submission.submission_key)) {
        submissions.push(n.submission);
        n.files.forEach(f => files.push(f));
        if (n.score) scores.push(n.score);
        context.existingSub.add(n.submission.submission_key);
      }
      if (n.errors && n.errors.length) n.errors.forEach(e => errorRows.push(e));
    });
  });

  appendObjects_(SHEETS.RAW_FORM_ROWS, rawRows);
  appendObjects_(SHEETS.NORMALIZED_SUBMISSIONS, submissions);
  appendObjects_(SHEETS.SUBMISSION_FILES, files);
  appendObjects_(SHEETS.SCORE_LEDGER, scores);
  appendMissingStudentsAndEnrollments_(context);
  if (errorRows.length) appendObjects_(SHEETS.ERROR_LOG, errorRows);
  if (options.advanceCursor !== false) updateRowById_(SHEETS.SOURCE_FORMS, 'source_id', source.source_id, { last_sync_row: boundedEnd, last_sync_time: now_() });

  const hasMore = boundedEnd < lastRow;
  return {
    imported: rawRows.length,
    normalized: submissions.length,
    files: files.length,
    scores: scores.length,
    errors: errorRows.length,
    startRow: Number(startRow),
    endRow: boundedEnd,
    lastRow,
    lastRowProcessed: boundedEnd,
    nextStartRow: hasMore ? boundedEnd + 1 : null,
    hasMore,
    percent: lastRow ? Math.round((boundedEnd / lastRow) * 10000) / 100 : 100
  };
}

function buildSyncContext_(source) {
  const students = getRows_(SHEETS.STUDENTS);
  const byId = {}, byRfid = {};
  students.forEach(s => {
    byId[cleanId_(s.student_id)] = s;
    if (s.rfid_code) byRfid[cleanId_(s.rfid_code)] = s;
    if (s.student_pay_code) byRfid[cleanId_(s.student_pay_code)] = s;
    if (s.backup_card_code) byRfid[cleanId_(s.backup_card_code)] = s;
  });
  return {
    maps: getHeaderMaps_(source.source_id),
    topicMap: buildTopicMap_(),
    offerings: buildOfferingMap_(),
    studentMap: { byId, byRfid },
    existingRaw: new Set(getRows_(SHEETS.RAW_FORM_ROWS).map(r => String(r.row_hash))),
    existingSub: new Set(getRows_(SHEETS.NORMALIZED_SUBMISSIONS).map(r => String(r.submission_key))),
    existingEnrollments: new Set(getRows_(SHEETS.ENROLLMENTS).map(r => String(r.enrollment_id))),
    studentsToAppend: {},
    enrollmentsToAppend: {}
  };
}

function appendMissingStudentsAndEnrollments_(context) {
  const students = Object.values(context.studentsToAppend || {});
  const enrollments = Object.values(context.enrollmentsToAppend || {});
  if (students.length) appendObjects_(SHEETS.STUDENTS, students);
  if (enrollments.length) appendObjects_(SHEETS.ENROLLMENTS, enrollments);
}

function findGlobalValue_(headers, row, names) {
  const idx = headers.findIndex(h => names.some(n => String(h).toLowerCase() === String(n).toLowerCase()));
  return idx >= 0 ? row[idx] : '';
}

function buildTopicMap_() {
  const map = {};
  getRows_(SHEETS.TOPIC_MAP).filter(r => String(r.status) === 'ACTIVE').forEach(r => {
    map[[r.term_id, r.class_code, normalizeText_(r.form_topic_text)].join('|')] = r;
  });
  return map;
}

function buildOfferingMap_() {
  const map = {};
  getRows_(SHEETS.COURSE_OFFERINGS).filter(r => String(r.status) === 'ACTIVE').forEach(r => {
    map[[r.term_id, r.class_code].join('|')] = r;
  });
  return map;
}

function buildStudentMap_() {
  const students = getRows_(SHEETS.STUDENTS);
  const byId = {}, byRfid = {};
  students.forEach(s => {
    byId[cleanId_(s.student_id)] = s;
    if (s.rfid_code) byRfid[cleanId_(s.rfid_code)] = s;
    if (s.student_pay_code) byRfid[cleanId_(s.student_pay_code)] = s;
    if (s.backup_card_code) byRfid[cleanId_(s.backup_card_code)] = s;
  });
  return { byId, byRfid };
}

function normalizeSourceRow_(source, headers, row, sourceRow, context) {
  const groups = {};
  context.maps.forEach(m => {
    const cls = String(m.class_code || 'GENERIC');
    if (!groups[cls]) groups[cls] = {};
    const idx = Number(m.column_index) - 1;
    groups[cls][m.field_type] = row[idx];
  });
  const classTextGlobal = findGlobalValue_(headers, row, ['ระดับชั้น','ห้อง']);
  const email = findGlobalValue_(headers, row, ['Email Address','อีเมล','Email']);
  const timestamp = findGlobalValue_(headers, row, ['Timestamp','ประทับเวลา']);
  const results = [];
  Object.keys(groups).forEach(groupKey => {
    const g = groups[groupKey];
    const studentId = cleanId_(g[FIELD_TYPES.STUDENT_ID]);
    const topicText = normalizeText_(g[FIELD_TYPES.TOPIC]);
    const fileUrls = [g[FIELD_TYPES.FILE_1], g[FIELD_TYPES.FILE_2], g[FIELD_TYPES.FILE_3]].map(v => String(v || '').trim()).filter(Boolean);
    if (!studentId && !topicText && fileUrls.length === 0) return;
    let classCode = groupKey === 'GENERIC' ? classTextToCode_(classTextGlobal) : groupKey;
    if (!classCode) classCode = classTextToCode_(classTextGlobal);
    const termId = source.term_id || getActiveTerm_();
    const offering = context.offerings[[termId, classCode].join('|')];
    const topic = context.topicMap[[termId, classCode, topicText].join('|')];
    const submissionKey = digest_([source.source_id, sourceRow, classCode, studentId, topicText, fileUrls.join('|')].join('|'), 32);
    const submissionId = 'SUB-' + submissionKey.slice(0, 18);
    const score = topic ? numericOrZero_(topic.score) : 0;
    const errors = [];

    if (!context.studentMap.byId[studentId] && studentId) {
      context.studentsToAppend[studentId] = { student_id: studentId, student_name_th: '', student_name_en: normalizeText_(g[FIELD_TYPES.NAME]), email, rfid_code:'', student_pay_code:'', backup_card_code:'', status:'ACTIVE', created_at:now_(), updated_at:now_(), note:'Auto-created from Form response' };
      context.studentMap.byId[studentId] = { student_id: studentId, student_name_en: normalizeText_(g[FIELD_TYPES.NAME]) };
    }
    if (offering && studentId) {
      const enrollmentId = ['ENR', termId, classCode, studentId].join('-');
      if (!context.existingEnrollments.has(enrollmentId)) {
        context.enrollmentsToAppend[enrollmentId] = { enrollment_id: enrollmentId, term_id: termId, offering_id: offering.offering_id, class_code: classCode, student_id: studentId, student_no: '', enrollment_status:'ACTIVE', created_at:now_(), note:'Auto-created from Form response' };
        context.existingEnrollments.add(enrollmentId);
      }
    }
    if (!topic && topicText) errors.push({ error_id: uuid_('ERR'), source_row: sourceRow || '', error_type: 'TOPIC_NOT_MAPPED', error_message: 'Topic is not mapped yet: ' + topicText, raw_value: safeJson_({ classCode, studentId, topicText }), status: 'OPEN', created_at: now_(), resolved_by: '', resolved_at: '' });

    const sub = {
      submission_id: submissionId, term_id: termId, source_id: source.source_id, source_row: sourceRow,
      offering_id: offering ? offering.offering_id : '', class_code: classCode, student_id: studentId,
      student_name: normalizeText_(g[FIELD_TYPES.NAME]), email, form_topic_text: topicText, topic_id: topic ? topic.topic_id : '',
      timestamp, file_count: fileUrls.length, sync_mode: topic && String(topic.sync_mode) === 'RETROACTIVE' ? 'RETROACTIVE' : 'AUTO',
      review_status: 'PENDING', score_status: topic ? 'ACTIVE' : 'PENDING_TOPIC', score, submission_key: submissionKey,
      created_at: now_(), updated_at: now_(), note: topic ? '' : 'Waiting for TopicMap'
    };
    const fileRows = fileUrls.map((url, idx) => {
      const fid = extractDriveFileId_(url);
      return { file_record_id: 'FILE-' + digest_(submissionId + '|' + idx + '|' + url, 18), term_id: termId, submission_id: submissionId, student_id: studentId, class_code: classCode, topic_id: topic ? topic.topic_id : '', file_no: idx + 1, file_url: url, file_id: fid, preview_url: makePreviewUrl_(url), file_status: 'ACTIVE', note: '' };
    });
    const scoreRow = topic ? {
      score_event_id: 'SCORE-' + submissionId,
      term_id: termId, event_date: toDateOnly_(timestamp || now_()), session_id: '', offering_id: offering ? offering.offering_id : '', class_code: classCode,
      student_id: studentId, event_type: 'FORM_SUBMISSION', score_title: topic.display_topic_name || topicText, score_delta: score,
      source_type: 'GOOGLE_FORM', source_ref: submissionId, status: 'ACTIVE', void_reason: '', created_by: 'SYSTEM_SYNC', created_at: now_(), updated_at: now_()
    } : null;
    results.push({ submission: sub, files: fileRows, score: scoreRow, errors });
  });
  return results;
}

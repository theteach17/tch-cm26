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
    const mapObj = {
      header_map_id: digest_([source.source_id, detected.class_code, detected.field_type, header, idx+1].join('|'), 18),
      source_id: source.source_id,
      class_code: detected.class_code,
      field_type: detected.field_type,
      header_name: header,
      column_index: idx + 1,
      is_active: true,
      note: detected.note || 'auto-detected'
    };
    maps.push(mapObj);
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
    if (!getRows_(SHEETS.FORM_HEADER_MAP).some(r => String(r.source_id) === String(source.source_id))) detectFormHeaders();
    const fromRow = Math.max(Number(source.last_sync_row || 1) + 1, Number(source.header_row || 1) + 1);
    const result = syncFormRows_(source, fromRow, null);
    if (result.lastRowProcessed) {
      updateRowById_(SHEETS.SOURCE_FORMS, 'source_id', source.source_id, { last_sync_row: result.lastRowProcessed, last_sync_time: now_() });
    }
    return ok_(result, 'Sync completed');
  } finally { lock.releaseLock(); }
}
function syncFormRows_(source, startRow, endRow) {
  const ss = openSourceSpreadsheet_(source);
  const src = ss.getSheetByName(source.sheet_name);
  if (!src) throw new Error('Source sheet not found: ' + source.sheet_name);
  const lastRow = src.getLastRow();
  if (lastRow < startRow) return { imported: 0, normalized: 0, errors: 0, lastRowProcessed: Number(source.last_sync_row || 1) };
  endRow = endRow ? Math.min(endRow, lastRow) : lastRow;
  const lastCol = src.getLastColumn();
  const headerRow = Number(source.header_row || 1);
  const headers = src.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const values = src.getRange(startRow, 1, endRow - startRow + 1, lastCol).getValues();
  const existingRaw = new Set(getRows_(SHEETS.RAW_FORM_ROWS).map(r => String(r.row_hash)));
  const existingSub = new Set(getRows_(SHEETS.NORMALIZED_SUBMISSIONS).map(r => String(r.submission_key)));
  const topicMap = buildTopicMap_();
  const offerings = buildOfferingMap_();
  const studentMap = buildStudentMap_();
  let rawRows = [], submissions = [], files = [], scores = [], errors = 0;
  values.forEach((row, i) => {
    const sourceRow = startRow + i;
    const rowObj = {};
    headers.forEach((h, c) => rowObj[h || ('COL_' + (c+1))] = row[c]);
    const rowHash = digest_(source.source_id + '|' + sourceRow + '|' + safeJson_(rowObj), 30);
    if (!existingRaw.has(rowHash)) {
      rawRows.push({ raw_id: uuid_('RAW'), term_id: source.term_id, source_id: source.source_id, source_row: sourceRow,
        timestamp: findGlobalValue_(headers, row, ['Timestamp','ประทับเวลา']) || '', email: findGlobalValue_(headers, row, ['Email Address','อีเมล','Email']) || '',
        class_text: findGlobalValue_(headers, row, ['ระดับชั้น','ห้อง']) || '', raw_json: safeJson_(rowObj), row_hash: rowHash,
        sync_time: now_(), sync_status: 'SYNCED', note: '' });
      existingRaw.add(rowHash);
    }
    const normalized = normalizeSourceRow_(source, headers, row, sourceRow, topicMap, offerings, studentMap);
    normalized.forEach(n => {
      if (!existingSub.has(n.submission.submission_key)) {
        submissions.push(n.submission);
        n.files.forEach(f => files.push(f));
        if (n.score) scores.push(n.score);
        existingSub.add(n.submission.submission_key);
      }
    });
    errors += normalized.filter(n => n.error).length;
  });
  appendObjects_(SHEETS.RAW_FORM_ROWS, rawRows);
  appendObjects_(SHEETS.NORMALIZED_SUBMISSIONS, submissions);
  appendObjects_(SHEETS.SUBMISSION_FILES, files);
  appendObjects_(SHEETS.SCORE_LEDGER, scores);
  return { imported: rawRows.length, normalized: submissions.length, files: files.length, scores: scores.length, errors, lastRowProcessed: endRow };
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
function normalizeSourceRow_(source, headers, row, sourceRow, topicMap, offerings, studentMap) {
  const maps = getHeaderMaps_(source.source_id);
  const groups = {};
  maps.forEach(m => {
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
    const offering = offerings[[termId, classCode].join('|')];
    const topic = topicMap[[termId, classCode, topicText].join('|')];
    const submissionKey = digest_([source.source_id, sourceRow, classCode, studentId, topicText, fileUrls.join('|')].join('|'), 32);
    const submissionId = 'SUB-' + submissionKey.slice(0, 18);
    const score = topic ? numericOrZero_(topic.score) : 0;
    if (!studentMap.byId[studentId] && studentId) {
      // Auto-register minimal student record to reduce setup burden. Teacher can fix later.
      upsertByKey_(SHEETS.STUDENTS, 'student_id', { student_id: studentId, student_name_th: '', student_name_en: normalizeText_(g[FIELD_TYPES.NAME]), email, rfid_code:'', student_pay_code:'', backup_card_code:'', status:'ACTIVE', created_at:now_(), updated_at:now_(), note:'Auto-created from Form response' });
      studentMap.byId[studentId] = { student_id: studentId, student_name_en: normalizeText_(g[FIELD_TYPES.NAME]) };
    }
    if (offering && studentId) {
      const enrollmentId = ['ENR', termId, classCode, studentId].join('-');
      upsertByKey_(SHEETS.ENROLLMENTS, 'enrollment_id', { enrollment_id: enrollmentId, term_id: termId, offering_id: offering.offering_id, class_code: classCode, student_id: studentId, student_no: '', enrollment_status:'ACTIVE', created_at:now_(), note:'Auto-created from Form response' });
    }
    if (!topic && topicText) logError_(sourceRow, 'TOPIC_NOT_MAPPED', 'Topic is not mapped yet: ' + topicText, { classCode, studentId, topicText });
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
    results.push({ submission: sub, files: fileRows, score: scoreRow, error: !topic });
  });
  return results;
}
function syncAllFormRowsForActiveSource() {
  assertRole_(['ADMIN']);
  const lock = lock_(30000);
  try {
    const source = getActiveSource_();
    if (!source) throw new Error('No active source form');
    const result = syncFormRows_(source, Number(source.header_row || 1) + 1, null);
    updateRowById_(SHEETS.SOURCE_FORMS, 'source_id', source.source_id, { last_sync_row: result.lastRowProcessed, last_sync_time: now_() });
    return ok_(result, 'Full source sync completed');
  } finally { lock.releaseLock(); }
}

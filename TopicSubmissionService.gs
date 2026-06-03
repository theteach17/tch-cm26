function listDiscoveredTopics(payload) {
  payload = payload || {};
  const source = getActiveSource_();
  if (!source) throw new Error('No active source form');
  if (!getRows_(SHEETS.FORM_HEADER_MAP).some(r => String(r.source_id) === String(source.source_id))) detectFormHeaders();
  const ss = openSourceSpreadsheet_(source);
  const src = ss.getSheetByName(source.sheet_name);
  const lastRow = src.getLastRow(), lastCol = src.getLastColumn();
  const headerRow = Number(source.header_row || 1);
  const headers = src.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const startRow = Math.max(headerRow + 1, Number(payload.startRow || headerRow + 1));
  const endRow = Math.min(lastRow, Number(payload.endRow || lastRow));
  const values = startRow <= endRow ? src.getRange(startRow,1,endRow-startRow+1,lastCol).getValues() : [];
  const maps = getHeaderMaps_(source.source_id);
  const topicCols = maps.filter(m => m.field_type === FIELD_TYPES.TOPIC);
  const found = {};
  values.forEach((row) => {
    const classTextGlobal = findGlobalValue_(headers, row, ['ระดับชั้น','ห้อง']);
    topicCols.forEach(m => {
      const topic = normalizeText_(row[Number(m.column_index)-1]);
      if (!topic) return;
      let classCode = m.class_code === 'GENERIC' ? classTextToCode_(classTextGlobal) : m.class_code;
      if (payload.class_code && String(payload.class_code) !== String(classCode)) return;
      const key = classCode + '|' + topic;
      found[key] = found[key] || { class_code: classCode, class_text: classCodeToText_(classCode), form_topic_text: topic, count: 0 };
      found[key].count++;
    });
  });
  return ok_(Object.values(found).sort((a,b) => String(a.class_code).localeCompare(String(b.class_code)) || String(a.form_topic_text).localeCompare(String(b.form_topic_text))), 'Topics discovered');
}
function createOrUpdateTopicMap(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  const termId = payload.term_id || getActiveTerm_();
  const classCode = String(payload.class_code || '').trim();
  const offering = payload.offering_id ? getOffering_(payload.offering_id) : buildOfferingMap_()[[termId, classCode].join('|')];
  if (!offering) throw new Error('Course offering not found for class ' + classCode + ' in ' + termId);
  const topicId = payload.topic_id || ('TOPIC-' + digest_([termId, offering.offering_id, classCode, payload.form_topic_text].join('|'), 18));
  const row = {
    topic_id: topicId, term_id: termId, offering_id: offering.offering_id, class_code: classCode,
    form_topic_text: normalizeText_(payload.form_topic_text), display_topic_name: normalizeText_(payload.display_topic_name || payload.form_topic_text),
    assigned_date: payload.assigned_date || toDateOnly_(now_()), due_date: payload.due_date || '',
    score: payload.score === undefined ? getSetting_('DEFAULT_SUBMISSION_SCORE') || 1 : payload.score,
    sync_mode: payload.sync_mode || 'LIVE', duplicate_policy: payload.duplicate_policy || 'LATEST', status: payload.status || 'ACTIVE',
    created_by: getUserEmail_(), created_at: now_(), note: payload.note || ''
  };
  upsertByKey_(SHEETS.TOPIC_MAP, 'topic_id', row);
  audit_('UPSERT_TOPIC_MAP', SHEETS.TOPIC_MAP, topicId, {}, row, 'Topic map saved');
  if (payload.import_now) remapAndScoreExistingSubmissions(topicId);
  return ok_({ topic_id: topicId }, 'Topic map saved');
}
function previewRetroactiveImport(payload) {
  payload = payload || {};
  const source = getActiveSource_();
  if (!source) throw new Error('No active source form');
  const classCode = String(payload.class_code || '').trim();
  const topicText = normalizeText_(payload.form_topic_text);
  const sourceCopy = Object.assign({}, source);
  if (!getRows_(SHEETS.FORM_HEADER_MAP).some(r => String(r.source_id) === String(source.source_id))) detectFormHeaders();
  const ss = openSourceSpreadsheet_(sourceCopy);
  const src = ss.getSheetByName(sourceCopy.sheet_name);
  const lastRow = src.getLastRow(), lastCol = src.getLastColumn();
  const headerRow = Number(sourceCopy.header_row || 1);
  const headers = src.getRange(headerRow, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const values = src.getRange(headerRow + 1, 1, Math.max(0, lastRow - headerRow), lastCol).getValues();
  const maps = getHeaderMaps_(sourceCopy.source_id);
  const groups = groupHeaderMapsByClass_(maps);
  const found = [];
  values.forEach((row, i) => {
    const sourceRow = headerRow + 1 + i;
    const classTextGlobal = findGlobalValue_(headers, row, ['ระดับชั้น','ห้อง']);
    Object.keys(groups).forEach(gk => {
      const colMap = groups[gk];
      let cls = gk === 'GENERIC' ? classTextToCode_(classTextGlobal) : gk;
      if (String(cls) !== String(classCode)) return;
      const t = normalizeText_(row[(colMap[FIELD_TYPES.TOPIC] || 0)-1]);
      if (t !== topicText) return;
      const ts = findGlobalValue_(headers, row, ['Timestamp','ประทับเวลา']);
      if (payload.start_date && toDateOnly_(ts) < payload.start_date) return;
      if (payload.end_date && toDateOnly_(ts) > payload.end_date) return;
      found.push({ source_row: sourceRow, timestamp: ts, email: findGlobalValue_(headers,row,['Email Address','อีเมล','Email']), class_code: cls, student_id: cleanId_(row[(colMap[FIELD_TYPES.STUDENT_ID] || 0)-1]), student_name: normalizeText_(row[(colMap[FIELD_TYPES.NAME] || 0)-1]), topic: t, file_1: row[(colMap[FIELD_TYPES.FILE_1] || 0)-1] || '', file_2: row[(colMap[FIELD_TYPES.FILE_2] || 0)-1] || '', file_3: row[(colMap[FIELD_TYPES.FILE_3] || 0)-1] || '' });
    });
  });
  return ok_({ count: found.length, rows: found.slice(0, 200) }, 'Preview completed');
}
function groupHeaderMapsByClass_(maps) {
  const groups = {};
  maps.forEach(m => {
    const cls = String(m.class_code || 'GENERIC');
    groups[cls] = groups[cls] || {};
    groups[cls][m.field_type] = Number(m.column_index);
  });
  return groups;
}
function remapAndScoreExistingSubmissions(topicId) {
  const topic = findOne_(SHEETS.TOPIC_MAP, r => String(r.topic_id) === String(topicId));
  if (!topic) throw new Error('Topic not found: ' + topicId);
  const rows = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(r =>
    String(r.term_id) === String(topic.term_id) && String(r.class_code) === String(topic.class_code) &&
    normalizeText_(r.form_topic_text) === normalizeText_(topic.form_topic_text)
  );
  const existingScores = new Set(getRows_(SHEETS.SCORE_LEDGER).map(r => String(r.source_ref)));
  const scores = [];
  rows.forEach(r => {
    updateRowById_(SHEETS.NORMALIZED_SUBMISSIONS, 'submission_id', r.submission_id, {
      topic_id: topic.topic_id, score_status: 'ACTIVE', score: topic.score, updated_at: now_(), note: ''
    });
    if (!existingScores.has(String(r.submission_id))) {
      scores.push({ score_event_id: 'SCORE-' + r.submission_id, term_id: r.term_id, event_date: toDateOnly_(r.timestamp || now_()), session_id: '', offering_id: topic.offering_id, class_code: r.class_code, student_id: r.student_id, event_type:'FORM_SUBMISSION', score_title: topic.display_topic_name, score_delta: topic.score, source_type:'GOOGLE_FORM_RETROACTIVE', source_ref:r.submission_id, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() });
    }
  });
  appendObjects_(SHEETS.SCORE_LEDGER, scores);
  audit_('REMAP_AND_SCORE_SUBMISSIONS', SHEETS.TOPIC_MAP, topicId, {}, { rows: rows.length, scores: scores.length }, 'Existing submissions mapped/scored');
  return ok_({ updated: rows.length, scores: scores.length }, 'Existing submissions remapped');
}
function listSubmissionsForReview(filters) {
  filters = filters || {};
  let rows = getRows_(SHEETS.NORMALIZED_SUBMISSIONS);
  if (filters.term_id) rows = rows.filter(r => String(r.term_id) === String(filters.term_id)); else rows = rows.filter(r => String(r.term_id) === getActiveTerm_());
  if (filters.class_code) rows = rows.filter(r => String(r.class_code) === String(filters.class_code));
  if (filters.topic_id) rows = rows.filter(r => String(r.topic_id) === String(filters.topic_id));
  if (filters.review_status) rows = rows.filter(r => String(r.review_status) === String(filters.review_status));
  if (filters.form_topic_text) rows = rows.filter(r => normalizeText_(r.form_topic_text) === normalizeText_(filters.form_topic_text));
  const files = getRows_(SHEETS.SUBMISSION_FILES);
  const bySub = {};
  files.forEach(f => { (bySub[f.submission_id] = bySub[f.submission_id] || []).push(f); });
  return ok_(rows.slice(0, Number(filters.limit || 200)).map(r => Object.assign({}, r, { files: bySub[r.submission_id] || [] })), 'Submissions loaded');
}
function reviewSubmission(submissionId, action, reason, note) {
  assertRole_(['ADMIN','TEACHER']);
  const sub = findOne_(SHEETS.NORMALIZED_SUBMISSIONS, r => String(r.submission_id) === String(submissionId));
  if (!sub) throw new Error('Submission not found: ' + submissionId);
  const oldReview = sub.review_status, oldScore = sub.score_status;
  let newReview = oldReview, newScore = oldScore, ledgerStatus = null, voidReason = '';
  switch (action) {
    case REVIEW_ACTIONS.APPROVE: newReview = 'APPROVED'; newScore = 'ACTIVE'; ledgerStatus = 'ACTIVE'; break;
    case REVIEW_ACTIONS.VOID_NO_STAMP: newReview = 'NO_STAMP'; newScore = 'VOIDED'; ledgerStatus = 'VOIDED'; voidReason = reason || 'ไม่มีตราปั๊ม'; break;
    case REVIEW_ACTIONS.VOID_WRONG_TOPIC: newReview = 'WRONG_TOPIC'; newScore = 'VOIDED'; ledgerStatus = 'VOIDED'; voidReason = reason || 'ส่งผิดหัวข้อ'; break;
    case REVIEW_ACTIONS.VOID_DUPLICATE: newReview = 'DUPLICATE'; newScore = 'VOIDED'; ledgerStatus = 'VOIDED'; voidReason = reason || 'ส่งซ้ำ'; break;
    case REVIEW_ACTIONS.VOID_UNCLEAR_IMAGE: newReview = 'UNCLEAR'; newScore = 'VOIDED'; ledgerStatus = 'VOIDED'; voidReason = reason || 'รูปไม่ชัด'; break;
    case REVIEW_ACTIONS.VOID_OTHER: newReview = 'VOIDED_OTHER'; newScore = 'VOIDED'; ledgerStatus = 'VOIDED'; voidReason = reason || 'ยกเลิกโดยครู'; break;
    case REVIEW_ACTIONS.RESTORE_SCORE: newReview = 'APPROVED'; newScore = 'ACTIVE'; ledgerStatus = 'ACTIVE'; break;
    default: throw new Error('Unknown review action: ' + action);
  }
  updateRowById_(SHEETS.NORMALIZED_SUBMISSIONS, 'submission_id', submissionId, { review_status:newReview, score_status:newScore, updated_at:now_(), note: note || sub.note || '' });
  const ledger = findOne_(SHEETS.SCORE_LEDGER, r => String(r.source_ref) === String(submissionId));
  if (ledger && ledgerStatus) updateRowById_(SHEETS.SCORE_LEDGER, 'score_event_id', ledger.score_event_id, { status: ledgerStatus, void_reason: ledgerStatus === 'VOIDED' ? voidReason : '', updated_at: now_() });
  appendObjects_(SHEETS.REVIEW_LOG, [{ review_id: uuid_('REV'), submission_id: submissionId, action, old_review_status: oldReview, new_review_status: newReview, old_score_status: oldScore, new_score_status: newScore, reason: reason || '', reviewed_by: getUserEmail_(), reviewed_at: now_(), note: note || '' }]);
  audit_('REVIEW_SUBMISSION', SHEETS.NORMALIZED_SUBMISSIONS, submissionId, { oldReview, oldScore }, { newReview, newScore, action }, reason || '');
  return ok_({ submission_id: submissionId, review_status:newReview, score_status:newScore }, 'Review saved');
}

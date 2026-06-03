function listDiscoveredTopics(payload) {
  payload = payload || {};
  validate_(payload, { class_code: { maxLen: 20 }, startRow: { type: 'number' }, endRow: { type: 'number' } });
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
  validate_(payload, { class_code: { required: true, maxLen: 20 }, form_topic_text: { required: true, maxLen: 300 }, display_topic_name: { maxLen: 300 }, score: { type: 'number' }, assigned_date: { maxLen: 20 }, sync_mode: { maxLen: 40 } });
  const termId = payload.term_id || getActiveTerm_();
  const classCode = String(payload.class_code || '').trim();
  const offering = payload.offering_id ? getOffering_(payload.offering_id) : buildOfferingMap_()[[termId, classCode].join('|')];
  if (!offering) throw new Error('Course offering not found for class ' + classCode + ' in ' + termId);
  assertOfferingAccess_(offering.offering_id);
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
  validate_(payload, { class_code: { required: true, maxLen: 20 }, form_topic_text: { required: true, maxLen: 300 }, start_date: { maxLen: 20 }, end_date: { maxLen: 20 } });
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
  if (topic.offering_id) assertOfferingAccess_(topic.offering_id);
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
  validate_(filters, { class_code: { maxLen: 20 }, topic_id: { maxLen: 80 }, review_status: { maxLen: 40 }, limit: { type: 'number' }, offset: { type: 'number' } });
  let rows = getRows_(SHEETS.NORMALIZED_SUBMISSIONS);
  if (filters.term_id) rows = rows.filter(r => String(r.term_id) === String(filters.term_id)); else rows = rows.filter(r => String(r.term_id) === getActiveTerm_());
  if (filters.class_code) rows = rows.filter(r => String(r.class_code) === String(filters.class_code));
  if (filters.topic_id) rows = rows.filter(r => String(r.topic_id) === String(filters.topic_id));
  if (filters.review_status) rows = rows.filter(r => String(r.review_status) === String(filters.review_status));
  if (filters.form_topic_text) rows = rows.filter(r => normalizeText_(r.form_topic_text) === normalizeText_(filters.form_topic_text));
  const offset = Math.max(0, Number(filters.offset || 0));
  const limit = Math.max(1, Math.min(Number(filters.limit || getSetting_('REVIEW_PAGE_SIZE') || APP.REVIEW_PAGE_SIZE || 30), 60));
  const pageRows = rows.slice(offset, offset + limit);
  const pageIds = new Set(pageRows.map(r => String(r.submission_id)));
  const files = getRows_(SHEETS.SUBMISSION_FILES).filter(f => pageIds.has(String(f.submission_id)));
  const bySub = {};
  files.forEach(f => { (bySub[f.submission_id] = bySub[f.submission_id] || []).push(f); });
  return ok_({ rows: pageRows.map(r => Object.assign({}, r, { files: bySub[r.submission_id] || [] })), offset, limit, total: rows.length, hasMore: offset + limit < rows.length }, 'Submissions loaded');
}
function reviewSubmission(submissionId, action, reason, note) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ submissionId, action, reason: reason || '', note: note || '' }, { submissionId: { required: true, maxLen: 80 }, action: { required: true, allowed: Object.keys(REVIEW_ACTIONS).map(k => REVIEW_ACTIONS[k]) }, reason: { maxLen: 300 }, note: { maxLen: 500 } });
  const sub = findOne_(SHEETS.NORMALIZED_SUBMISSIONS, r => String(r.submission_id) === String(submissionId));
  if (!sub) throw new Error('Submission not found: ' + submissionId);
  if (sub.offering_id) assertOfferingAccess_(sub.offering_id);
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

/**
 * v1.4.0 production-audit: create TopicMap automatically from existing pending submissions,
 * re-score them, update files, and resolve noisy TOPIC_NOT_MAPPED errors.
 * This is safe to run repeatedly; it is idempotent by topic_id and score source_ref.
 */
function autoMapAndReprocessTopics(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  const termIdFilter = payload.term_id || getActiveTerm_();
  const classFilter = String(payload.class_code || '').trim();
  const source = getActiveSource_() || { source_id: 'AUTO', term_id: termIdFilter };
  const context = buildSyncContext_(source);
  const submissions = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(r => {
    if (termIdFilter && String(r.term_id) !== String(termIdFilter)) return false;
    if (classFilter && String(r.class_code) !== classFilter) return false;
    if (!normalizeText_(r.form_topic_text)) return false;
    return !r.topic_id || String(r.score_status) === 'PENDING_TOPIC' || String(r.note || '').indexOf('Waiting for TopicMap') >= 0;
  });

  const topicBySubmissionId = {};
  const topicKeys = {};
  submissions.forEach(r => {
    const termId = r.term_id || termIdFilter;
    const classCode = String(r.class_code || '').trim();
    const offering = ensureOfferingForContext_(context, termId, classCode);
    const topic = ensureTopicForContext_(context, termId, classCode, r.form_topic_text, offering, r.timestamp);
    if (topic) {
      topicBySubmissionId[String(r.submission_id)] = topic;
      topicKeys[[termId, classCode, normalizeText_(r.form_topic_text)].join('|')] = topic;
    }
  });
  appendAutomationObjects_(context);

  const updatedSubs = bulkApplyTopicToSubmissions_(topicBySubmissionId);
  const updatedFiles = bulkApplyTopicToFiles_(topicBySubmissionId);
  const scoreRows = buildScoresForMappedSubmissions_(submissions, topicBySubmissionId);
  appendObjects_(SHEETS.SCORE_LEDGER, scoreRows);
  const resolvedErrors = bulkResolveTopicErrors_(topicKeys, termIdFilter);

  audit_('AUTO_MAP_AND_REPROCESS_TOPICS', SHEETS.TOPIC_MAP, termIdFilter, {}, {
    submissions_scanned: submissions.length,
    topics_created: Object.keys(context.topicsToAppend || {}).length,
    submissions_updated: updatedSubs,
    files_updated: updatedFiles,
    scores_created: scoreRows.length,
    errors_resolved: resolvedErrors
  }, 'Automatic TopicMap repair and reprocess completed');

  return ok_({
    submissions_scanned: submissions.length,
    topics_created: Object.keys(context.topicsToAppend || {}).length,
    submissions_updated: updatedSubs,
    files_updated: updatedFiles,
    scores_created: scoreRows.length,
    errors_resolved: resolvedErrors
  }, 'Auto mapping and reprocess completed');
}

function bulkApplyTopicToSubmissions_(topicBySubmissionId) {
  const ids = Object.keys(topicBySubmissionId || {});
  if (!ids.length) return 0;
  const idSet = new Set(ids);
  const sh = sh_(SHEETS.NORMALIZED_SUBMISSIONS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const map = {}; headers.forEach((h,i)=>map[h]=i);
  const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  let changed = 0;
  values.forEach(row => {
    const subId = String(row[map.submission_id] || '');
    if (!idSet.has(subId)) return;
    const topic = topicBySubmissionId[subId];
    row[map.topic_id] = topic.topic_id;
    row[map.offering_id] = topic.offering_id || row[map.offering_id] || '';
    row[map.score_status] = 'ACTIVE';
    row[map.score] = topic.score;
    row[map.updated_at] = now_();
    row[map.note] = '';
    changed++;
  });
  if (changed) sh.getRange(2,1,lastRow-1,lastCol).setValues(values);
  return changed;
}

function bulkApplyTopicToFiles_(topicBySubmissionId) {
  const ids = Object.keys(topicBySubmissionId || {});
  if (!ids.length) return 0;
  const idSet = new Set(ids);
  const sh = sh_(SHEETS.SUBMISSION_FILES);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const map = {}; headers.forEach((h,i)=>map[h]=i);
  const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  let changed = 0;
  values.forEach(row => {
    const subId = String(row[map.submission_id] || '');
    if (!idSet.has(subId)) return;
    const topic = topicBySubmissionId[subId];
    row[map.topic_id] = topic.topic_id;
    changed++;
  });
  if (changed) sh.getRange(2,1,lastRow-1,lastCol).setValues(values);
  return changed;
}

function buildScoresForMappedSubmissions_(submissions, topicBySubmissionId) {
  const existingSourceRefs = new Set(getRows_(SHEETS.SCORE_LEDGER).map(r => String(r.source_ref)));
  const scores = [];
  submissions.forEach(r => {
    const subId = String(r.submission_id || '');
    const topic = topicBySubmissionId[subId];
    if (!topic || existingSourceRefs.has(subId)) return;
    scores.push({
      score_event_id: 'SCORE-' + subId,
      term_id: r.term_id,
      event_date: toDateOnly_(r.timestamp || now_()),
      session_id: '',
      offering_id: topic.offering_id || r.offering_id || '',
      class_code: r.class_code,
      student_id: r.student_id,
      event_type: 'FORM_SUBMISSION',
      score_title: topic.display_topic_name || r.form_topic_text,
      score_delta: topic.score,
      source_type: 'GOOGLE_FORM_AUTO_TOPIC',
      source_ref: subId,
      status: 'ACTIVE',
      void_reason: '',
      created_by: 'SYSTEM_AUTO_REPROCESS',
      created_at: now_(),
      updated_at: now_()
    });
    existingSourceRefs.add(subId);
  });
  return scores;
}

function bulkResolveTopicErrors_(topicKeys, termId) {
  if (!topicKeys || !Object.keys(topicKeys).length) return 0;
  if (getSetting_('AUTO_RESOLVE_TOPIC_ERRORS') !== '' && !toBool_(getSetting_('AUTO_RESOLVE_TOPIC_ERRORS'))) return 0;
  const sh = sh_(SHEETS.ERROR_LOG);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const map = {}; headers.forEach((h,i)=>map[h]=i);
  const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  let resolved = 0;
  values.forEach(row => {
    if (String(row[map.error_type]) !== 'TOPIC_NOT_MAPPED') return;
    if (String(row[map.status]) === 'RESOLVED') return;
    const raw = parseJson_(row[map.raw_value], {});
    const classCode = String(raw.classCode || raw.class_code || '').trim();
    const topicText = normalizeText_(raw.topicText || raw.form_topic_text || '');
    const key = [termId || getActiveTerm_(), classCode, topicText].join('|');
    if (!topicKeys[key]) return;
    row[map.status] = 'RESOLVED';
    row[map.resolved_by] = getUserEmail_() || 'SYSTEM_AUTO_REPAIR';
    row[map.resolved_at] = now_();
    resolved++;
  });
  if (resolved) sh.getRange(2,1,lastRow-1,lastCol).setValues(values);
  return resolved;
}

/**
 * v1.9.0 review-viewer-images
 * Review page performance fix:
 * - Do not load all submissions/files for review.
 * - Force the user flow to choose class + topic first.
 * - Use a denormalized ReviewIndex sheet for fast paginated review cards.
 * - Keep api_listSubmissionsForReview name for frontend compatibility, but serve it from ReviewIndex.
 */
function ensureReviewIndexSheet_() {
  return ensureSheet_(SHEETS.REVIEW_INDEX, SCHEMA[SHEETS.REVIEW_INDEX]);
}

function listReviewTopics(filters) {
  filters = filters || {};
  validate_(filters, { class_code: { maxLen: 20 }, offering_id: { maxLen: 120 }, term_id: { maxLen: 40 } });
  const termId = filters.term_id || getActiveTerm_();
  let topics = getRows_(SHEETS.TOPIC_MAP).filter(function (t) {
    if (String(t.term_id) !== String(termId)) return false;
    if (String(t.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return false;
    if (filters.offering_id && String(t.offering_id) !== String(filters.offering_id)) return false;
    if (filters.class_code && String(t.class_code) !== String(filters.class_code)) return false;
    return true;
  });

  topics.sort(function (a, b) {
    return String(b.assigned_date || '').localeCompare(String(a.assigned_date || '')) || String(a.display_topic_name || a.form_topic_text).localeCompare(String(b.display_topic_name || b.form_topic_text));
  });

  let countByTopic = {};
  try {
    ensureReviewIndexSheet_();
    getRows_(SHEETS.REVIEW_INDEX).forEach(function (r) {
      if (String(r.term_id) !== String(termId)) return;
      if (filters.class_code && String(r.class_code) !== String(filters.class_code)) return;
      const key = String(r.topic_id || '');
      if (key) countByTopic[key] = (countByTopic[key] || 0) + 1;
    });
  } catch (err) {
    console.warn('Review topic counts skipped', err);
  }

  return ok_({
    term_id: termId,
    class_code: filters.class_code || '',
    topics: topics.map(function (t) {
      return Object.assign({}, t, {
        indexed_count: countByTopic[String(t.topic_id)] || 0,
        label: (t.display_topic_name || t.form_topic_text || t.topic_id) + ' · ' + (t.assigned_date || '')
      });
    })
  }, 'Review topics loaded');
}

function topicMatchesFilter_(r, filters) {
  if (filters.term_id && String(r.term_id) !== String(filters.term_id)) return false;
  if (!filters.term_id && String(r.term_id) !== String(getActiveTerm_())) return false;
  if (filters.offering_id && String(r.offering_id) !== String(filters.offering_id)) return false;
  if (filters.class_code && String(r.class_code) !== String(filters.class_code)) return false;
  if (filters.topic_id && String(r.topic_id) !== String(filters.topic_id)) return false;
  if (filters.form_topic_text && normalizeText_(r.form_topic_text) !== normalizeText_(filters.form_topic_text)) return false;
  return true;
}

function buildReviewIndexRows_(filters) {
  filters = filters || {};
  const termId = filters.term_id || getActiveTerm_();
  let subs = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(function (r) {
    return topicMatchesFilter_(r, Object.assign({}, filters, { term_id: termId }));
  });
  if (!subs.length) return [];

  const subIds = new Set(subs.map(function (s) { return String(s.submission_id); }));
  const filesBySub = {};
  getRows_(SHEETS.SUBMISSION_FILES).forEach(function (f) {
    const sid = String(f.submission_id || '');
    if (!subIds.has(sid)) return;
    (filesBySub[sid] = filesBySub[sid] || []).push(f);
  });

  return subs.map(function (s) {
    const files = (filesBySub[String(s.submission_id)] || []).sort(function (a, b) { return Number(a.file_no || 0) - Number(b.file_no || 0); });
    const fileUrls = files.map(function (f) { return String(f.file_url || ''); }).filter(Boolean);
    const previewUrls = files.map(function (f) {
      // Always regenerate a thumbnail URL from the original Drive URL when possible.
      // Old rows may still contain uc?export=view previews, which often fail in Web App image tags.
      return String(makePreviewUrl_(f.file_url || f.preview_url || f.file_id) || f.preview_url || '');
    }).filter(Boolean);
    return {
      review_index_id: 'RIDX-' + digest_(String(s.submission_id || ''), 18),
      term_id: s.term_id || termId,
      offering_id: s.offering_id || '',
      class_code: s.class_code || '',
      topic_id: s.topic_id || '',
      form_topic_text: s.form_topic_text || '',
      submission_id: s.submission_id || '',
      student_id: s.student_id || '',
      student_name: s.student_name || '',
      timestamp: s.timestamp || '',
      review_status: s.review_status || 'PENDING',
      score_status: s.score_status || '',
      score: s.score || '',
      file_count: files.length || Number(s.file_count || 0),
      first_preview_url: previewUrls[0] || '',
      first_file_url: fileUrls[0] || '',
      file_urls_json: safeJson_(fileUrls),
      preview_urls_json: safeJson_(previewUrls),
      updated_at: now_()
    };
  });
}

function replaceReviewIndexRows_(filters, newRows) {
  ensureReviewIndexSheet_();
  const sh = sh_(SHEETS.REVIEW_INDEX);
  const headers = SCHEMA[SHEETS.REVIEW_INDEX];
  const existing = getRows_(SHEETS.REVIEW_INDEX);
  const keep = existing.filter(function (r) { return !topicMatchesFilter_(r, filters); });
  const rows = keep.concat(newRows || []);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows.map(function (obj) {
      return headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
    }));
  }
  return { kept: keep.length, rebuilt: (newRows || []).length, total: rows.length };
}

function rebuildReviewIndex(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { class_code: { maxLen: 20 }, topic_id: { maxLen: 80 }, form_topic_text: { maxLen: 300 }, term_id: { maxLen: 40 } });
  const filters = {
    term_id: payload.term_id || getActiveTerm_(),
    class_code: payload.class_code || '',
    topic_id: payload.topic_id || '',
    form_topic_text: payload.form_topic_text || ''
  };
  if (!filters.topic_id && !filters.form_topic_text && !payload.rebuild_all) {
    throw new Error('กรุณาเลือกหัวข้อก่อนสร้างดัชนีตรวจงาน เพื่อป้องกันการประมวลผลทั้งระบบนานเกินไป');
  }
  const rows = buildReviewIndexRows_(filters);
  const result = replaceReviewIndexRows_(filters, rows);
  audit_('REBUILD_REVIEW_INDEX', SHEETS.REVIEW_INDEX, filters.topic_id || filters.form_topic_text || 'ALL', {}, result, 'ReviewIndex rebuilt');
  return ok_(result, 'Review index rebuilt');
}

function parseJsonArray_(s) {
  const v = parseJson_(s, []);
  return Array.isArray(v) ? v : [];
}

function reviewIndexRowToSubmission_(r) {
  const fileUrls = parseJsonArray_(r.file_urls_json);
  const previewUrls = parseJsonArray_(r.preview_urls_json);
  const maxLen = Math.max(fileUrls.length, previewUrls.length, Number(r.file_count || 0));
  const files = [];
  for (let i = 0; i < maxLen; i++) {
    const originalUrl = fileUrls[i] || r.first_file_url || '';
    const fileId = extractDriveFileId_(originalUrl || previewUrls[i] || r.first_preview_url || '');
    const preview = makePreviewUrl_(originalUrl || fileId) || previewUrls[i] || r.first_preview_url || '';
    const viewUrl = makeDriveViewUrl_(originalUrl || fileId);
    if (!originalUrl && !preview && !viewUrl) continue;
    files.push({
      file_no: i + 1,
      file_id: fileId,
      file_url: viewUrl || originalUrl,
      original_url: originalUrl,
      preview_url: preview,
      thumb_url: preview
    });
  }
  return {
    submission_id: r.submission_id,
    term_id: r.term_id,
    offering_id: r.offering_id,
    class_code: r.class_code,
    topic_id: r.topic_id,
    form_topic_text: r.form_topic_text,
    student_id: r.student_id,
    student_name: r.student_name,
    timestamp: r.timestamp,
    review_status: r.review_status,
    score_status: r.score_status,
    score: r.score,
    file_count: r.file_count,
    files: files
  };
}

function listSubmissionsForReview(filters) {
  filters = filters || {};
  validate_(filters, { class_code: { maxLen: 20 }, topic_id: { maxLen: 80 }, form_topic_text: { maxLen: 300 }, review_status: { maxLen: 40 }, limit: { type: 'number' }, offset: { type: 'number' }, force_rebuild: { type: 'boolean' } });
  const termId = filters.term_id || getActiveTerm_();
  if (!filters.topic_id && !filters.form_topic_text) {
    return ok_({ rows: [], offset:0, limit:Number(filters.limit || 30), total:0, hasMore:false, requiresTopic:true, message:'กรุณาเลือกหัวข้องานก่อนโหลดรายการตรวจ เพื่อให้ระบบทำงานเร็วและไม่ดึงข้อมูลทั้งภาคเรียน' }, 'Topic required');
  }

  const idxFilters = { term_id: termId, class_code: filters.class_code || '', topic_id: filters.topic_id || '', form_topic_text: filters.form_topic_text || '' };
  ensureReviewIndexSheet_();
  let indexRows = getRows_(SHEETS.REVIEW_INDEX).filter(function (r) { return topicMatchesFilter_(r, idxFilters); });

  if (toBool_(filters.force_rebuild) || !indexRows.length) {
    const rows = buildReviewIndexRows_(idxFilters);
    replaceReviewIndexRows_(idxFilters, rows);
    indexRows = rows;
  }

  if (filters.review_status) indexRows = indexRows.filter(function (r) { return String(r.review_status) === String(filters.review_status); });
  indexRows.sort(function (a, b) { return String(b.timestamp || '').localeCompare(String(a.timestamp || '')); });

  const offset = Math.max(0, Number(filters.offset || 0));
  const limit = Math.max(1, Math.min(Number(filters.limit || getSetting_('REVIEW_PAGE_SIZE') || APP.REVIEW_PAGE_SIZE || 30), 30));
  const pageRows = indexRows.slice(offset, offset + limit);

  return ok_({
    rows: pageRows.map(reviewIndexRowToSubmission_),
    offset: offset,
    limit: limit,
    total: indexRows.length,
    hasMore: offset + limit < indexRows.length,
    source: 'ReviewIndex'
  }, 'Submissions loaded from ReviewIndex');
}

function updateReviewIndexAfterReview_(submissionId, patch) {
  try {
    ensureReviewIndexSheet_();
    updateRowById_(SHEETS.REVIEW_INDEX, 'submission_id', submissionId, Object.assign({}, patch, { updated_at: now_() }));
  } catch (err) {
    console.warn('updateReviewIndexAfterReview skipped', err);
  }
}

function reviewSubmission(submissionId, action, reason, note) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ submissionId, action, reason, note }, { submissionId: { required: true, maxLen: 120 }, action: { required: true, maxLen: 40 }, reason: { maxLen: 300 }, note: { maxLen: 500 } });
  const sub = findOne_(SHEETS.NORMALIZED_SUBMISSIONS, function (r) { return String(r.submission_id) === String(submissionId); });
  if (!sub) throw new Error('Submission not found: ' + submissionId);
  if (sub.offering_id) assertOfferingAccess_(sub.offering_id);
  const oldReview = sub.review_status, oldScore = sub.score_status;
  let newReview, newScore, ledgerStatus = null, voidReason = '';
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
  const ledger = findOne_(SHEETS.SCORE_LEDGER, function (r) { return String(r.source_ref) === String(submissionId); });
  if (ledger && ledgerStatus) updateRowById_(SHEETS.SCORE_LEDGER, 'score_event_id', ledger.score_event_id, { status: ledgerStatus, void_reason: ledgerStatus === 'VOIDED' ? voidReason : '', updated_at: now_() });
  appendObjects_(SHEETS.REVIEW_LOG, [{ review_id: uuid_('REV'), submission_id: submissionId, action, old_review_status: oldReview, new_review_status: newReview, old_score_status: oldScore, new_score_status: newScore, reason: reason || '', reviewed_by: getUserEmail_(), reviewed_at: now_(), note: note || '' }]);
  updateReviewIndexAfterReview_(submissionId, { review_status: newReview, score_status: newScore });
  audit_('REVIEW_SUBMISSION', SHEETS.NORMALIZED_SUBMISSIONS, submissionId, { oldReview, oldScore }, { newReview, newScore, action }, reason || '');
  return ok_({ submission_id: submissionId, review_status:newReview, score_status:newScore }, 'Review saved');
}

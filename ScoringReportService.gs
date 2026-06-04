function randomBookCheck(sessionId, count) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ sessionId, count: count || 1 }, { sessionId: { required: true, maxLen: 120 }, count: { type: 'number' } });
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');
  assertOfferingAccess_(session.offering_id);
  count = Number(count || getSetting_('RANDOM_BOOK_CHECK_COUNT') || 5);
  const presentIds = new Set(getRows_(SHEETS.ATTENDANCE_LOG).filter(r => String(r.session_id) === String(sessionId) && String(r.attendance_status) === 'PRESENT').map(r => cleanId_(r.student_id)));
  const enrollments = getCachedEnrollmentsByOffering_(session.offering_id);
  const pool = enrollments.filter(e => presentIds.size ? presentIds.has(cleanId_(e.student_id)) : true);
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count);
  return ok_(shuffled, 'Students randomized');
}
function saveBookCheckResult(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { session_id: { required: true, maxLen: 120 }, student_id: { required: true, maxLen: 20 }, result: { maxLen: 40 }, score_delta: { type: 'number' } });
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(payload.session_id));
  if (!session) throw new Error('Session not found');
  assertOfferingAccess_(session.offering_id);
  const result = payload.result || 'BROUGHT';
  const delta = payload.score_delta !== undefined ? Number(payload.score_delta) : (result === 'BROUGHT' ? numericOrZero_(getSetting_('DEFAULT_BOOK_BROUGHT_SCORE') || 1) : numericOrZero_(getSetting_('DEFAULT_BOOK_NOT_BROUGHT_SCORE') || -1));
  const id = uuid_('BOOK');
  appendObjects_(SHEETS.BOOK_CHECK_LOG, [{ book_check_id:id, term_id: session.term_id, session_id: session.session_id, offering_id: session.offering_id, class_code: session.class_code, student_id: cleanId_(payload.student_id), is_random: payload.is_random === undefined ? true : toBool_(payload.is_random), result, score_delta: delta, checked_by: getUserEmail_(), checked_at: now_(), note: payload.note || '' }]);
  appendObjects_(SHEETS.SCORE_LEDGER, [{ score_event_id:'SCORE-' + id, term_id: session.term_id, event_date: toDateOnly_(session.session_date), session_id: session.session_id, offering_id: session.offering_id, class_code: session.class_code, student_id: cleanId_(payload.student_id), event_type:'BOOK_CHECK', score_title: result === 'BROUGHT' ? 'นำสมุดมา' : 'ไม่นำสมุดมา', score_delta: delta, source_type:'BOOK_CHECK', source_ref:id, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() }]);
  return ok_({ book_check_id: id }, 'Book check saved');
}
function saveManualScore(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { session_id: { maxLen: 120 }, offering_id: { maxLen: 120 }, student_id: { maxLen: 20 }, score_title: { maxLen: 200 }, score_delta: { required: true, type: 'number' } });
  const session = payload.session_id ? findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(payload.session_id)) : null;
  const termId = session ? session.term_id : (payload.term_id || getActiveTerm_());
  const offeringId = session ? session.offering_id : payload.offering_id;
  const offering = getOffering_(offeringId);
  if (!offering) throw new Error('Offering not found');
  assertOfferingAccess_(offering.offering_id);
  const students = Array.isArray(payload.student_ids) ? payload.student_ids : [payload.student_id];
  const manualRows = [], scoreRows = [];
  students.filter(Boolean).forEach(studentIdRaw => {
    const studentId = cleanId_(studentIdRaw);
    const id = uuid_('MS');
    manualRows.push({ manual_score_id:id, term_id:termId, session_id: session ? session.session_id : '', offering_id:offering.offering_id, class_code:offering.class_code, student_id:studentId, score_type:payload.score_type || 'SPECIAL', score_title:payload.score_title || 'คะแนนพิเศษ', score_delta:Number(payload.score_delta || 0), created_by:getUserEmail_(), created_at:now_(), note:payload.note || '' });
    scoreRows.push({ score_event_id:'SCORE-' + id, term_id:termId, event_date: toDateOnly_(session ? session.session_date : now_()), session_id: session ? session.session_id : '', offering_id:offering.offering_id, class_code:offering.class_code, student_id:studentId, event_type:'MANUAL', score_title:payload.score_title || 'คะแนนพิเศษ', score_delta:Number(payload.score_delta || 0), source_type:'MANUAL_SCORE', source_ref:id, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() });
  });
  appendObjects_(SHEETS.MANUAL_SCORE_LOG, manualRows);
  appendObjects_(SHEETS.SCORE_LEDGER, scoreRows);
  return ok_({ count: manualRows.length }, 'Manual scores saved');
}
/**
 * Lightweight projection reader for dashboard counters.
 * It reads only the columns needed by the dashboard, instead of getRows_() on entire sheets.
 * This prevents the home page from becoming a bottleneck when submissions/attendance grow.
 */
function getProjectedRowsForDashboard_(sheetName, fields) {
  const sh = sh_(sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const header = headerMap_(sheetName);
  const n = lastRow - 1;
  const cols = {};
  fields.forEach(function (f) {
    const idx = header.map[f];
    if (idx === undefined) {
      cols[f] = Array(n).fill('');
    } else {
      cols[f] = sh.getRange(2, idx + 1, n, 1).getValues().map(function (r) { return r[0]; });
    }
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const obj = { __row: i + 2 };
    fields.forEach(function (f) { obj[f] = cols[f][i]; });
    out.push(obj);
  }
  return out;
}

function getDashboardData() {
  const termId = getActiveTerm_();
  const user = getCurrentUser();
  const cache = CacheService.getScriptCache();
  const cacheKey = 'DASH_V25_' + termId + '_' + String(user.email || '').toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached) {
    return ok_(JSON.parse(cached), 'Dashboard loaded from cache');
  }

  const started = Date.now();
  const offerings = listUiOfferings_ ? listUiOfferings_() : listActiveOfferings();
  const allowedOfferings = new Set(offerings.map(function (o) { return String(o.offering_id); }));

  // Sessions are small, but still read only the required columns.
  const sessions = getProjectedRowsForDashboard_(SHEETS.SESSIONS, [
    'term_id','status','offering_id','session_id','class_code','session_date','period_no','lesson_title'
  ]).filter(function (r) { return String(r.term_id) === String(termId); });
  const activeSessions = sessions.filter(function (r) {
    return String(r.status) === 'ACTIVE' && allowedOfferings.has(String(r.offering_id));
  });

  let submissions = 0, pending = 0, voided = 0;
  try {
    getProjectedRowsForDashboard_(SHEETS.NORMALIZED_SUBMISSIONS, [
      'term_id','review_status','score_status'
    ]).forEach(function (r) {
      if (String(r.term_id) !== String(termId)) return;
      submissions++;
      if (String(r.review_status) === 'PENDING') pending++;
      if (String(r.score_status) === 'VOIDED') voided++;
    });
  } catch (err) {
    // Dashboard must never block the Web App startup. Return a warning instead.
    console.warn('Dashboard submission counters skipped: ' + err.message);
  }

  let attendanceToday = 0;
  const today = toDateOnly_(now_());
  try {
    getProjectedRowsForDashboard_(SHEETS.ATTENDANCE_LOG, [
      'term_id','created_at','checkin_time','attendance_status'
    ]).forEach(function (r) {
      if (String(r.term_id) !== String(termId)) return;
      const d = toDateOnly_(r.created_at || r.checkin_time || now_());
      if (d === today && String(r.attendance_status) === 'PRESENT') attendanceToday++;
    });
  } catch (err) {
    console.warn('Dashboard attendance counter skipped: ' + err.message);
  }

  const data = {
    termId,
    activeSessions,
    totalSessions: sessions.length,
    submissions,
    pendingReview: pending,
    voided,
    attendanceToday,
    offerings,
    generatedAt: now_(),
    elapsedMs: Date.now() - started
  };
  try { cache.put(cacheKey, JSON.stringify(sanitizeForClient_(data)), 45); } catch (err) {}
  return ok_(data, 'Dashboard loaded');
}
function getGradebook(payload) {
  payload = payload || {};
  validate_(payload, { offering_id: { required: true, maxLen: 120 }, term_id: { maxLen: 40 } });
  const termId = payload.term_id || getActiveTerm_();
  const offeringId = payload.offering_id;
  const offering = getOffering_(offeringId);
  if (!offering) throw new Error('Offering not found');
  assertOfferingAccess_(offering.offering_id);
  const enrollments = getRows_(SHEETS.ENROLLMENTS).filter(r => String(r.offering_id) === offeringId && String(r.enrollment_status) === 'ACTIVE');
  const students = buildStudentMap_().byId;
  const scores = getRows_(SHEETS.SCORE_LEDGER).filter(r => String(r.term_id) === termId && String(r.offering_id) === offeringId && String(r.status) === 'ACTIVE');
  const topics = getRows_(SHEETS.TOPIC_MAP).filter(r => String(r.term_id) === termId && String(r.offering_id) === offeringId && String(r.status) === 'ACTIVE');
  const submissions = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(r => String(r.term_id) === termId && String(r.offering_id) === offeringId);
  const byStudent = {};
  enrollments.forEach(e => byStudent[cleanId_(e.student_id)] = { student_id: cleanId_(e.student_id), student_no: e.student_no || '', student_name: (students[cleanId_(e.student_id)] || {}).student_name_th || (students[cleanId_(e.student_id)] || {}).student_name_en || '', attendance_score:0, book_score:0, submission_score:0, manual_score:0, total_score:0, submitted_count:0, pending_review_count:0, voided_count:0, missing_count:0, topic_status:{} });
  scores.forEach(s => {
    const st = byStudent[cleanId_(s.student_id)]; if (!st) return;
    const val = numericOrZero_(s.score_delta); st.total_score += val;
    if (s.event_type === 'ATTENDANCE') st.attendance_score += val;
    else if (s.event_type === 'BOOK_CHECK') st.book_score += val;
    else if (s.event_type === 'FORM_SUBMISSION') st.submission_score += val;
    else st.manual_score += val;
  });
  const subByStudentTopic = {};
  submissions.forEach(sub => {
    const sid = cleanId_(sub.student_id);
    const key = sid + '|' + sub.topic_id;
    subByStudentTopic[key] = sub;
    const st = byStudent[sid]; if (!st) return;
    if (sub.topic_id) st.submitted_count++;
    if (sub.review_status === 'PENDING') st.pending_review_count++;
    if (sub.score_status === 'VOIDED') st.voided_count++;
  });
  Object.keys(byStudent).forEach(sid => {
    topics.forEach(t => {
      const sub = subByStudentTopic[sid + '|' + t.topic_id];
      byStudent[sid].topic_status[t.topic_id] = sub ? (sub.score_status === 'VOIDED' ? 'ยกเลิก' : (sub.review_status === 'PENDING' ? 'รอตรวจ' : '✓')) : '-';
      if (!sub) byStudent[sid].missing_count++;
    });
  });
  let attendanceSummary = null;
  try {
    attendanceSummary = getAttendanceSummary({ offering_id: offeringId, term_id: termId }).data;
    Object.keys(byStudent).forEach(function (sid) {
      const attRow = (attendanceSummary.rows || []).find(function (r) { return String(r.student_id) === String(sid); }) || {};
      byStudent[sid].present_count = attRow.present || 0;
      byStudent[sid].absent_count = attRow.absent || 0;
      byStudent[sid].late_count = attRow.late || 0;
      byStudent[sid].excused_count = attRow.excused || 0;
      byStudent[sid].attendance_rate = attRow.rate || 0;
    });
  } catch (err) {
    attendanceSummary = { summary: {}, rows: [], warning: err.message };
  }
  return ok_({ offering, topics, attendanceSummary: attendanceSummary, rows:Object.values(byStudent).sort((a,b) => String(a.student_no).localeCompare(String(b.student_no), undefined, {numeric:true}) || String(a.student_id).localeCompare(String(b.student_id))) }, 'Gradebook loaded');
}
function regenerateActiveRoomSheets() {
  const termId = getActiveTerm_();
  const offerings = getRows_(SHEETS.COURSE_OFFERINGS).filter(o => String(o.term_id) === termId && String(o.status) === 'ACTIVE');
  const results = [];
  offerings.forEach(o => results.push(regenerateRoomSheet(o.offering_id).data));
  return ok_(results, 'Room sheets regenerated');
}
function regenerateRoomSheet(offeringId) {
  const gb = getGradebook({ offering_id: offeringId }).data;
  const sheetName = 'Room_' + gb.offering.class_code;
  const sh = sh_(sheetName);
  sh.clear();
  const topicHeaders = gb.topics.map(t => t.display_topic_name || t.form_topic_text);
  const headers = ['เลขที่','รหัสนักเรียน','ชื่อ','เข้าเรียน','สมุด','ส่งงาน','พิเศษ/หัก','รวม','ส่งแล้ว','ขาดส่ง','รอตรวจ','ยกเลิก'].concat(topicHeaders);
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#d9ead3');
  const values = gb.rows.map(r => [r.student_no, r.student_id, r.student_name, r.attendance_score, r.book_score, r.submission_score, r.manual_score, r.total_score, r.submitted_count, r.missing_count, r.pending_review_count, r.voided_count].concat(gb.topics.map(t => r.topic_status[t.topic_id] || '-')));
  if (values.length) sh.getRange(2,1,values.length,headers.length).setValues(values);
  sh.setFrozenRows(1); sh.setFrozenColumns(3); sh.autoResizeColumns(1, Math.min(headers.length, 20));
  return ok_({ sheetName, rows: values.length }, 'Room sheet regenerated');
}

/**
 * v2.6: batch save book check results from the random-name page.
 * This prevents multiple google.script.run calls when a teacher records book-check scores for several students.
 */
function saveBookCheckBatch(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { session_id: { required: true, maxLen: 120 }, note: { maxLen: 500 } });
  const results = Array.isArray(payload.results) ? payload.results : [];
  if (!results.length) throw new Error('ไม่มีรายการนักเรียนสำหรับบันทึกคะแนนสมุด');
  if (results.length > 60) throw new Error('รายการมากเกินไป กรุณาบันทึกครั้งละไม่เกิน 60 คน');
  const session = findOne_(SHEETS.SESSIONS, function (r) { return String(r.session_id) === String(payload.session_id); });
  if (!session) throw new Error('ไม่พบคาบเรียนที่เลือก');
  assertOfferingAccess_(session.offering_id);
  const bookRows = [];
  const scoreRows = [];
  results.forEach(function (item) {
    const studentId = cleanId_(item.student_id);
    if (!studentId) return;
    const result = String(item.result || 'BROUGHT').toUpperCase();
    const delta = item.score_delta !== undefined && item.score_delta !== ''
      ? Number(item.score_delta)
      : (result === 'BROUGHT' ? numericOrZero_(getSetting_('DEFAULT_BOOK_BROUGHT_SCORE') || 1) : numericOrZero_(getSetting_('DEFAULT_BOOK_NOT_BROUGHT_SCORE') || -1));
    const id = uuid_('BOOK');
    const title = result === 'BROUGHT' ? 'นำสมุดมา' : 'ไม่นำสมุดมา';
    bookRows.push({ book_check_id:id, term_id: session.term_id, session_id: session.session_id, offering_id: session.offering_id, class_code: session.class_code, student_id: studentId, is_random: true, result: result, score_delta: delta, checked_by: getUserEmail_(), checked_at: now_(), note: payload.note || 'บันทึกจากเมนูสุ่มชื่อ' });
    scoreRows.push({ score_event_id:'SCORE-' + id, term_id: session.term_id, event_date: toDateOnly_(session.session_date), session_id: session.session_id, offering_id: session.offering_id, class_code: session.class_code, student_id: studentId, event_type:'BOOK_CHECK', score_title:title, score_delta: delta, source_type:'BOOK_CHECK', source_ref:id, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() });
  });
  if (!bookRows.length) throw new Error('ไม่พบเลขประจำตัวนักเรียนที่ถูกต้องสำหรับบันทึกคะแนน');
  appendObjects_(SHEETS.BOOK_CHECK_LOG, bookRows);
  appendObjects_(SHEETS.SCORE_LEDGER, scoreRows);
  return ok_({ count: bookRows.length }, 'บันทึกคะแนนสมุดแบบกลุ่มสำเร็จ');
}

/**
 * v2.7: Scorebook-only projection for UI.
 * Keeps attendance details out of the gradebook page so the score table remains focused and readable.
 */
function getScorebook(payload) {
  payload = payload || {};
  validate_(payload, { offering_id: { required: true, maxLen: 120 }, term_id: { maxLen: 40 } });
  const termId = payload.term_id || getActiveTerm_();
  const offeringId = payload.offering_id;
  const offering = getOffering_(offeringId);
  if (!offering) throw new Error('ไม่พบห้อง/รายวิชาในระบบ');
  assertOfferingAccess_(offering.offering_id);

  const enrollments = getCachedEnrollmentsByOffering_(offeringId)
    .filter(function (r) { return String(r.enrollment_status || 'ACTIVE').toUpperCase() === 'ACTIVE'; });
  const students = getCachedStudentMap_().byId || {};
  const scores = getRows_(SHEETS.SCORE_LEDGER).filter(function (r) {
    return String(r.term_id) === String(termId) && String(r.offering_id) === String(offeringId) && String(r.status).toUpperCase() === 'ACTIVE';
  });
  const topics = getRows_(SHEETS.TOPIC_MAP).filter(function (r) {
    return String(r.term_id) === String(termId) && String(r.offering_id) === String(offeringId) && String(r.status).toUpperCase() === 'ACTIVE';
  }).sort(function (a, b) {
    return String(a.assigned_date || '').localeCompare(String(b.assigned_date || '')) || String(a.display_topic_name || a.form_topic_text).localeCompare(String(b.display_topic_name || b.form_topic_text), 'th');
  });
  const submissions = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(function (r) {
    return String(r.term_id) === String(termId) && String(r.offering_id) === String(offeringId);
  });

  const byStudent = {};
  enrollments.forEach(function (e) {
    const sid = cleanId_(e.student_id);
    const st = students[sid] || {};
    byStudent[sid] = {
      student_id: sid,
      student_no: e.student_no || '',
      student_name: st.student_name_th || st.student_name_en || sid,
      book_score: 0,
      submission_score: 0,
      manual_score: 0,
      total_score: 0,
      submitted_count: 0,
      missing_count: 0,
      pending_review_count: 0,
      voided_count: 0,
      topic_status: {},
      topic_scores: {}
    };
  });

  scores.forEach(function (s) {
    const row = byStudent[cleanId_(s.student_id)];
    if (!row) return;
    const val = numericOrZero_(s.score_delta);
    if (s.event_type === 'FORM_SUBMISSION') row.submission_score += val;
    else if (s.event_type === 'BOOK_CHECK') row.book_score += val;
    else if (s.event_type !== 'ATTENDANCE') row.manual_score += val;
    // Keep total score focused on gradebook-related scores. Attendance is reported in the attendance menu.
    if (s.event_type !== 'ATTENDANCE') row.total_score += val;
    if (s.event_type === 'FORM_SUBMISSION' && s.source_ref) {
      // source_ref is submission_id in current scoring flow.
      const topic = submissions.find(function (sub) { return String(sub.submission_id) === String(s.source_ref); });
      if (topic && topic.topic_id) row.topic_scores[topic.topic_id] = (row.topic_scores[topic.topic_id] || 0) + val;
    }
  });

  const subByStudentTopic = {};
  submissions.forEach(function (sub) {
    const sid = cleanId_(sub.student_id);
    const key = sid + '|' + sub.topic_id;
    const current = subByStudentTopic[key];
    if (!current || String(sub.timestamp || '').localeCompare(String(current.timestamp || '')) > 0) subByStudentTopic[key] = sub;
  });

  Object.keys(byStudent).forEach(function (sid) {
    topics.forEach(function (t) {
      const sub = subByStudentTopic[sid + '|' + t.topic_id];
      let status = 'MISSING';
      if (sub) {
        const review = String(sub.review_status || '').toUpperCase();
        const scoreStatus = String(sub.score_status || '').toUpperCase();
        if (scoreStatus === 'VOIDED') status = 'VOIDED';
        else if (review === 'PENDING') status = 'PENDING';
        else status = 'SUBMITTED';
      }
      byStudent[sid].topic_status[t.topic_id] = status;
      if (status === 'MISSING') byStudent[sid].missing_count++;
      else byStudent[sid].submitted_count++;
      if (status === 'PENDING') byStudent[sid].pending_review_count++;
      if (status === 'VOIDED') byStudent[sid].voided_count++;
    });
  });

  return ok_({
    offering: offering,
    topics: topics,
    rows: Object.values(byStudent).sort(function (a, b) {
      return String(a.student_no || '').localeCompare(String(b.student_no || ''), undefined, { numeric: true }) || String(a.student_id).localeCompare(String(b.student_id), undefined, { numeric: true });
    })
  }, 'โหลดสมุดคะแนนสำเร็จ');
}

/**
 * v2.7: Attendance detail matrix for the new attendance menu.
 * Shows each student by session/date/period with summary counts and attendance rate.
 */
function getAttendanceDetail(payload) {
  payload = payload || {};
  validate_(payload, { offering_id: { required: true, maxLen: 120 }, term_id: { maxLen: 40 } });
  const termId = payload.term_id || getActiveTerm_();
  const offering = getOffering_(payload.offering_id);
  if (!offering) throw new Error('ไม่พบห้อง/รายวิชาในระบบ');
  assertOfferingAccess_(offering.offering_id);

  const roster = buildRosterStudents_(offering.offering_id);
  const sessions = getRows_(SHEETS.SESSIONS).filter(function (s) {
    return String(s.term_id) === String(termId) && String(s.offering_id) === String(offering.offering_id) && String(s.status).toUpperCase() !== 'CANCELLED';
  }).sort(function (a, b) {
    return String(a.session_date || '').localeCompare(String(b.session_date || '')) || Number(a.period_no || 0) - Number(b.period_no || 0);
  });
  const logs = getRows_(SHEETS.ATTENDANCE_LOG).filter(function (a) {
    return String(a.term_id) === String(termId) && String(a.offering_id) === String(offering.offering_id);
  });
  const logMap = {};
  logs.forEach(function (a) {
    const sid = cleanId_(a.student_id);
    const key = sid + '|' + a.session_id;
    const st = String(a.attendance_status || '').toUpperCase();
    const priority = { PRESENT: 4, LATE: 3, EXCUSED: 2, ABSENT: 1 };
    if (!logMap[key] || (priority[st] || 0) > (priority[logMap[key].attendance_status] || 0)) {
      logMap[key] = { attendance_status: st, checkin_time: a.checkin_time || a.created_at || '', note: a.note || '' };
    }
  });

  const rows = roster.map(function (s) {
    const r = { student_id: s.student_id, student_no: s.student_no, student_name: s.name, present: 0, absent: 0, late: 0, excused: 0, no_record: 0, rate: 0, cells: {} };
    sessions.forEach(function (session) {
      const item = logMap[s.student_id + '|' + session.session_id];
      const status = item ? String(item.attendance_status || '').toUpperCase() : 'NO_RECORD';
      if (status === 'PRESENT') r.present++;
      else if (status === 'LATE') r.late++;
      else if (status === 'EXCUSED') r.excused++;
      else if (status === 'ABSENT') r.absent++;
      else r.no_record++;
      r.cells[session.session_id] = { status: status, checkin_time: item ? item.checkin_time : '' };
    });
    const denom = r.present + r.late + r.absent + r.excused;
    r.rate = denom ? Math.round(((r.present + r.late + r.excused) / denom) * 1000) / 10 : 0;
    return r;
  });

  const summary = rows.reduce(function (acc, r) {
    acc.present += r.present; acc.absent += r.absent; acc.late += r.late; acc.excused += r.excused; acc.no_record += r.no_record;
    return acc;
  }, { present: 0, absent: 0, late: 0, excused: 0, no_record: 0 });
  summary.student_count = roster.length;
  summary.session_count = sessions.length;
  summary.average_rate = rows.length ? Math.round((rows.reduce(function (sum, r) { return sum + Number(r.rate || 0); }, 0) / rows.length) * 10) / 10 : 0;

  return ok_({ offering: offering, sessions: sessions, rows: rows, summary: summary }, 'โหลดตารางเวลาเรียนสำเร็จ');
}

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
function getDashboardData() {
  const termId = getActiveTerm_();
  const sessions = getRows_(SHEETS.SESSIONS).filter(r => String(r.term_id) === termId);
  const allowedOfferings = new Set(listActiveOfferings().map(o => String(o.offering_id)));
  const activeSessions = sessions.filter(r => String(r.status) === 'ACTIVE' && allowedOfferings.has(String(r.offering_id)));
  const submissions = getRows_(SHEETS.NORMALIZED_SUBMISSIONS).filter(r => String(r.term_id) === termId);
  const pending = submissions.filter(r => String(r.review_status) === 'PENDING').length;
  const voided = submissions.filter(r => String(r.score_status) === 'VOIDED').length;
  const attendanceToday = getRows_(SHEETS.ATTENDANCE_LOG).filter(r => String(r.term_id) === termId && toDateOnly_(r.created_at || now_()) === toDateOnly_(now_()) && String(r.attendance_status) === 'PRESENT').length;
  return ok_({ termId, activeSessions, totalSessions:sessions.length, submissions:submissions.length, pendingReview:pending, voided, attendanceToday, offerings:listActiveOfferings() }, 'Dashboard loaded');
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
  return ok_({ offering, topics, rows:Object.values(byStudent).sort((a,b) => String(a.student_no).localeCompare(String(b.student_no), undefined, {numeric:true}) || String(a.student_id).localeCompare(String(b.student_id))) }, 'Gradebook loaded');
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

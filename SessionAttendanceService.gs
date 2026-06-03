function startSession(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  const termId = payload.term_id || getActiveTerm_();
  const offering = getOffering_(payload.offering_id) || buildOfferingMap_()[[termId, payload.class_code].join('|')];
  if (!offering) throw new Error('Offering not found for class ' + payload.class_code);
  let topicId = payload.topic_id || '';
  if (payload.form_topic_text && !topicId) {
    const topicResult = createOrUpdateTopicMap({
      term_id: termId, offering_id: offering.offering_id, class_code: offering.class_code,
      form_topic_text: payload.form_topic_text, display_topic_name: payload.display_topic_name || payload.form_topic_text,
      assigned_date: payload.session_date || toDateOnly_(now_()), score: payload.submission_score || getSetting_('DEFAULT_SUBMISSION_SCORE'),
      sync_mode: payload.sync_mode || 'LIVE', import_now: false
    });
    topicId = topicResult.data.topic_id;
  }
  const sessionDate = payload.session_date || toDateOnly_(now_());
  const sessionId = payload.session_id || ['SES', termId, offering.class_code, sessionDate.replace(/-/g,''), 'P' + (payload.period_no || '')].join('-');
  upsertByKey_(SHEETS.SESSIONS, 'session_id', {
    session_id: sessionId, term_id: termId, offering_id: offering.offering_id, session_date: sessionDate,
    class_code: offering.class_code, period_no: payload.period_no || '', lesson_title: payload.lesson_title || '',
    form_topic_text: normalizeText_(payload.form_topic_text || ''), topic_id: topicId,
    attendance_enabled: payload.attendance_enabled === undefined ? true : toBool_(payload.attendance_enabled),
    book_check_enabled: payload.book_check_enabled === undefined ? false : toBool_(payload.book_check_enabled),
    status: 'ACTIVE', created_by: getUserEmail_(), created_at: now_(), closed_at: '', note: payload.note || ''
  });
  audit_('START_SESSION', SHEETS.SESSIONS, sessionId, {}, payload, 'Session started');
  return ok_(getSessionDetail(sessionId).data, 'Session started');
}
function closeSession(sessionId) {
  assertRole_(['ADMIN','TEACHER']);
  const ok = updateRowById_(SHEETS.SESSIONS, 'session_id', sessionId, { status:'CLOSED', closed_at: now_() });
  if (!ok) throw new Error('Session not found: ' + sessionId);
  audit_('CLOSE_SESSION', SHEETS.SESSIONS, sessionId, {}, { status:'CLOSED' }, 'Session closed');
  return ok_({ session_id: sessionId }, 'Session closed');
}
function getActiveSessions() {
  const termId = getActiveTerm_();
  return ok_(getRows_(SHEETS.SESSIONS).filter(r => String(r.term_id) === termId && String(r.status) === 'ACTIVE'), 'Active sessions loaded');
}
function getSessionDetail(sessionId) {
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');
  const offering = getOffering_(session.offering_id);
  const enrollments = getRows_(SHEETS.ENROLLMENTS).filter(r => String(r.offering_id) === String(session.offering_id) && String(r.enrollment_status) === 'ACTIVE');
  const studentsById = buildStudentMap_().byId;
  const attendance = getRows_(SHEETS.ATTENDANCE_INDEX).filter(r => String(r.session_id) === String(sessionId));
  return ok_({ session, offering, roster: enrollments.map(e => Object.assign({}, e, { student: studentsById[cleanId_(e.student_id)] || {} })), attendance }, 'Session detail loaded');
}
function getScanBootstrap(sessionId) {
  const detail = getSessionDetail(sessionId).data;
  const rfidMap = {}, idMap = {}, present = {};
  detail.roster.forEach(r => {
    const s = r.student || {};
    idMap[cleanId_(r.student_id)] = { student_id: cleanId_(r.student_id), name: s.student_name_th || s.student_name_en || r.student_id, class_code: r.class_code, student_no: r.student_no || '' };
    [s.rfid_code, s.student_pay_code, s.backup_card_code].forEach(code => { if (code) rfidMap[cleanId_(code)] = idMap[cleanId_(r.student_id)]; });
  });
  detail.attendance.forEach(a => present[cleanId_(a.student_id)] = true);
  return ok_({ session: detail.session, roster: Object.values(idMap), rfidMap, idMap, present }, 'Scan bootstrap loaded');
}
function processScanBatch(sessionId, scans) {
  assertRole_(['ADMIN','TEACHER']);
  scans = scans || [];
  if (!scans.length) return ok_({ processed:0, results:[] }, 'No scans');
  const lock = lock_(30000);
  try {
    const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
    if (!session) throw new Error('Session not found: ' + sessionId);
    if (String(session.status) !== 'ACTIVE') throw new Error('Session is not ACTIVE');
    const students = buildStudentMap_();
    const enrollments = getRows_(SHEETS.ENROLLMENTS).filter(r => String(r.offering_id) === String(session.offering_id) && String(r.enrollment_status) === 'ACTIVE');
    const enrolledIds = new Set(enrollments.map(e => cleanId_(e.student_id)));
    const currentIndex = getRows_(SHEETS.ATTENDANCE_INDEX).filter(r => String(r.session_id) === String(sessionId));
    const idxByStudent = {};
    currentIndex.forEach(i => idxByStudent[cleanId_(i.student_id)] = i);
    const termId = session.term_id;
    const startDate = getSetting_('ATTENDANCE_SCORE_START_DATE') || '1900-01-01';
    const defaultScore = numericOrZero_(getSetting_('DEFAULT_ATTENDANCE_SCORE') || 0.5);
    const attendanceRows = [], indexRows = [], queueRows = [], scoreRows = [], results = [];
    scans.forEach(scan => {
      const raw = cleanId_(scan.raw || scan.raw_scan_value || scan);
      const queueId = uuid_('SCAN');
      const receivedAt = scan.received_at ? new Date(scan.received_at) : now_();
      let student = students.byRfid[raw] || students.byId[raw] || null;
      let result = { raw, ok:false, message:'ไม่พบข้อมูลบัตร/เลขประจำตัว', student_id:'', name:'' };
      if (student) {
        const studentId = cleanId_(student.student_id);
        if (!enrolledIds.has(studentId)) {
          result = { raw, ok:false, message:'พบนักเรียน แต่ไม่ได้อยู่ในห้อง/รายวิชานี้', student_id: studentId, name: student.student_name_th || student.student_name_en || '' };
        } else if (idxByStudent[studentId]) {
          const old = idxByStudent[studentId];
          result = { raw, ok:true, duplicate:true, message:'สแกนซ้ำ: เช็กชื่อไว้แล้ว', student_id: studentId, name: student.student_name_th || student.student_name_en || '' };
          updateRowById_(SHEETS.ATTENDANCE_INDEX, 'attendance_id', old.attendance_id, { latest_scan_time: now_(), scan_count: Number(old.scan_count || 1) + 1, status:'DUPLICATE_IGNORED' });
        } else {
          const attId = uuid_('ATT');
          const isScored = toDateOnly_(session.session_date) >= startDate;
          const score = isScored ? defaultScore : 0;
          attendanceRows.push({ attendance_id: attId, term_id: termId, session_id: sessionId, offering_id: session.offering_id, class_code: session.class_code, student_id: studentId, rfid_code: raw, checkin_time: now_(), checkin_method: students.byRfid[raw] ? 'RFID' : 'MANUAL_STUDENT_ID', attendance_status:'PRESENT', score, is_scored:isScored, created_by:getUserEmail_(), created_at:now_(), note:'' });
          indexRows.push({ term_id: termId, session_id: sessionId, student_id: studentId, attendance_id: attId, first_checkin_time: now_(), latest_scan_time: now_(), scan_count: 1, status:'PRESENT' });
          if (isScored && score !== 0) scoreRows.push({ score_event_id: 'SCORE-' + attId, term_id: termId, event_date: toDateOnly_(session.session_date), session_id: sessionId, offering_id: session.offering_id, class_code: session.class_code, student_id: studentId, event_type:'ATTENDANCE', score_title:'เข้าเรียน', score_delta:score, source_type:'RFID', source_ref:attId, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() });
          idxByStudent[studentId] = { attendance_id: attId, student_id: studentId, scan_count:1 };
          result = { raw, ok:true, duplicate:false, message:'เช็กชื่อสำเร็จ', student_id: studentId, name: student.student_name_th || student.student_name_en || '' };
        }
      }
      queueRows.push({ queue_id: queueId, term_id: termId, session_id: sessionId, raw_scan_value: raw, received_at: receivedAt, client_id: scan.client_id || '', process_status: result.ok ? 'PROCESSED' : 'ERROR', processed_at: now_(), result_message: result.message, student_id: result.student_id || '', note:'' });
      results.push(result);
    });
    appendObjects_(SHEETS.SCAN_QUEUE, queueRows);
    appendObjects_(SHEETS.ATTENDANCE_LOG, attendanceRows);
    appendObjects_(SHEETS.ATTENDANCE_INDEX, indexRows);
    appendObjects_(SHEETS.SCORE_LEDGER, scoreRows);
    return ok_({ processed: results.length, inserted: attendanceRows.length, duplicates: results.filter(r => r.duplicate).length, errors: results.filter(r => !r.ok).length, results }, 'Scan batch processed');
  } finally { lock.releaseLock(); }
}
function markAbsentForSession(sessionId) {
  assertRole_(['ADMIN','TEACHER']);
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');
  const enrollments = getRows_(SHEETS.ENROLLMENTS).filter(r => String(r.offering_id) === String(session.offering_id) && String(r.enrollment_status) === 'ACTIVE');
  const present = new Set(getRows_(SHEETS.ATTENDANCE_INDEX).filter(r => String(r.session_id) === String(sessionId)).map(r => cleanId_(r.student_id)));
  const rows = enrollments.filter(e => !present.has(cleanId_(e.student_id))).map(e => ({ attendance_id: uuid_('ABS'), term_id: session.term_id, session_id: sessionId, offering_id: session.offering_id, class_code: session.class_code, student_id: cleanId_(e.student_id), rfid_code:'', checkin_time:'', checkin_method:'SYSTEM', attendance_status:'ABSENT', score:0, is_scored:false, created_by:getUserEmail_(), created_at:now_(), note:'Marked absent after session' }));
  appendObjects_(SHEETS.ATTENDANCE_LOG, rows);
  return ok_({ absent: rows.length }, 'Absent records created');
}

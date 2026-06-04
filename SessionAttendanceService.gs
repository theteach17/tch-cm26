function startSession(payload) {
  assertRole_(['ADMIN','TEACHER']);
  validate_(payload || {}, {
    offering_id: { maxLen: 120 },
    class_code: { maxLen: 20 },
    period_no: { maxLen: 20 },
    lesson_title: { maxLen: 200 },
    form_topic_text: { maxLen: 300 },
    submission_score: { type: 'number' }
  });
  payload = payload || {};
  const termId = payload.term_id || getActiveTerm_();
  const offering = getOffering_(payload.offering_id) || buildOfferingMap_()[[termId, payload.class_code].join('|')];
  if (!offering) throw new Error('Offering not found for class ' + payload.class_code);
  assertOfferingAccess_(offering.offering_id);
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
  validate_({ sessionId }, { sessionId: { required: true, maxLen: 120 } });
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found: ' + sessionId);
  assertOfferingAccess_(session.offering_id);
  const ok = updateRowById_(SHEETS.SESSIONS, 'session_id', sessionId, { status:'CLOSED', closed_at: now_() });
  if (!ok) throw new Error('Session not found: ' + sessionId);
  audit_('CLOSE_SESSION', SHEETS.SESSIONS, sessionId, {}, { status:'CLOSED' }, 'Session closed');
  return ok_({ session_id: sessionId }, 'Session closed');
}
function getActiveSessions() {
  const termId = getActiveTerm_();
  const offeringIds = new Set(listActiveOfferings().map(o => String(o.offering_id)));
  return ok_(getRows_(SHEETS.SESSIONS).filter(r => String(r.term_id) === termId && String(r.status) === 'ACTIVE' && offeringIds.has(String(r.offering_id))), 'Active sessions loaded');
}
function getSessionDetail(sessionId) {
  validate_({ sessionId }, { sessionId: { required: true, maxLen: 120 } });
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');
  assertOfferingAccess_(session.offering_id);
  const offering = getOffering_(session.offering_id);
  const enrollments = getCachedEnrollmentsByOffering_(session.offering_id);
  const studentsById = getCachedStudentMap_().byId;
  const attendance = getCachedAttendanceIndexBySession_(sessionId);
  return ok_({ session, offering, roster: enrollments.map(e => Object.assign({}, e, { student: studentsById[cleanId_(e.student_id)] || {} })), attendance }, 'Session detail loaded');
}
function getScanBootstrap(sessionId) {
  const detail = getSessionDetail(sessionId).data;
  const rfidMap = {}, idMap = {}, present = {};
  detail.roster.forEach(r => {
    const s = r.student || {};
    const sid = cleanId_(r.student_id);
    if (!sid) return;
    idMap[sid] = { student_id: sid, name: s.student_name_th || s.student_name_en || r.student_id, class_code: r.class_code, student_no: r.student_no || '' };
    [s.rfid_code, s.student_pay_code, s.backup_card_code].forEach(code => {
      if (!code) return;
      const exact = cleanId_(code);
      const normalized = normalizeCardCode_(code);
      if (exact) rfidMap[exact] = idMap[sid];
      if (normalized) rfidMap[normalized] = idMap[sid];
    });
  });
  detail.attendance.forEach(a => present[cleanId_(a.student_id)] = true);
  return ok_({
    session: detail.session,
    roster: Object.values(idMap),
    rosterCount: Object.keys(idMap).length,
    rfidCount: Object.keys(rfidMap).length,
    idMap,
    rfidMap,
    present,
    presentCount: Object.keys(present).length
  }, 'Scan bootstrap loaded');
}

function diagnoseScanSession(sessionId) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ sessionId }, { sessionId: { required: true, maxLen: 120 } });
  const out = { sessionId: sessionId, errors: [], warnings: [] };
  try {
    const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
    if (!session) throw new Error('Session not found');
    out.session = session;
    out.sessionStatus = session.status;
    out.offeringId = session.offering_id;
    out.classCode = session.class_code;
    assertOfferingAccess_(session.offering_id);
    const offering = getOffering_(session.offering_id);
    out.offering = offering || null;
    const enrollments = getCachedEnrollmentsByOffering_(session.offering_id);
    const students = getCachedStudentMap_();
    const attendance = getCachedAttendanceIndexBySession_(sessionId);
    out.enrollmentCount = enrollments.length;
    out.studentTotal = Object.keys(students.byId || {}).length;
    out.rfidTotal = Object.keys(students.byRfid || {}).length;
    out.attendanceIndexCount = attendance.length;
    out.sampleEnrollments = enrollments.slice(0, 5).map(e => ({ student_id: e.student_id, class_code: e.class_code, status: e.enrollment_status }));
    out.sampleStudents = out.sampleEnrollments.map(e => students.byId[cleanId_(e.student_id)] || { missingStudent: e.student_id });
    if (!enrollments.length) out.errors.push('ไม่พบ Enrollments ของ offering นี้ จึงไม่มีรายชื่อสำหรับสแกน');
    if (!Object.keys(students.byId || {}).length) out.errors.push('Students ว่าง ระบบไม่สามารถจับคู่เลขประจำตัว/บัตรได้');
    if (String(session.status) !== 'ACTIVE') out.errors.push('Session ไม่ได้อยู่สถานะ ACTIVE');
    if (!Object.keys(students.byRfid || {}).length) out.warnings.push('ยังไม่มีรหัส RFID/student_pay_code ใน Students แต่ยังสามารถคีย์เลขประจำตัวนักเรียนได้');
  } catch (err) {
    out.errors.push(err.message || String(err));
  }
  return ok_(out, 'Scan session diagnostics loaded');
}
function loadScanContext_(sessionId) {
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found: ' + sessionId);
  if (String(session.status) !== 'ACTIVE') throw new Error('Session is not ACTIVE');
  assertOfferingAccess_(session.offering_id);
  const students = getCachedStudentMap_();
  const enrollments = getCachedEnrollmentsByOffering_(session.offering_id);
  const enrolledIds = new Set(enrollments.map(e => cleanId_(e.student_id)));
  const currentIndex = getCachedAttendanceIndexBySession_(sessionId);
  const idxByStudent = {};
  currentIndex.forEach(i => idxByStudent[cleanId_(i.student_id)] = i);
  return {
    session,
    students,
    enrolledIds,
    currentIndex,
    idxByStudent,
    termId: session.term_id,
    startDate: getSetting_('ATTENDANCE_SCORE_START_DATE') || '1900-01-01',
    defaultScore: numericOrZero_(getSetting_('DEFAULT_ATTENDANCE_SCORE') || 0.5),
    now: now_()
  };
}
function processSingleScan_(scan, ctx) {
  const rawOriginal = cleanId_(scan.raw || scan.raw_scan_value || scan);
  const raw = normalizeCardCode_(rawOriginal);
  const queueId = uuid_('SCAN');
  const receivedAt = scan.received_at ? new Date(scan.received_at) : now_();
  let result = { raw: raw || rawOriginal, raw_original: rawOriginal, ok:false, message:'ไม่พบข้อมูลบัตร/เลขประจำตัว', student_id:'', name:'' };
  let attendanceRow = null, indexRow = null, scoreRow = null, indexUpdate = null;

  if (!raw) {
    result = { raw, ok:false, message:'ค่าว่าง ไม่สามารถเช็กชื่อได้', student_id:'', name:'' };
  } else {
    // Lookup order: normalized RFID/card code, exact scanned code, normalized/manual student_id, exact student_id.
    const student = ctx.students.byRfid[raw] || ctx.students.byRfid[rawOriginal] || ctx.students.byId[raw] || ctx.students.byId[rawOriginal] || null;
    if (student) {
      const studentId = cleanId_(student.student_id);
      const name = student.student_name_th || student.student_name_en || '';
      if (!ctx.enrolledIds.has(studentId)) {
        result = { raw, ok:false, message:'พบนักเรียน แต่ไม่ได้อยู่ในห้อง/รายวิชานี้', student_id: studentId, name };
      } else if (ctx.idxByStudent[studentId]) {
        const old = ctx.idxByStudent[studentId];
        const nextCount = Number(old.scan_count || 1) + 1;
        result = { raw, ok:true, duplicate:true, message:'สแกนซ้ำ: เช็กชื่อไว้แล้ว', student_id: studentId, name };
        indexUpdate = { attendance_id: old.attendance_id, latest_scan_time: now_(), scan_count: nextCount, status:'DUPLICATE_IGNORED' };
        old.latest_scan_time = indexUpdate.latest_scan_time;
        old.scan_count = nextCount;
        old.status = 'DUPLICATE_IGNORED';
      } else {
        const attId = uuid_('ATT');
        const isScored = toDateOnly_(ctx.session.session_date) >= ctx.startDate;
        const score = isScored ? ctx.defaultScore : 0;
        const matchedByCard = !!(ctx.students.byRfid[raw] || ctx.students.byRfid[rawOriginal]);
        attendanceRow = { attendance_id: attId, term_id: ctx.termId, session_id: ctx.session.session_id, offering_id: ctx.session.offering_id, class_code: ctx.session.class_code, student_id: studentId, rfid_code: raw, checkin_time: now_(), checkin_method: matchedByCard ? 'RFID' : 'MANUAL_STUDENT_ID', attendance_status:'PRESENT', score, is_scored:isScored, created_by:getUserEmail_(), created_at:now_(), note: rawOriginal && rawOriginal !== raw ? ('Original scan: ' + rawOriginal) : '' };
        indexRow = { term_id: ctx.termId, session_id: ctx.session.session_id, student_id: studentId, attendance_id: attId, first_checkin_time: now_(), latest_scan_time: now_(), scan_count: 1, status:'PRESENT' };
        if (isScored && score !== 0) scoreRow = { score_event_id: 'SCORE-' + attId, term_id: ctx.termId, event_date: toDateOnly_(ctx.session.session_date), session_id: ctx.session.session_id, offering_id: ctx.session.offering_id, class_code: ctx.session.class_code, student_id: studentId, event_type:'ATTENDANCE', score_title:'เข้าเรียน', score_delta:score, source_type:'RFID', source_ref:attId, status:'ACTIVE', void_reason:'', created_by:getUserEmail_(), created_at:now_(), updated_at:now_() };
        ctx.idxByStudent[studentId] = Object.assign({}, indexRow);
        ctx.currentIndex.push(Object.assign({}, indexRow));
        result = { raw, ok:true, duplicate:false, message:'เช็กชื่อสำเร็จ', student_id: studentId, name };
      }
    }
  }
  const queueRow = { queue_id: queueId, term_id: ctx.termId, session_id: ctx.session.session_id, raw_scan_value: raw, received_at: receivedAt, client_id: scan.client_id || '', process_status: result.ok ? 'PROCESSED' : 'ERROR', processed_at: now_(), result_message: result.message, student_id: result.student_id || '', note: rawOriginal && rawOriginal !== raw ? ('Original scan: ' + rawOriginal) : '' };
  return { result, queueRow, attendanceRow, indexRow, scoreRow, indexUpdate };
}
function persistScanResults_(processed, ctx) {
  const queueRows = [], attendanceRows = [], indexRows = [], scoreRows = [], indexUpdates = [];
  processed.forEach(p => {
    if (p.queueRow) queueRows.push(p.queueRow);
    if (p.attendanceRow) attendanceRows.push(p.attendanceRow);
    if (p.indexRow) indexRows.push(p.indexRow);
    if (p.scoreRow) scoreRows.push(p.scoreRow);
    if (p.indexUpdate) indexUpdates.push(p.indexUpdate);
  });
  appendObjects_(SHEETS.SCAN_QUEUE, queueRows);
  appendObjects_(SHEETS.ATTENDANCE_LOG, attendanceRows);
  appendObjects_(SHEETS.ATTENDANCE_INDEX, indexRows);
  appendObjects_(SHEETS.SCORE_LEDGER, scoreRows);
  indexUpdates.forEach(patch => updateRowById_(SHEETS.ATTENDANCE_INDEX, 'attendance_id', patch.attendance_id, patch));
  updateAttendanceIndexCache_(ctx.session.session_id, ctx.currentIndex);
  return { inserted: attendanceRows.length, queued: queueRows.length, scores: scoreRows.length, duplicateUpdates: indexUpdates.length };
}
function summarizeScanResults_(processed, persisted) {
  const results = processed.map(p => p.result);
  return Object.assign({ processed: results.length, duplicates: results.filter(r => r.duplicate).length, errors: results.filter(r => !r.ok).length, results }, persisted || {});
}
function processScanBatch(sessionId, scans) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ sessionId }, { sessionId: { required: true, maxLen: 120 } });
  scans = Array.isArray(scans) ? scans.slice(0, 100) : [];
  if (!scans.length) return ok_({ processed:0, results:[] }, 'No scans');
  const lock = lock_(30000);
  try {
    const ctx = loadScanContext_(sessionId);
    const processed = scans.map(scan => processSingleScan_(scan, ctx));
    const persisted = persistScanResults_(processed, ctx);
    return ok_(summarizeScanResults_(processed, persisted), 'Scan batch processed');
  } finally { lock.releaseLock(); }
}
function markAbsentForSession(sessionId) {
  assertRole_(['ADMIN','TEACHER']);
  validate_({ sessionId }, { sessionId: { required: true, maxLen: 120 } });
  const session = findOne_(SHEETS.SESSIONS, r => String(r.session_id) === String(sessionId));
  if (!session) throw new Error('Session not found');
  assertOfferingAccess_(session.offering_id);
  const enrollments = getCachedEnrollmentsByOffering_(session.offering_id);
  const present = new Set(getCachedAttendanceIndexBySession_(sessionId).map(r => cleanId_(r.student_id)));
  const rows = enrollments.filter(e => !present.has(cleanId_(e.student_id))).map(e => ({ attendance_id: uuid_('ABS'), term_id: session.term_id, session_id: sessionId, offering_id: session.offering_id, class_code: session.class_code, student_id: cleanId_(e.student_id), rfid_code:'', checkin_time:'', checkin_method:'SYSTEM', attendance_status:'ABSENT', score:0, is_scored:false, created_by:getUserEmail_(), created_at:now_(), note:'Marked absent after session' }));
  appendObjects_(SHEETS.ATTENDANCE_LOG, rows);
  return ok_({ absent: rows.length }, 'Absent records created');
}

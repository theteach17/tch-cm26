/**
 * Random / Grouping tools for classroom display.
 * v2.4.0-classroom-ux-tools
 *
 * Design rules:
 * - Never writes data. It only reads roster / attendance and returns display-ready results.
 * - If the teacher asks for PRESENT_ONLY but the session has not been closed / absence has not
 *   been finalized, fallback to ALL roster as requested by the user.
 * - Student names are displayed using Students.student_name_th first.
 */
function getSessionForPool_(sessionId) {
  if (!sessionId) return null;
  const session = findOne_(SHEETS.SESSIONS, function (r) { return String(r.session_id) === String(sessionId); });
  if (!session) throw new Error('ไม่พบคาบเรียนที่เลือก');
  assertOfferingAccess_(session.offering_id);
  return session;
}

function buildRosterStudents_(offeringId) {
  validate_({ offeringId: offeringId }, { offeringId: { required: true, maxLen: 120 } });
  const offering = getOffering_(offeringId);
  if (!offering) throw new Error('ไม่พบห้อง/รายวิชาในระบบ');
  assertOfferingAccess_(offering.offering_id);
  const studentsById = getCachedStudentMap_().byId || {};
  const enrollments = getCachedEnrollmentsByOffering_(offering.offering_id);
  return enrollments.map(function (e) {
    const sid = cleanId_(e.student_id);
    const s = studentsById[sid] || {};
    return {
      student_id: sid,
      student_no: e.student_no || '',
      class_code: e.class_code || offering.class_code || '',
      name_th: s.student_name_th || '',
      name_en: s.student_name_en || '',
      name: s.student_name_th || s.student_name_en || sid,
      email: s.email || ''
    };
  }).sort(function (a, b) {
    return String(a.student_no || '').localeCompare(String(b.student_no || ''), undefined, { numeric: true }) ||
      String(a.student_id).localeCompare(String(b.student_id), undefined, { numeric: true });
  });
}

function getAttendanceStatusForSession_(sessionId) {
  const rows = getRows_(SHEETS.ATTENDANCE_LOG).filter(function (r) { return String(r.session_id) === String(sessionId); });
  const byStudent = {};
  rows.forEach(function (r) {
    const sid = cleanId_(r.student_id);
    if (!sid) return;
    const status = String(r.attendance_status || '').toUpperCase();
    if (!byStudent[sid]) byStudent[sid] = [];
    byStudent[sid].push(status);
  });
  const present = new Set();
  const absent = new Set();
  const late = new Set();
  const excused = new Set();
  Object.keys(byStudent).forEach(function (sid) {
    const statuses = byStudent[sid];
    if (statuses.indexOf('PRESENT') >= 0) present.add(sid);
    if (statuses.indexOf('ABSENT') >= 0) absent.add(sid);
    if (statuses.indexOf('LATE') >= 0) late.add(sid);
    if (statuses.indexOf('EXCUSED') >= 0) excused.add(sid);
  });
  return {
    rows: rows,
    present: present,
    absent: absent,
    late: late,
    excused: excused,
    hasFinalizedAbsence: absent.size > 0 || excused.size > 0
  };
}

function isSessionAttendanceFinalized_(session, att) {
  if (!session) return false;
  if (String(session.status || '').toUpperCase() === 'CLOSED') return true;
  return !!(att && att.hasFinalizedAbsence);
}

function getRosterPool(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, {
    offering_id: { maxLen: 120 },
    session_id: { maxLen: 120 },
    pool_mode: { maxLen: 30 }
  });
  const session = payload.session_id ? getSessionForPool_(payload.session_id) : null;
  const offeringId = payload.offering_id || (session ? session.offering_id : '');
  const offering = getOffering_(offeringId);
  if (!offering) throw new Error('กรุณาเลือกห้อง/รายวิชาก่อน');
  assertOfferingAccess_(offering.offering_id);

  const roster = buildRosterStudents_(offering.offering_id);
  const att = session ? getAttendanceStatusForSession_(session.session_id) : { present: new Set(), absent: new Set(), late: new Set(), excused: new Set(), hasFinalizedAbsence: false };
  const requestedMode = String(payload.pool_mode || 'ALL').toUpperCase();
  let appliedMode = requestedMode === 'PRESENT' ? 'PRESENT' : 'ALL';
  let fallbackReason = '';
  let pool = roster.slice();

  if (appliedMode === 'PRESENT') {
    if (!session) {
      appliedMode = 'ALL';
      fallbackReason = 'ยังไม่ได้เลือกคาบเรียน ระบบจึงใช้รายชื่อทั้งห้อง';
    } else if (!isSessionAttendanceFinalized_(session, att)) {
      appliedMode = 'ALL';
      fallbackReason = 'คาบนี้ยังไม่ได้ปิดยอดขาดเรียน ระบบจึงใช้รายชื่อทั้งห้องตามเงื่อนไข';
    } else {
      pool = roster.filter(function (s) { return att.present.has(s.student_id) || att.late.has(s.student_id); });
    }
  }

  return ok_({
    offering: offering,
    session: session || null,
    requested_mode: requestedMode,
    applied_mode: appliedMode,
    fallback_reason: fallbackReason,
    attendance_finalized: !!(session && isSessionAttendanceFinalized_(session, att)),
    roster_count: roster.length,
    pool_count: pool.length,
    present_count: att.present.size,
    absent_count: att.absent.size,
    late_count: att.late.size,
    excused_count: att.excused.size,
    roster: roster,
    pool: pool
  }, 'โหลดรายชื่อสำเร็จ');
}

function shuffleArray_(arr) {
  const a = (arr || []).slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function randomStudents(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { count: { type: 'number' }, offering_id: { maxLen: 120 }, session_id: { maxLen: 120 }, pool_mode: { maxLen: 30 } });
  const poolData = getRosterPool(payload).data;
  const count = Math.max(1, Math.min(Number(payload.count || 1), poolData.pool.length || 1));
  const selected = shuffleArray_(poolData.pool).slice(0, count);
  return ok_(Object.assign({}, poolData, {
    count: count,
    selected: selected,
    generated_at: fmtDate_(now_(), 'yyyy-MM-dd HH:mm:ss')
  }), 'สุ่มรายชื่อสำเร็จ');
}

function groupStudents(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, {
    students_per_group: { type: 'number' },
    group_count: { type: 'number' },
    offering_id: { maxLen: 120 },
    session_id: { maxLen: 120 },
    pool_mode: { maxLen: 30 }
  });
  const poolData = getRosterPool(payload).data;
  const shuffled = shuffleArray_(poolData.pool);
  let groups = [];
  let ungrouped = [];
  const requestedGroupCount = Number(payload.group_count || 0);
  const studentsPerGroup = Number(payload.students_per_group || 0);

  if (requestedGroupCount > 0) {
    const gc = Math.max(1, Math.min(requestedGroupCount, Math.max(1, shuffled.length)));
    groups = Array.from({ length: gc }, function (_, i) { return { group_no: i + 1, members: [] }; });
    shuffled.forEach(function (s, idx) { groups[idx % gc].members.push(s); });
  } else {
    const size = Math.max(1, studentsPerGroup || 4);
    const fullGroupCount = Math.floor(shuffled.length / size);
    for (let i = 0; i < fullGroupCount; i++) {
      groups.push({ group_no: i + 1, members: shuffled.slice(i * size, i * size + size) });
    }
    ungrouped = shuffled.slice(fullGroupCount * size);
    if (!groups.length && ungrouped.length) {
      groups.push({ group_no: 1, members: ungrouped });
      ungrouped = [];
    }
  }

  return ok_(Object.assign({}, poolData, {
    groups: groups,
    ungrouped: ungrouped,
    group_count: groups.length,
    students_per_group: studentsPerGroup || '',
    generated_at: fmtDate_(now_(), 'yyyy-MM-dd HH:mm:ss')
  }), 'จัดกลุ่มสำเร็จ');
}

function getAttendanceSummary(payload) {
  assertRole_(['ADMIN','TEACHER']);
  payload = payload || {};
  validate_(payload, { offering_id: { required: true, maxLen: 120 }, term_id: { maxLen: 40 } });
  const termId = payload.term_id || getActiveTerm_();
  const offering = getOffering_(payload.offering_id);
  if (!offering) throw new Error('ไม่พบห้อง/รายวิชาในระบบ');
  assertOfferingAccess_(offering.offering_id);
  const roster = buildRosterStudents_(offering.offering_id);
  const sessions = getRows_(SHEETS.SESSIONS).filter(function (s) {
    return String(s.term_id) === String(termId) && String(s.offering_id) === String(offering.offering_id) && String(s.status) !== 'CANCELLED';
  });
  const logs = getRows_(SHEETS.ATTENDANCE_LOG).filter(function (a) {
    return String(a.term_id) === String(termId) && String(a.offering_id) === String(offering.offering_id);
  });
  const byStudent = {};
  roster.forEach(function (s) {
    byStudent[s.student_id] = {
      student_id: s.student_id,
      student_no: s.student_no,
      name: s.name,
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total_recorded: 0,
      rate: 0
    };
  });
  logs.forEach(function (a) {
    const sid = cleanId_(a.student_id);
    const row = byStudent[sid];
    if (!row) return;
    const st = String(a.attendance_status || '').toUpperCase();
    if (st === 'PRESENT') row.present++;
    else if (st === 'ABSENT') row.absent++;
    else if (st === 'LATE') row.late++;
    else if (st === 'EXCUSED') row.excused++;
    row.total_recorded++;
  });
  Object.keys(byStudent).forEach(function (sid) {
    const r = byStudent[sid];
    const attended = r.present + r.late + r.excused;
    const total = Math.max(1, r.present + r.late + r.absent + r.excused);
    r.rate = Math.round((attended / total) * 1000) / 10;
  });
  const summary = {
    offering_id: offering.offering_id,
    class_code: offering.class_code,
    session_count: sessions.length,
    student_count: roster.length,
    present_total: logs.filter(function (a) { return String(a.attendance_status).toUpperCase() === 'PRESENT'; }).length,
    absent_total: logs.filter(function (a) { return String(a.attendance_status).toUpperCase() === 'ABSENT'; }).length,
    late_total: logs.filter(function (a) { return String(a.attendance_status).toUpperCase() === 'LATE'; }).length,
    excused_total: logs.filter(function (a) { return String(a.attendance_status).toUpperCase() === 'EXCUSED'; }).length
  };
  return ok_({ summary: summary, rows: Object.values(byStudent).sort(function (a, b) { return String(a.student_no).localeCompare(String(b.student_no), undefined, { numeric: true }); }) }, 'โหลดสรุปการเข้าเรียนสำเร็จ');
}

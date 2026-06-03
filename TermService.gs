function createTerm(payload) {
  assertRole_(['ADMIN']);
  payload = payload || {};
  const termId = payload.term_id || ('AY' + payload.academic_year + '-T' + payload.semester);
  upsertByKey_(SHEETS.ACADEMIC_TERMS, 'term_id', {
    term_id: termId,
    academic_year: payload.academic_year,
    semester: payload.semester,
    term_name: payload.term_name || ('ภาคเรียนที่ ' + payload.semester + '/' + payload.academic_year),
    start_date: payload.start_date || '',
    end_date: payload.end_date || '',
    status: payload.status || 'PLANNED',
    archive_file_id: '',
    created_at: now_(),
    closed_at: '',
    note: payload.note || ''
  });
  audit_('CREATE_TERM', SHEETS.ACADEMIC_TERMS, termId, {}, payload, 'Term created/updated');
  return ok_({ term_id: termId }, 'Term saved');
}
function setActiveTerm(termId) {
  assertRole_(['ADMIN']);
  const term = findOne_(SHEETS.ACADEMIC_TERMS, r => String(r.term_id) === String(termId));
  if (!term) throw new Error('Term not found: ' + termId);
  setSetting_('ACTIVE_TERM_ID', termId, 'text', 'Current active term');
  updateRowById_(SHEETS.ACADEMIC_TERMS, 'term_id', termId, { status: 'ACTIVE' });
  audit_('SET_ACTIVE_TERM', SHEETS.SYSTEM_CONFIG, 'ACTIVE_TERM_ID', {}, { termId }, 'Active term changed');
  return ok_({ termId }, 'Active term changed');
}
function createCourseOffering(payload) {
  assertRole_(['ADMIN']);
  payload = payload || {};
  const termId = payload.term_id || getActiveTerm_();
  const classCode = String(payload.class_code || '').trim();
  const courseCode = String(payload.course_code || '').trim();
  const course = findOne_(SHEETS.COURSES, r => String(r.course_code) === courseCode || String(r.course_id) === String(payload.course_id));
  if (!course) throw new Error('Course not found: ' + courseCode);
  const offeringId = payload.offering_id || [termId, course.course_code.replace(/[^A-Za-z0-9ก-๙]/g,''), classCode].join('-');
  upsertByKey_(SHEETS.COURSE_OFFERINGS, 'offering_id', {
    offering_id: offeringId, term_id: termId, course_id: course.course_id, course_code: course.course_code,
    class_code: classCode, class_text: payload.class_text || classCodeToText_(classCode), teacher_email: payload.teacher_email || getUserEmail_(),
    status: payload.status || 'ACTIVE', created_at: now_(), note: payload.note || ''
  });
  audit_('CREATE_COURSE_OFFERING', SHEETS.COURSE_OFFERINGS, offeringId, {}, payload, 'Offering saved');
  return ok_({ offering_id: offeringId }, 'Course offering saved');
}

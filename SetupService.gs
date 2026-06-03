function onOpen() {
  SpreadsheetApp.getUi().createMenu('Classroom App')
    .addItem('Initialize / Repair System', 'initializeSystem')
    .addItem('Detect Form Headers', 'detectFormHeaders')
    .addItem('Sync New Form Rows', 'syncNewFormRows')
    .addItem('Regenerate Room Sheets', 'regenerateActiveRoomSheets')
    .addToUi();
}

function initializeSystem(options) {
  options = options || {};
  const lock = lock_(30000);
  try {
    if (options.dbSpreadsheetId) setDbSpreadsheetId(options.dbSpreadsheetId);
    const ss = getDb_();
    Object.keys(SCHEMA).forEach(name => ensureSheet_(name, SCHEMA[name]));
    seedDefaults_(options);
    protectCoreHeaders_();
    audit_('INITIALIZE_SYSTEM', 'SYSTEM', ss.getId(), {}, { version: APP.VERSION }, 'System initialized/repaired');
    return ok_({ spreadsheetId: ss.getId(), url: ss.getUrl(), version: APP.VERSION }, 'System initialized successfully');
  } finally {
    lock.releaseLock();
  }
}

function seedDefaults_(options) {
  const email = getUserEmail_();
  const activeTerm = options.activeTermId || APP.ACTIVE_TERM_ID;
  const defaults = [
    ['APP_VERSION', APP.VERSION, 'text', 'Application version'],
    ['ACTIVE_TERM_ID', activeTerm, 'text', 'Current active term'],
    ['TIMEZONE', 'Asia/Bangkok', 'text', 'System timezone'],
    ['SOURCE_FORM_SPREADSHEET_ID', options.sourceSpreadsheetId || APP.DEFAULT_SOURCE_SPREADSHEET_ID, 'text', 'Google Form response spreadsheet ID'],
    ['SOURCE_FORM_SHEET_NAME', options.sourceSheetName || APP.DEFAULT_SOURCE_SHEET_NAME, 'text', 'Google Form response sheet name'],
    ['ATTENDANCE_SCORE_START_DATE', '2026-06-01', 'date', 'Start date for attendance scoring'],
    ['DEFAULT_ATTENDANCE_SCORE', '0.5', 'number', 'Default attendance score per session'],
    ['DEFAULT_SUBMISSION_SCORE', '1', 'number', 'Default score for valid submission'],
    ['DEFAULT_BOOK_BROUGHT_SCORE', '1', 'number', 'Book brought score'],
    ['DEFAULT_BOOK_NOT_BROUGHT_SCORE', '-1', 'number', 'Book not brought score'],
    ['RANDOM_BOOK_CHECK_COUNT', '5', 'number', 'Default random book check count'],
    ['SCAN_DUPLICATE_WINDOW_SECONDS', '8', 'number', 'Client duplicate scan window'],
    ['AUTO_CREATE_TOPICS_FROM_FORM', 'TRUE', 'boolean', 'Automatically create TopicMap for new Google Form topics during sync'],
    ['AUTO_RESOLVE_TOPIC_ERRORS', 'TRUE', 'boolean', 'Automatically mark TOPIC_NOT_MAPPED errors as resolved after auto-mapping'],
    ['AUTO_CREATE_CLASSES_OFFERINGS', 'TRUE', 'boolean', 'Automatically create class and course offering when a class appears in Form data'],
    ['TOPIC_NOT_MAPPED_LOG_MODE', 'SUMMARY', 'text', 'SUMMARY avoids one error row per student for missing topics']
  ];
  defaults.forEach(d => setSetting_(d[0], d[1], d[2], d[3]));

  upsertByKey_(SHEETS.USERS, 'email', {
    email, display_name: email, role: 'ADMIN', allowed_offerings: '*', is_active: true, created_at: now_(), note: 'Created by initializeSystem'
  });
  upsertByKey_(SHEETS.ACADEMIC_TERMS, 'term_id', {
    term_id: activeTerm, academic_year: '2569', semester: '1', term_name: 'ภาคเรียนที่ 1/2569',
    start_date: '2026-05-15', end_date: '2026-10-10', status: 'ACTIVE', archive_file_id: '', created_at: now_(), closed_at: '', note: 'Default active term'
  });

  const courses = [
    { course_id:'COURSE-ENG22101', course_code:'อ22101', course_name:'ภาษาอังกฤษพื้นฐาน 3', credit:'1.5', subject_group:'ภาษาต่างประเทศ', default_score_policy_id:'DEFAULT', is_active:true, note:'' },
    { course_id:'COURSE-ENG33208', course_code:'อ33208', course_name:'ภาษาอังกฤษบูรณาการทักษะ 1', credit:'1.0', subject_group:'ภาษาต่างประเทศ', default_score_policy_id:'DEFAULT', is_active:true, note:'' }
  ];
  courses.forEach(c => upsertByKey_(SHEETS.COURSES, 'course_id', c));

  const classes = ['204','208','214','605','606','607','608','609','610'].map(code => {
    const grade = Math.floor(Number(code)/100), room = Number(code)%100;
    return { class_code: code, class_text: classCodeToText_(code), grade_level: grade, room, school_year:'2569', is_active:true, note:'' };
  });
  classes.forEach(c => upsertByKey_(SHEETS.CLASSES, 'class_code', c));

  classes.forEach(c => {
    const isM2 = String(c.class_code).startsWith('2');
    const courseId = isM2 ? 'COURSE-ENG22101' : 'COURSE-ENG33208';
    const courseCode = isM2 ? 'อ22101' : 'อ33208';
    const offeringId = [activeTerm, courseCode.replace(/[^A-Za-z0-9ก-๙]/g,''), c.class_code].join('-');
    upsertByKey_(SHEETS.COURSE_OFFERINGS, 'offering_id', {
      offering_id: offeringId, term_id: activeTerm, course_id: courseId, course_code: courseCode,
      class_code: c.class_code, class_text: c.class_text, teacher_email: email, status: 'ACTIVE', created_at: now_(), note: 'Default offering'
    });
  });

  upsertByKey_(SHEETS.SOURCE_FORMS, 'source_id', {
    source_id: 'FORM-MAIN-' + activeTerm, term_id: activeTerm, source_name: 'แบบฟอร์มส่งงานในชั้นเรียน',
    spreadsheet_id: getSetting_('SOURCE_FORM_SPREADSHEET_ID') || APP.DEFAULT_SOURCE_SPREADSHEET_ID,
    sheet_name: getSetting_('SOURCE_FORM_SHEET_NAME') || APP.DEFAULT_SOURCE_SHEET_NAME,
    header_row: 1, is_active: true, last_sync_row: 1, last_sync_time: '', note: 'Read-only source form response sheet'
  });
}

function upsertByKey_(sheetName, keyField, obj) {
  ensureSheet_(sheetName, SCHEMA[sheetName]);
  const found = findOne_(sheetName, r => String(r[keyField]) === String(obj[keyField]));
  if (found) updateRowById_(sheetName, keyField, obj[keyField], obj);
  else appendObjects_(sheetName, [obj]);
}

function protectCoreHeaders_() {
  const ss = getDb_();
  Object.keys(SCHEMA).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    try {
      const protections = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).filter(p => p.getDescription() === 'Header Protection');
      if (!protections.length) sh.getRange(1,1,1,sh.getLastColumn()).protect().setDescription('Header Protection');
    } catch (err) { console.warn('Protect skipped for ' + name, err); }
  });
}

function installTimeDrivenSyncTrigger(minutes) {
  minutes = Number(minutes || 5);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncNewFormRows').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNewFormRows').timeBased().everyMinutes(minutes).create();
  return ok_({ minutes }, 'Time-driven sync trigger installed');
}

function resetDemoDataKeepConfig() {
  const keep = [SHEETS.SYSTEM_CONFIG, SHEETS.USERS, SHEETS.ACADEMIC_TERMS, SHEETS.COURSES, SHEETS.CLASSES, SHEETS.COURSE_OFFERINGS, SHEETS.SOURCE_FORMS];
  Object.keys(SCHEMA).forEach(name => {
    if (keep.indexOf(name) >= 0) return;
    const sh = ensureSheet_(name, SCHEMA[name]);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow()-1, sh.getLastColumn()).clearContent();
  });
  audit_('RESET_DATA_KEEP_CONFIG', 'SYSTEM', '', {}, {}, 'Cleared transactional data');
  return ok_(null, 'Transactional data cleared');
}

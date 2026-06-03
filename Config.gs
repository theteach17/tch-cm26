/**
 * Classroom Management Ledger System
 * Production-hardened Google Apps Script + Google Sheets Web App
 * Version: 1.8.0-review-performance-date
 *
 * IMPORTANT SECURITY NOTE:
 * Do not hardcode real Spreadsheet IDs in this repository. Configure them from
 * the Apps Script editor by running setDbSpreadsheetId('<DB_ID>') and then
 * initializeSystem({ sourceSpreadsheetId:'<FORM_RESPONSE_ID>' }) or by editing
 * SystemConfig / SourceForms in the secured database spreadsheet.
 */

const APP = Object.freeze({
  NAME: 'Classroom Management Ledger',
  VERSION: '1.8.0-review-performance-date',
  TIMEZONE: 'Asia/Bangkok',
  DEFAULT_DB_SPREADSHEET_ID: '',
  DEFAULT_SOURCE_SPREADSHEET_ID: '',
  DEFAULT_SOURCE_SHEET_NAME: 'Form Responses 1',
  ACTIVE_TERM_ID: 'AY2569-T1',
  REVIEW_PAGE_SIZE: 30,
  MAX_SCAN_RETRY: 5,
  DEFAULT_PERIOD_SCHEDULE: [
    { period_no: 1, start: '08:20', end: '09:10' },
    { period_no: 2, start: '09:10', end: '10:00' },
    { period_no: 3, start: '10:00', end: '10:50' },
    { period_no: 4, start: '10:50', end: '11:40' },
    { period_no: 5, start: '11:50', end: '12:40' },
    { period_no: 6, start: '12:40', end: '13:30' },
    { period_no: 7, start: '13:30', end: '14:20' },
    { period_no: 8, start: '14:20', end: '15:10' },
    { period_no: 9, start: '15:10', end: '16:00' }
  ]
});

const STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
  PLANNED: 'PLANNED',
  CLOSED: 'CLOSED',
  DRAFT: 'DRAFT',
  CANCELLED: 'CANCELLED',
  SYNCED: 'SYNCED',
  ERROR: 'ERROR',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  VOIDED: 'VOIDED',
  RESTORED: 'RESTORED'
});

const SHEETS = Object.freeze({
  SYSTEM_CONFIG: 'SystemConfig',
  USERS: 'Users',
  ACADEMIC_TERMS: 'AcademicTerms',
  COURSES: 'Courses',
  CLASSES: 'Classes',
  COURSE_OFFERINGS: 'CourseOfferings',
  STUDENTS: 'Students',
  ENROLLMENTS: 'Enrollments',
  SOURCE_FORMS: 'SourceForms',
  FORM_HEADER_MAP: 'FormHeaderMap',
  SESSIONS: 'Sessions',
  TOPIC_MAP: 'TopicMap',
  RAW_FORM_ROWS: 'RawFormRows',
  NORMALIZED_SUBMISSIONS: 'NormalizedSubmissions',
  SUBMISSION_FILES: 'SubmissionFiles',
  REVIEW_LOG: 'ReviewLog',
  ATTENDANCE_LOG: 'AttendanceLog',
  ATTENDANCE_INDEX: 'AttendanceIndex',
  SCAN_QUEUE: 'ScanQueue',
  BOOK_CHECK_LOG: 'BookCheckLog',
  MANUAL_SCORE_LOG: 'ManualScoreLog',
  SCORE_LEDGER: 'ScoreLedger',
  ERROR_LOG: 'ErrorLog',
  AUDIT_LOG: 'AuditLog',
  ARCHIVE_INDEX: 'ArchiveIndex',
  REVIEW_INDEX: 'ReviewIndex'
});

const SCHEMA = Object.freeze({
  [SHEETS.SYSTEM_CONFIG]: ['setting_key','setting_value','data_type','description','updated_at'],
  [SHEETS.USERS]: ['email','display_name','role','allowed_offerings','is_active','created_at','note'],
  [SHEETS.ACADEMIC_TERMS]: ['term_id','academic_year','semester','term_name','start_date','end_date','status','archive_file_id','created_at','closed_at','note'],
  [SHEETS.COURSES]: ['course_id','course_code','course_name','credit','subject_group','default_score_policy_id','is_active','note'],
  [SHEETS.CLASSES]: ['class_code','class_text','grade_level','room','school_year','is_active','note'],
  [SHEETS.COURSE_OFFERINGS]: ['offering_id','term_id','course_id','course_code','class_code','class_text','teacher_email','status','created_at','note'],
  [SHEETS.STUDENTS]: ['student_id','student_name_th','student_name_en','email','rfid_code','student_pay_code','backup_card_code','status','created_at','updated_at','note'],
  [SHEETS.ENROLLMENTS]: ['enrollment_id','term_id','offering_id','class_code','student_id','student_no','enrollment_status','created_at','note'],
  [SHEETS.SOURCE_FORMS]: ['source_id','term_id','source_name','spreadsheet_id','sheet_name','header_row','is_active','last_sync_row','last_sync_time','note'],
  [SHEETS.FORM_HEADER_MAP]: ['header_map_id','source_id','class_code','field_type','header_name','column_index','is_active','note'],
  [SHEETS.SESSIONS]: ['session_id','term_id','offering_id','session_date','class_code','period_no','lesson_title','form_topic_text','topic_id','attendance_enabled','book_check_enabled','status','created_by','created_at','closed_at','note'],
  [SHEETS.TOPIC_MAP]: ['topic_id','term_id','offering_id','class_code','form_topic_text','display_topic_name','assigned_date','due_date','score','sync_mode','duplicate_policy','status','created_by','created_at','note'],
  [SHEETS.RAW_FORM_ROWS]: ['raw_id','term_id','source_id','source_row','timestamp','email','class_text','raw_json','row_hash','sync_time','sync_status','note'],
  [SHEETS.NORMALIZED_SUBMISSIONS]: ['submission_id','term_id','source_id','source_row','offering_id','class_code','student_id','student_name','email','form_topic_text','topic_id','timestamp','file_count','sync_mode','review_status','score_status','score','submission_key','created_at','updated_at','note'],
  [SHEETS.SUBMISSION_FILES]: ['file_record_id','term_id','submission_id','student_id','class_code','topic_id','file_no','file_url','file_id','preview_url','file_status','note'],
  [SHEETS.REVIEW_LOG]: ['review_id','submission_id','action','old_review_status','new_review_status','old_score_status','new_score_status','reason','reviewed_by','reviewed_at','note'],
  [SHEETS.ATTENDANCE_LOG]: ['attendance_id','term_id','session_id','offering_id','class_code','student_id','rfid_code','checkin_time','checkin_method','attendance_status','score','is_scored','created_by','created_at','note'],
  [SHEETS.ATTENDANCE_INDEX]: ['term_id','session_id','student_id','attendance_id','first_checkin_time','latest_scan_time','scan_count','status'],
  [SHEETS.SCAN_QUEUE]: ['queue_id','term_id','session_id','raw_scan_value','received_at','client_id','process_status','processed_at','result_message','student_id','note'],
  [SHEETS.BOOK_CHECK_LOG]: ['book_check_id','term_id','session_id','offering_id','class_code','student_id','is_random','result','score_delta','checked_by','checked_at','note'],
  [SHEETS.MANUAL_SCORE_LOG]: ['manual_score_id','term_id','session_id','offering_id','class_code','student_id','score_type','score_title','score_delta','created_by','created_at','note'],
  [SHEETS.SCORE_LEDGER]: ['score_event_id','term_id','event_date','session_id','offering_id','class_code','student_id','event_type','score_title','score_delta','source_type','source_ref','status','void_reason','created_by','created_at','updated_at'],
  [SHEETS.ERROR_LOG]: ['error_id','source_row','error_type','error_message','raw_value','status','created_at','resolved_by','resolved_at'],
  [SHEETS.AUDIT_LOG]: ['audit_id','timestamp','user_email','action','target_sheet','target_id','old_value','new_value','note'],
  [SHEETS.ARCHIVE_INDEX]: ['archive_id','term_id','archive_file_id','archive_url','created_by','created_at','status','note'],
  [SHEETS.REVIEW_INDEX]: ['review_index_id','term_id','offering_id','class_code','topic_id','form_topic_text','submission_id','student_id','student_name','timestamp','review_status','score_status','score','file_count','first_preview_url','first_file_url','file_urls_json','preview_urls_json','updated_at']
});

const REVIEW_ACTIONS = Object.freeze({
  APPROVE: 'APPROVE',
  VOID_NO_STAMP: 'VOID_NO_STAMP',
  VOID_WRONG_TOPIC: 'VOID_WRONG_TOPIC',
  VOID_DUPLICATE: 'VOID_DUPLICATE',
  VOID_UNCLEAR_IMAGE: 'VOID_UNCLEAR_IMAGE',
  VOID_OTHER: 'VOID_OTHER',
  RESTORE_SCORE: 'RESTORE_SCORE'
});

const FIELD_TYPES = Object.freeze({
  NAME: 'NAME',
  STUDENT_ID: 'STUDENT_ID',
  TOPIC: 'TOPIC',
  FILE_1: 'FILE_1',
  FILE_2: 'FILE_2',
  FILE_3: 'FILE_3'
});

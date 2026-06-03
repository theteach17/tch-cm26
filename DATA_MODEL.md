# Data Model Summary

## Core identity

- `AcademicTerms` ระบุภาคเรียน เช่น AY2569-T1
- `Courses` เก็บรายวิชา
- `Classes` เก็บห้องเรียน
- `CourseOfferings` ผูกภาคเรียน + รายวิชา + ห้องเรียน
- `Students` เก็บตัวนักเรียน
- `Enrollments` ผูกนักเรียนเข้ากับ CourseOffering ในภาคเรียนนั้น

## Source form pipeline

- `SourceForms` แหล่งข้อมูล Google Form Responses
- `FormHeaderMap` mapping หัวตารางจาก Form
- `RawFormRows` snapshot ข้อมูลดิบ
- `NormalizedSubmissions` รายการส่งงานมาตรฐาน
- `SubmissionFiles` ไฟล์รูปที่แนบในแต่ละ submission

## Classroom workflow

- `Sessions` คาบเรียน
- `AttendanceLog` การเข้าเรียน
- `AttendanceIndex` กันสแกนซ้ำในคาบเดียวกัน
- `ScanQueue` buffer รายการสแกน
- `BookCheckLog` ตรวจสมุด
- `ManualScoreLog` คะแนนพิเศษ/หักคะแนน

## Scoring and review

- `TopicMap` หัวข้องานและคะแนนที่ map จาก Google Form
- `ScoreLedger` คะแนนจริงทั้งหมด
- `ReviewLog` ประวัติการตรวจและยกเลิก/คืนคะแนน
- `AuditLog` ประวัติการทำงานสำคัญ
- `ErrorLog` รายการผิดปกติ


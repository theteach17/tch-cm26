# Installation Guide

## 1. เตรียมไฟล์ฐานข้อมูล

ใช้ไฟล์ Google Sheet ที่เตรียมไว้:

`ClassroomManagement`

เปิด Extensions > Apps Script

## 2. นำไฟล์เข้า Apps Script

สร้างไฟล์ตามชื่อใน zip แล้วคัดลอกเนื้อหาไปวาง:

- appsscript.json
- Code.gs
- Config.gs
- Utilities.gs
- SheetService.gs
- SetupService.gs
- AuthService.gs
- TermService.gs
- SourceFormService.gs
- TopicSubmissionService.gs
- SessionAttendanceService.gs
- ScoringReportService.gs
- ArchiveService.gs
- Index.html

## 3. Initialize

ใน Apps Script เลือกฟังก์ชัน:

`initializeSystem`

กด Run และ authorize

ระบบจะสร้างชีททั้งหมดให้เอง ได้แก่:

- SystemConfig
- Users
- AcademicTerms
- Courses
- Classes
- CourseOfferings
- Students
- Enrollments
- SourceForms
- FormHeaderMap
- Sessions
- TopicMap
- RawFormRows
- NormalizedSubmissions
- SubmissionFiles
- ReviewLog
- AttendanceLog
- AttendanceIndex
- ScanQueue
- BookCheckLog
- ManualScoreLog
- ScoreLedger
- ErrorLog
- AuditLog
- ArchiveIndex

## 4. ตรวจหัวตาราง Google Form Responses

รัน:

`detectFormHeaders`

ระบบจะอ่านหัวตารางจากไฟล์ Google Form Responses เดิม และสร้าง mapping ใน `FormHeaderMap`

## 5. Deploy Web App

Deploy > New deployment > Web app

- Execute as: Me
- Who has access: Only myself / Anyone in domain ตามนโยบายโรงเรียน

## 6. เริ่มใช้งาน

ลำดับแนะนำ:

1. Setup > Initialize / Detect Headers
2. Topics > ค้นหัวข้อจริงจาก Form
3. บันทึก TopicMap สำหรับงานย้อนหลัง
4. Sync > Sync ทั้งหมด
5. Review > ตรวจรูปงาน
6. Session > เปิดคาบ
7. Attendance > สแกนบัตร
8. Gradebook > ดูคะแนนและสร้างชีทรายห้อง


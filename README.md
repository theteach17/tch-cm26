# Classroom Management Ledger System

Current version: `v2.1.0-scan-leading-zero-normalization`

ระบบ Web App สำหรับจัดการคาบเรียน การสแกนบัตรเข้าเรียน การดึงข้อมูลส่งงานจาก Google Form Responses เดิม การตรวจรูปงาน การยกเลิก/คืนคะแนน และการสร้างสมุดคะแนนรายห้อง โดยใช้ Google Apps Script + Google Sheets เป็นฐานข้อมูล

## แนวคิดหลัก

- Google Form เดิมทำหน้าที่รับงานจากนักเรียนต่อไปเหมือนเดิม
- ระบบใหม่อ่านข้อมูลจาก Form Responses แบบ read-only
- Google Sheet `ClassroomManagement` เป็นฐานข้อมูลกลางของระบบใหม่
- คะแนนทุกประเภทลงที่ `ScoreLedger`
- การยกเลิกคะแนนใช้สถานะ `VOIDED` ไม่ลบข้อมูลจริง
- รองรับภาคเรียนใหม่ ห้องเรียนใหม่ รายวิชาใหม่ ผ่าน `AcademicTerms` และ `CourseOfferings`

## ไฟล์สำคัญ

- `appsscript.json` — manifest และ scopes
- `Code.gs` — doGet และ API bridge สำหรับหน้าเว็บ
- `Config.gs` — schema และ constants
- `SetupService.gs` — สร้างชีท/ค่าเริ่มต้น/trigger อัตโนมัติ
- `SourceFormService.gs` — อ่านและ sync Google Form Responses
- `TopicSubmissionService.gs` — mapping หัวข้องาน, sync ย้อนหลัง, review
- `SessionAttendanceService.gs` — เปิดคาบเรียนและสแกนบัตรเป็น batch
- `ScoringReportService.gs` — คะแนนสมุด/พิเศษ/สมุดคะแนน/ชีทรายห้อง
- `ArchiveService.gs` — archive ภาคเรียน
- `Index.html` — Web App UI

## Quick Start

1. เปิด Apps Script จากไฟล์ Google Sheet `ClassroomManagement`
2. คัดลอกไฟล์ทั้งหมดใน zip เข้า Apps Script project
3. กด Save
4. รัน `initializeSystem()` ครั้งแรก และ authorize
5. รัน `detectFormHeaders()` เพื่อตรวจหัวตาราง Form Responses
6. Deploy เป็น Web App
7. เปิด Web App แล้วใช้งานเมนู Setup / Sync / Topic / Attendance / Review / Gradebook

## การตั้งค่า Spreadsheet ID

เพื่อความปลอดภัย ระบบไม่ฝัง Spreadsheet ID จริงในโค้ดหรือเอกสารที่ใช้บน GitHub ให้ตั้งค่าจาก Apps Script editor เท่านั้น เช่น

```javascript
setDbSpreadsheetId('<DB_SPREADSHEET_ID>');
initializeSystem({
  sourceSpreadsheetId: '<FORM_RESPONSE_SPREADSHEET_ID>',
  sourceSheetName: 'Form Responses 1'
});
```

ตรวจ Google Drive sharing ของไฟล์ฐานข้อมูลและไฟล์คำตอบ Form ให้เป็น `Restricted` เสมอ

## ข้อควรทราบ

ระบบนี้ออกแบบให้ production-oriented แต่ก่อนใช้จริงควรทดสอบกับสำเนาข้อมูลหรือห้องเรียนตัวอย่างก่อนอย่างน้อย 1 รอบ โดยเฉพาะการ sync ทั้งหมดจาก Google Form เดิมและการ review รายการส่งงานย้อนหลัง



## v1.1.0 Hotfix: Chunked Sync
- แก้ปัญหา `api_syncAllFormRows` ใช้เวลานานจน Web App timeout
- Full Sync/Rebuild จะประมวลผลทีละชุดผ่าน `api_syncAllFormRowsChunk`
- Sync ใหม่จาก trigger จะประมวลผลแบบ bounded chunk เพื่อความเสถียร
- ลดการเขียน row-by-row ระหว่าง normalize โดย batch append นักเรียน/enrollment/error log


## Hotfix v1.2.0
- Fixed frontend JavaScript syntax error in `Index.html` that made all Web App buttons unresponsive after v1.1 timeout hotfix.
- Replaced unsafe multiline string literal in `syncAllUI()` with escaped `\n`.
- Verified the client-side `<script>` block using a JavaScript syntax check.


## v1.9.0 Review Viewer + Image Fix

- แก้ปัญหา CSS แสดงเป็นข้อความด้านบนหน้าเว็บ
- ปรับหน้า Review ให้ตรวจทีละรายการแบบภาพใหญ่ ซูมได้ เลื่อนก่อนหน้า/ถัดไปได้ และบันทึกแล้วเลื่อนอัตโนมัติ
- ปรับ URL รูปจาก Google Drive เป็น thumbnail เพื่อแสดงรูปใน Web App ได้เสถียรกว่า

## v1.8.0 Review Performance + Thai Date
- แก้วันที่หน้าเปิดคาบไม่ให้แสดงแบบ MM/DD/YYYY โดยแสดงเป็นวันที่ไทย และส่งค่า backend เป็น ISO yyyy-MM-dd
- เพิ่ม dropdown หัวข้องานในหน้า Review หลังเลือกห้อง
- ป้องกันการโหลดงานทั้งห้อง/ทั้งภาคเรียนโดยไม่เลือกหัวข้อ
- เพิ่ม ReviewIndex เพื่อโหลดงานตรวจจากดัชนีแบบเร็ว พร้อม pagination 30 รายการ
- เพิ่มปุ่มรีเฟรชดัชนีเฉพาะหัวข้อที่เลือก

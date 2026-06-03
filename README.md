# Classroom Management Ledger System

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

## ค่าเริ่มต้นที่ฝังไว้

Database Spreadsheet ID:


Source Form Response Spreadsheet ID:


Source Sheet:
`Form Responses 1`

Active Term:
`AY2569-T1`

Attendance score start date:
`2026-06-01`

## ข้อควรทราบ

ระบบนี้ออกแบบให้ production-oriented แต่ก่อนใช้จริงควรทดสอบกับสำเนาข้อมูลหรือห้องเรียนตัวอย่างก่อนอย่างน้อย 1 รอบ โดยเฉพาะการ sync ทั้งหมดจาก Google Form เดิมและการ review รายการส่งงานย้อนหลัง


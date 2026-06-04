# Classroom Management Ledger System

Production-oriented Google Apps Script + Google Sheets Web App สำหรับจัดการคาบเรียน เช็กชื่อด้วยบัตร RFID ดึงงานจาก Google Form ตรวจงานจากรูปภาพ จัดการคะแนน สุ่มชื่อ จับกลุ่ม และสรุปผลรายห้อง

## Version
`2.4.0-classroom-ux-tools`

## ไฟล์ที่ต้องมีใน Apps Script
- appsscript.json
- Config.gs
- Code.gs
- Utilities.gs
- SheetService.gs
- SetupService.gs
- AuthService.gs
- TermService.gs
- SourceFormService.gs
- TopicSubmissionService.gs
- SessionAttendanceService.gs
- ScoringReportService.gs
- RandomGroupService.gs
- ArchiveService.gs
- Index.html
- styles.html
- utils.html
- dashboard.html
- session.html
- topicsSync.html
- review.html
- gradebook.html

## อัปเดตสำคัญ v2.4
1. เพิ่มเมนูสุ่ม/จับกลุ่ม พร้อม animation สำหรับฉายหน้าจอ
2. ปรับสมุดคะแนนให้อ่านง่ายและเพิ่มสรุปการเข้าเรียน/ขาดเรียน/ลา/สาย
3. ปรับข้อความแจ้งเตือนและ toast ให้เป็นมืออาชีพขึ้น
4. แก้ UX หน้า Review ไม่ให้แสดง error proxy หากรูป fallback โหลดได้สำเร็จ

## หลังอัปเดต
1. Save ทุกไฟล์
2. Deploy > Manage deployments > New version
3. เปิด Web App ใหม่แบบ hard refresh
4. หากยังไม่เคยอนุญาตสิทธิ์ UrlFetch ให้รัน API หรือเปิดหน้า Review เพื่อให้ระบบขอ authorization ใหม่

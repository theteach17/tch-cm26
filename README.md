# Classroom Management Ledger System

Production-oriented Google Apps Script + Google Sheets Web App สำหรับจัดการคาบเรียน เช็กชื่อด้วยบัตร RFID ดึงงานจาก Google Form ตรวจงานจากรูปภาพ จัดการคะแนน สุ่มชื่อ จับกลุ่ม และสรุปผลรายห้อง

## Version
`2.6.0-random-group-workflow`

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
- random.html
- grouping.html

## อัปเดตสำคัญ v2.6
1. แยกเมนู “สุ่มชื่อ” และ “จับกลุ่ม” ออกจากกัน
2. หน้า “สุ่มชื่อ” ใช้พื้นที่แสดงผลใหญ่ขึ้น มี countdown และ roulette animation สำหรับฉายหน้าจอ
3. หน้า “สุ่มชื่อ” สามารถบันทึกคะแนนสมุดจากรายชื่อที่สุ่มได้ทันที ทั้งรายคนและแบบกลุ่ม
4. เมนูสุ่มและจับกลุ่มเลือกคาบเรียนได้ โดยระบบโหลดคาบจากห้อง/รายวิชาที่เลือก
5. ลดการเปิดหน้าแล้วค้างจาก dashboard โดยไม่โหลด counter หนักอัตโนมัติ

## หลังอัปเดต
1. Save ทุกไฟล์
2. Deploy > Manage deployments > New version
3. เปิด Web App ใหม่แบบ hard refresh
4. หากยังไม่เคยอนุญาตสิทธิ์ UrlFetch ให้รัน API หรือเปิดหน้า Review เพื่อให้ระบบขอ authorization ใหม่


### v2.6 Random/Group Workflow Note
Dashboard counters are no longer loaded automatically on startup. Use the “โหลดภาพรวม” button when needed. Random and grouping tools now have separate menus; random results can be recorded as book-check scores directly into BookCheckLog and ScoreLedger.

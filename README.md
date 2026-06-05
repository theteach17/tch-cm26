# Classroom Management Ledger v2.9.0

This build focuses on dashboard stability and faster random-name/book-check workflow.

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

### v2.7 Notes
- หลังอัปเดตเป็น v2.7 ให้กด `Initialize / Repair` หนึ่งครั้ง เพื่อสร้างชีท `GroupingLog` และตรวจ schema ล่าสุด
- เมนู `สมุดคะแนน` ใช้สำหรับคะแนนและชิ้นงานเท่านั้น
- เมนูใหม่ `เวลาเรียน` ใช้ตรวจรายละเอียด มา / ขาด / ลา / สาย รายคาบ
- เมนู `จับกลุ่ม` จะบันทึกผลลงชีท `GroupingLog` อัตโนมัติทุกครั้งที่กดจัดกลุ่ม

### v2.8.1 Notes
- คืน emoji เมนูหลักและหัวข้อกลับเป็นรูปแบบเดิม
- ปรับเฉพาะเมนูจับกลุ่มให้ใช้ 👥 แทนสัญลักษณ์ที่อาจแสดงเป็นกล่อง
- คง dashboard lightweight จาก v2.8 ไว้

### v2.8 Notes
- Dashboard now uses a lightweight backend path. If the previous version took more than 1 minute to load dashboard counters, replace `ScoringReportService.gs`, `dashboard.html`, `Index.html`, `styles.html`, and `utils.html` from this package.
- Menu icons were changed from emoji/special symbols to text badges such as `DB`, `GP`, `AT` to prevent square-box glyphs on Windows/Chrome classroom machines.

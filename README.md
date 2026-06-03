# Classroom Management Ledger — Production Audit Build v1.4.0

ระบบ Google Apps Script + Google Sheets สำหรับบริหารคาบเรียน, ดึงข้อมูลงานจาก Google Form Responses แบบ read-only, ตรวจรูปงาน, เช็กชื่อด้วย RFID/เลขประจำตัว, และรวมคะแนนใน ScoreLedger

## Security first

เวอร์ชันนี้ **ไม่ฝัง Spreadsheet ID จริงใน repository** แล้ว ให้ตั้งค่าด้วยวิธีปลอดภัยเท่านั้น:

1. เปิด Apps Script จากไฟล์ Google Sheet ฐานระบบ
2. วางไฟล์โค้ดทั้งหมด
3. รัน `setDbSpreadsheetId('<CLASSROOM_MANAGEMENT_SHEET_ID>')` จาก Apps Script editor หรือใช้ bound spreadsheet เป็นฐานหลัก
4. รัน `initializeSystem({ sourceSpreadsheetId:'<FORM_RESPONSE_SPREADSHEET_ID>', sourceSheetName:'Form Responses 1' })`
5. ตั้งค่า sharing ของ Google Sheets เป็น **Restricted**

ห้ามใส่ Spreadsheet ID จริงลง GitHub public repository

## Production hardening in v1.4.0

- เพิ่ม Authorization Guard ทุก `api_*` function
- ลบ hardcoded Spreadsheet IDs จาก `Config.gs` และเอกสาร
- เปลี่ยน `updateRowById_()` เป็น single-row batch write
- เพิ่ม CacheService สำหรับ Student Map, Enrollment Map และ Attendance Index รายคาบ
- เพิ่ม Backend input validation
- ปรับ RFID batch scan ให้ retry แบบ exponential backoff และมี retry limit
- แยก Frontend เป็น module: `styles.html`, `utils.html`, `dashboard.html`, `session.html`, `topicsSync.html`, `review.html`, `gradebook.html`
- ลด review default page size เป็น 30 และใช้ lazy image loading
- เพิ่ม confirmation ก่อน VOID/RESTORE คะแนน
- เพิ่ม progress bar จริงสำหรับ chunked sync
- เพิ่ม CHANGELOG.md และ PDCA notes

## Deployment

ให้ใช้ `Deploy > Manage deployments > Edit > New version` ทุกครั้งหลังแก้ไฟล์ และตรวจว่า Web App เปิดให้เฉพาะผู้ที่ sign in ได้เท่านั้น

# Installation — Classroom Management Ledger v1.4.0

## 1) Copy files into Apps Script

สร้างไฟล์ Apps Script/HTML ตามชื่อไฟล์ใน ZIP แล้วคัดลอกเนื้อหาให้ครบทุกไฟล์ รวมถึง module HTML ใหม่:

- `Index.html`
- `styles.html`
- `utils.html`
- `dashboard.html`
- `session.html`
- `topicsSync.html`
- `review.html`
- `gradebook.html`

## 2) Configure secured spreadsheet IDs

เวอร์ชันนี้ไม่ฝัง Spreadsheet ID ใน source code เพื่อความปลอดภัย

จาก Apps Script editor ให้รันครั้งแรก:

```javascript
setDbSpreadsheetId('<CLASSROOM_MANAGEMENT_SPREADSHEET_ID>');
initializeSystem({
  sourceSpreadsheetId: '<GOOGLE_FORM_RESPONSE_SPREADSHEET_ID>',
  sourceSheetName: 'Form Responses 1'
});
```

หลังจากนั้นตรวจชีต `SystemConfig` และ `SourceForms` ว่ามีค่า source ถูกต้อง

## 3) Security settings

- ตั้ง Google Sheet ทุกไฟล์เป็น `Restricted`
- Deploy Web App โดยจำกัดผู้ใช้งานเป็น signed-in users
- ตรวจ `Users` ให้ครูที่ใช้งานมี role `ADMIN` หรือ `TEACHER`
- อย่านำ Spreadsheet ID จริงไป commit บน GitHub

## 4) Deploy

`Deploy > Manage deployments > New version > Deploy`

หลัง deploy ให้ hard refresh Web App และตรวจว่ามุมซ้ายแสดง `v1.4.0-production-audit`

## 5) Smoke test

1. เปิด Web App แล้วเข้า Dashboard
2. กด Detect Form Headers
3. กด Sync รายการใหม่
4. เปิดเมนู Review ตรวจว่ารูปโหลดแบบ lazy ไม่เกิน 30 รายการต่อหน้า
5. เปิดคาบเรียนทดสอบ แล้วลองสแกน/กรอกเลขนักเรียน 2–3 รายการ
6. ตรวจ `AttendanceLog`, `AttendanceIndex`, `ScoreLedger`

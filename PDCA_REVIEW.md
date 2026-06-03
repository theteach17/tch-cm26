# PDCA Review Notes

## Plan

ออกแบบระบบให้ Google Form เดิมเป็น read-only source เพื่อรักษาความเสถียร และให้ Google Sheet ใหม่เป็นฐานกลางของระบบ โดยรองรับหลายภาคเรียน หลายรายวิชา หลายห้องเรียน และการ archive

## Do

สร้าง Apps Script project ที่มีโมดูลครบ:

- Setup automation
- Form header detection
- Form sync and normalization
- Retroactive topic mapping
- Submission review with void/restore
- Attendance scan batch processing
- Score ledger
- Room sheet generation
- Term archive

## Check

ประเด็นที่ตรวจซ้ำในโค้ด:

- ไม่เขียนกลับไปยัง Google Form Responses เดิม
- ทุก transactional table มี `term_id`
- ทุกคะแนนอยู่ใน `ScoreLedger`
- การยกเลิกใช้ `VOIDED` ไม่ลบข้อมูลจริง
- Attendance ใช้ batch processing และมี `AttendanceIndex` กันซ้ำ
- Sync ใช้ `submission_key` กันข้อมูลซ้ำ
- TopicMap รองรับ LIVE และ RETROACTIVE
- Room sheet เป็น generated view ไม่ใช่ฐานข้อมูลหลัก

## Act

ข้อเสนอเมื่อเริ่มใช้จริง:

1. ทดสอบกับห้องเดียวก่อน เช่น ม.6/10
2. สร้าง TopicMap ย้อนหลัง 1 หัวข้อ
3. Sync และตรวจว่า NormalizedSubmissions ถูกต้อง
4. Review รูป 5–10 รายการ
5. เปิด Session ทดสอบสแกน RFID
6. ตรวจ ScoreLedger และ Room Sheet
7. ค่อยเปิดใช้ทุกห้อง


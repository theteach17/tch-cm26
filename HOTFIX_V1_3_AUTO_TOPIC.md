# Hotfix v1.3.0-auto-topic-repair

เป้าหมาย: ลดความผิดพลาดและลดขั้นตอนของผู้ใช้ให้มากที่สุด

## สิ่งที่เพิ่ม

1. Auto TopicMap
- ระหว่าง Sync หากพบหัวข้อใหม่จาก Google Form ระบบจะสร้าง `TopicMap` ให้อัตโนมัติ
- ไม่ต้องให้ครูสร้างหัวข้อก่อนทุกครั้ง
- ใช้คะแนนเริ่มต้นจาก `DEFAULT_SUBMISSION_SCORE`
- ตั้ง `sync_mode = AUTO_MAPPED`

2. Auto Class / Offering
- หากพบห้องใหม่ใน Form ที่ยังไม่มีในระบบ ระบบจะสร้าง `Classes` และ `CourseOfferings` ให้อัตโนมัติ
- ม.6 ใช้รายวิชาเริ่มต้น `อ33208`
- ม.2 และระดับอื่นใช้รายวิชาเริ่มต้น `อ22101`

3. Auto Reprocess
- ปุ่ม `Auto Fix หัวข้อ/คะแนน/Error` จะนำรายการที่เคย `PENDING_TOPIC` กลับมาจับคู่หัวข้อ สร้างคะแนน และแก้ ErrorLog เป็น `RESOLVED`

4. ลด ErrorLog ซ้ำ
- เพิ่ม setting `TOPIC_NOT_MAPPED_LOG_MODE = SUMMARY`
- หากปิด Auto Topic ระบบจะสรุป error ตาม class + topic แทนการเขียน error รายคนจำนวนมาก

## ไฟล์ที่ควรแทนที่

- Config.gs
- SetupService.gs
- SourceFormService.gs
- TopicSubmissionService.gs
- Code.gs
- Index.html

## หลังติดตั้ง

1. Save ทุกไฟล์
2. Deploy > Manage deployments > New version
3. Refresh หน้า Web App
4. กด `ซ่อมอัตโนมัติ: สร้างหัวข้อ/คืนสถานะ Error`
5. ตรวจ `TopicMap`, `NormalizedSubmissions`, `ScoreLedger`, `ErrorLog`


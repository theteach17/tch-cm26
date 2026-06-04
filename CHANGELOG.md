# CHANGELOG

## v2.6.0-random-group-workflow
- แยกเมนู “สุ่มชื่อ” และ “จับกลุ่ม” ออกจากกัน เพื่อให้พื้นที่แสดงผลของการสุ่มใหญ่ขึ้นและเหมาะกับการฉายหน้าจอมากขึ้น
- ปรับหน้า “สุ่มชื่อ” เป็น display mode แบบเต็มพื้นที่ พร้อม countdown, roulette animation, winner cards และแผงบันทึกคะแนนสมุด
- เพิ่มการเลือกคาบเรียนในเมนูสุ่มและเมนูจับกลุ่ม โดยโหลดคาบตามห้อง/รายวิชาที่เลือก ไม่จำกัดแค่ dropdown ห้อง
- เพิ่ม API `api_listToolSessions()` สำหรับโหลดคาบ ACTIVE/CLOSED ล่าสุดของห้องที่เลือก เพื่อใช้ประกอบการสุ่ม/จับกลุ่มจากรายชื่อทั้งห้องหรือเฉพาะผู้มาเรียน
- เพิ่ม API `api_saveBookCheckBatch()` สำหรับบันทึกคะแนนสมุดจากรายชื่อที่สุ่มได้แบบ batch ลดจำนวน request และลดโอกาส timeout
- ปรับ startup ให้ไม่เรียก dashboard counters อัตโนมัติ ลดอาการเปิดหน้าแล้วค้างที่ “กำลังประมวลผล”
- คง workflow หลักของการเปิดคาบ สแกน ดึง Form ตรวจงาน และ ScoreLedger เดิม ไม่เปลี่ยน data model


## 2.4.0-classroom-ux-tools
- ปรับข้อความแจ้งเตือนให้เป็นรูปแบบมืออาชีพและอ่านง่ายขึ้น
- ปรับหน้าเมนูคะแนน/สมุดคะแนนให้มี summary cards และตารางที่อ่านง่ายขึ้น
- เพิ่มสรุปการเข้าเรียน: มาเรียน / ขาดเรียน / ลา / สาย / อัตราเข้าเรียน
- เพิ่มหน้า “สุ่ม/จับกลุ่ม” สำหรับฉายหน้าจอ
- เพิ่มสุ่มรายชื่อแบบมี animation และระบุจำนวนที่ต้องการสุ่มได้
- เพิ่มจับกลุ่มนักเรียน โดยเลือกจำนวนคนต่อกลุ่มหรือจำนวนกลุ่มได้ พร้อมแสดงรายชื่อที่เหลือ
- เพิ่มตัวเลือกสุ่ม/จับกลุ่มจากรายชื่อทั้งห้อง หรือเฉพาะผู้มาเรียนในคาบนั้น หากยังไม่ได้ปิดยอดขาดเรียน ระบบจะ fallback เป็นรายชื่อทั้งห้อง
- แก้การแจ้ง error ในหน้าโหลดรูปภาพ: ถ้า proxy ไม่มีสิทธิ์ UrlFetch แต่ fallback สำเร็จ จะไม่แสดง error สีแดงให้ผู้ใช้ตกใจ
- เพิ่ม RandomGroupService.gs

## 2.3.0-review-image-proxy
- เพิ่ม proxy โหลดรูปภาพตรวจงาน

## v2.5.0-dashboard-startup-stability
- Fixed Web App startup hang caused by the dashboard loading heavy counters through `api_getDashboardData` during bootstrap.
- Optimized `getDashboardData()` to use projected column reads and short CacheService cache instead of full-sheet object reads for every dashboard refresh.
- Changed bootstrap so dashboard counters are non-blocking. Core menus remain usable even if dashboard counters are slow.
- Added client-side request timeout support to `call()` to prevent the global loading overlay from staying forever.
- Added loading overlay reference counting and force-safe hide behavior.

## v2.7.0-gradebook-attendance-group-log
- แยกเมนูตารางเวลาเรียน / มา-ขาด-ลา ออกจากเมนูสมุดคะแนน เพื่อให้เห็นรายละเอียดรายคาบชัดเจนขึ้น
- ปรับสมุดคะแนนให้เน้นคะแนนและสถานะชิ้นงาน โดยใช้ตารางแนวนอนแบบ sticky columns และสีสถานะ ส่งแล้ว / ขาดส่ง / รอตรวจ / ยกเลิก
- เพิ่ม API `api_getScorebook()` และ `api_getAttendanceDetail()` เพื่อลดภาระการโหลดข้อมูลที่ไม่จำเป็นในแต่ละหน้า
- แก้ icon เมนูจับกลุ่มที่แสดงเป็นกล่องสี่เหลี่ยม โดยเปลี่ยนเป็นสัญลักษณ์ข้อความที่รองรับทุกเครื่อง
- เพิ่มชีท `GroupingLog` สำหรับบันทึกประวัติการจับกลุ่มทุกครั้ง ได้แก่ วันที่, คาบ, จำนวนกลุ่ม, สมาชิกแต่ละกลุ่ม และรายชื่อที่เหลือ
- ปรับการ์ดแสดงผลกลุ่มให้เป็น card layout อ่านง่าย พร้อมประวัติการจับกลุ่มล่าสุด


## 2.8.1-emoji-menu-restore
- คืน emoji เมนูและหัวข้อหน้าจอกลับเป็นรูปแบบเดิมตาม UX ที่ผู้ใช้ต้องการ
- เปลี่ยนเฉพาะเมนูจับกลุ่มจากสัญลักษณ์ที่บางเครื่องแสดงเป็นกล่อง เป็น emoji 👥 ที่รองรับบน Windows/Chrome ได้ดีกว่า
- คงการปรับปรุง Dashboard performance จาก v2.8.0 ไว้ทั้งหมด

## 2.8.0-dashboard-icons-stability
- Reworked Dashboard API to lightweight metadata counters so pressing "โหลดภาพรวม" does not scan large submission/attendance tables.
- Dashboard now returns fast summary counts and active session list without blocking the Web App.
- Replaced menu emoji/symbol icons with text-based icon badges to avoid square-box rendering on classroom browsers.
- Updated section icons and key action buttons to use stable text labels where emoji rendering may be unreliable.
- Fixed duplicate `const offering` declaration in scorebook service package source.

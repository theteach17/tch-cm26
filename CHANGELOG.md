
## v1.6.0-startup-diagnostics
- Fixed startup single-point-of-failure that could leave all offering selectors blank while the database already contained CourseOfferings.
- Added tolerant `api_bootstrap()` with partial diagnostics instead of hard failure.
- Added `api_diagnoseStartup()` for real server-side diagnostics: user role, active term, offering count, and sheet row counts.
- Updated frontend offering loading to accept both array and object API shapes.
- Added visible "วิเคราะห์ปัญหา" button on the Start Session screen.

# CHANGELOG

## v1.5.0-session-ui-hotfix

### Fixed
- แก้ปัญหาหน้าเปิดคาบเรียนไม่มีรายการห้อง/รายวิชา โดยเพิ่ม `api_listOfferings()` และ fallback `listUiOfferings_()` สำหรับ ADMIN
- หน้า Web App โหลดรายการห้องใหม่ได้จากปุ่มในหน้าเปิดคาบเรียน
- เพิ่ม session defaults จากเวลาระบบผ่าน `api_getSessionDefaults()`

### Added
- ตารางคาบเรียนอัตโนมัติ:
  - คาบ 1 08:20-09:10
  - คาบ 2 09:10-10:00
  - คาบ 3 10:00-10:50
  - คาบ 4 10:50-11:40
  - คาบ 5 11:50-12:40
  - คาบ 6 12:40-13:30
  - คาบ 7 13:30-14:20
  - คาบ 8 14:20-15:10
  - คาบ 9 15:10-16:00
- `PERIOD_SCHEDULE_JSON` ใน SystemConfig เพื่อปรับตารางคาบได้ในอนาคตโดยไม่แก้โค้ด
- UI ธีมใหม่แบบ professional dashboard พร้อม emoji/icon, gradient sidebar, hero bar และ period suggestion card

### Notes
- ถ้าอัปเดตจาก v1.4 ให้แทนที่ทุกไฟล์ใน Apps Script แล้ว Deploy เป็น New version
- หลัง deploy ให้กด Initialize / Repair System หนึ่งครั้งเพื่อเพิ่มค่า `PERIOD_SCHEDULE_JSON`

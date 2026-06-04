
## v2.2.0 - Scan Lock Queue Serialization
- Prevented overlapping `api_processScanBatch` calls from the same browser by adding a client-side `isFlushing` guard.
- Increased scan batching window slightly and sends up to 30 scans per server request to reduce ScriptLock contention.
- Server now returns a retryable `SCAN_LOCK_BUSY` response instead of throwing a long lock timeout.
- Duplicate scan counting no longer performs per-row `AttendanceIndex` updates during fast scan bursts; duplicates remain visible in `ScanQueue` while the original PRESENT record remains authoritative.
- Scan lock/busy retries are now shown as a warning and requeued automatically, not as a fatal save failure.


## v2.1.0-scan-leading-zero-normalization
- Fixed RFID/card scans that contain leading zeros (e.g. `0009832237`) not matching card numbers stored in the Students sheet without leading zeros (e.g. `9832237`).
- Added backend `normalizeCardCode_()` and card lookup registration for both exact and normalized RFID/student_pay/backup card codes.
- Added frontend scan normalization so the scan page can show the student immediately before server save.
- Server now stores the normalized code in AttendanceLog/ScanQueue and keeps the original scan value in note for audit traceability.

## v2.0.0-attendance-scan-reliability
- Fixed attendance scan not recording when the active session dropdown was populated but scan bootstrap was not loaded.
- Scan page now auto-selects the first active session and auto-loads roster/id maps.
- Added scan readiness panel, server result logs, manual immediate flush, and diagnostics for roster/session problems.
- Added backend scan diagnostics API and safer scan bootstrap metadata.

# CHANGELOG

## v1.9.0-review-viewer-images
- Fixed raw CSS text appearing at the top of the Web App by keeping all review styles inside styles.html <style>.
- Changed Review UX from card grid to one-by-one large image inspection mode.
- Added next/previous navigation, auto-advance after review save, image zoom controls, thumbnail switching, and open-original-file action.
- Regenerated Drive preview URLs using drive.google.com/thumbnail for better image rendering in HtmlService.
- Kept topic-required Review flow and ReviewIndex performance design from v1.8.

## v1.7.0-client-serialization-fix
- Fixed root cause where the backend could read `CourseOfferings` but the browser dropdown stayed empty.
- Added `sanitizeForClient_()` to convert Google Sheet `Date` objects and other non-plain values into JSON-safe strings before returning through `google.script.run`.
- All `ok_()` and `fail_()` API bridge responses now sanitize their payloads automatically.
- This resolves startup/bootstrap/listOfferings failures caused by rows containing `created_at` or other Date fields.

## v1.6.0-startup-diagnostics
- Added startup diagnostics and fallback offering loading.

## v1.8.0-review-performance-date
- Fixed date UX on Start Session: visible date is now Thai Buddhist-year display while backend still receives ISO `yyyy-MM-dd`.
- Added review topic selector after class selection.
- Prevented review page from loading an entire class/term without a topic filter.
- Added `ReviewIndex` sheet for fast review listing and denormalized preview URLs.
- Added `api_listReviewTopics()` and `api_rebuildReviewIndex()`.
- Reworked `api_listSubmissionsForReview()` to use ReviewIndex, topic-required flow, 30-row pagination, and lazy images.
- Review actions now update ReviewIndex status to keep UI responsive.

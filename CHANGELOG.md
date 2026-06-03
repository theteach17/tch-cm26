# CHANGELOG

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

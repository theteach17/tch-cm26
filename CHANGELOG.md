# CHANGELOG

## v1.4.0-production-audit

### Security
- Added guarded API bridge for every `api_*` function.
- Removed hardcoded real Spreadsheet IDs from source code and README.
- Added setup-only/admin-only initialization guard.
- Added offering access helper for future class-level authorization.

### Performance
- Replaced cell-by-cell `updateRowById_()` with single-row `setValues()`.
- Added CacheService helpers for student map, enrollments by offering, and attendance index by session.
- Refactored scan processing into context loading, per-scan processing, batch persistence, and summary.

### Reliability
- Added backend validation helper and validation to critical write APIs.
- Added bounded scan batch size.
- Added safer source spreadsheet configuration and error messages.

### UX
- Split frontend into modules.
- Added retry limit and exponential backoff for scan queue.
- Added offline warning and pending scan export.
- Added confirmation for destructive review actions.
- Added lazy loading and pagination for review images.
- Added real progress bar for full sync.

## v1.3.0-auto-topic-repair
- Auto-created TopicMap from Google Form topics.
- Auto-created class/offering/student/enrollment from Form responses.
- Auto-resolved TOPIC_NOT_MAPPED errors when repair succeeds.

## v1.2.0-hotfix-ui
- Fixed frontend JavaScript syntax issue.

## v1.1.0-hotfix-timeout
- Added chunked full sync to avoid Apps Script timeout.

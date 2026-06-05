# CHANGELOG

## v2.9.0-dashboard-random-speed

### Fixed
- Dashboard no longer scans large sheets or blocks startup. It now returns an instant lightweight response and directs detailed views to their dedicated menus.
- Random-name page no longer waits for a server randomization request on every click. It preloads/caches the roster and randomizes client-side for fast classroom display.
- Random tool skips AttendanceLog reads when using all-roster mode or when the selected session is not closed, preventing slow first-load behavior.
- Book-check scoring from the random page now updates UI optimistically and sends the save request silently in the background.
- Batch book-check save now caches default score settings and timestamps once per request to reduce backend overhead.

### Notes
- Core workflows for Sync, Review, Attendance Scan, ScoreLedger, and Grouping remain unchanged.

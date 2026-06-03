function createTermArchive(termId) {
  assertRole_(['ADMIN']);
  termId = termId || getActiveTerm_();
  const lock = lock_(30000);
  try {
    const sourceSs = getDb_();
    const archive = SpreadsheetApp.create('ClassroomManagement_ARCHIVE_' + termId + '_' + fmtDate_(now_(), 'yyyyMMdd_HHmm'));
    Object.keys(SCHEMA).forEach(sheetName => {
      const src = sourceSs.getSheetByName(sheetName);
      if (!src) return;
      const rows = getRows_(sheetName).filter(r => String(r.term_id || termId) === String(termId) || [SHEETS.SYSTEM_CONFIG,SHEETS.USERS,SHEETS.COURSES,SHEETS.CLASSES,SHEETS.ARCHIVE_INDEX].indexOf(sheetName) >= 0);
      const dst = archive.insertSheet(sheetName);
      dst.getRange(1,1,1,SCHEMA[sheetName].length).setValues([SCHEMA[sheetName]]).setFontWeight('bold');
      if (rows.length) dst.getRange(2,1,rows.length,SCHEMA[sheetName].length).setValues(rows.map(r => SCHEMA[sheetName].map(h => r[h] === undefined ? '' : r[h])));
      dst.setFrozenRows(1);
    });
    const defaultSheet = archive.getSheetByName('Sheet1');
    if (defaultSheet) archive.deleteSheet(defaultSheet);
    const archiveId = uuid_('ARCH');
    appendObjects_(SHEETS.ARCHIVE_INDEX, [{ archive_id: archiveId, term_id: termId, archive_file_id: archive.getId(), archive_url: archive.getUrl(), created_by: getUserEmail_(), created_at: now_(), status:'CREATED', note:'' }]);
    updateRowById_(SHEETS.ACADEMIC_TERMS, 'term_id', termId, { status:'ARCHIVED', archive_file_id: archive.getId(), closed_at: now_() });
    audit_('CREATE_TERM_ARCHIVE', SHEETS.ARCHIVE_INDEX, archiveId, {}, { termId, archiveUrl: archive.getUrl() }, 'Archive created');
    return ok_({ archive_id: archiveId, archive_file_id: archive.getId(), archive_url: archive.getUrl() }, 'Archive created');
  } finally { lock.releaseLock(); }
}

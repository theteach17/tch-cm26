function getDb_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DB_SPREADSHEET_ID') || APP.DEFAULT_DB_SPREADSHEET_ID;
  try { return SpreadsheetApp.openById(id); }
  catch (err) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw err;
  }
}
function setDbSpreadsheetId(spreadsheetId) {
  PropertiesService.getScriptProperties().setProperty('DB_SPREADSHEET_ID', spreadsheetId);
  return ok_({ spreadsheetId }, 'Database spreadsheet ID saved');
}
function sh_(sheetName) {
  const ss = getDb_();
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  return sh;
}
function ensureSheet_(sheetName, headers) {
  const sh = sh_(sheetName);
  const existing = sh.getRange(1,1,1,Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  const isBlank = sh.getLastRow() === 0 || existing.every(v => !v);
  const need = headers || SCHEMA[sheetName] || [];
  if (need.length && (isBlank || existing.join('|') !== need.join('|'))) {
    sh.clear();
    sh.getRange(1,1,1,need.length).setValues([need]);
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, need.length);
    sh.getRange(1,1,1,need.length).setFontWeight('bold').setBackground('#e8f0fe');
  }
  return sh;
}
function headerMap_(sheetName) {
  const sh = sh_(sheetName);
  const width = Math.max(1, sh.getLastColumn());
  const headers = sh.getRange(1,1,1,width).getValues()[0].map(h => String(h || '').trim());
  const map = {};
  headers.forEach((h, i) => { if (h) map[h] = i; });
  return { headers, map };
}
function getRows_(sheetName) {
  const sh = sh_(sheetName);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const lastCol = sh.getLastColumn();
  const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  const { headers } = headerMap_(sheetName);
  return values.map((row, idx) => {
    const obj = { __row: idx + 2 };
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}
function appendObjects_(sheetName, objects) {
  if (!objects || !objects.length) return 0;
  const sh = ensureSheet_(sheetName, SCHEMA[sheetName]);
  const headers = SCHEMA[sheetName];
  const rows = objects.map(obj => headers.map(h => obj[h] === undefined ? '' : obj[h]));
  sh.getRange(sh.getLastRow()+1, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}
function updateRowById_(sheetName, idField, idValue, patch) {
  const rows = getRows_(sheetName);
  const target = rows.find(r => String(r[idField]) === String(idValue));
  if (!target) return false;
  const sh = sh_(sheetName);
  const { map } = headerMap_(sheetName);
  Object.keys(patch).forEach(k => {
    if (map[k] !== undefined) sh.getRange(target.__row, map[k]+1).setValue(patch[k]);
  });
  return true;
}
function findOne_(sheetName, predicate) { return getRows_(sheetName).find(predicate) || null; }
function findAll_(sheetName, predicate) { return getRows_(sheetName).filter(predicate); }
function getSetting_(key) {
  try {
    const row = findOne_(SHEETS.SYSTEM_CONFIG, r => String(r.setting_key) === String(key));
    return row ? row.setting_value : '';
  } catch (err) { return ''; }
}
function setSetting_(key, value, type, description) {
  ensureSheet_(SHEETS.SYSTEM_CONFIG, SCHEMA[SHEETS.SYSTEM_CONFIG]);
  const row = findOne_(SHEETS.SYSTEM_CONFIG, r => String(r.setting_key) === String(key));
  if (row) {
    updateRowById_(SHEETS.SYSTEM_CONFIG, 'setting_key', key, { setting_value: value, data_type: type || row.data_type, description: description || row.description, updated_at: now_() });
  } else {
    appendObjects_(SHEETS.SYSTEM_CONFIG, [{ setting_key: key, setting_value: value, data_type: type || 'text', description: description || '', updated_at: now_() }]);
  }
}
function audit_(action, sheetName, targetId, oldValue, newValue, note) {
  try {
    appendObjects_(SHEETS.AUDIT_LOG, [{
      audit_id: uuid_('AUD'), timestamp: now_(), user_email: getUserEmail_(), action,
      target_sheet: sheetName || '', target_id: targetId || '', old_value: safeJson_(oldValue), new_value: safeJson_(newValue), note: note || ''
    }]);
  } catch (err) { console.error('Audit failed', err); }
}
function logError_(sourceRow, errorType, errorMessage, rawValue) {
  appendObjects_(SHEETS.ERROR_LOG, [{
    error_id: uuid_('ERR'), source_row: sourceRow || '', error_type: errorType,
    error_message: errorMessage, raw_value: typeof rawValue === 'string' ? rawValue : safeJson_(rawValue),
    status: 'OPEN', created_at: now_(), resolved_by: '', resolved_at: ''
  }]);
}

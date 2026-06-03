function getCurrentUser() {
  const email = getUserEmail_();
  const row = findOne_(SHEETS.USERS, r => String(r.email).toLowerCase() === String(email).toLowerCase() && toBool_(r.is_active));
  if (row) return { email, displayName: row.display_name || email, role: row.role || 'TEACHER', allowedOfferings: row.allowed_offerings || '*' };
  return { email, displayName: email, role: 'VIEWER', allowedOfferings: '' };
}
function assertRole_(roles) {
  const user = getCurrentUser();
  const list = Array.isArray(roles) ? roles : [roles];
  if (list.indexOf(user.role) < 0 && user.role !== 'ADMIN') throw new Error('Permission denied for ' + user.email);
  return user;
}
function listActiveOfferings() {
  const termId = getSetting_('ACTIVE_TERM_ID') || APP.ACTIVE_TERM_ID;
  return getRows_(SHEETS.COURSE_OFFERINGS).filter(r => String(r.term_id) === String(termId) && String(r.status) === 'ACTIVE');
}
function getActiveTerm_() { return getSetting_('ACTIVE_TERM_ID') || APP.ACTIVE_TERM_ID; }
function getOffering_(offeringId) { return findOne_(SHEETS.COURSE_OFFERINGS, r => String(r.offering_id) === String(offeringId)); }
function getActiveSource_() {
  const termId = getActiveTerm_();
  return findOne_(SHEETS.SOURCE_FORMS, r => String(r.term_id) === termId && toBool_(r.is_active));
}

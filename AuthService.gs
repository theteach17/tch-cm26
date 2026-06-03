function getCurrentUser() {
  const email = getUserEmail_();
  let row = null;
  try {
    row = findOne_(SHEETS.USERS, r => String(r.email).toLowerCase() === String(email).toLowerCase() && toBool_(r.is_active));
  } catch (err) {}
  if (row) return { email, displayName: row.display_name || email, role: row.role || 'TEACHER', allowedOfferings: row.allowed_offerings || '*' };
  return { email, displayName: email, role: 'VIEWER', allowedOfferings: '' };
}
function assertAuthenticated_() {
  const email = getUserEmail_();
  if (!email || email === 'unknown') throw new Error('Authentication required. Deploy the Web App for signed-in users only.');
  return email;
}
function roleRank_(role) {
  const ranks = { VIEWER: 1, TEACHER: 2, ADMIN: 3 };
  return ranks[String(role || '').toUpperCase()] || 0;
}
function assertRole_(roles) {
  assertAuthenticated_();
  const user = getCurrentUser();
  const list = Array.isArray(roles) ? roles : [roles];
  const ok = list.some(role => roleRank_(user.role) >= roleRank_(role));
  if (!ok) throw new Error('Permission denied for ' + user.email + ' (role: ' + user.role + ')');
  return user;
}
function assertSetupOrAdmin_() {
  assertAuthenticated_();
  try {
    const users = getRows_(SHEETS.USERS).filter(r => String(r.email || '').trim());
    if (!users.length) return { email: getUserEmail_(), role: 'ADMIN', firstSetup: true };
  } catch (err) {
    return { email: getUserEmail_(), role: 'ADMIN', firstSetup: true };
  }
  return assertRole_(['ADMIN']);
}
function userCanAccessOffering_(offeringId) {
  const user = getCurrentUser();
  if (user.role === 'ADMIN' || String(user.allowedOfferings || '').trim() === '*') return true;
  const allowed = String(user.allowedOfferings || '').split(',').map(s => s.trim()).filter(Boolean);
  return allowed.indexOf(String(offeringId)) >= 0;
}
function assertOfferingAccess_(offeringId) {
  assertRole_(['ADMIN','TEACHER']);
  if (!offeringId) return true;
  if (!userCanAccessOffering_(offeringId)) throw new Error('You do not have access to offering: ' + offeringId);
  return true;
}
function listActiveOfferings() {
  const termId = getSetting_('ACTIVE_TERM_ID') || APP.ACTIVE_TERM_ID;
  const rows = getRows_(SHEETS.COURSE_OFFERINGS).filter(r => String(r.term_id) === String(termId) && String(r.status) === 'ACTIVE');
  const user = getCurrentUser();
  if (user.role === 'ADMIN' || String(user.allowedOfferings || '').trim() === '*') return rows;
  return rows.filter(r => userCanAccessOffering_(r.offering_id));
}
function getActiveTerm_() { return getSetting_('ACTIVE_TERM_ID') || APP.ACTIVE_TERM_ID; }
function getOffering_(offeringId) { return findOne_(SHEETS.COURSE_OFFERINGS, r => String(r.offering_id) === String(offeringId)); }
function getActiveSource_() {
  const termId = getActiveTerm_();
  return findOne_(SHEETS.SOURCE_FORMS, r => String(r.term_id) === termId && toBool_(r.is_active));
}

function listUiOfferings_() {
  const termId = getActiveTerm_();
  let rows = listActiveOfferings();
  const user = getCurrentUser();

  // Self-healing fallback for ADMIN: if the role filter or stale cache accidentally returns no rows,
  // read the active term offerings directly so the session selector is not blank.
  if (!rows.length && user.role === 'ADMIN') {
    rows = getRows_(SHEETS.COURSE_OFFERINGS).filter(function (r) {
      return String(r.term_id) === String(termId) && String(r.status).toUpperCase() === 'ACTIVE';
    });
  }

  return rows.sort(function (a, b) {
    const ga = Number(a.class_code || 9999), gb = Number(b.class_code || 9999);
    if (ga !== gb) return ga - gb;
    return String(a.course_code || '').localeCompare(String(b.course_code || ''), 'th');
  });
}

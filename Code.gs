function doGet(e) {
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.appName = APP.NAME;
  tpl.version = APP.VERSION;
  return tpl.evaluate()
    .setTitle(APP.NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
function guardedCall_(roles, fn) {
  const args = Array.prototype.slice.call(arguments, 2);
  assertRole_(roles);
  return fn.apply(null, args);
}
function setupGuardedCall_(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  assertSetupOrAdmin_();
  return fn.apply(null, args);
}

function buildBootstrapData_() {
  const diagnostics = { phase: 'bootstrap', errors: [], warnings: [] };
  let user = null;
  try {
    user = getCurrentUser();
  } catch (err) {
    user = { email: getUserEmail_(), displayName: getUserEmail_(), role: 'VIEWER', allowedOfferings: '' };
    diagnostics.errors.push('getCurrentUser failed: ' + err.message);
  }

  let activeTerm = APP.ACTIVE_TERM_ID;
  try {
    activeTerm = getActiveTerm_();
  } catch (err) {
    diagnostics.errors.push('getActiveTerm failed: ' + err.message);
  }

  let sessionDefaults = null;
  try {
    sessionDefaults = getCurrentPeriodInfo_();
  } catch (err) {
    diagnostics.errors.push('period defaults failed: ' + err.message);
    try { sessionDefaults = { date: Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy-MM-dd'), period_no: '', period_label: '', state: 'ERROR', schedule: APP.DEFAULT_PERIOD_SCHEDULE || [] }; } catch(e) {}
  }

  let offerings = [];
  try {
    // The selector must not be a single point of failure. listUiOfferings_ already applies user access rules.
    offerings = listUiOfferings_();
  } catch (err) {
    diagnostics.errors.push('listUiOfferings failed: ' + err.message);
    // Last-resort fallback for diagnostics and UI continuity. This does not expose student data.
    try {
      const rows = getRows_(SHEETS.COURSE_OFFERINGS).filter(function (r) {
        return String(r.term_id) === String(activeTerm) && String(r.status).toUpperCase() === 'ACTIVE';
      });
      if (roleRank_(user.role) >= roleRank_('TEACHER') || String(user.allowedOfferings || '').trim() === '*') {
        offerings = rows;
        diagnostics.warnings.push('Loaded offerings by direct fallback after listUiOfferings failed.');
      }
      diagnostics.directOfferingCount = rows.length;
    } catch (e2) {
      diagnostics.errors.push('direct offering fallback failed: ' + e2.message);
    }
  }

  diagnostics.offeringCount = offerings.length;
  diagnostics.activeTerm = activeTerm;
  diagnostics.role = user.role;
  diagnostics.email = user.email;
  return {
    user: user,
    config: {
      activeTerm: activeTerm,
      appName: APP.NAME,
      version: APP.VERSION,
      reviewPageSize: APP.REVIEW_PAGE_SIZE,
      maxScanRetry: APP.MAX_SCAN_RETRY,
      sessionDefaults: sessionDefaults
    },
    offerings: offerings,
    diagnostics: diagnostics
  };
}

function api_bootstrap() {
  // Bootstrap must be tolerant: if one part fails, the UI still needs diagnostics instead of staying on "Loading...".
  try {
    assertAuthenticated_();
    return ok_(buildBootstrapData_(), 'Bootstrapped');
  } catch (err) {
    return ok_({
      user: { email: 'unknown', displayName: 'unknown', role: 'VIEWER', allowedOfferings: '' },
      config: { activeTerm: APP.ACTIVE_TERM_ID, appName: APP.NAME, version: APP.VERSION, reviewPageSize: APP.REVIEW_PAGE_SIZE, maxScanRetry: APP.MAX_SCAN_RETRY, sessionDefaults: null },
      offerings: [],
      diagnostics: { phase: 'bootstrap', errors: [err.message], warnings: ['Authentication or deployment setting may be incorrect.'], offeringCount: 0 }
    }, 'Bootstrapped with diagnostics');
  }
}

function api_listOfferings() {
  return guardedCall_(['VIEWER'], function () {
    const data = buildBootstrapData_();
    return ok_({ offerings: data.offerings, diagnostics: data.diagnostics, user: data.user }, 'Offerings loaded');
  });
}
function api_diagnoseStartup() {
  return guardedCall_(['VIEWER'], function () {
    const data = buildBootstrapData_();
    let sheetStats = {};
    try {
      [SHEETS.USERS, SHEETS.SYSTEM_CONFIG, SHEETS.CLASSES, SHEETS.COURSE_OFFERINGS, SHEETS.SESSIONS].forEach(function (name) {
        const sh = sh_(name);
        sheetStats[name] = { rows: Math.max(0, sh.getLastRow() - 1), cols: sh.getLastColumn() };
      });
    } catch (err) {
      data.diagnostics.errors.push('sheetStats failed: ' + err.message);
    }
    data.diagnostics.sheetStats = sheetStats;
    return ok_(data.diagnostics, 'Startup diagnostics loaded');
  });
}
function api_getSessionDefaults() { return guardedCall_(['ADMIN','TEACHER'], getSessionDefaults); }

function api_initializeSystem(options) { return setupGuardedCall_(initializeSystem, options || {}); }
function api_detectFormHeaders() { return guardedCall_(['ADMIN','TEACHER'], detectFormHeaders); }
function api_syncNewFormRows() { return guardedCall_(['ADMIN','TEACHER'], syncNewFormRows); }
function api_syncAllFormRows() { return guardedCall_(['ADMIN'], syncAllFormRowsForActiveSource); }
function api_syncAllFormRowsChunk(payload) { return guardedCall_(['ADMIN'], syncAllFormRowsChunk, payload || {}); }
function api_listDiscoveredTopics(payload) { return guardedCall_(['ADMIN','TEACHER'], listDiscoveredTopics, payload || {}); }
function api_createTopicMap(payload) { return guardedCall_(['ADMIN','TEACHER'], createOrUpdateTopicMap, payload || {}); }
function api_previewRetroactiveImport(payload) { return guardedCall_(['ADMIN','TEACHER'], previewRetroactiveImport, payload || {}); }
function api_remapTopic(topicId) { return guardedCall_(['ADMIN','TEACHER'], remapAndScoreExistingSubmissions, topicId); }
function api_startSession(payload) { return guardedCall_(['ADMIN','TEACHER'], startSession, payload || {}); }
function api_closeSession(sessionId) { return guardedCall_(['ADMIN','TEACHER'], closeSession, sessionId); }
function api_getActiveSessions() { return guardedCall_(['ADMIN','TEACHER'], getActiveSessions); }
function api_getScanBootstrap(sessionId) { return guardedCall_(['ADMIN','TEACHER'], getScanBootstrap, sessionId); }
function api_processScanBatch(sessionId, scans) { return guardedCall_(['ADMIN','TEACHER'], processScanBatch, sessionId, scans || []); }
function api_markAbsentForSession(sessionId) { return guardedCall_(['ADMIN','TEACHER'], markAbsentForSession, sessionId); }
function api_listSubmissionsForReview(filters) { return guardedCall_(['ADMIN','TEACHER'], listSubmissionsForReview, filters || {}); }
function api_reviewSubmission(submissionId, action, reason, note) { return guardedCall_(['ADMIN','TEACHER'], reviewSubmission, submissionId, action, reason, note); }
function api_randomBookCheck(sessionId, count) { return guardedCall_(['ADMIN','TEACHER'], randomBookCheck, sessionId, count); }
function api_saveBookCheckResult(payload) { return guardedCall_(['ADMIN','TEACHER'], saveBookCheckResult, payload || {}); }
function api_saveManualScore(payload) { return guardedCall_(['ADMIN','TEACHER'], saveManualScore, payload || {}); }
function api_getDashboardData() { return guardedCall_(['ADMIN','TEACHER'], getDashboardData); }
function api_getGradebook(payload) { return guardedCall_(['ADMIN','TEACHER'], getGradebook, payload || {}); }
function api_regenerateRoomSheets() { return guardedCall_(['ADMIN','TEACHER'], regenerateActiveRoomSheets); }
function api_createTermArchive(termId) { return guardedCall_(['ADMIN'], createTermArchive, termId); }
function api_installSyncTrigger(minutes) { return guardedCall_(['ADMIN'], installTimeDrivenSyncTrigger, minutes || 5); }
function api_autoMapAndReprocessTopics(payload) { return guardedCall_(['ADMIN','TEACHER'], autoMapAndReprocessTopics, payload || {}); }
function api_autoRepairSystem(payload) {
  return guardedCall_(['ADMIN','TEACHER'], function () {
    const a = autoMapAndReprocessTopics(payload || {});
    let rooms = null;
    try { rooms = regenerateActiveRoomSheets(); } catch (err) { rooms = fail_(err.message); }
    return ok_({ autoMap: a.data, roomSheets: rooms && rooms.data ? rooms.data : rooms }, 'Auto repair completed');
  });
}

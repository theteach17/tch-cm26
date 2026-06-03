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

function api_bootstrap() {
  return guardedCall_(['VIEWER'], function () {
    const user = getCurrentUser();
    const activeTerm = getActiveTerm_();
    const offerings = roleRank_(user.role) >= roleRank_('TEACHER') ? listActiveOfferings() : [];
    return ok_({ user, config:{ activeTerm, appName:APP.NAME, version:APP.VERSION, reviewPageSize:APP.REVIEW_PAGE_SIZE, maxScanRetry:APP.MAX_SCAN_RETRY }, offerings }, 'Bootstrapped');
  });
}
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

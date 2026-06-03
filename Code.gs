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
function api_bootstrap() {
  return ok_({ user:getCurrentUser(), config:{ activeTerm:getActiveTerm_(), appName:APP.NAME, version:APP.VERSION }, offerings:getRows_(SHEETS.COURSE_OFFERINGS).filter(o => String(o.term_id) === getActiveTerm_() && String(o.status) === 'ACTIVE') }, 'Bootstrapped');
}
function api_initializeSystem(options) { return initializeSystem(options || {}); }
function api_detectFormHeaders() { return detectFormHeaders(); }
function api_syncNewFormRows() { return syncNewFormRows(); }
function api_syncAllFormRows() { return syncAllFormRowsForActiveSource(); }
function api_listDiscoveredTopics(payload) { return listDiscoveredTopics(payload || {}); }
function api_createTopicMap(payload) { return createOrUpdateTopicMap(payload || {}); }
function api_previewRetroactiveImport(payload) { return previewRetroactiveImport(payload || {}); }
function api_remapTopic(topicId) { return remapAndScoreExistingSubmissions(topicId); }
function api_startSession(payload) { return startSession(payload || {}); }
function api_closeSession(sessionId) { return closeSession(sessionId); }
function api_getActiveSessions() { return getActiveSessions(); }
function api_getScanBootstrap(sessionId) { return getScanBootstrap(sessionId); }
function api_processScanBatch(sessionId, scans) { return processScanBatch(sessionId, scans || []); }
function api_markAbsentForSession(sessionId) { return markAbsentForSession(sessionId); }
function api_listSubmissionsForReview(filters) { return listSubmissionsForReview(filters || {}); }
function api_reviewSubmission(submissionId, action, reason, note) { return reviewSubmission(submissionId, action, reason, note); }
function api_randomBookCheck(sessionId, count) { return randomBookCheck(sessionId, count); }
function api_saveBookCheckResult(payload) { return saveBookCheckResult(payload || {}); }
function api_saveManualScore(payload) { return saveManualScore(payload || {}); }
function api_getDashboardData() { return getDashboardData(); }
function api_getGradebook(payload) { return getGradebook(payload || {}); }
function api_regenerateRoomSheets() { return regenerateActiveRoomSheets(); }
function api_createTermArchive(termId) { return createTermArchive(termId); }
function api_installSyncTrigger(minutes) { return installTimeDrivenSyncTrigger(minutes || 5); }

/* ═══════════════════════════════════════════════════════════════════════ 
 * 19 · DAILY RESET — Daily reset, watchdog and retry mechanisms
 * ═══════════════════════════════════════════════════════════════════════ */ 

const RESET_TITLE_TZ        = "Europe/Zagreb"; 
const RESET_TITLE_BASE_NAME = "WORKFLOW REGISTER"; 

// ── Holiday calendar: dynamic generator by year ──────────────────────── 

const _HR_FIXED_HOLIDAYS_MMDD_ = [ 
  "01-01", "01-06", "05-01", "05-30", "06-22", 
  "08-05", "08-15", "11-01", "11-18", "12-25", "12-26" 
]; 

let _HR_HOLIDAY_CACHE_ = {}; 

function _calcEasterDate_(year) { 
  year = Number(year); 

  const a = year % 19; 
  const b = Math.floor(year / 100); 
  const c = year % 100; 
  const d = Math.floor(b / 4); 
  const e = b % 4; 
  const f = Math.floor((b + 8) / 25); 
  const g = Math.floor((b - f + 1) / 3); 
  const h = (19 * a + b - d - g + 15) % 30; 
  const i = Math.floor(c / 4); 
  const k = c % 4; 
  const l = (32 + 2 * e + 2 * i - h - k) % 7; 
  const m = Math.floor((a + 11 * h + 22 * l) / 451); 

  const month = Math.floor((h + l - 7 * m + 114) / 31); 
  const day   = ((h + l - 7 * m + 114) % 31) + 1; 

  return new Date(year, month - 1, day); 
} 

function _addDays_(date, days) { 
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()); 
  d.setDate(d.getDate() + Number(days || 0)); 
  return d; 
} 
 
function _pad2_(n) { 
  return String(Number(n)).padStart(2, "0"); 
} 

function _dateKeyYmd_(d) { 
  return d.getFullYear() + "-" + _pad2_(d.getMonth() + 1) + "-" + _pad2_(d.getDate()); 
} 

function _croatianHolidayKeysForYear_(year) { 
  year = Number(year); 

  if (_HR_HOLIDAY_CACHE_[year]) return _HR_HOLIDAY_CACHE_[year]; 

  const set = new Set(); 
  _HR_FIXED_HOLIDAYS_MMDD_.forEach(mmdd => set.add(year + "-" + mmdd)); 

  const easter = _calcEasterDate_(year); 

  set.add(_dateKeyYmd_(easter)); 
  set.add(_dateKeyYmd_(_addDays_(easter, 1))); 
  set.add(_dateKeyYmd_(_addDays_(easter, 60))); 

  _HR_HOLIDAY_CACHE_[year] = set; 
  return set; 
} 

function _dateOnly_(d) { 
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0); 
} 

function _fmtYmd_(d) { 
  return Utilities.formatDate(_dateOnly_(d), RESET_TITLE_TZ, "yyyy-MM-dd"); 
} 

function _isWeekend_(d) { 
  const day = d.getDay(); 
  return day === 0 || day === 6; 
} 

function _isHolidayHr_(d) { 
  const dd = _dateOnly_(d); 
  return _croatianHolidayKeysForYear_(dd.getFullYear()).has(_dateKeyYmd_(dd)); 
} 

function _isWorkdayHr_(d) { 
  return !_isWeekend_(d) && !_isHolidayHr_(d); 
} 

function _nextWorkdayHr_(fromDate) { 
  const parts = Utilities.formatDate(fromDate, "Europe/Paris", "yyyy-MM-dd").split("-"); 
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0); 

  while (!_isWorkdayHr_(d)) d.setDate(d.getDate() + 1); 

  return d; 
} 

function _setA1AndRenameToWorkday_(sheet, workDate) { 
  const safeDate = new Date( 
    workDate.getFullYear(), 
    workDate.getMonth(), 
    workDate.getDate(), 
    12, 0, 0 
  ); 

  sheet.getRange("A1") 
    .setValue(safeDate) 
    .setNumberFormat("dd.MM.yyyy.") 
    .setFontSize(12); 

  const ss        = sheet.getParent(); 
  const titleDate = Utilities.formatDate(safeDate, RESET_TITLE_TZ, "dd.MM.yyyy."); 
  const fullName  = titleDate + " " + RESET_TITLE_BASE_NAME; 

  try { 
    ss.rename(fullName); 
  } catch (e) { 
    try { 
      DriveApp.getFileById(ss.getId()).setName(fullName); 
    } catch (e2) {} 
  } 
} 

function _todayKey_() { 
  return Utilities.formatDate(new Date(), "Europe/Zagreb", "yyyy-MM-dd"); 
} 

/**
 * Minimal pre-reset guard:
 * - clears onEdit intent
 * - sets reset-in-progress flag
 * - clears pending markers
 *
 * Intentionally does not delete EDIT_QUEUE_KEY.
 * The queue remains alive so edits made just before or during reset are not lost.
 */
function _resetClearInterference_(props) { 
  try { props.deleteProperty(ONEDIT_INTENT_KEY); } catch (e) {} 
  try { props.setProperty(RESET_IN_PROGRESS_KEY, String(Date.now())); } catch (e) {} 

  [ 
    "pending_resetirajDnevnuMemoriju", 
    "pending_provjeriVrijemeCekanja", 
    "pending_cistacFormataGotovihPacijenata", 
    "pending_obradiEditQueue" 
  ].forEach(k => { 
    try { props.deleteProperty(k); } catch (e) {} 
  }); 
} 

/**
 * Clears only daily memory that must be removed.
 *
 * Important:
 * - vrijeme_id_* is deleted
 * - cek_* is deleted
 * - pending_* is deleted
 * - EDIT_QUEUE_KEY is not deleted
 *
 * This keeps reset from fighting the edit queue mechanism.
 */
function _resetDailyCore_(props) { 
  for (const k of Object.keys(props.getProperties())) { 
    if ( 
      k.startsWith("vrijeme_id_") || 
      k.startsWith("cek_") || 
      k.startsWith("pending_") 
    ) { 
      props.deleteProperty(k); 
    } 
  } 

  resetirajTablicuZaNoviDan_(); 
  SpreadsheetApp.flush(); 
} 

function resetirajTablicuZaNoviDan_() { 
  const sheet = _requireTargetSheet_(); 

  try { 
    sheet.getBandings().forEach(b => { 
      try { b.remove(); } catch (e) {} 
    }); 
  } catch (e) {} 

  const workDate = _nextWorkdayHr_(new Date()); 

  try { 
    _setA1AndRenameToWorkday_(sheet, workDate); 
  } catch (e) {} 

  const lastCol = STUPAC_SYS_SIG; 
  const endRow  = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 

  if (endRow < 2) return; 

  const n         = endRow - 1; 
  const dataRange = sheet.getRange(2, 1, n, lastCol); 

  dataRange.clearContent() 
    .clearNote() 
    .setFontFamily("Arial") 
    .setFontColor("black") 
    .setFontWeight("normal") 
    .setFontStyle("normal") 
    .setFontSize(12) 
    .setFontLine("none") 
    .setVerticalAlignment("bottom") 
    .setWrap(true) 
    .setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID); 
 
  const headerBgs = sheet.getRange(1, 1, 1, lastCol).getBackgrounds()[0]; 
  const oneRowBgs = Array.from({ length: lastCol }, (_, i) => 
    (i >= 3 && i <= 6) ? (headerBgs[i] || "white") : "white" 
  ); 

  dataRange.setBackgrounds(Array.from({ length: n }, () => oneRowBgs.slice())); 

  sheet.getRange(2, 1, n, 1) 
    .setValues(Array.from({ length: n }, (_, i) => [i + 1])) 
    .setBackground("white") 
    .setVerticalAlignment("bottom"); 

  sheet.getRange(2, STUPAC_B, n, STUPAC_ID - STUPAC_B + 1) 
    .setHorizontalAlignment("left"); 

  try { 
    sheet.setRowHeights(2, n, 90); 
  } catch (e) {} 
} 

function _clearResetRetryTriggers_() { 
  ScriptApp.getProjectTriggers() 
    .filter(t => t.getHandlerFunction && t.getHandlerFunction() === "resetirajDnevnuMemoriju_RETRY") 
    .forEach(t => { 
      try { ScriptApp.deleteTrigger(t); } catch (e) {} 
    }); 
} 

function _hasResetRetryTrigger_() { 
  return ScriptApp.getProjectTriggers() 
    .some(t => t.getHandlerFunction && t.getHandlerFunction() === "resetirajDnevnuMemoriju_RETRY"); 
} 

function _scheduleResetRetry_() { 
  if (_hasResetRetryTrigger_()) return; 

  ScriptApp.newTrigger("resetirajDnevnuMemoriju_RETRY") 
    .timeBased() 
    .after(RESET_RETRY_DELAY_MIN * 60000) 
    .create(); 

  console.log("Scheduled reset retry in " + RESET_RETRY_DELAY_MIN + " min"); 
} 

/**
 * Main daily reset.
 *
 * The lock is held only around the actual reset work.
 * The edit queue is intentionally preserved.
 */
function resetirajDnevnuMemoriju() { 
  const props = PropertiesService.getScriptProperties(); 

  props.setProperty(RESET_IN_PROGRESS_KEY, String(Date.now())); 
  props.setProperty(RESET_RETRY_DATE_KEY, _todayKey_()); 
  props.setProperty(RESET_RETRY_COUNT_KEY, "0"); 

  _clearResetRetryTriggers_(); 
  _resetClearInterference_(props); 

  const lock = LockService.getDocumentLock(); 
  let got = false; 

  try { 
    lock.waitLock(30000); 
    got = true; 

    console.log("resetirajDnevnuMemoriju start"); 
    _resetDailyCore_(props); 
    console.log("resetirajDnevnuMemoriju done"); 

    _clearResetRetryTriggers_(); 
  } catch (e) { 
    console.error("resetirajDnevnuMemoriju error:", e && e.stack ? e.stack : e); 
    _scheduleResetRetry_(); 
  } finally { 
    try { props.deleteProperty(RESET_IN_PROGRESS_KEY); } catch (e) {} 

    if (got) { 
      try { lock.releaseLock(); } catch (e) {} 
    } 
  } 
} 

function resetirajDnevnuMemoriju_RETRY() { 
  _clearResetRetryTriggers_(); 

  const props = PropertiesService.getScriptProperties(); 
  props.setProperty(RESET_IN_PROGRESS_KEY, String(Date.now())); 

  if (props.getProperty(RESET_RETRY_DATE_KEY) !== _todayKey_()) { 
    try { props.deleteProperty(RESET_IN_PROGRESS_KEY); } catch (e) {} 
    return; 
  } 

  const n = Number(props.getProperty(RESET_RETRY_COUNT_KEY) || "0") + 1; 
  props.setProperty(RESET_RETRY_COUNT_KEY, String(n)); 

  if (n > RESET_RETRY_MAX) { 
    console.log("Reset retry max reached"); 
    try { props.deleteProperty(RESET_IN_PROGRESS_KEY); } catch (e) {} 
    return; 
  } 

  console.log("Reset retry " + n + "/" + RESET_RETRY_MAX); 
  _resetClearInterference_(props); 

  const lock = LockService.getDocumentLock(); 
  let got = false; 

  try { 
    lock.waitLock(30000); 
    got = true; 

    _resetDailyCore_(props); 
    console.log("Reset retry succeeded"); 
    _clearResetRetryTriggers_(); 
  } catch (e) { 
    console.error("Reset retry error:", e && e.stack ? e.stack : e); 
    _scheduleResetRetry_(); 
  } finally { 
    try { props.deleteProperty(RESET_IN_PROGRESS_KEY); } catch (e) {} 

    if (got) { 
      try { lock.releaseLock(); } catch (e) {} 
    } 
  } 
} 

/**
 * Force reset.
 *
 * The edit queue is still preserved.
 * The goal is to avoid conflict with the edit queue mechanism.
 */
function resetirajDnevnuMemoriju_FORCE() { 
  const props = PropertiesService.getScriptProperties(); 

  _clearResetRetryTriggers_(); 
  props.setProperty(RESET_IN_PROGRESS_KEY, String(Date.now())); 

  [ 
    ONEDIT_INTENT_KEY, 
    "pending_resetirajDnevnuMemoriju", 
    "pending_provjeriVrijemeCekanja", 
    "pending_cistacFormataGotovihPacijenata", 
    "pending_obradiEditQueue" 
  ].forEach(k => { 
    try { props.deleteProperty(k); } catch (e) {} 
  }); 

  const lock = LockService.getDocumentLock(); 
  lock.waitLock(30000); 

  try { 
    console.log("Force reset start"); 

    for (const k of Object.keys(props.getProperties())) { 
      if ( 
        k.startsWith("vrijeme_id_") || 
        k.startsWith("cek_") || 
        k.startsWith("pending_") 
      ) { 
        props.deleteProperty(k); 
      } 
    } 

    resetirajTablicuZaNoviDan_(); 
    SpreadsheetApp.flush(); 

    console.log("Force reset done"); 
  } finally { 
    try { props.deleteProperty(RESET_IN_PROGRESS_KEY); } catch (e) {} 
    try { lock.releaseLock(); } catch (e) {} 
  } 
} 

function resetWatchdog_0630() { 
  const ss = _getSpreadsheet_(); 
  const sh = ss ? ss.getSheetByName(TARGET_SHEET_NAME) : null; 

  if (!sh) return; 

  const expected    = _nextWorkdayHr_(new Date()); 
  const expectedKey = _fmtYmd_(expected); 

  let a1ok = false; 

  try { 
    const v = sh.getRange("A1").getValue(); 

    if (v instanceof Date && !isNaN(v.getTime())) { 
      a1ok = (_fmtYmd_(v) === expectedKey); 
    } else { 
      const a1 = sh.getRange("A1").getDisplayValue(); 
      const m  = a1.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); 

      if (m) { 
        a1ok = ( 
          m[3] + "-" + 
          String(m[2]).padStart(2, "0") + "-" + 
          String(m[1]).padStart(2, "0") 
        ) === expectedKey; 
      } 
    } 
  } catch (e) {} 

  const hasData = sh.getRange(2, 1, 1, STUPAC_ID).getDisplayValues()[0] 
    .slice(1) 
    .some(v => String(v || "").trim() !== ""); 

  if (!a1ok || hasData) resetirajDnevnuMemoriju_FORCE(); 

  try { 
    _cistiOrphanedVrijemeKeys_(); 
  } catch (e) {} 
} 

// ── Holiday toast ────────────────────────────────────────────────────── 

const HOLIDAY_TOAST_DURATION_SEC = 10; 

function _getHolidayMetaByDate_(d) { 
  const dd   = _dateOnly_(d); 
  const year = dd.getFullYear(); 
  const key  = _dateKeyYmd_(dd); 
  const mmdd = _pad2_(dd.getMonth() + 1) + "-" + _pad2_(dd.getDate()); 

  const easter           = _calcEasterDate_(year); 
  const easterKey        = _dateKeyYmd_(easter); 
  const easterMondayKey  = _dateKeyYmd_(_addDays_(easter, 1)); 
  const corpusChristiKey = _dateKeyYmd_(_addDays_(easter, 60)); 

  if (key === easterKey)        return { code: "EASTER",         name: "Easter",          kind: "christian" }; 
  if (key === easterMondayKey)  return { code: "EASTER_MONDAY",  name: "Easter Monday",   kind: "christian", ignoreGreeting: true }; 
  if (key === corpusChristiKey) return { code: "CORPUS_CHRISTI", name: "Corpus Christi",  kind: "christian" }; 

  const fixed = { 
    "01-01": { code: "NEW_YEAR",         name: "New Year",        kind: "state" }, 
    "01-06": { code: "EPIPHANY",         name: "Epiphany",        kind: "christian" }, 
    "05-01": { code: "LABOUR_DAY",       name: "Labour Day",      kind: "state" }, 
    "05-30": { code: "STATEHOOD_DAY",    name: "Statehood Day",   kind: "state" }, 
    "06-22": { code: "ANTI_FASCIST_DAY", name: "Memorial Day",    kind: "state" }, 
    "08-05": { code: "VICTORY_DAY",      name: "Victory Day",     kind: "state" }, 
    "08-15": { code: "ASSUMPTION",       name: "Assumption",      kind: "christian" }, 
    "11-01": { code: "ALL_SAINTS",       name: "All Saints",      kind: "christian" }, 
    "11-18": { code: "REMEMBRANCE_DAY",  name: "Remembrance Day", kind: "state_piety" }, 
    "12-25": { code: "CHRISTMAS",        name: "Christmas",       kind: "christian" }, 
    "12-26": { code: "ST_STEPHEN",       name: "St Stephen",      kind: "christian", combineWith: "CHRISTMAS", ignoreGreeting: true } 
  }; 

  return fixed[mmdd] || null; 
} 

function _collectUpcomingNonWorkdayHolidayMetas_(fromDate) { 
  const metas = []; 
  let cursor  = _addDays_(_dateOnly_(fromDate), 1); 
  let safety  = 0; 

  while (!_isWorkdayHr_(cursor) && safety < 10) { 
    if (_isHolidayHr_(cursor)) { 
      const meta = _getHolidayMetaByDate_(cursor); 
      if (meta) metas.push(meta); 
    } 

    cursor = _addDays_(cursor, 1); 
    safety++; 
  } 

  return metas; 
} 

function _resolveHolidayGreetingMeta_(metas) { 
  if (!metas || !metas.length) return null; 

  const codes = new Set(metas.map(m => m.code)); 

  if (codes.has("CHRISTMAS")) return { code: "CHRISTMAS_COMBINED" }; 

  const filtered = metas.filter(m => !m.ignoreGreeting); 

  return filtered.length ? filtered[0] : null; 
} 

function _buildHolidayGreetingPayload_(meta) { 
  if (!meta || !meta.code) return null; 

  const DEFAULT_TITLE = "Holiday notice"; 

  const MAP = { 
    EPIPHANY:           { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Epiphany." }, 
    EASTER:             { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Easter." }, 
    CORPUS_CHRISTI:     { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Corpus Christi." }, 
    ASSUMPTION:         { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Assumption." }, 
    ALL_SAINTS:         { title: DEFAULT_TITLE, message: "Upcoming holiday notice: All Saints." }, 
    CHRISTMAS_COMBINED: { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Christmas period." }, 
    REMEMBRANCE_DAY:    { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Remembrance Day." }, 
    NEW_YEAR:           { title: DEFAULT_TITLE, message: "Upcoming holiday notice: New Year." }, 
    LABOUR_DAY:         { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Labour Day." }, 
    STATEHOOD_DAY:      { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Statehood Day." }, 
    ANTI_FASCIST_DAY:   { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Memorial Day." }, 
    VICTORY_DAY:        { title: DEFAULT_TITLE, message: "Upcoming holiday notice: Victory Day." } 
  }; 

  return MAP[meta.code] || null; 
} 

function _getHolidayToastPayloadForDate_(date) { 
  const today = _dateOnly_(date); 
  if (!_isWorkdayHr_(today)) return null; 

  const metas = _collectUpcomingNonWorkdayHolidayMetas_(today); 
  if (!metas.length) return null; 

  const greetingMeta = _resolveHolidayGreetingMeta_(metas); 
  if (!greetingMeta) return null; 

  return _buildHolidayGreetingPayload_(greetingMeta); 
} 

function _maybeShowHolidayGreetingToast_() { 
  try { 
    const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
    if (!ss) return; 

    const payload = _getHolidayToastPayloadForDate_(new Date()); 
    if (!payload || !payload.message) return; 

    ss.toast( 
      payload.message, 
      payload.title || "Holiday", 
      HOLIDAY_TOAST_DURATION_SEC 
    ); 
  } catch (e) { 
    console.error("_maybeShowHolidayGreetingToast_ error:", e && e.stack ? e.stack : e); 
  } 
} 

// ── Orphaned key cleanup ─────────────────────────────────────────────── 

function _cistiOrphanedVrijemeKeys_() { 
  try { 
    const props = PropertiesService.getScriptProperties(); 
    const sheet = _getTargetSheet_(); 

    if (!sheet) return; 

    const vrijemeKeys = Object.keys(props.getProperties()).filter(k => k.startsWith("vrijeme_id_")); 
    if (!vrijemeKeys.length) return; 

    const hardMax = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
    if (hardMax < 2) return; 

    const idVals    = sheet.getRange(2, STUPAC_ID, hardMax - 1, 1).getValues(); 
    const activeIds = new Set(); 

    for (const row of idVals) { 
      const id = String(row[0] || "").trim(); 
      if (id) activeIds.add(id); 
    } 

    let deleted = 0; 
    const cache = CacheService.getScriptCache(); 

    for (const key of vrijemeKeys) { 
      const uuid = key.substring("vrijeme_id_".length); 

      if (!activeIds.has(uuid)) { 
        props.deleteProperty(key); 

        try { 
          cache.remove("t_" + key); 
        } catch (e) {} 

        deleted++; 
      } 
    } 

    if (deleted > 0) { 
      console.log("Orphan cleanup: deleted " + deleted + " orphaned vrijeme_id_* keys"); 
    } 
  } catch (e) { 
    console.error("_cistiOrphanedVrijemeKeys_ error:", e); 
  } 
} 

// ── PropertiesService diagnostics ────────────────────────────────────── 

function dijagnostikaPropertiesService() { 
  const props   = PropertiesService.getScriptProperties(); 
  const allData = props.getProperties(); 
  const keys    = Object.keys(allData); 

  let totalBytes = 0; 

  keys.forEach(k => { 
    totalBytes += k.length + String(allData[k]).length; 
  }); 

  const categories = { 
    "vrijeme_id_*":    { count: 0, bytes: 0 }, 
    "cek_*":           { count: 0, bytes: 0 }, 
    "edit_queue":      { count: 0, bytes: 0 }, 
    "sport_*":         { count: 0, bytes: 0 }, 
    "pending_*":       { count: 0, bytes: 0 }, 
    "oftPrompt_*":     { count: 0, bytes: 0 }, 
    "fakturaPrompt_*": { count: 0, bytes: 0 }, 
    "config/system":   { count: 0, bytes: 0 }, 
    "other":           { count: 0, bytes: 0 } 
  }; 

  for (const k of keys) { 
    const size = k.length + String(allData[k]).length; 
    let cat = "other"; 

    if      (k.startsWith("vrijeme_id_"))    cat = "vrijeme_id_*"; 
    else if (k.startsWith("cek_"))           cat = "cek_*"; 
    else if (k === EDIT_QUEUE_KEY)           cat = "edit_queue"; 
    else if (k.startsWith("sport_"))         cat = "sport_*"; 
    else if (k.startsWith("pending_"))       cat = "pending_*"; 
    else if (k.startsWith("oftPrompt_"))     cat = "oftPrompt_*"; 
    else if (k.startsWith("fakturaPrompt_")) cat = "fakturaPrompt_*"; 
    else if ([ 
      "SPREADSHEET_ID_BOUND", 
      QUIET_OVERRIDE_UNTIL_KEY, 
      SPORT_WAIT_ENABLED_KEY, 
      REPORT_INTERRUPT_UNTIL_KEY, 
      RESET_IN_PROGRESS_KEY, 
      RESET_RETRY_DATE_KEY, 
      RESET_RETRY_COUNT_KEY, 
      ONEDIT_INTENT_KEY 
    ].includes(k)) cat = "config/system"; 

    categories[cat].count++; 
    categories[cat].bytes += size; 
  } 

  let queueItems = 0; 
  let queueBytes = 0; 

  const queueJson = allData[EDIT_QUEUE_KEY]; 

  if (queueJson) { 
    queueBytes = queueJson.length; 

    try { 
      queueItems = Object.keys(JSON.parse(queueJson)).length; 
    } catch (e) {} 
  } 

  const today = _todayZg_(); 

  let staleCek = 0; 
  let staleOft = 0; 
  let staleFak = 0; 

  for (const k of keys) { 
    if (k.startsWith("cek_")           && !k.startsWith("cek_" + today)) staleCek++; 
    if (k.startsWith("oftPrompt_")     && !k.includes("_" + today + "_")) staleOft++; 
    if (k.startsWith("fakturaPrompt_") && !k.includes("_" + today + "_")) staleFak++; 
  } 

  const totalStale = staleCek + staleOft + staleFak; 

  const LIMIT_TOTAL = 500 * 1024; 
  const LIMIT_KEY   = 9 * 1024; 
  const pct         = ((totalBytes / LIMIT_TOTAL) * 100).toFixed(1); 

  let report = "═══════════════════════════════════════════\n"; 
  report    += "   PropertiesService diagnostics\n"; 
  report    += "═══════════════════════════════════════════\n\n"; 
  report    += "TOTAL:\n"; 
  report    += "   Keys:      " + keys.length + "\n"; 
  report    += "   Size:      " + _formatBytes_(totalBytes) + " / 500 KB  (" + pct + "%)\n"; 
  report    += "   Status:    " + 
    ( 
      totalBytes > LIMIT_TOTAL * 0.8 ? "WARNING — close to limit" 
      : totalBytes > LIMIT_TOTAL * 0.5 ? "Moderate" 
      : "OK" 
    ) + "\n\n"; 

  report += "BY CATEGORY:\n"; 
  report += "   ─────────────────────────────────────────\n"; 

  for (const [catName, data] of Object.entries(categories)) { 
    if (data.count === 0) continue; 

    const catPct = ((data.bytes / LIMIT_TOTAL) * 100).toFixed(1); 

    report += 
      "   " + catName.padEnd(20) + " " + 
      String(data.count).padStart(4) + " key(s)   " + 
      _formatBytes_(data.bytes).padStart(8) + "  (" + catPct + "%)\n"; 
  } 

  report += "\n"; 

  if (queueJson) { 
    const qPct = ((queueBytes / LIMIT_KEY) * 100).toFixed(1); 

    report += "EDIT QUEUE DETAILS:\n"; 
    report += "   Items:     " + queueItems + " / " + EDIT_QUEUE_MAX_V2 + "\n"; 
    report += "   Size:      " + _formatBytes_(queueBytes) + " / 9 KB  (" + qPct + "%)\n"; 
    report += "   Status:    " + 
      ( 
        queueBytes > LIMIT_KEY * 0.8 ? "WARNING" 
        : queueBytes > LIMIT_KEY * 0.5 ? "Moderate" 
        : "OK" 
      ) + "\n\n"; 
  } 

  if (totalStale > 0) { 
    report += "STALE KEYS FROM PREVIOUS DAYS:\n"; 

    if (staleCek) report += "   cek_*:           " + staleCek + "\n"; 
    if (staleOft) report += "   oftPrompt_*:     " + staleOft + "\n"; 
    if (staleFak) report += "   fakturaPrompt_*: " + staleFak + "\n"; 

    report += "   → Automatically cleaned through processEditQueue, throttled by cache.\n\n"; 
  } 

  report += "═══════════════════════════════════════════\n"; 

  SpreadsheetApp.getUi().alert( 
    "PropertiesService diagnostics", 
    report, 
    SpreadsheetApp.getUi().ButtonSet.OK 
  ); 

  console.log(report); 
} 

function _formatBytes_(bytes) { 
  if (bytes < 1024) return bytes + " B"; 
  return (bytes / 1024).toFixed(1) + " KB"; 
}

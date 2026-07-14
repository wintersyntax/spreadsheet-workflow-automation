/* ═══════════════════════════════════════════════════════════════════════ 
 * 05 · SHORT WAIT — Short waiting-time configuration and activation
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _isSportWaitEnabled_() { 
  try { 
    const val = PropertiesService.getScriptProperties().getProperty(SPORT_WAIT_ENABLED_KEY); 
    return val === null ? true : (val === "true" || val === "1"); 
  } catch (e) { 
    return true; 
  } 
} 

function _isSportWaitCurrentlyActive_() { 
  if (!_isSportWaitEnabled_()) return false; 

  const now = new Date(); 

  // On workdays, the short-wait workflow is only checked before 15:00.
  if (_isWorkdayHr_(now)) { 
    const hour   = _zgHour_(); 
    const minute = _zgMinute_(); 

    if (hour > 15) return false; 
    if (hour === 15 && minute >= 0) return false; 
  } 

  return true; 
} 

function enableSportWait() { 
  PropertiesService.getScriptProperties().setProperty(SPORT_WAIT_ENABLED_KEY, "true"); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Short-wait workflow enabled", "ON", 5); 
} 

function disableSportWait() { 
  PropertiesService.getScriptProperties().setProperty(SPORT_WAIT_ENABLED_KEY, "false"); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Short-wait workflow disabled", "OFF", 5); 
} 

function toggleSportWait() { 
  _isSportWaitEnabled_() ? disableSportWait() : enableSportWait(); 
}

/* ═══════════════════════════════════════════════════════════════════════ 
 * 04 · QUIET HOURS — Night-mode execution handling
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _isQuietOverrideActive_() { 
  try { 
    const until = Number(PropertiesService.getScriptProperties().getProperty(QUIET_OVERRIDE_UNTIL_KEY) || 0); 
    return !!(until && Date.now() < until); 
  } catch (e) { 
    return false; 
  } 
} 

function _isQuietHours_() { 
  if (_isQuietOverrideActive_()) return false; 

  const h = _zgHour_(); 
  return (h >= QUIET_HOURS_START_H || h < QUIET_HOURS_END_H); 
} 

function disableQuietHoursFor(minutes) { 
  minutes = Math.max(1, Number(minutes) || 30); 

  PropertiesService.getScriptProperties()
    .setProperty(QUIET_OVERRIDE_UNTIL_KEY, String(Date.now() + minutes * 60 * 1000)); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Quiet hours disabled for " + minutes + " min", "🌙➡️☀️", 5); 
} 

/**
 * Backwards-compatible alias from the original implementation.
 */
function ugasiQuietHoursNa(minuta) { 
  return disableQuietHoursFor(minuta); 
} 

function disableQuietHoursFor15() { disableQuietHoursFor(15); } 
function disableQuietHoursFor30() { disableQuietHoursFor(30); } 
function disableQuietHoursFor60() { disableQuietHoursFor(60); } 

/**
 * Backwards-compatible aliases from the original implementation.
 */
function ugasiQuietHours15() { return disableQuietHoursFor15(); } 
function ugasiQuietHours30() { return disableQuietHoursFor30(); } 
function ugasiQuietHours60() { return disableQuietHoursFor60(); } 

function restoreQuietHoursNow() { 
  PropertiesService.getScriptProperties().deleteProperty(QUIET_OVERRIDE_UNTIL_KEY); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Quiet hours restored to default", "🌙", 5); 
} 

/**
 * Backwards-compatible alias from the original implementation.
 */
function vratiQuietHoursOdmah() { 
  return restoreQuietHoursNow(); 
}

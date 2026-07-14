/* ═══════════════════════════════════════════════════════════════════════ 
 * 15 · HANDLER B — Time handling and persistence in column B
 * ═══════════════════════════════════════════════════════════════════════ */ 
 
function _handleBCellTimeLite_(sheet, ctx, patch) { 
  const row = ctx.row; 
  const currentText = String(_ctxVal_(ctx, STUPAC_B) || "").trim(); 

  if (!currentText) return; 

  const cellId = sheet.getRange(row, STUPAC_ID); 
  let rowId = String(cellId.getValue() || "").trim(); 

  if (!rowId) { 
    rowId = Utilities.getUuid(); 
    _patchSetValue_(patch, STUPAC_ID, rowId); 
    _patchSetFontColor_(patch, STUPAC_ID, "black"); 
  } 

  const keyProp  = "time_id_" + rowId; 
  const keyCache = "t_" + keyProp; 
  const cache    = CacheService.getScriptCache(); 

  let storedTime = cache.get(keyCache); 

  if (storedTime === null) { 
    storedTime = memorijaSkripte.getProperty(keyProp) || ""; 

    if (storedTime) { 
      cache.put(keyCache, storedTime, TIME_CACHE_TTL_SEC); 
    } 
  } 

  storedTime = String(storedTime || "").trim(); 

  const oldMatch = storedTime.match(REGEX_VRIJEME_HHMM); 
  const oldTime = oldMatch ? oldMatch[0] : ""; 

  const currentMatch = currentText.match(REGEX_VRIJEME_HHMM); 
  const hasTimeInText = !!currentMatch; 

  if (!hasTimeInText) { 
    const timeToAppend = oldTime || Utilities.formatDate(new Date(), "Europe/Zagreb", "HH:mm"); 
    const finalText = (currentText + " " + timeToAppend).trim(); 

    _ctxSetVal_(ctx, STUPAC_B, finalText); 
    _patchSetValue_(patch, STUPAC_B, finalText); 

    memorijaSkripte.setProperty(keyProp, timeToAppend); 
    cache.put(keyCache, timeToAppend, TIME_CACHE_TTL_SEC); 

    return; 
  } 

  const newTime = currentMatch[0]; 

  memorijaSkripte.setProperty(keyProp, newTime); 
  cache.put(keyCache, newTime, TIME_CACHE_TTL_SEC); 
} 
 
// Legacy wrapper.
function _handleBCellTime_(sheet, row, rangeB) { 
  const ctx   = _buildRowContextLite_(sheet, row, STUPAC_B, false, rangeB.getDisplayValue()); 
  const patch = _newRowPatch_(); 

  _handleBCellTimeLite_(sheet, ctx, patch); 
  _applyRowPatchLite_(sheet, row, patch); 
}

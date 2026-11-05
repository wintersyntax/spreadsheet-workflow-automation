/* ═══════════════════════════════════════════════════════════════════════ 
 * 07 · EDIT QUEUE — Deferred edit-event processing queue
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _queueKey_(sheetId, row, col) { 
  return sheetId + "!" + row + "!" + col; 
} 

function _safeParseQueueJson_(json) { 
  try { 
    const q = json ? JSON.parse(json) : {}; 
    return (q && typeof q === "object") ? q : {}; 
  } catch (e) { 
    return {}; 
  } 
} 

function _parseQueueEntry_(entry) { 
  if (typeof entry === "string") { 
    const sep = entry.indexOf("|"); 
    if (sep === -1) return { t: Number(entry) || 0 }; 
    return { t: Number(entry.substring(0, sep)) || 0 }; 
  } 

  if (entry && typeof entry === "object") return { t: Number(entry.t) || 0 }; 

  return { t: 0 }; 
} 

function _serializeQueueEntry_(timestamp) { 
  return String(timestamp); 
} 

function _enqueueEdit_(sheet, range) { 
  try { 
    const row = range.getRow(); 
    if (row <= 1) return false; 

    const sk = LockService.getScriptLock(); 
    let got = false; 

    try { 
      got = sk.tryLock(EDIT_QUEUE_LOCK_MS); 
    } catch (e) {} 

    if (!got) { 
      console.error("_enqueueEdit_: ScriptLock timeout, row=" + row + ", col=" + range.getColumn()); 
      return false; 
    } 

    try { 
      const props = PropertiesService.getScriptProperties(); 
      let q = _safeParseQueueJson_(props.getProperty(EDIT_QUEUE_KEY)); 

      const key = _queueKey_(sheet.getSheetId(), row, range.getColumn()); 
      q[key] = _serializeQueueEntry_(Date.now()); 

      let keys = Object.keys(q); 

      if (keys.length > EDIT_QUEUE_MAX_V2) { 
        keys.sort((a, b) => _parseQueueEntry_(q[b]).t - _parseQueueEntry_(q[a]).t); 

        const nq = {}; 
        keys.slice(0, EDIT_QUEUE_MAX_V2).forEach(k => (nq[k] = q[k])); 
        q = nq; 
      } 

      props.setProperty(EDIT_QUEUE_KEY, JSON.stringify(q)); 
      return true; 
    } finally { 
      try { 
        sk.releaseLock(); 
      } catch (e2) {} 
    } 
  } catch (e) { 
    console.error("_enqueueEdit_ error:", e && e.stack ? e.stack : e); 
    return false; 
  } 
} 

function _dequeueEditsBatch_(maxN) { 
  const sk = LockService.getScriptLock(); 

  if (!sk.tryLock(EDIT_QUEUE_LOCK_MS)) return []; 

  try { 
    const props = PropertiesService.getScriptProperties(); 
    const json  = props.getProperty(EDIT_QUEUE_KEY); 

    if (!json) return []; 

    const q    = _safeParseQueueJson_(json); 
    const keys = Object.keys(q); 

    if (!keys.length) return []; 

    keys.sort((a, b) => _parseQueueEntry_(q[a]).t - _parseQueueEntry_(q[b]).t); 

    const batchKeys = keys.slice(0, Math.max(1, Number(maxN) || EDIT_WORK_BATCH)); 
    const batch     = batchKeys.map(k => ({ key: k, t: _parseQueueEntry_(q[k]).t })); 

    batchKeys.forEach(k => delete q[k]); 

    Object.keys(q).length 
      ? props.setProperty(EDIT_QUEUE_KEY, JSON.stringify(q)) 
      : props.deleteProperty(EDIT_QUEUE_KEY); 

    return batch; 
  } catch (e) { 
    console.error("_dequeueEditsBatch_ error:", e && e.stack ? e.stack : e); 
    return []; 
  } finally { 
    try { 
      sk.releaseLock(); 
    } catch (e2) {} 
  } 
} 

function _proaktivnoCistiStaleProperties_() { 
  const cache = CacheService.getScriptCache(); 

  if (cache.get(PROPS_CLEANUP_THROTTLE_KEY)) return; 

  cache.put(PROPS_CLEANUP_THROTTLE_KEY, "1", PROPS_CLEANUP_THROTTLE_SEC); 

  try { 
    const props   = PropertiesService.getScriptProperties(); 
    const allKeys = Object.keys(props.getProperties()); 
    const today   = _todayZg_(); 

    let deleted = 0; 

    for (const key of allKeys) { 
      if (key.startsWith("cek_") && !key.startsWith("cek_" + today)) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 

      if (key.startsWith("oftPrompt_") && !key.includes("_" + today + "_")) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 

      if (key.startsWith("fakturaPrompt_") && !key.includes("_" + today + "_")) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 

      if (key.startsWith("ugovorPrompt_") && !key.includes("_" + today + "_")) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 

      if (key.startsWith("ugovorAsked_") && !key.endsWith("_" + today)) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 

      if (key.startsWith("ugovorDecision_") && !key.endsWith("_" + today)) { 
        props.deleteProperty(key); 
        deleted++; 
        continue; 
      } 
    } 

    if (deleted > 0) {
      console.log("Proactive cleanup: deleted " + deleted + " stale property keys."); 
    }

    // Cleanup for stale notification records.
    try { 
      _najavaCleanupStale_(); 
    } catch (eN) { 
      console.error("_najavaCleanupStale_ call error:", eN && eN.stack ? eN.stack : eN); 
    } 
  } catch (e) { 
    console.error("_proaktivnoCistiStaleProperties_ error:", e && e.stack ? e.stack : e); 
  } 
} 

function processEditQueue() { 
  _withDocumentLockOrPending_("processEditQueue", "pending_obradiEditQueue", (props, pendingKey) => { 
    try { 
      _proaktivnoCistiStaleProperties_(); 
    } catch (e) {} 

    const ss = _getSpreadsheet_(); 
    if (!ss) return; 

    const batch = _dequeueEditsBatch_(EDIT_WORK_BATCH); 
    if (!batch.length) return; 

    const bySheet = {}; 

    for (const it of batch) { 
      if (_shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

      const parts = String(it.key).split("!"); 
      if (parts.length !== 3) continue; 

      const shId = Number(parts[0]); 
      const row  = Number(parts[1]); 
      const col  = Number(parts[2]); 

      if (!shId || !row || !col) continue; 

      if (!bySheet[shId]) bySheet[shId] = []; 
      bySheet[shId].push({ row, col }); 
    } 

    for (const shIdStr of Object.keys(bySheet)) { 
      if (_shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

      const shId  = Number(shIdStr); 
      const sheet = ss.getSheets().find(sh => sh.getSheetId() === shId); 

      if (!sheet || sheet.getName() !== TARGET_SHEET_NAME) continue; 

      const events      = bySheet[shIdStr]; 
      const touchedRows = {}; 

      for (let i = 0; i < events.length; i++) { 
        if (i % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
          _bgYieldNow_(props, pendingKey); 
        } 

        const ev = events[i]; 
        touchedRows[ev.row] = true; 

        try { 
          const range        = sheet.getRange(ev.row, ev.col); 
          const currentValue = range.getDisplayValue(); 

          _applyRulesForEdit_(sheet, range, currentValue, false); 
        } catch (e) { 
          console.error("processEditQueue item error:", e && e.stack ? e.stack : e); 
        } 
      } 

      const rows = Object.keys(touchedRows).map(Number).sort((a, b) => a - b); 

      for (let r = 0; r < rows.length; r++) { 
        if (r % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
          _bgYieldNow_(props, pendingKey); 
        } 

        const row = rows[r]; 
        if (row <= 1) continue; 

        try { 
          const bCell = sheet.getRange(row, STUPAC_B); 
          const bVal  = String(bCell.getDisplayValue() || "").trim(); 

          if (!bVal) continue; 

          _applyRulesForEdit_(sheet, bCell, bVal, false); 
        } catch (e) { 
          console.error("processEditQueue final repair error:", e && e.stack ? e.stack : e); 
        } 
      } 
    } 
  }); 
} 

/**
 * Backwards-compatible alias from the original implementation.
 * Keep this if an installed trigger still points to obradiEditQueue.
 */
function obradiEditQueue() { 
  return processEditQueue(); 
}

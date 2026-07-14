/* ═══════════════════════════════════════════════════════════════════════ 
 * 06 · LOCK ENGINE — Concurrency control and execution synchronization
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _markOnEditIntent_(on) { 
  if (_isQuietHours_() || _isResetInProgress_()) return; 

  try { 
    const props = PropertiesService.getScriptProperties(); 

    on 
      ? props.setProperty(ONEDIT_INTENT_KEY, String(Date.now())) 
      : props.deleteProperty(ONEDIT_INTENT_KEY); 
  } catch (e) {} 
} 

function _shouldYieldToOnEdit_() { 
  try { 
    const ts = Number(PropertiesService.getScriptProperties().getProperty(ONEDIT_INTENT_KEY) || 0); 
    return ts && (Date.now() - ts) <= ONEDIT_INTENT_TTL_MS; 
  } catch (e) { 
    return false; 
  } 
} 

function _shouldYieldToReset_() { 
  try { 
    const ts = Number(PropertiesService.getScriptProperties().getProperty(RESET_IN_PROGRESS_KEY) || 0); 
    return !!(ts && (Date.now() - ts) <= RESET_IN_PROGRESS_TTL_MS); 
  } catch (e) { 
    return false; 
  } 
} 

function _shouldBackgroundYieldNow_() { 
  return _shouldYieldToOnEdit_() || _shouldYieldToReset_(); 
} 

function _bgYieldNow_(props, pendingKey) { 
  try { 
    if (pendingKey) props.setProperty(pendingKey, String(Date.now())); 
  } catch (e) {} 

  throw new Error("__YIELD_TO_ONEDIT__"); 
} 

function _withDocumentLockOrPending_(label, pendingKey, fn) { 
  const props = PropertiesService.getScriptProperties(); 

  if (_isReportInterruptActive_() || _isQuietHours_()) return false; 

  try { 
    const resetTs = Number(props.getProperty(RESET_IN_PROGRESS_KEY) || 0); 

    if (resetTs && (Date.now() - resetTs) <= RESET_IN_PROGRESS_TTL_MS) { 
      if (pendingKey) props.setProperty(pendingKey, String(Date.now())); 
      return false; 
    } 
  } catch (e) {} 

  if (_shouldBackgroundYieldNow_()) { 
    if (pendingKey) props.setProperty(pendingKey, String(Date.now())); 
    return false; 
  } 

  const lock = LockService.getDocumentLock(); 
  let got = false; 

  try { 
    got = lock.tryLock(BG_TRYLOCK_MS); 
  } catch (e) {} 

  if (!got) { 
    if (pendingKey) props.setProperty(pendingKey, String(Date.now())); 
    return false; 
  } 

  try { 
    if (_shouldYieldToReset_()) _bgYieldNow_(props, pendingKey); 

    fn(props, pendingKey); 
    SpreadsheetApp.flush(); 

    if (pendingKey) props.deleteProperty(pendingKey); 

    return true; 
  } catch (e) { 
    const msg = String(e && e.message ? e.message : e); 

    if (msg.indexOf("__YIELD_TO_ONEDIT__") === -1) { 
      console.error("[" + label + "] error:", e && e.stack ? e.stack : e); 
    } 

    return false; 
  } finally { 
    try { 
      lock.releaseLock(); 
    } catch (e2) {} 
  } 
}

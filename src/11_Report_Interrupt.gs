/* ═══════════════════════════════════════════════════════════════════════ 
 * 11 · REPORT INTERRUPT — Temporary automation suspension during export
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _isResetInProgress_() { 
  try { 
    const ts = Number(PropertiesService.getScriptProperties().getProperty(RESET_IN_PROGRESS_KEY) || 0); 
    return !!(ts && (Date.now() - ts) <= RESET_IN_PROGRESS_TTL_MS); 
  } catch (e) { 
    return false; 
  } 
} 

function _setReportInterrupt_(ttlMs) { 
  try { 
    const until = Date.now() + Math.max(10000, Number(ttlMs) || REPORT_INTERRUPT_TTL_MS); 
    PropertiesService.getScriptProperties().setProperty(REPORT_INTERRUPT_UNTIL_KEY, String(until)); 

    try { 
      CacheService.getScriptCache().remove(REPORT_INTERRUPT_TOAST_CACHE_KEY); 
    } catch (e0) {} 
  } catch (e) {} 
} 

function _clearReportInterrupt_() { 
  try { 
    PropertiesService.getScriptProperties().deleteProperty(REPORT_INTERRUPT_UNTIL_KEY); 
  } catch (e) {} 

  try { 
    CacheService.getScriptCache().remove(REPORT_INTERRUPT_TOAST_CACHE_KEY); 
  } catch (e) {} 
} 

function _isReportInterruptActive_() { 
  try { 
    const until = Number(PropertiesService.getScriptProperties().getProperty(REPORT_INTERRUPT_UNTIL_KEY) || 0); 
    return !!(until && Date.now() < until); 
  } catch (e) { 
    return false; 
  } 
} 

function _toastReportInterruptOnce_(ss) { 
  try { 
    if (!ss) return; 

    const cache = CacheService.getScriptCache(); 

    if (cache.get(REPORT_INTERRUPT_TOAST_CACHE_KEY)) return; 

    cache.put(REPORT_INTERRUPT_TOAST_CACHE_KEY, "1", REPORT_INTERRUPT_TOAST_TTL_SEC); 
    ss.toast("Saving XLSX… automations paused briefly", "📦 Report", 4); 
  } catch (e) {} 
} 

function _clearQueuesAndPendingsForReport_(props) { 
  try { 
    if (!props) props = PropertiesService.getScriptProperties(); 
  } catch (e) {} 

  if (!props) return; 

  [ 
    ONEDIT_INTENT_KEY, 
    EDIT_QUEUE_KEY, 
    "pending_resetirajDnevnuMemoriju", 
    "pending_provjeriVrijemeCekanja", 
    "pending_cistacFormataGotovihPacijenata", 
    "pending_obradiEditQueue" 
  ].forEach(k => { 
    try { 
      props.deleteProperty(k); 
    } catch (e) {} 
  }); 
}

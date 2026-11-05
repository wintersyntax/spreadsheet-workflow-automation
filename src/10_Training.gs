/* ═══════════════════════════════════════════════════════════════════════ 
 * 10 · TRAINING — Detection of training-related scenarios
 * ═══════════════════════════════════════════════════════════════════════ */ 

// OPT: cache is invalidated only when the Admin UI saves a new company list.
//      _adminInvalidateCache_ in module 25 resets this value to null.

let _TVRTKE_EDUKACIJA_NORM_CACHE = null; 

function _hasEdukacijaTvrtka_(txt) { 
  const t = _normTxt_(txt || ""); 
  if (!t) return false; 

  if (!_TVRTKE_EDUKACIJA_NORM_CACHE) { 
    _TVRTKE_EDUKACIJA_NORM_CACHE = _getAdminTvrtkeEdukacija_() 
      .map(_normTxt_) 
      .filter(Boolean); 
  } 

  return _TVRTKE_EDUKACIJA_NORM_CACHE.some(norm => { 
    const escaped = _reEscape_(norm); 
    return new RegExp("\\b" + escaped + "\\b", "i").test(t); 
  }); 
} 

function _jePeriodic_Standard_(vCraw) { 
  return _normTxt_(vCraw || "").toUpperCase().includes("PERIODICKI"); 
}

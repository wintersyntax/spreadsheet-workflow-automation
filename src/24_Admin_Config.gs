/* ═══════════════════════════════════════════════════════════════════════ 
 * 24 · ADMIN CONFIG — Administrative configuration and PIN protection
 * ═══════════════════════════════════════════════════════════════════════ */ 

const ADMIN_MAPPING_KEY  = "admin_mapping_v1"; 
const ADMIN_TVRTKE_KEY   = "admin_tvrtke_v1"; 
const ADMIN_CACHE_TTL_MS = 120000; 

let _adminMappingCache   = null; 
let _adminMappingCacheTs = 0; 
let _adminTvrtkeCache    = null; 
let _adminTvrtkeCacheTs  = 0; 

/* ── PIN helpers ─────────────────────────────────────────────────────── */ 

function _adminUserProps_() { 
  return PropertiesService.getUserProperties(); 
} 
 
function _bytesToHex_(bytes) { 
  return bytes.map(function(b) { 
    const v = (b < 0 ? b + 256 : b).toString(16); 
    return v.length === 1 ? "0" + v : v; 
  }).join(""); 
} 

function _generateAdminPinSalt_() { 
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""); 
} 

function _hashAdminPinWithSalt_(pin, salt) { 
  const raw = String(salt || "") + "|" + String(pin || ""); 
  const digest = Utilities.computeDigest( 
    Utilities.DigestAlgorithm.SHA_256, 
    raw, 
    Utilities.Charset.UTF_8 
  ); 
  return _bytesToHex_(digest); 
} 

function adminConfig_SetPin(pin) { 
  const p = String(pin || "").trim(); 

  if (!/^\d{4,8}$/.test(p)) { 
    throw new Error("PIN must contain 4 to 8 digits."); 
  } 

  const salt = _generateAdminPinSalt_(); 
  const hash = _hashAdminPinWithSalt_(p, salt); 
  const props = PropertiesService.getScriptProperties(); 

  props.setProperty(ADMIN_PIN_SALT_KEY, salt); 
  props.setProperty(ADMIN_PIN_HASH_KEY, hash); 

  return "OK"; 
} 

function adminConfig_ClearPin() { 
  const props = PropertiesService.getScriptProperties(); 

  props.deleteProperty(ADMIN_PIN_HASH_KEY); 
  props.deleteProperty(ADMIN_PIN_SALT_KEY); 

  return "OK"; 
} 

function _getAdminPinHash_() { 
  return String(PropertiesService.getScriptProperties().getProperty(ADMIN_PIN_HASH_KEY) || "").trim(); 
} 

function _getAdminPinSalt_() { 
  return String(PropertiesService.getScriptProperties().getProperty(ADMIN_PIN_SALT_KEY) || "").trim(); 
} 

function _isAdminPinConfigured_() { 
  return !!(_getAdminPinHash_() && _getAdminPinSalt_()); 
} 

function _isAdminPinLocked_() { 
  try { 
    const until = Number(_adminUserProps_().getProperty(ADMIN_PIN_LOCK_UNTIL_KEY) || 0); 
    return !!(until && Date.now() < until); 
  } catch (e) { 
    return false; 
  } 
} 

function _getAdminPinLockRemainingSec_() { 
  try { 
    const until = Number(_adminUserProps_().getProperty(ADMIN_PIN_LOCK_UNTIL_KEY) || 0); 
    return Math.max(0, Math.ceil((until - Date.now()) / 1000)); 
  } catch (e) { 
    return 0; 
  } 
} 

function _registerAdminPinFailure_() { 
  const up = _adminUserProps_(); 
  const current = Number(up.getProperty(ADMIN_PIN_ATTEMPTS_KEY) || 0) + 1; 

  if (current >= ADMIN_MAX_PIN_ATTEMPTS) { 
    up.setProperty(ADMIN_PIN_LOCK_UNTIL_KEY, String(Date.now() + ADMIN_PIN_LOCK_TTL_MS)); 
    up.deleteProperty(ADMIN_PIN_ATTEMPTS_KEY); 
    return { locked: true, attempts: current }; 
  } 

  up.setProperty(ADMIN_PIN_ATTEMPTS_KEY, String(current)); 
  return { locked: false, attempts: current }; 
} 

function _clearAdminPinFailures_() { 
  const up = _adminUserProps_(); 

  up.deleteProperty(ADMIN_PIN_ATTEMPTS_KEY); 
  up.deleteProperty(ADMIN_PIN_LOCK_UNTIL_KEY); 
} 

function adminConfig_VerifyPin(pin) { 
  const storedHash = _getAdminPinHash_(); 
  const storedSalt = _getAdminPinSalt_(); 

  if (!storedHash || !storedSalt) { 
    throw new Error("Admin PIN is not configured. Run adminConfig_SetPin('1234') first."); 
  } 

  if (_isAdminPinLocked_()) { 
    const sec = _getAdminPinLockRemainingSec_(); 
    throw new Error("Too many failed attempts. Try again in " + sec + " seconds."); 
  } 

  const input = String(pin || "").trim(); 
  const inputHash = _hashAdminPinWithSalt_(input, storedSalt); 

  if (inputHash !== storedHash) { 
    const fail = _registerAdminPinFailure_(); 

    if (fail.locked) { 
      throw new Error("Too many failed attempts. Admin access is locked for 10 minutes."); 
    } 

    const left = ADMIN_MAX_PIN_ATTEMPTS - fail.attempts; 
    throw new Error("Wrong PIN. Attempts remaining: " + left + "."); 
  } 

  _clearAdminPinFailures_(); 
  return { ok: true }; 
} 

function adminConfig_VerifyPinAndOpen(pin) { 
  adminConfig_VerifyPin(pin); 
  adminConfig_OpenModal(); 
  return { ok: true }; 
} 

function adminConfig_OpenGuard() { 
  adminConfig_OpenPinModal(); 
} 

function adminConfig_OpenPinModal() { 
  const html = HtmlService.createTemplateFromFile("AdminPin")
    .evaluate()
    .setWidth(620)
    .setHeight(560); 

  SpreadsheetApp.getUi().showModalDialog(html, "Admin access"); 
} 
 

 

function _adminInvalidateCache_() { 
  _adminMappingCache = null; 
  _adminMappingCacheTs = 0; 
  _adminTvrtkeCache = null; 
  _adminTvrtkeCacheTs = 0; 

  try { 
    _TVRTKE_EDUKACIJA_NORM_CACHE = null; 
  } catch (e) {} 
} 

/* ── Staff mapping ───────────────────────────────────────────────────── */ 

function _adminLoadMapping_() { 
  const r = PropertiesService.getScriptProperties().getProperty(ADMIN_MAPPING_KEY); 

  try { 
    return r ? JSON.parse(r) : {}; 
  } catch (e) { 
    return {}; 
  } 
} 

function _adminSaveMapping_(obj) { 
  PropertiesService.getScriptProperties().setProperty(ADMIN_MAPPING_KEY, JSON.stringify(obj)); 
  _adminInvalidateCache_(); 
} 

/* ── Training companies, grouped with aliases ────────────────────────── */ 

function _adminParseTvrtke_(raw) { 
  if (!raw) return []; 

  try { 
    const arr = JSON.parse(raw); 

    if (!Array.isArray(arr) || !arr.length) return []; 

    if (typeof arr[0] === "string") { 
      return arr
        .map(s => ({ name: String(s || "").trim(), aliases: [] }))
        .filter(g => g.name); 
    } 

    return arr.map(item => ({ 
      name: String(item.name || "").trim(), 
      aliases: Array.isArray(item.aliases) 
        ? item.aliases.map(a => String(a || "").trim()).filter(Boolean) 
        : [] 
    })).filter(g => g.name); 
  } catch (e) { 
    return []; 
  } 
} 

function _adminLoadTvrtkeGrouped_() { 
  return _adminParseTvrtke_(PropertiesService.getScriptProperties().getProperty(ADMIN_TVRTKE_KEY)); 
} 

function _adminSaveTvrtkeGrouped_(arr) { 
  PropertiesService.getScriptProperties().setProperty(ADMIN_TVRTKE_KEY, JSON.stringify(arr)); 
  _adminInvalidateCache_(); 
} 

/* ── Public getters ──────────────────────────────────────────────────── */ 

function _getAdminMappingImena_() { 
  const now = Date.now(); 

  if (_adminMappingCache && (now - _adminMappingCacheTs) < ADMIN_CACHE_TTL_MS) { 
    return _adminMappingCache; 
  } 

  const m = _adminLoadMapping_(); 

  _adminMappingCache = m; 
  _adminMappingCacheTs = now; 

  return m; 
} 

function _getAdminInitijalsSorted_() { 
  return Object.keys(_getAdminMappingImena_()).sort((a, b) => b.length - a.length); 
} 

function _getAdminTvrtkeEdukacija_() { 
  const now = Date.now(); 

  if (_adminTvrtkeCache && (now - _adminTvrtkeCacheTs) < ADMIN_CACHE_TTL_MS) { 
    return _adminTvrtkeCache; 
  } 

  const flat = []; 

  _adminLoadTvrtkeGrouped_().forEach(g => { 
    flat.push(g.name); 
    (g.aliases || []).forEach(a => flat.push(a)); 
  }); 

  _adminTvrtkeCache = flat; 
  _adminTvrtkeCacheTs = now; 

  return flat; 
} 

/* ── Export / import ─────────────────────────────────────────────────── */ 

function adminConfig_ExportJson() { 
  return JSON.stringify({ 
    version: 7, 
    exported: new Date().toISOString(), 
    mapping: _adminLoadMapping_(), 
    tvrtke: _adminLoadTvrtkeGrouped_(), 
    faktura: _adminLoadFakturaGrouped_(), 
    ugovor: _adminLoadUgovorGrouped_(), 
    zastitarskeTvrtke: _adminLoadZastitarskeTvrtkeGrouped_(), 
    zdravstveneUstanove: _adminLoadZdravstveneUstanoveGrouped_(), 
    prioritetno: _adminLoadPrioritetnoList_(), 
    najave: _adminLoadNajave_(), 
    najaveAutori: _adminLoadNajaveAutori_() 
  }, null, 2); 
} 

function adminConfig_ImportJson(jsonStr) { 
  const data = JSON.parse(String(jsonStr || "")); 

  if (data.mapping && typeof data.mapping === "object") { 
    _adminSaveMapping_(data.mapping); 
  } 

  if (data.tvrtke && Array.isArray(data.tvrtke)) { 
    _adminSaveTvrtkeGrouped_(_adminParseTvrtke_(JSON.stringify(data.tvrtke))); 
  } 

  if (data.faktura && Array.isArray(data.faktura)) { 
    _adminSaveFakturaGrouped_(_adminParseFaktura_(JSON.stringify(data.faktura))); 
  } 

  if (data.ugovor && Array.isArray(data.ugovor)) { 
    _adminSaveUgovorGrouped_(_adminParseUgovor_(JSON.stringify(data.ugovor))); 
  } 

  if (data.zastitarskeTvrtke && Array.isArray(data.zastitarskeTvrtke)) { 
    _adminSaveZastitarskeTvrtkeGrouped_(_adminParseGroupedSimple_(JSON.stringify(data.zastitarskeTvrtke))); 
  } 

  if (data.zdravstveneUstanove && Array.isArray(data.zdravstveneUstanove)) { 
    _adminSaveZdravstveneUstanoveGrouped_(_adminParseGroupedSimple_(JSON.stringify(data.zdravstveneUstanove))); 
  } 

  if (data.prioritetno && Array.isArray(data.prioritetno)) { 
    _adminSavePrioritetnoList_(_adminParsePrioritetno_(JSON.stringify(data.prioritetno))); 
  } 

  if (data.najave && Array.isArray(data.najave)) { 
    _adminSaveNajave_(data.najave); 
  } 

  if (data.najaveAutori && Array.isArray(data.najaveAutori)) { 
    _adminSaveNajaveAutori_(data.najaveAutori); 
  } 
} 

/* ── Backend callbacks ───────────────────────────────────────────────── */ 

function adminConfig_GetData() { 
  return JSON.stringify({ 
    mapping: _adminLoadMapping_(), 
    tvrtke: _adminLoadTvrtkeGrouped_(), 
    faktura: _adminLoadFakturaGrouped_(), 
    ugovor: _adminLoadUgovorGrouped_(), 
    zastitarskeTvrtke: _adminLoadZastitarskeTvrtkeGrouped_(), 
    zdravstveneUstanove: _adminLoadZdravstveneUstanoveGrouped_(), 
    prioritetno: _adminLoadPrioritetnoList_(), 
    najave: _adminLoadNajave_(), 
    najaveAutori: _adminLoadNajaveAutori_() 
  }); 
}

/* ── Staff ───────────────────────────────────────────────────────────── */ 

function adminConfig_SaveDoktor(jsonStr) { 
  const { initials, name } = JSON.parse(jsonStr); 
  const inic = String(initials || "").toLowerCase().trim(); 
  const ime  = String(name || "").trim(); 

  if (!inic)           throw new Error("Initials are required."); 
  if (!ime)            throw new Error("Name is required."); 
  if (inic.length > 6) throw new Error("Initials can contain up to 6 characters."); 

  const m = _adminLoadMapping_(); 
  m[inic] = ime; 
  _adminSaveMapping_(m); 
} 

function adminConfig_DeleteDoktor(initials) { 
  const inic = String(initials || "").toLowerCase().trim(); 
  const m    = _adminLoadMapping_(); 

  if (!(inic in m)) throw new Error('"' + inic + '" does not exist.'); 

  delete m[inic]; 
  _adminSaveMapping_(m); 
} 

function adminConfig_SaveAllDoctors(jsonStr) { 
  const arr = JSON.parse(jsonStr); 

  if (!Array.isArray(arr)) throw new Error("Invalid format."); 

  const m = {}; 

  for (const { initials, name } of arr) { 
    const k = String(initials || "").toLowerCase().trim(); 
    const v = String(name || "").trim(); 

    if (k && v) m[k] = v; 
  } 

  _adminSaveMapping_(m); 
} 

/* ── Training companies ──────────────────────────────────────────────── */ 

function adminConfig_SaveTvrtka(name) { 
  const n = String(name || "").trim(); 

  if (!n) throw new Error("Name is required."); 

  const groups = _adminLoadTvrtkeGrouped_(); 
  const all    = new Set(); 

  groups.forEach(g => { 
    all.add(g.name.toLowerCase()); 
    (g.aliases || []).forEach(a => all.add(a.toLowerCase())); 
  }); 

  if (all.has(n.toLowerCase())) throw new Error('"' + n + '" already exists.'); 

  groups.push({ name: n, aliases: [] }); 
  _adminSaveTvrtkeGrouped_(groups); 
} 

function adminConfig_DeleteTvrtka(name) { 
  const n      = String(name || "").trim(); 
  const groups = _adminLoadTvrtkeGrouped_(); 
  const idx    = groups.findIndex(g => g.name.toLowerCase() === n.toLowerCase()); 

  if (idx === -1) throw new Error('"' + n + '" does not exist.'); 

  groups.splice(idx, 1); 
  _adminSaveTvrtkeGrouped_(groups); 
} 

function adminConfig_UpdateTvrtkaRow(jsonStr) { 
  const { oldName, newName } = JSON.parse(jsonStr); 
  const on = String(oldName || "").trim(); 
  const nn = String(newName || "").trim(); 

  if (!on || !nn) throw new Error("Name is required."); 

  const groups = _adminLoadTvrtkeGrouped_(); 
  const idx    = groups.findIndex(g => g.name.toLowerCase() === on.toLowerCase()); 

  if (idx === -1) throw new Error('"' + on + '" does not exist.'); 

  const all = new Set(); 

  groups.forEach((g, i) => { 
    if (i === idx) return; 

    all.add(g.name.toLowerCase()); 
    (g.aliases || []).forEach(a => all.add(a.toLowerCase())); 
  }); 

  if (all.has(nn.toLowerCase())) throw new Error('"' + nn + '" already exists.'); 

  groups[idx].name = nn; 
  _adminSaveTvrtkeGrouped_(groups); 
} 

function adminConfig_AddAlias(jsonStr) { 
  const { company, alias } = JSON.parse(jsonStr); 
  const a = String(alias || "").trim(); 

  if (!a) throw new Error("Alias is required."); 

  const groups = _adminLoadTvrtkeGrouped_(); 
  const idx = groups.findIndex(g => 
    g.name.toLowerCase() === String(company || "").toLowerCase()
  ); 

  if (idx === -1) throw new Error('"' + company + '" does not exist.'); 

  const all = new Set(); 

  groups.forEach(g => { 
    all.add(g.name.toLowerCase()); 
    (g.aliases || []).forEach(x => all.add(x.toLowerCase())); 
  }); 

  if (all.has(a.toLowerCase())) throw new Error('"' + a + '" already exists.'); 

  groups[idx].aliases.push(a); 
  _adminSaveTvrtkeGrouped_(groups); 
} 

function adminConfig_DeleteAlias(jsonStr) { 
  const { company, alias } = JSON.parse(jsonStr); 
  const groups = _adminLoadTvrtkeGrouped_(); 
  const idx = groups.findIndex(g => 
    g.name.toLowerCase() === String(company || "").toLowerCase()
  ); 

  if (idx === -1) throw new Error('"' + company + '" does not exist.'); 

  const ai = groups[idx].aliases.findIndex(x => 
    x.toLowerCase() === String(alias || "").toLowerCase()
  ); 

  if (ai === -1) throw new Error('"' + alias + '" does not exist.'); 

  groups[idx].aliases.splice(ai, 1); 
  _adminSaveTvrtkeGrouped_(groups); 
} 

/* ── Main admin modal ───────────────────────────────────────────────── */ 

function adminConfig_OpenModal() { 
  const html = HtmlService.createTemplateFromFile("AdminConfig")
    .evaluate()
    .setWidth(1280)
    .setHeight(920); 

  SpreadsheetApp.getUi().showModalDialog(html, "Admin configuration"); 
} 
 

/* ── HTML builder ────────────────────────────────────────────────────── */

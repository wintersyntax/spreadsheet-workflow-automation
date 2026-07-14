/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CODE.GS — CENTRAL ORCHESTRATION LAYER FOR SPREADSHEET WORKFLOW LOGIC
 *  Last updated: 2026-07
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  This script is the central runtime layer for the operational spreadsheet.
 *  It covers:
 *  - user input processing and data standardization
 *  - business-rule handling by columns and rows
 *  - visual signaling, waiting states and row-status processing
 *  - daily reset of the operational worksheet
 *  - XLSX report export and administrative configuration
 *  - patient, company and keyword announcement system
 *
 *  ARCHITECTURE (27 modules):
 *
 *  01 · CONFIG                      – System constants, column indexes and operational limits
 *  02 · BINDING                     – Spreadsheet context and target sheet binding
 *  03 · HELPERS                     – Generic helpers, normalization and patch infrastructure
 *  04 · QUIET HOURS                 – Quiet-hours execution mode
 *  05 · SHORT WAIT                  – Short waiting-time configuration and activation
 *  06 · LOCK ENGINE                 – Concurrency control and execution synchronization
 *  07 · EDIT QUEUE                  – Deferred edit-event processing queue
 *  08 · FUZZY STANDARDIZATION C     – Fuzzy standardization of values in column C
 *  09 · KAT / SPORT NORMALIZATION   – Domain normalization for KAT / SPORTSKI / REGISTER / ROČNIK combinations
 *  10 · TRAINING                    – Training-scenario detection
 *  11 · REPORT INTERRUPT            – Temporary automation suspension during report export
 *  12 · REPORT EXPORT               – Export UI, status handling and user dialog
 *  13 · APPLY RULES                 – Central dispatcher for edit-triggered rule processing
 *  14 · HANDLER J                   – Doctor initials and location-tag handling
 *  15 · HANDLER B                   – Time handling and persistence in column B
 *  16 · HANDLER C/H                 – Business-rule handling for columns C–H
 *  17 · WAIT CHECKER                – Waiting-time evaluation and status escalation
 *  18 · FORMAT CLEANER              – Format and content cleanup for completed rows
 *  19 · DAILY RESET                 – Daily reset, watchdog and retry mechanisms
 *  20 · XLSX AUTORESTORE            – Revision-based auto-restore for XLSX reference files
 *  21 · DRIVE AUTH                  – One-time Drive authorization helper
 *  22 · TRIGGERS                    – Installed trigger management
 *  23 · ONEDIT                      – Main edit-event entry point
 *  24 · ADMIN CONFIG                – Administrative configuration and PIN protection
 *  25 · OPERATIVE SETTINGS          – Config layer for clients, clubs and operational rules
 *  26 · ANNOUNCEMENTS               – Patient, company and keyword announcement system
 *  27 · REPORT EXPORT BACKEND       – XLSX save, auto-restore baseline and failsafe export
 **/

/* ═══════════════════════════════════════════════════════════════════════ 
 * 01 · CONFIG — System constants, column indexes and operational limits
 * ═══════════════════════════════════════════════════════════════════════ */ 

// ── Column indexes (1-based) ─────────────────────────────────────────── 
const STUPAC_B  = 2; 
const STUPAC_C  = 3; 
const STUPAC_D  = 4; 
const STUPAC_E  = 5; 
const STUPAC_F  = 6; 
const STUPAC_G  = 7; 
const STUPAC_H  = 8; 
const STUPAC_I  = 9; 
const STUPAC_J  = 10; 
const STUPAC_L  = 12; 
const STUPAC_ID = 13; 
const STUPAC_SYS_STATE = 14; 
const STUPAC_SYS_SIG   = 15; 

// ── Sheet and limits ─────────────────────────────────────────────────── 
const TARGET_SHEET_NAME    = "WORKFLOW_REGISTER"; 
const MAX_TEMPLATE_ROW     = 700; 
const CLEANER_BUFFER_ROWS  = 30; 
const CEKANJE_BUFFER_ROWS  = 50; 

// ── Priority / workflow colors used by _handleCHRulesLite_ ─────────────
// Public portfolio version uses generalized keywords,
// but demo/local aliases are kept so the original visual workflow still works.

const BOJE_PRIORITETI = [ 
  // General/public demo keywords.
  { rijec: "priority",          boja: "#c27ba0" }, 
  { rijec: "priority-alt",      boja: "#c27ba0" }, 
  { rijec: "external-review",   boja: "#c27ba0" }, 
  { rijec: "systematic-review", boja: "#4285f4" }, 
  { rijec: "location-service",  boja: "#b4a7d6" }, 
  { rijec: "workflow",          boja: "#fff2cc" }, 
  { rijec: "category-a",        boja: "#46bdc6" }, 
  { rijec: "category-b",        boja: "#c9daf8" }, 
  { rijec: "special-case",      boja: "#8e7cc3" }, 
  { rijec: "follow-up",         boja: "#b6d7a8" },

  // Demo/local workflow aliases kept for visual behavior in the original sheet.
  { rijec: "pur",               boja: "#fff2cc" },
  { rijec: "register",          boja: "#fff2cc" },
  { rijec: "kat",               boja: "#46bdc6" },
  { rijec: "sportski",          boja: "#c9daf8" }
]; 

// OPT: pre-normalized version — initialized once when the script starts.
const BOJE_PRIORITETI_NORM = BOJE_PRIORITETI.map(p => ({ 
  normRijec: p.rijec 
    .toLowerCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, ""), 
  boja: p.boja 
})); 

// ── Text labels and colors ───────────────────────────────────────────── 
const TEKST_EDUKACIJA       = "; TRAINING"; 
const BOJA_EDUKACIJA        = "#cc0001"; 
const TEKST_ZA_DODATI_OFT   = "REVIEW"; 
const TEKST_ZA_DODATI_KAT_X = "X"; 
const EMOJI_ALARM           = " ⚠️"; 
const BOJA_VADJENJE_KRVI    = "#f09999"; 
const BOJA_ORS              = "#6ba84f"; 
const BOJA_CEKANJE_SPORT    = "#ff9900"; 
const REGEX_VRIJEME_HHMM    = /\b\d{1,2}:\d{2}\b/; 
const TEKST_CEKANJE         = "[waiting more than two hours]"; 
const TEKST_CEKANJE_SPORT   = "[waiting more than 45 minutes]"; 

// ── Lock / Queue constants ───────────────────────────────────────────── 
const ONEDIT_INTENT_KEY       = "onedit_intent_ts"; 
const ONEDIT_INTENT_TTL_MS    = 15000; 
const ONEDIT_TRYLOCK_MS       = 2000; 
const BG_TRYLOCK_MS           = 2000; 
const BG_YIELD_CHECK_EVERY    = 10; 
const OFT_PROMPT_TTL_SEC      = 30; 
const FAKTURA_PROMPT_TTL_SEC  = 30; 
const EDIT_QUEUE_KEY          = "edit_queue_v3"; 
const EDIT_QUEUE_MAX          = 250; 
const EDIT_QUEUE_MAX_V2       = 150; 
const EDIT_WORK_BATCH         = 60; 
const EDIT_QUEUE_LOCK_MS      = 1500; 
const TIME_CACHE_TTL_SEC      = 8 * 60 * 60; 

// ── Reset constants ──────────────────────────────────────────────────── 
const RESET_IN_PROGRESS_KEY    = "reset_in_progress"; 
const RESET_IN_PROGRESS_TTL_MS = 10 * 60 * 1000; 
const RESET_RETRY_MAX          = 3; 
const RESET_RETRY_DELAY_MIN    = 2; 
const RESET_RETRY_DATE_KEY     = "reset_retry_date"; 
const RESET_RETRY_COUNT_KEY    = "reset_retry_count"; 

// ── Quiet hours (22:00 – 06:00) ──────────────────────────────────────── 
const QUIET_HOURS_START_H      = 22; 
const QUIET_HOURS_END_H        = 6; 
const QUIET_OVERRIDE_UNTIL_KEY = "quiet_override_until_ts"; 

// ── Short-wait feature toggle ──────────────────────────────────────────
// Original implementation used a domain-specific short-wait workflow.
// Public version keeps the feature generic.

const SPORT_WAIT_ENABLED_KEY = "short_wait_feature_enabled"; 

// ── Report interrupt ─────────────────────────────────────────────────── 
const REPORT_INTERRUPT_UNTIL_KEY       = "report_interrupt_until_ts"; 
const REPORT_INTERRUPT_TTL_MS          = 2 * 60 * 1000; 
const REPORT_INTERRUPT_TOAST_CACHE_KEY = "report_interrupt_toast_v1"; 
const REPORT_INTERRUPT_TOAST_TTL_SEC   = 6; 

// ── Short-wait config in-memory cache ────────────────────────────────── 
const SPORT_CFG_CACHE_TTL_MS = 60000; 

// ── Proactive property cleanup throttle ──────────────────────────────── 
const PROPS_CLEANUP_THROTTLE_KEY = "propCleanup_lastRun"; 
const PROPS_CLEANUP_THROTTLE_SEC = 3600; 

// ── Admin PIN protection ───────────────────────────────────────────────
// These are property key names only. Real PIN hashes and salts should be
// generated and stored in Script Properties, not hard-coded in public code.

const ADMIN_PIN_HASH_KEY       = "admin_config_pin_hash_v1"; 
const ADMIN_PIN_SALT_KEY       = "admin_config_pin_salt_v1"; 
const ADMIN_MAX_PIN_ATTEMPTS   = 3; 
const ADMIN_PIN_ATTEMPTS_KEY   = "admin_pin_attempts_v1"; 
const ADMIN_PIN_LOCK_UNTIL_KEY = "admin_pin_lock_until_ts"; 
const ADMIN_PIN_LOCK_TTL_MS    = 10 * 60 * 1000; // 10 min lock after too many failed attempts.

// ── ScriptProperties global handle ───────────────────────────────────── 
const memorijaSkripte = PropertiesService.getScriptProperties(); 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 02 · BINDING — Spreadsheet context and target sheet binding
 * ═══════════════════════════════════════════════════════════════════════ */ 

/**
 * Stores the active spreadsheet ID in Script Properties.
 *
 * This allows time-based triggers and background functions to reopen the
 * spreadsheet even when there is no active UI-bound spreadsheet context.
 */
function bindActiveSpreadsheetId() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); 
  if (!ss) throw new Error("No active spreadsheet found. Run this function from the bound Google Sheet."); 

  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID_BOUND", ss.getId()); 
  console.log("Spreadsheet ID stored successfully."); 
} 

/**
 * Backwards-compatible alias from the original implementation.
 */
function zapamtiSpreadsheetId() {
  return bindActiveSpreadsheetId();
}

/**
 * Returns the current spreadsheet.
 *
 * First tries to use the active spreadsheet context. If unavailable, it falls
 * back to the spreadsheet ID stored in Script Properties.
 */
function _getSpreadsheet_() { 
  const ss = SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) return ss; 

  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID_BOUND"); 
  return id ? SpreadsheetApp.openById(id) : null; 
} 

/**
 * Returns the configured target sheet, or null if the spreadsheet or sheet
 * cannot be found.
 */
function _getTargetSheet_() { 
  const ss = _getSpreadsheet_(); 
  return ss ? ss.getSheetByName(TARGET_SHEET_NAME) : null; 
} 

/**
 * Returns the configured target sheet.
 *
 * Throws an explicit error if the spreadsheet context or target sheet is
 * missing. Use this in functions where the target sheet is required.
 */
function _requireTargetSheet_() { 
  const ss = _getSpreadsheet_(); 
  if (!ss) throw new Error("No spreadsheet context found. Run bindActiveSpreadsheetId() first."); 

  const sh = ss.getSheetByName(TARGET_SHEET_NAME); 
  if (!sh) throw new Error('Target sheet "' + TARGET_SHEET_NAME + '" does not exist.'); 

  return sh; 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 03 · HELPERS — Generic helpers, normalization and patch infrastructure
 * ═══════════════════════════════════════════════════════════════════════ */ 

/* ── Date / text basic helpers ────────────────────────────────────────── */ 

function _todayZg_()  { return Utilities.formatDate(new Date(), "Europe/Zagreb", "yyyy-MM-dd"); } 
function _stamp_()    { return Utilities.formatDate(new Date(), "Europe/Zagreb", "dd.MM.yyyy HH:mm"); } 
function _trim_(v)    { return String(v || "").trim(); } 
function _zgHour_()   { return Number(Utilities.formatDate(new Date(), "Europe/Zagreb", "H")); } 
function _zgMinute_() { return Number(Utilities.formatDate(new Date(), "Europe/Zagreb", "m")); } 
 
function _normTxt_(s) { 
  return String(s || "") 
    .toLowerCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, ""); 
} 

function _normUpperNoDiacritics_(s) { 
  return String(s || "") 
    .toUpperCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, ""); 
} 

function _reEscape_(s) { 
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); 
} 

function _normPhrase_(s) { 
  return String(s || "") 
    .toLowerCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]+/g, " ") 
    .replace(/\s+/g, " ") 
    .trim(); 
} 

function _normPhraseTokens_(s) { 
  const norm = _normPhrase_(s); 
  return norm ? norm.split(" ").filter(Boolean) : []; 
} 

function _buildFlexiblePhraseRegex_(phrase) { 
  const norm = _normPhrase_(phrase); 
  if (!norm) return null; 

  const parts = norm.split(" ").filter(Boolean).map(_reEscape_); 
  if (!parts.length) return null; 

  return new RegExp("\\b" + parts.join("\\W*") + "\\b", "i"); 
} 

function _textHasFlexiblePhrase_(text, phrase) { 
  const rx = _buildFlexiblePhraseRegex_(phrase); 
  if (!rx) return false; 
  return rx.test(_normPhrase_(text)); 
} 

function sadrziJednuOdRijeci(text, rijeci) { 
  if (!text || !rijeci || !rijeci.length) return false; 

  const low = String(text).toLowerCase(); 
  return rijeci.some(r => low.includes(String(r).toLowerCase())); 
} 

/* ── UI-driven matcher helpers: exact phrase + segment fuzzy matching ─── */ 

function _isShortAcronymToken_(tok) { 
  const t = _normPhrase_(tok); 
  return /^[a-z]{2,3}$/.test(t); 
} 

function _maxFuzzyDistanceForToken_(tok) { 
  const len = String(tok || "").length; 
  if (len < 3)  return -1; 
  if (len <= 6) return 1; 
  return 2; 
} 

function _compareMatcherTokens_(candidateToken, termToken) { 
  const cand = _normPhrase_(candidateToken); 
  const term = _normPhrase_(termToken); 

  if (!cand || !term) return null; 
  if (cand === term) return { ok: true, dist: 0 }; 

  const candLen = cand.length; 
  const termLen = term.length; 

  if (candLen < 3 || termLen < 3) return null; 
  if (_isShortAcronymToken_(cand) || _isShortAcronymToken_(term)) return null; 

  const cap = Math.min( 
    _maxFuzzyDistanceForToken_(cand), 
    _maxFuzzyDistanceForToken_(term) 
  ); 

  if (cap < 0) return null; 

  const d = _levenshteinDistanceCapped_(cand, term, cap); 
  if (d > cap) return null; 

  return { ok: true, dist: d }; 
} 

function _scoreSegmentAgainstTerm_(segmentTokens, termTokens) { 
  if (!segmentTokens || !termTokens) return null; 
  if (segmentTokens.length !== termTokens.length) return null; 

  let totalDist = 0; 
  let exactCount = 0; 

  for (let i = 0; i < termTokens.length; i++) { 
    const cmp = _compareMatcherTokens_(segmentTokens[i], termTokens[i]); 
    if (!cmp || !cmp.ok) return null; 

    totalDist += cmp.dist; 
    if (cmp.dist === 0) exactCount++; 
  } 

  return { totalDist, exactCount, tokenCount: termTokens.length }; 
} 

function _findBestSegmentFuzzyMatch_(text, phrase) { 
  const textTokens = _normPhraseTokens_(text); 
  const termTokens = _normPhraseTokens_(phrase); 

  if (!textTokens.length || !termTokens.length) return null; 
  if (textTokens.length < termTokens.length) return null; 

  let best = null; 

  for (let start = 0; start <= textTokens.length - termTokens.length; start++) { 
    const seg   = textTokens.slice(start, start + termTokens.length); 
    const score = _scoreSegmentAgainstTerm_(seg, termTokens); 

    if (!score) continue; 

    const candidate = { 
      start, 
      end: start + termTokens.length - 1, 
      totalDist: score.totalDist, 
      exactCount: score.exactCount, 
      tokenCount: score.tokenCount, 
      segment: seg.join(" "), 
      term: _normPhrase_(phrase) 
    }; 

    if (!best) { best = candidate; continue; } 
    if (candidate.totalDist < best.totalDist) { best = candidate; continue; } 
    if (candidate.totalDist === best.totalDist && candidate.exactCount > best.exactCount) { best = candidate; continue; } 

    if (candidate.totalDist === best.totalDist && 
        candidate.exactCount === best.exactCount && 
        candidate.term.length > best.term.length) { 
      best = candidate; 
    } 
  } 

  return best; 
} 

function _collectGroupedEntryTerms_(entry) { 
  if (!entry) return []; 

  const out = []; 
  const pushTerm = t => { 
    const s = String(t || "").trim(); 
    if (s) out.push(s); 
  }; 

  pushTerm(entry.name); 
  (entry.aliases || []).forEach(pushTerm); 

  const seen = {}; 

  return out.filter(term => { 
    const k = _normPhrase_(term); 
    if (!k || seen[k]) return false; 

    seen[k] = true; 
    return true; 
  }); 
} 

function _matchGroupedEntryByText_(text, groupedEntries) { 
  const detailed = _matchGroupedEntryDetailedByText_(String(text || ""), groupedEntries); 
  return detailed ? detailed.entry : null; 
} 

function _matchGroupedEntryDetailedByText_(text, groupedEntries) { 
  const sourceText = String(text || ""); 
  if (!_normPhrase_(sourceText)) return null; 

  const entries = Array.isArray(groupedEntries) ? groupedEntries : []; 
  if (!entries.length) return null; 

  // 1) Exact flexible phrase match. Prefer the longest match.
  let bestExact = null; 

  entries.forEach(entry => { 
    _collectGroupedEntryTerms_(entry).forEach(term => { 
      if (!_textHasFlexiblePhrase_(sourceText, term)) return; 

      const score = _normPhrase_(term).length; 

      if (!bestExact || score > bestExact.score) { 
        bestExact = { entry, score, term, matchedSegment: term, mode: "exact" }; 
      } 
    }); 
  }); 

  if (bestExact) return bestExact; 

  // 2) Segment fuzzy matching.
  let best = null; 
  let second = null; 

  entries.forEach(entry => { 
    _collectGroupedEntryTerms_(entry).forEach(term => { 
      const fuzzy = _findBestSegmentFuzzyMatch_(sourceText, term); 
      if (!fuzzy || fuzzy.totalDist <= 0) return; 

      const candidate = { 
        entry, 
        term, 
        totalDist: fuzzy.totalDist, 
        exactCount: fuzzy.exactCount, 
        termLen: _normPhrase_(term).length, 
        tokenCount: fuzzy.tokenCount, 
        matchedSegment: fuzzy.segment, 
        mode: "fuzzy" 
      }; 

      const isBetter = 
        !best || 
        candidate.totalDist < best.totalDist || 
        (candidate.totalDist === best.totalDist && candidate.exactCount > best.exactCount) || 
        (candidate.totalDist === best.totalDist && 
         candidate.exactCount === best.exactCount && 
         candidate.termLen > best.termLen); 

      if (isBetter) { 
        second = best; 
        best = candidate; 
      } else { 
        const isBetterThanSecond = 
          !second || 
          candidate.totalDist < second.totalDist || 
          (candidate.totalDist === second.totalDist && candidate.exactCount > second.exactCount) || 
          (candidate.totalDist === second.totalDist && 
           candidate.exactCount === second.exactCount && 
           candidate.termLen > second.termLen); 

        if (isBetterThanSecond) second = candidate; 
      } 
    }); 
  }); 

  if (!best) return null; 

  // Ambiguity guard.
  if (second && 
      second.entry !== best.entry && 
      second.totalDist === best.totalDist && 
      second.exactCount === best.exactCount && 
      Math.abs(second.termLen - best.termLen) <= 1) { 
    return null; 
  } 

  return best; 
} 

function _replaceMatchedSegmentOnly_(originalText, matchedSegment, correctedTerm) { 
  const raw       = String(originalText || ""); 
  const matched   = String(matchedSegment || "").trim(); 
  const corrected = String(correctedTerm || "").trim(); 

  if (!raw.trim() || !matched || !corrected) return raw.toUpperCase(); 

  const rawTokens       = _normPhraseTokens_(raw); 
  const segTokens       = _normPhraseTokens_(matched); 
  const correctedTokens = _normPhraseTokens_(corrected); 

  if (!rawTokens.length || !segTokens.length || rawTokens.length < segTokens.length) { 
    return raw.toUpperCase(); 
  } 

  for (let start = 0; start <= rawTokens.length - segTokens.length; start++) { 
    let ok = true; 

    for (let i = 0; i < segTokens.length; i++) { 
      const cmp = _compareMatcherTokens_(rawTokens[start + i], segTokens[i]); 
      if (!cmp || !cmp.ok) { 
        ok = false; 
        break; 
      } 
    } 

    if (!ok) continue; 

    return [] 
      .concat(rawTokens.slice(0, start)) 
      .concat(correctedTokens) 
      .concat(rawTokens.slice(start + segTokens.length)) 
      .join(" ") 
      .toUpperCase(); 
  } 

  return raw.toUpperCase(); 
} 

function _canonicalizeGroupedEntryText_(text, groupedEntries) { 
  const raw = String(text || "").trim(); 
  if (!raw) return null; 

  const detailed = _matchGroupedEntryDetailedByText_(raw, groupedEntries); 
  if (!detailed || !detailed.entry || !detailed.term) return null; 

  const correctedTerm = String(detailed.term || "").trim(); 
  if (!correctedTerm) return null; 

  const correctedText = _replaceMatchedSegmentOnly_( 
    raw, 
    String(detailed.matchedSegment || correctedTerm), 
    correctedTerm 
  ); 

  return { 
    entry: detailed.entry, 
    correctedText, 
    correctedTerm, 
    matchedSegment: String(detailed.matchedSegment || ""), 
    mode: detailed.mode 
  }; 
} 

function _cekFlagKey2h_(rowId) { 
  const id = String(rowId || "").trim(); 
  if (!id) return ""; 

  return "cek_" + _todayZg_() + "_2h_" + id; 
} 

function _getRowId_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_ID).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _ensureRowId_(sheet, row) { 
  let rowId = _getRowId_(sheet, row); 
  if (rowId) return rowId; 

  rowId = Utilities.getUuid(); 

  try { 
    sheet.getRange(row, STUPAC_ID).setValue(rowId).setFontColor("black"); 
  } catch (e) {} 

  return rowId; 
} 
 
function _isVipRowByI_(iText) { 
  return _isPrioritetnoText_(String(iText || "")); 
} 

function _hasAlarmEmoji_(bText) { 
  return String(bText || "").includes("⚠️"); 
} 

function _stripAlarmEmoji_(bText) { 
  return String(bText || "") 
    .replace(/^⚠️\s*/, "") 
    .split(EMOJI_ALARM).join("") 
    .replace(/\s{2,}/g, " ") 
    .trim(); 
} 

function _ensureAlarmEmojiInB_(bText) { 
  const clean = _stripAlarmEmoji_(bText); 
  if (!clean) return ""; 

  return clean + EMOJI_ALARM; 
} 

function _hasWait2hTag_(bText) { 
  return String(bText || "").includes(TEKST_CEKANJE); 
} 

function _hasWaitSportTag_(bText) { 
  return String(bText || "").includes(TEKST_CEKANJE_SPORT); 
} 

function _cleanWaitDecorButPreserveVip_(bText, isVip) { 
  let cleaned = String(bText || "") 
    .replace(/^⚠️\s*/i, "") 
    .replace(new RegExp(_reEscape_(TEKST_CEKANJE), "gi"), "") 
    .replace(new RegExp(_reEscape_(TEKST_CEKANJE_SPORT), "gi"), "") 
    .split(EMOJI_ALARM).join("") 
    .replace(/\s{2,}/g, " ") 
    .trim(); 

  if (isVip && cleaned) cleaned += EMOJI_ALARM; 

  return cleaned; 
} 

/* ── Sheet scan helpers ───────────────────────────────────────────────── */ 

function _findNextEmptyRowInColumn_(sheet, col, startRow, maxRow) { 
  startRow = Math.max(1, Number(startRow) || 1); 
  maxRow   = Math.min(Number(maxRow) || sheet.getMaxRows(), sheet.getMaxRows()); 

  if (maxRow < startRow) return startRow; 

  const vals = sheet.getRange(startRow, col, maxRow - startRow + 1, 1).getDisplayValues(); 
  let lastNonEmpty = startRow - 1; 

  for (let i = vals.length - 1; i >= 0; i--) { 
    if (_trim_(vals[i][0]) !== "") { 
      lastNonEmpty = startRow + i; 
      break; 
    } 
  } 

  return Math.min(lastNonEmpty + 1, maxRow); 
} 

function _setReportStatusInColumnB_(sheet, text, bg) { 
  try { 
    const row  = _findNextEmptyRowInColumn_(sheet, STUPAC_B, 2, Math.min(sheet.getMaxRows(), MAX_TEMPLATE_ROW)); 
    const cell = sheet.getRange(row, STUPAC_B); 

    cell.setValue(text); 
    if (bg) cell.setBackground(bg); 
  } catch (e) {} 
} 

function _groupConsecutiveRows_(rows) { 
  if (!rows || !rows.length) return []; 

  const sorted = rows.slice().sort((a, b) => a - b); 
  const out = []; 

  let start = sorted[0]; 
  let prev = sorted[0]; 

  for (let i = 1; i < sorted.length; i++) { 
    const cur = sorted[i]; 

    if (cur === prev + 1) { 
      prev = cur; 
      continue; 
    } 

    out.push({ start, len: prev - start + 1 }); 
    start = cur; 
    prev = cur; 
  } 

  out.push({ start, len: prev - start + 1 }); 
  return out; 
} 

function _scanEndRowByColumnB_(sheet, maxRow, bufferRows) { 
  const hardMax = Math.min(Number(maxRow) || MAX_TEMPLATE_ROW, sheet.getMaxRows(), MAX_TEMPLATE_ROW); 
  if (hardMax < 2) return 2; 

  const vB = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getDisplayValues(); 
  let lastNonEmpty = 1; 

  for (let i = vB.length - 1; i >= 0; i--) { 
    if (_trim_(vB[i][0]) !== "") { 
      lastNonEmpty = i + 2; 
      break; 
    } 
  } 

  return Math.max(2, Math.min(hardMax, lastNonEmpty + Math.max(0, Number(bufferRows) || 0))); 
} 

function _scanEndRowByLastStruckInB_(sheet, maxRow, bufferRows) { 
  const hardMax = Math.min(Number(maxRow) || MAX_TEMPLATE_ROW, sheet.getMaxRows(), MAX_TEMPLATE_ROW); 
  if (hardMax < 2) return 2; 

  const fL = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getFontLines(); 
  let lastStruck = 0; 

  for (let i = fL.length - 1; i >= 0; i--) { 
    if (fL[i][0] === "line-through") { 
      lastStruck = i + 2; 
      break; 
    } 
  } 

  if (!lastStruck) return 2; 

  return Math.max(2, Math.min(hardMax, lastStruck + Math.max(0, Number(bufferRows) || 0))); 
} 

function _isReportOrKpiRowInB_(bText) { 
  const t = _trim_(bText); 
  if (!t) return false; 

  const low = t.toLowerCase(); 

  if (t.startsWith("✅") || t.startsWith("⛔")) return true; 
  if (low.startsWith("saved") || low.startsWith("error")) return true; 
  if (low.startsWith("spremjeno") || low.startsWith("greška") || low.startsWith("greska")) return true; 
  if (low.startsWith("category-a (") || low.startsWith("category-b (")) return true; 
  if (low.startsWith("kat (") || low.startsWith("sportski (")) return true; 

  return false; 
} 

function _lastDataRowByColumnB_(sheet) { 
  const hardMax = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (hardMax < 2) return 1; 

  const vB = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getDisplayValues(); 

  for (let i = vB.length - 1; i >= 0; i--) { 
    const b = _trim_(vB[i][0]); 

    if (!b || _isReportOrKpiRowInB_(b)) continue; 
    return i + 2; 
  } 

  return 1; 
} 

/**
 * Backwards-compatible alias from the original implementation.
 */
function _lastPatientRowByColumnB_(sheet) { 
  return _lastDataRowByColumnB_(sheet); 
} 

function _fixNextEmptyBRowIfStruck_() { 
  const sheet = _getTargetSheet_(); 
  if (!sheet) return null; 

  const endRow = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (endRow < 2) return null; 

  const numRows = endRow - 1; 
  const rangeB  = sheet.getRange(2, STUPAC_B, numRows, 1); 
  const vB      = rangeB.getDisplayValues(); 
  const fL      = rangeB.getFontLines(); 

  let firstEmpty = -1; 

  for (let i = 0; i < numRows; i++) { 
    if (_trim_(vB[i][0]) === "") { 
      firstEmpty = i; 
      break; 
    } 
  } 

  if (firstEmpty < 0) return null; 

  let changed = 0; 

  for (let i = firstEmpty; i < numRows; i++) { 
    if (_trim_(vB[i][0]) !== "") break; 

    if (fL[i][0] === "line-through") { 
      sheet.getRange(i + 2, STUPAC_B).setFontLine("none"); 
      changed++; 
    } 
  } 

  return { row: firstEmpty + 2, changed }; 
}

/* ── Row signature / row state helpers ───────────────────────────────── */ 

function _hashString32_(input) { 
  const s = String(input == null ? "" : input); 
  let h = 2166136261; 

  for (let i = 0; i < s.length; i++) { 
    h ^= s.charCodeAt(i); 
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); 
  } 

  return (h >>> 0).toString(16).padStart(8, "0"); 
} 

function _sigPart_(v) { 
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); 
} 

function _buildRowSignatureLite_(ctx) { 
  const parts = [ 
    "B="   + _sigPart_(_ctxVal_(ctx, STUPAC_B)), 
    "C="   + _sigPart_(_ctxVal_(ctx, STUPAC_C)), 
    "D="   + _sigPart_(_ctxVal_(ctx, STUPAC_D)), 
    "E="   + _sigPart_(_ctxVal_(ctx, STUPAC_E)), 
    "F="   + _sigPart_(_ctxVal_(ctx, STUPAC_F)), 
    "G="   + _sigPart_(_ctxVal_(ctx, STUPAC_G)), 
    "H="   + _sigPart_(_ctxVal_(ctx, STUPAC_H)), 
    "I="   + _sigPart_(_ctxVal_(ctx, STUPAC_I)), 
    "J="   + _sigPart_(_ctxVal_(ctx, STUPAC_J)), 
    "FLB=" + _sigPart_(ctx.fontLineB || "none") 
  ]; 

  return _hashString32_(parts.join("¦")); 
} 

function _deriveRowStateLite_(ctx) { 
  const b = String(_ctxVal_(ctx, STUPAC_B) || ""); 
  const i = String(_ctxVal_(ctx, STUPAC_I) || ""); 
  const bTrim = _trim_(b); 

  if (!bTrim) return "EMPTY"; 
  if (_isReportOrKpiRowInB_(bTrim)) return "SYS"; 
  if (ctx.fontLineB === "line-through") return "DONE_PENDING_CLEAN"; 
  if (_isVipRowByI_(i)) return "VIP"; 
  if (_hasWaitSportTag_(b)) return "WAIT_SPORT"; 
  if (_hasWait2hTag_(b)) return "WAIT_2H"; 

  return "ACTIVE"; 
} 

function _getRowSysState_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_SYS_STATE).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _getRowSysSignature_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_SYS_SIG).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _patchSetRowSysState_(patch, state) { 
  if (typeof STUPAC_SYS_STATE !== "number") return; 
  _patchSetValue_(patch, STUPAC_SYS_STATE, String(state || "")); 
} 

function _patchSetRowSysSignature_(patch, signature) { 
  if (typeof STUPAC_SYS_SIG !== "number") return; 
  _patchSetValue_(patch, STUPAC_SYS_SIG, String(signature || "")); 
} 

function _isSameRowSignatureAlreadyStored_(sheet, row, signature) { 
  try { 
    const oldSig = _getRowSysSignature_(sheet, row); 
    return !!oldSig && oldSig === String(signature || ""); 
  } catch (e) { 
    return false; 
  } 
} 

function _patchFinalizeRowMeta_(ctx, patch) { 
  const state = _deriveRowStateLite_(ctx); 
  const sig   = _buildRowSignatureLite_(ctx); 

  _patchSetRowSysState_(patch, state); 
  _patchSetRowSysSignature_(patch, sig); 

  return { state, sig }; 
} 

/* ── Lite row context / patch helpers ────────────────────────────────── */ 

const LITE_DEBUG_ENABLED = false; 

function _liteDebug_() { 
  if (!LITE_DEBUG_ENABLED) return; 

  try { 
    console.log.apply(console, arguments); 
  } catch (e) {} 
} 

function _ctxColOffset_(col) { 
  return Number(col) - STUPAC_B; 
} 

function _buildRowContextLite_(sheet, row, editedCol, allowUi, unesenaVrijednost) { 
  const rowDisp   = sheet.getRange(row, STUPAC_B, 1, STUPAC_J - STUPAC_B + 1).getDisplayValues()[0]; 
  const fontLineB = sheet.getRange(row, STUPAC_B).getFontLine(); 

  return { 
    sheet, 
    row, 
    editedCol: Number(editedCol), 
    allowUi: !!allowUi, 
    rowDisp: rowDisp.slice(), 
    fontLineB: fontLineB || "none", 
    editedValue: String(unesenaVrijednost == null ? "" : unesenaVrijednost) 
  }; 
} 

/* ── Patch helpers ───────────────────────────────────────────────────── */ 

function _ctxVal_(ctx, col) { 
  const idx = _ctxColOffset_(col); 
  return (idx < 0 || idx >= ctx.rowDisp.length) ? "" : ctx.rowDisp[idx]; 
} 

function _ctxSetVal_(ctx, col, value) { 
  const idx = _ctxColOffset_(col); 

  if (idx < 0 || idx >= ctx.rowDisp.length) return; 

  ctx.rowDisp[idx] = String(value == null ? "" : value); 
} 

function _newRowPatch_() { 
  return { values: {}, backgrounds: [], richText: {}, clearNotes: {}, fontColors: {} }; 
} 

function _patchSetValue_(patch, col, value) { 
  patch.values[String(col)] = String(value == null ? "" : value); 
} 

function _patchSetBackground_(patch, colStart, numCols, color) { 
  patch.backgrounds.push({ colStart: Number(colStart), numCols: Number(numCols), color }); 
} 

function _patchSetRichText_(patch, col, richTextValue) { 
  patch.richText[String(col)] = richTextValue; 
} 

function _patchClearNote_(patch, col) { 
  patch.clearNotes[String(col)] = true; 
} 

function _patchSetFontColor_(patch, col, color) { 
  patch.fontColors[String(col)] = color; 
} 

function _buildTaggedRichTextValue_(text, taggedParts) { 
  const txt     = String(text || ""); 
  const builder = SpreadsheetApp.newRichTextValue().setText(txt); 

  (taggedParts || []).forEach(part => { 
    if (!part || !part.text) return; 

    const start = Number(part.start); 
    const end   = Number(part.end); 

    if (!(end > start)) return; 

    builder.setTextStyle(start, end, part.style); 
  }); 

  return builder.build(); 
} 

function _patchSetRichOrPlain_(patch, col, text, taggedParts) { 
  const txt = String(text || ""); 

  if (!taggedParts || !taggedParts.length) { 
    _patchSetValue_(patch, col, txt); 
    return; 
  } 

  _patchSetRichText_(patch, col, _buildTaggedRichTextValue_(txt, taggedParts)); 
} 

function _applyRowPatchLite_(sheet, row, patch) { 
  if (!patch) return; 

  Object.keys(patch.clearNotes || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).clearNote(); 
    } catch (e) { 
      console.error("_applyRowPatchLite clearNote error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  (patch.backgrounds || []).forEach(bg => { 
    try { 
      sheet.getRange(row, bg.colStart, 1, bg.numCols).setBackground(bg.color); 
    } catch (e) { 
      console.error("_applyRowPatchLite background error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  const valueCols = Object.keys(patch.values || {}) 
    .map(Number) 
    .filter(col => !(patch.richText && patch.richText[String(col)])) 
    .sort((a, b) => a - b); 

  if (valueCols.length) { 
    const groups = []; 

    let start = valueCols[0]; 
    let prev  = valueCols[0]; 

    for (let i = 1; i < valueCols.length; i++) { 
      const col = valueCols[i]; 

      if (col === prev + 1) { 
        prev = col; 
        continue; 
      } 

      groups.push({ start, end: prev }); 
      start = col; 
      prev = col; 
    } 

    groups.push({ start, end: prev }); 

    groups.forEach(g => { 
      try { 
        const rowVals = []; 

        for (let col = g.start; col <= g.end; col++) { 
          rowVals.push(patch.values[String(col)] == null ? "" : patch.values[String(col)]); 
        } 

        sheet.getRange(row, g.start, 1, g.end - g.start + 1).setValues([rowVals]); 
      } catch (e) { 
        console.error("_applyRowPatchLite setValues error:", e && e.stack ? e.stack : e); 
      } 
    }); 
  } 

  Object.keys(patch.richText || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).setRichTextValue(patch.richText[colStr]); 
    } catch (e) { 
      console.error("_applyRowPatchLite richText error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  Object.keys(patch.fontColors || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).setFontColor(patch.fontColors[colStr]); 
    } catch (e) { 
      console.error("_applyRowPatchLite fontColor error:", e && e.stack ? e.stack : e); 
    } 
  }); 
} 

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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 08 · FUZZY STANDARDIZATION C — Fuzzy standardization of column C values
 * ═══════════════════════════════════════════════════════════════════════ */ 

const C_ALIASI = { 
  "boks":                  "SPORTSKI", 
  "boxing":                "SPORTSKI", 
  "boks godišnji":         "SPORTSKI", 
  "boks godisnji":         "SPORTSKI", 
  "boks polugodisnji":     "SPORTSKI", 
  "opća radna":            "OPĆA RADNA SPOSOBNOST", 
  "opca radna":            "OPĆA RADNA SPOSOBNOST", 
  "voditelj brodice":      "POMORAC", 
  "ls za pomorca":         "POMORAC" 
}; 

function _levenshteinDistanceCapped_(a, b, cap) { 
  a = String(a || ""); 
  b = String(b || ""); 

  if (a === b) return 0; 

  const la = a.length; 
  const lb = b.length; 

  if (Math.abs(la - lb) > cap) return cap + 1; 
  if (la === 0) return lb <= cap ? lb : cap + 1; 
  if (lb === 0) return la <= cap ? la : cap + 1; 

  const INF  = 1e9; 
  let   prev = new Array(lb + 1).fill(INF); 
  let   curr = new Array(lb + 1).fill(INF); 

  for (let j = 0; j <= Math.min(lb, cap); j++) prev[j] = j; 

  for (let i = 1; i <= la; i++) { 
    const from = Math.max(1, i - cap); 
    const to   = Math.min(lb, i + cap); 

    curr[0] = i <= cap ? i : INF; 

    let rowMin = INF; 

    for (let j = from; j <= to; j++) { 
      const cost = (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) ? 0 : 1; 
      const v    = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost); 

      curr[j] = v; 
      if (v < rowMin) rowMin = v; 
    } 

    if (rowMin > cap) return cap + 1; 

    for (let j = 0; j <= lb; j++) { 
      prev[j] = curr[j]; 
      curr[j] = INF; 
    } 
  } 

  return prev[lb] <= cap ? prev[lb] : cap + 1; 
} 

function _isRegisterMarkerToken_(word) {
  const w = String(word || "").toUpperCase();
  return w === "REGISTER" || w === "PUR";
}

function _markerFromToken_(word) {
  const w = String(word || "").toUpperCase();
  return w === "PUR" ? "PUR" : "REGISTER";
}

function _standardizirajTipC_(vCraw) { 
  const s0 = String(vCraw || ""); 
  if (!s0.trim()) return null; 

  // Direct alias match against the full cell value, case-insensitive.
  const alias = C_ALIASI[s0.trim().toLowerCase()]; 
  if (alias) return alias; 

  const CAND = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 }, 
    { canon: "POMORAC",    key: "POMORAC",    cap: 3 }, 
    { canon: "NASTAVAK",   key: "NASTAVAK",   cap: 2 }, 
    { canon: "ROČNIK",     key: "ROCNIK",     cap: 2 } 
  ]; 

  const tokenRe = /[A-Za-z0-9ČĆĐŠŽčćđšž]+/g; 
  const matches = []; 
  let m; 

  while ((m = tokenRe.exec(s0)) !== null) { 
    matches.push({ text: m[0], start: m.index, end: m.index + m[0].length }); 
  } 

  if (!matches.length) return null; 

  const normWord = w => _normTxt_(w).toUpperCase(); 

  let registerIdx = matches.findIndex(t => _isRegisterMarkerToken_(normWord(t.text))); 
  let typeIdx     = registerIdx >= 0 ? (registerIdx + 1 < matches.length ? registerIdx + 1 : -1) : 0; 

  if (registerIdx >= 0 && typeIdx < 0) {
    return _markerFromToken_(normWord(matches[registerIdx].text));
  }

  const hasREGISTER = (registerIdx >= 0); 
  const marker = hasREGISTER ? _markerFromToken_(normWord(matches[registerIdx].text)) : "REGISTER";

  if (typeIdx + 2 < matches.length) { 
    const d1 = _levenshteinDistanceCapped_(normWord(matches[typeIdx].text),     "OPCA",  3); 
    const d2 = _levenshteinDistanceCapped_(normWord(matches[typeIdx + 1].text), "RADNA", 3); 

    if (d1 <= 3 && d2 <= 3) { 
      let before  = s0.slice(0, matches[typeIdx].start); 
      const after = s0.slice(matches[typeIdx + 2].end); 

      if (hasREGISTER && normWord(matches[registerIdx].text) !== marker) { 
        const pt = matches[registerIdx]; 
        before = before.slice(0, pt.start) + marker + before.slice(pt.end); 
      } 

      return before + "OPĆA RADNA SPOSOBNOST" + after; 
    } 
  } 
 
  if (typeIdx + 1 < matches.length) { 
    const d1 = _levenshteinDistanceCapped_(normWord(matches[typeIdx].text),     "NOCNI", 2); 
    const d2 = _levenshteinDistanceCapped_(normWord(matches[typeIdx + 1].text), "RAD",   1); 

    if (d1 <= 2 && d2 <= 1) { 
      let before  = s0.slice(0, matches[typeIdx].start); 
      const after = s0.slice(matches[typeIdx + 1].end); 

      if (hasREGISTER && normWord(matches[registerIdx].text) !== marker) { 
        const pt = matches[registerIdx]; 
        before = before.slice(0, pt.start) + marker + before.slice(pt.end); 
      } 

      return before + "NOĆNI RAD" + after; 
    } 
  } 

  let t0        = matches[typeIdx].text; 
  let tNorm     = normWord(t0); 
  let candidate = tNorm; 

  if (!hasREGISTER && tNorm.startsWith("REGISTER") && tNorm.length > "REGISTER".length) { 
    candidate = tNorm.slice("REGISTER".length); 
  } 

  if (!hasREGISTER && tNorm.startsWith("PUR") && tNorm.length > "PUR".length) { 
    candidate = tNorm.slice("PUR".length); 
  } 

  if (!candidate.trim() || candidate.length < 4) return null; 

  let best = null; 

  for (const c of CAND) { 
    if (!candidate[0] || candidate[0] !== c.key[0]) continue; 

    const d = _levenshteinDistanceCapped_(candidate, c.key, c.cap); 

    if (d <= c.cap && (!best || d < best.d)) { 
      best = { canon: c.canon, d }; 
    } 
  } 

  if (!best) return null; 

  let out = s0; 

  if (registerIdx >= 0) { 
    const registerTok = matches[registerIdx]; 
    const markerForOutput = _markerFromToken_(normWord(registerTok.text));

    if (registerTok.text !== markerForOutput) { 
      out = out.slice(0, registerTok.start) + markerForOutput + out.slice(registerTok.end); 

      const delta = markerForOutput.length - (registerTok.end - registerTok.start); 

      if (delta !== 0) { 
        matches.slice(registerIdx + 1).forEach(mi => { 
          mi.start += delta; 
          mi.end += delta; 
        }); 
      } 
    } 

    const typTok = matches[typeIdx]; 
    return out.slice(0, typTok.start) + best.canon + out.slice(typTok.end); 
  } 

  if (!hasREGISTER && tNorm.startsWith("REGISTER") && tNorm.length > "REGISTER".length) { 
    const tok = matches[typeIdx]; 
    return out.slice(0, tok.start) + "REGISTER " + best.canon + out.slice(tok.end); 
  } 

  if (!hasREGISTER && tNorm.startsWith("PUR") && tNorm.length > "PUR".length) { 
    const tok = matches[typeIdx]; 
    return out.slice(0, tok.start) + "PUR " + best.canon + out.slice(tok.end); 
  } 

  const tok2 = matches[typeIdx]; 
  return out.slice(0, tok2.start) + best.canon + out.slice(tok2.end); 
} 

function _sanitizeInvalidRegisterType_(vCraw) { 
  const s0 = String(vCraw || "").trim(); 
  if (!s0) return null; 

  const plusIdx   = s0.indexOf("+"); 
  const leftPart  = plusIdx >= 0 ? s0.slice(0, plusIdx).trim() : s0; 
  const rightPart = plusIdx >= 0 ? s0.slice(plusIdx).trim() : ""; 

  if (!leftPart) return null; 

  const tokenRe = /[A-Za-z0-9ČĆĐŠŽčćđšž]+/g; 
  const matches = []; 
  let m; 

  while ((m = tokenRe.exec(leftPart)) !== null) { 
    matches.push({ text: m[0], start: m.index, end: m.index + m[0].length }); 
  } 

  if (!matches.length) return null; 

  const normWord = w => _normTxt_(w).toUpperCase(); 
  const registerIdx = matches.findIndex(t => _isRegisterMarkerToken_(normWord(t.text))); 

  if (registerIdx < 0) return null; 

  const marker = _markerFromToken_(normWord(matches[registerIdx].text));

  // Only marker without a type: leave unchanged.
  if (registerIdx === matches.length - 1) return null; 

  const afterRegisterTokens = matches.slice(registerIdx + 1); 
  if (!afterRegisterTokens.length) return null; 

  const REGISTER_SINGLE_TYPES = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
  ]; 

  // 1) If the first token after REGISTER/PUR matches a valid single-token type,
  // keep only "<MARKER> <TYPE>" and ignore any noise before the plus suffix.
  const nextTok = normWord(afterRegisterTokens[0].text); 
  let matchedSingle = null; 

  for (const t of REGISTER_SINGLE_TYPES) { 
    if (_levenshteinDistanceCapped_(nextTok, t.key, t.cap) <= t.cap) { 
      matchedSingle = t.canon; 
      break; 
    } 
  } 

  if (matchedSingle) { 
    const cleanedLeft = marker + " " + matchedSingle; 
    return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
  } 

  // 2) Multi-token valid types.
  if (afterRegisterTokens.length >= 3) { 
    const t1 = normWord(afterRegisterTokens[0].text); 
    const t2 = normWord(afterRegisterTokens[1].text); 
    const t3 = normWord(afterRegisterTokens[2].text); 

    const isOpcaRadnaSposobnost = 
      _levenshteinDistanceCapped_(t1, "OPCA", 3) <= 3 && 
      _levenshteinDistanceCapped_(t2, "RADNA", 3) <= 3 && 
      _levenshteinDistanceCapped_(t3, "SPOSOBNOST", 4) <= 4; 

    if (isOpcaRadnaSposobnost) { 
      const cleanedLeft = marker + " OPĆA RADNA SPOSOBNOST"; 
      return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
    } 
  } 

  if (afterRegisterTokens.length >= 2) { 
    const t1 = normWord(afterRegisterTokens[0].text); 
    const t2 = normWord(afterRegisterTokens[1].text); 

    const isNocniRad = 
      _levenshteinDistanceCapped_(t1, "NOCNI", 2) <= 2 && 
      _levenshteinDistanceCapped_(t2, "RAD", 1) <= 1; 

    if (isNocniRad) { 
      const cleanedLeft = marker + " NOĆNI RAD"; 
      return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
    } 
  } 

  // 3) If no valid REGISTER/PUR type is found, mark it as invalid.
  return rightPart 
    ? marker + " [invalid workflow type] " + rightPart 
    : marker + " [invalid workflow type]"; 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 09 · CATEGORY NORMALIZATION — Domain normalization for category/type combinations
 * ═══════════════════════════════════════════════════════════════════════ */ 

const KAT_CATEGORY_TOKENS_ORDER = [ 
  "A", "B", "AM", "A1", "A2", 
  "BE", "DE", 
  "PROF", 
  "C1E", "C1", "CE", "C", 
  "D1E", "D1", "D", 
  "E", "H" 
]; 

function _tokenizeUpper_(sUpper) { 
  const re  = /[A-Z]{1,2}\d+[A-Z]+|[A-Z]{1,2}\d+|[A-Z]+/g; 
  const out = []; 
  let m; 

  while ((m = re.exec(String(sUpper || ""))) !== null) out.push(m[0]); 

  return out; 
} 

function _isWorkflowMarkerToken_(tok) {
  const t = String(tok || "").toUpperCase();
  return t === "PUR" || t === "REGISTER";
}

function _workflowMarkerFromTokens_(tokens) {
  const toks = Array.isArray(tokens) ? tokens : [];
  const found = toks.find(_isWorkflowMarkerToken_);
  return found === "PUR" ? "PUR" : "REGISTER";
}

function _isFuzzyKategorija_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "KATEGORIJA" || t === "KATEGORIJE") return true; 

  return _levenshteinDistanceCapped_(t, "KATEGORIJA", 2) <= 2; 
} 

function _isExactProduljenje_(tok) { 
  return tok === "PRODULJENJE" || tok === "PRODULJENJA"; 
} 

function _isFuzzyProduljenje_(tok) { 
  const t = String(tok || ""); 
  if (!t || _isExactProduljenje_(t)) return false; 
  if (t === "PRODUZENJE" || t === "PRODUZENJA") return true; 

  return _levenshteinDistanceCapped_(t, "PRODULJENJE", 2) <= 2 
      || _levenshteinDistanceCapped_(t, "PRODUZENJE",  2) <= 2; 
} 

function _isExactIzvanredni_(tok) { 
  return String(tok || "") === "IZVANREDNI"; 
} 

function _isFuzzyIzvanredni_(tok) { 
  const t = String(tok || ""); 
  return t && !_isExactIzvanredni_(t) && _levenshteinDistanceCapped_(t, "IZVANREDNI", 2) <= 2; 
} 

function _isCategoryToken_(tok) { 
  return KAT_CATEGORY_TOKENS_ORDER.indexOf(String(tok || "")) !== -1; 
} 

function _isFuzzyZamjena_(tok) { 
  const t = String(tok || ""); 
  if (t.length < 5) return false; 
  if (["ZAMJENA", "ZAMJENE", "ZAMJENOM", "ZAMJENU"].includes(t)) return true; 

  return _levenshteinDistanceCapped_(t, "ZAMJENA", 2) <= 2; 
} 

function _isZamjenaPratecniToken_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 

  for (const group of [ 
    ["ZAMJENA", "ZAMJENE", "ZAMJENOM", "ZAMJENU"], 
    ["INOZEMNE", "INOZEMNA", "INOZEMNU", "INOZEMNOM"], 
    ["VOZACKE", "VOZACKA", "VOZACKU", "VOZACKOM"], 
    ["DOZVOLE", "DOZVOLA", "DOZVOLU", "DOZVOLOM"] 
  ]) { 
    if (group.includes(t)) return true; 
    if (_levenshteinDistanceCapped_(t, group[0], 2) <= 2) return true; 
  } 

  return false; 
} 

function _isFuzzySportski_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "SPORTSKI") return true; 

  return _levenshteinDistanceCapped_(t, "SPORTSKI", 2) <= 2; 
} 

function _looksLikeSportskiText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0 = _normUpperNoDiacritics_(s); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

  if (compact === "SPORTSKI") return true; 

  const tokens = _tokenizeUpper_(up0); 
  return tokens.some(_isFuzzySportski_); 
} 

function _normalizeSportskiStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  const up0 = _normUpperNoDiacritics_(original); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

  if (compact === "SPORTSKI") { 
    return original === "SPORTSKI" ? null : { text: "SPORTSKI" }; 
  } 

  const tokens = _tokenizeUpper_(up0); 
  if (!tokens.length) return null; 

  if (tokens.length === 1 && _isFuzzySportski_(tokens[0])) { 
    return { text: "SPORTSKI" }; 
  } 

  return null; 
} 

/* ── ROČNIK helpers ──────────────────────────────────────────────────── */ 

function _looksLikeRocnikText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0    = _normUpperNoDiacritics_(s); 
  const tokens = _tokenizeUpper_(up0); 

  return tokens.some(t => 
    t === "MORH"    || 
    t === "HV"      || 
    t === "VOJSKA"  || 
    t === "ROCNIK"  || 
    t === "ROCNICI" || 
    t === "NOVAK"   || 
    t === "NOVACI" 
  ); 
} 

function _normalizeRocnikStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 
  if (!_looksLikeRocnikText_(original)) return null; 
  if (original === "ROČNIK") return null; 

  return { text: "ROČNIK" }; 
} 

function _isFuzzyPromjena_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "PROMJENA") return true; 

  return _levenshteinDistanceCapped_(t, "PROMJENA", 2) <= 2; 
} 

function _fuzzyMatchPZS_tokens_(tokens) { 
  for (let i = 0; i + 2 < tokens.length; i++) { 
    if (_levenshteinDistanceCapped_(tokens[i],     "PROMJENA",     2) <= 2 && 
        _levenshteinDistanceCapped_(tokens[i + 1], "ZDRAVSTVENOG", 3) <= 3 && 
        _levenshteinDistanceCapped_(tokens[i + 2], "STANJA",       2) <= 2) { 
      return true; 
    } 
  } 

  return false; 
} 

function _extractIzvanredniReason_(rawUpperNoDia) { 
  const s = String(rawUpperNoDia || ""); 
  const tokens = _tokenizeUpper_(s); 

  if (/\bPROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*\b/.test(s)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (_fuzzyMatchPZS_tokens_(tokens)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (/\bPROMJEN\w*\b/.test(s) || tokens.some(_isFuzzyPromjena_)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (/\bALKOHOL\w*\b/.test(s)) return "ALKOHOL"; 
  if (/\bDROG\w*\b/.test(s)) return "DROGA"; 

  return null; 
} 

function _extractIzvanredniTag_(rawUpperNoDia) { 
  const s = String(rawUpperNoDia || ""); 
  const m = s.match(/\bIZVANREDNI\b\s*[-\u2013\u2014]\s*(ALKOHOL\w*|DROG\w*|PROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*|PROMJEN\w*)\b/); 

  if (m) { 
    const det = String(m[1] || "").replace(/\s+/g, " ").trim(); 

    if (/^ALKOHOL/.test(det)) return "IZVANREDNI - ALKOHOL"; 
    if (/^DROG/.test(det))    return "IZVANREDNI - DROGA"; 
    if (/^PROMJEN/.test(det)) return "IZVANREDNI - PROMJENA ZDRAVSTVENOG STANJA"; 

    return "IZVANREDNI"; 
  } 

  if (/\bIZVANREDNI\b/.test(s)) { 
    const reason = _extractIzvanredniReason_(s); 
    return reason ? "IZVANREDNI - " + reason : "IZVANREDNI"; 
  } 

  return null; 
} 
 
function _looksLikeKatLikeText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0    = _normUpperNoDiacritics_(s); 
  const tokens = _tokenizeUpper_(up0); 

  return tokens.includes("KAT") || 
         tokens.some(_isFuzzyKategorija_) || 
         tokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)) || 
         tokens.some(_isCategoryToken_) || 
         tokens.some(_isExactIzvanredni_) || 
         tokens.some(_isFuzzyIzvanredni_) || 
         tokens.some(_isFuzzyZamjena_); 
} 

function _normalizeKatLikeStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  const up0     = _normUpperNoDiacritics_(original); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 
  const tokens  = _tokenizeUpper_(up0); 

  if (compact === "SPORTSKI") return { text: "SPORTSKI" }; 

  let hasKatWord = (tokens.indexOf("KAT") !== -1); 
  let hasKategF  = false; 
  let hasProd    = false; 
  let hasIzExact = false; 
  let hasIzFuzzy = false; 
  let hasZamjena = false; 

  for (const t of tokens) { 
    if (_isFuzzyKategorija_(t)) hasKategF = true; 
    if (_isExactProduljenje_(t) || _isFuzzyProduljenje_(t)) hasProd = true; 
    if (_isExactIzvanredni_(t)) hasIzExact = true; 
    else if (_isFuzzyIzvanredni_(t)) hasIzFuzzy = true; 
    if (_isFuzzyZamjena_(t)) hasZamjena = true; 
  } 

  if (!hasKatWord && !hasKategF && !hasProd && !hasIzExact && !hasIzFuzzy && !hasZamjena && 
      !tokens.some(_isCategoryToken_)) { 
    return null; 
  } 

  const seenCat = {}; 
  const chosenTokens = []; 

  for (const t of tokens) { 
    if (_isCategoryToken_(t) && !seenCat[t]) { 
      chosenTokens.push(t); 
      seenCat[t] = true; 
    } 
  } 

  let izvanTag = _extractIzvanredniTag_(up0); 

  if (!izvanTag && (hasIzExact || hasIzFuzzy)) { 
    const ir = _extractIzvanredniReason_(up0); 
    izvanTag = ir ? "IZVANREDNI - " + ir : "IZVANREDNI"; 
  } 

  if (!izvanTag && (hasKatWord || hasKategF || hasProd)) { 
    const ir = _extractIzvanredniReason_(up0); 
    if (ir) izvanTag = "IZVANREDNI - " + ir; 
  } 

  const zamjenaTag = (hasZamjena && (hasKatWord || hasKategF || hasProd || chosenTokens.length > 0)) 
    ? "ZAMJENA INOZEMNE VOZAČKE DOZVOLE" 
    : null; 

  if (chosenTokens.length > 0) { 
    let canon = chosenTokens.join(" ") + " KAT"; 

    if (hasProd) canon += " PRODULJENJE"; 
    if (izvanTag) canon += " " + izvanTag; 
    if (zamjenaTag) canon += " " + zamjenaTag; 

    return { text: canon }; 
  } 

  let fallback = tokens.slice(); 

  for (let i = 0; i < fallback.length; i++) { 
    if (_isFuzzyKategorija_(fallback[i])) { 
      fallback[i] = "KAT"; 
      hasKatWord = true; 
    } else if (_isExactProduljenje_(fallback[i]) || _isFuzzyProduljenje_(fallback[i])) { 
      fallback[i] = "PRODULJENJE"; 
    } else if (_isExactIzvanredni_(fallback[i]) || _isFuzzyIzvanredni_(fallback[i])) { 
      fallback[i] = "IZVANREDNI"; 
    } 
  } 

  if (hasProd && fallback.indexOf("KAT") === -1) { 
    fallback.push("KAT"); 
  } 

  fallback = fallback.filter(t => !(zamjenaTag && _isZamjenaPratecniToken_(t))); 

  let out = fallback.join(" ").replace(/\s+/g, " ").trim(); 

  if (izvanTag) { 
    out = out 
      .replace(/\bIZVANREDNI\b(\s*[-\u2013\u2014]?\s*(ALKOHOL\w*|DROG\w*|PROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*|PROMJEN\w*))?/g, "") 
      .replace(/\s+/g, " ") 
      .trim(); 

    out = (out ? out + " " : "") + izvanTag; 
  } 

  if (zamjenaTag) out = (out ? out + " " : "") + zamjenaTag; 

  return { text: out }; 
} 

function _sanitizeInvalidKatTypeSegment_(segmentRaw) { 
  const raw = String(segmentRaw || "").trim(); 
  if (!raw) return null; 

  const up0    = _normUpperNoDiacritics_(raw); 
  const tokens = _tokenizeUpper_(up0); 

  if (!tokens.length) return null; 

  const seenCat = {}; 
  const cats = []; 

  for (const t of tokens) { 
    if (_isCategoryToken_(t) && !seenCat[t]) { 
      cats.push(t); 
      seenCat[t] = true; 
    } 
  } 

  const hasKatWord = 
    tokens.includes("KAT") || 
    tokens.some(_isFuzzyKategorija_) || 
    cats.length > 0; 

  if (!hasKatWord) return null; 

  const hasProd = tokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)); 
  const hasIzv = tokens.some(t => _isExactIzvanredni_(t) || _isFuzzyIzvanredni_(t)); 

  const hasZamjena = 
    tokens.some(_isFuzzyZamjena_) || 
    /\bZAMJEN\w*\s+INOZEMN\w*\s+VOZAC\w*\s+DOZVOL\w*\b/.test(up0); 

  const mutuallyExclusiveCount = [hasProd, hasIzv, hasZamjena].filter(Boolean).length; 

  if (mutuallyExclusiveCount <= 1) return null; 

  const leftBase = cats.length ? (cats.join(" ") + " KAT") : "KAT"; 
  return leftBase + " [invalid workflow type]"; 
} 

function _sanitizeInvalidKatType_(vCraw) { 
  const s0 = String(vCraw || "").trim(); 
  if (!s0) return null; 

  const plusIdx = s0.indexOf("+"); 

  if (plusIdx < 0) { 
    return _sanitizeInvalidKatTypeSegment_(s0); 
  } 

  const leftPart  = s0.slice(0, plusIdx).trim(); 
  const rightPart = s0.slice(plusIdx + 1).trim(); 

  const leftSan  = _sanitizeInvalidKatTypeSegment_(leftPart); 
  const rightSan = _sanitizeInvalidKatTypeSegment_(rightPart); 

  if (leftSan && rightSan) return leftSan + " + " + rightSan; 
  if (leftSan)             return rightPart ? (leftSan + " + " + rightPart) : leftSan; 
  if (rightSan)            return leftPart ? (leftPart + " + " + rightSan) : rightSan; 

  return null; 
} 

/* ── POMORAC / VODITELJ BRODICE helpers ──────────────────────────────── */ 

function _containsVoditeljBrodice_(raw) { 
  return _textHasFlexiblePhrase_(String(raw || ""), "voditelj brodice"); 
} 

function _extractRegisterTypeCanonFromLeft_(leftRaw) { 
  const left = String(leftRaw || "").trim(); 
  if (!left) return null; 

  const up   = _normUpperNoDiacritics_(left); 
  const toks = _tokenizeUpper_(up); 
  const pIdx = toks.findIndex(_isWorkflowMarkerToken_); 

  if (pIdx < 0) return null; 

  const REGISTER_TYPE_CANONS = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
  ]; 

  for (const offset of [1, -1]) { 
    const idx = pIdx + offset; 
    if (idx < 0 || idx >= toks.length) continue; 

    for (const c of REGISTER_TYPE_CANONS) { 
      if (_levenshteinDistanceCapped_(toks[idx], c.key, c.cap) <= c.cap) { 
        return c.canon; 
      } 
    } 
  } 

  return null; 
} 

function _extractWorkflowMarkerFromLeft_(leftRaw) {
  const up = _normUpperNoDiacritics_(String(leftRaw || ""));
  const toks = _tokenizeUpper_(up);
  return _workflowMarkerFromTokens_(toks);
}

function _normalizePomoracSpecialCase_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  if (!_containsVoditeljBrodice_(original)) return null; 

  const plusIdx  = original.indexOf("+"); 
  const leftRaw  = plusIdx >= 0 ? original.slice(0, plusIdx).trim() : original; 
  const rightRaw = plusIdx >= 0 ? original.slice(plusIdx + 1).trim() : ""; 

  const leftHasVoditelj  = _containsVoditeljBrodice_(leftRaw); 
  const rightHasVoditelj = _containsVoditeljBrodice_(rightRaw); 

  // Case: PUR/REGISTER TYPE + VODITELJ BRODICE ...
  if (plusIdx >= 0 && rightHasVoditelj) { 
    const registerType = _extractRegisterTypeCanonFromLeft_(leftRaw); 

    if (registerType) { 
      const marker = _extractWorkflowMarkerFromLeft_(leftRaw);
      const canon = marker + " " + registerType + " + POMORAC"; 
      return original === canon ? null : { text: canon }; 
    } 
  } 

  // Case: VODITELJ BRODICE + PUR/REGISTER TYPE
  if (plusIdx >= 0 && leftHasVoditelj) {
    const registerType = _extractRegisterTypeCanonFromLeft_(rightRaw);

    if (registerType) {
      const marker = _extractWorkflowMarkerFromLeft_(rightRaw);
      const canon = "POMORAC + " + marker + " " + registerType;
      return original === canon ? null : { text: canon };
    }
  }

  // Fallback: if the phrase appears anywhere without a recognized workflow type,
  // normalize it to POMORAC.
  if (leftHasVoditelj || rightHasVoditelj || _containsVoditeljBrodice_(original)) { 
    return original === "POMORAC" ? null : { text: "POMORAC" }; 
  } 

  return null; 
} 

function _normalizeC_forKATandSPORT_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  // Priority: ROČNIK aliases → ROČNIK.
  const rocnikSpecial = _normalizeRocnikStandalone_(original); 
  if (rocnikSpecial) return rocnikSpecial; 

  // Priority: VODITELJ BRODICE → POMORAC / PUR|REGISTER + POMORAC.
  const pomoracSpecial = _normalizePomoracSpecialCase_(original); 
  if (pomoracSpecial) return pomoracSpecial; 

  const plusIdx  = original.indexOf("+"); 
  const leftRaw  = plusIdx >= 0 ? original.slice(0, plusIdx).trim() : original; 
  const rightRaw = plusIdx >= 0 ? original.slice(plusIdx + 1).trim() : ""; 

  const upLeft      = _normUpperNoDiacritics_(leftRaw); 
  const compactLeft = upLeft.replace(/[\s\W_]+/g, " ").trim(); 
  const leftTokens  = _tokenizeUpper_(upLeft); 

  // PUR/REGISTER logic before the plus sign.
  const workflowIdx = leftTokens.findIndex(_isWorkflowMarkerToken_);
  const hasWorkflowToken = workflowIdx >= 0;
  const workflowMarker = hasWorkflowToken ? _workflowMarkerFromTokens_(leftTokens) : "REGISTER";

  if (hasWorkflowToken) { 
    const REGISTER_TYPE_CANONS = [ 
      { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
      { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
      { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
      { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
      { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
      { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
      { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
    ]; 

    let typeCanon = null; 

    for (const offset of [1, -1]) { 
      const idx = workflowIdx + offset; 
      if (idx < 0 || idx >= leftTokens.length) continue; 
 
      for (const c of REGISTER_TYPE_CANONS) { 
        if (_levenshteinDistanceCapped_(leftTokens[idx], c.key, c.cap) <= c.cap) { 
          typeCanon = c.canon; 
          break; 
        } 
      } 

      if (typeCanon) break; 
    } 

    if (typeCanon) { 
      const leftNormalized = workflowMarker + " " + typeCanon; 

      if (!rightRaw) { 
        return original === leftNormalized ? null : { text: leftNormalized }; 
      } 

      if (_looksLikeSportskiText_(rightRaw)) { 
        const sportRes = _normalizeSportskiStandalone_(rightRaw); 
        const rightNormalized = sportRes && sportRes.text ? sportRes.text : "SPORTSKI"; 
        const combined = leftNormalized + " + " + rightNormalized; 

        return original === combined ? null : { text: combined }; 
      } 

      if (_looksLikeKatLikeText_(rightRaw)) { 
        const katRes = _normalizeKatLikeStandalone_(rightRaw); 
        const rightNormalized = katRes && katRes.text 
          ? katRes.text 
          : _normUpperNoDiacritics_(rightRaw).replace(/\s+/g, " ").trim(); 

        const combined = leftNormalized + " + " + rightNormalized; 
        return original === combined ? null : { text: combined }; 
      } 

      const combinedUntouchedRight = leftNormalized + " + " + rightRaw; 
      return original === combinedUntouchedRight ? null : { text: combinedUntouchedRight }; 
    } 
  } 

  // SPORTSKI standalone.
  if (compactLeft === "SPORTSKI" && !rightRaw) { 
    return original === "SPORTSKI" ? null : { text: "SPORTSKI" }; 
  } 

  const sportStandalone = _normalizeSportskiStandalone_(original); 
  if (sportStandalone) return sportStandalone; 

  // Without a plus sign, run standalone KAT normalization.
  if (plusIdx < 0) { 
    return _normalizeKatLikeStandalone_(original); 
  } 
 
  // With a plus sign and no PUR/REGISTER on the left:
  // only normalize the right side if it looks like KAT-like or SPORTSKI-like text.
  if (!rightRaw) return null; 

  if (_looksLikeSportskiText_(rightRaw)) { 
    const sportRes = _normalizeSportskiStandalone_(rightRaw); 
    const rightNormalized = sportRes && sportRes.text ? sportRes.text : "SPORTSKI"; 
    const combined = leftRaw + " + " + rightNormalized; 

    return original === combined ? null : { text: combined }; 
  } 

  if (_looksLikeKatLikeText_(rightRaw)) { 
    const rightRes = _normalizeKatLikeStandalone_(rightRaw); 
    const rightNormalized = rightRes && rightRes.text ? rightRes.text : rightRaw; 
    const combined = leftRaw + " + " + rightNormalized; 

    return original === combined ? null : { text: combined }; 
  } 

  return null; 
} 

// ── KPI: KAT and SPORTSKI counting ───────────────────────────────────── 

function _countKATandSPORT_fromSheet_(sheet) { 
  const lastRow = _lastPatientRowByColumnB_(sheet); 
  if (lastRow < 2) return { katTotal: 0, sportTotal: 0 }; 

  const n  = lastRow - 1; 
  const vB = sheet.getRange(2, STUPAC_B, n, 1).getDisplayValues(); 
  const vC = sheet.getRange(2, STUPAC_C, n, 1).getDisplayValues(); 

  let katTotal = 0; 
  let sportTotal = 0; 

  for (let i = 0; i < n; i++) { 
    if (!String(vB[i][0] || "").trim() || _isReportOrKpiRowInB_(vB[i][0])) continue; 

    const cRaw = String(vC[i][0] || "").trim(); 
    if (!cRaw) continue; 

    const up0 = _normUpperNoDiacritics_(cRaw); 
    const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

    if (compact.startsWith("SPORTSKI")) { 
      sportTotal++; 
      continue; 
    } 

    const toks = _tokenizeUpper_(up0); 

    if (toks.includes("KAT") || 
        toks.some(_isFuzzyKategorija_) || 
        toks.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t))) { 
      katTotal++; 
    } 
  } 

  return { katTotal, sportTotal }; 
} 

function _setReportMetricLabelCell_(cell, icon, label, bg) { 
  try { 
    const text  = (icon ? icon + " " : "") + String(label || ""); 
    const style = SpreadsheetApp.newTextStyle() 
      .setFontSize(11) 
      .setForegroundColor("#666666") 
      .setBold(true) 
      .build(); 

    cell.setRichTextValue( 
      SpreadsheetApp.newRichTextValue() 
        .setText(text) 
        .setTextStyle(0, text.length, style) 
        .build() 
    ); 

    cell.setBackground(bg || "#f1f3f4") 
      .setFontFamily("Arial") 
      .setVerticalAlignment("middle") 
      .setHorizontalAlignment("left") 
      .setWrap(true); 
  } catch (e) {} 
} 

function _setReportMetricValueCell_(cell, value, bg) { 
  try { 
    const text  = String(value); 
    const style = SpreadsheetApp.newTextStyle() 
      .setFontSize(16) 
      .setForegroundColor("#111111") 
      .setBold(true) 
      .build(); 

    cell.setRichTextValue( 
      SpreadsheetApp.newRichTextValue() 
        .setText(text) 
        .setTextStyle(0, text.length, style) 
        .build() 
    ); 

    cell.setBackground(bg || "#ffffff") 
      .setFontFamily("Arial") 
      .setVerticalAlignment("middle") 
      .setHorizontalAlignment("center") 
      .setWrap(false); 
  } catch (e) {} 
} 

function _writeCountsBelowReportStatus_(sheet, statusCell) { 
  if (!sheet || !statusCell) return; 

  const counts = _countKATandSPORT_fromSheet_(sheet); 

  const r0 = statusCell.getRow(); 
  const c0 = statusCell.getColumn(); 
  const c1 = c0 + 1; 

  const rKat = r0 + 1; 
  const rSport = r0 + 2; 

  const cKV = sheet.getRange(rKat, c1); 
  const cSV = sheet.getRange(rSport, c1); 

  const rightHasStuff = !!String(cKV.getDisplayValue() || "").trim() 
                     || !!String(cSV.getDisplayValue() || "").trim(); 

  if (rightHasStuff) { 
    sheet.getRange(rKat, c0)
      .setValue("KAT (all categories): " + counts.katTotal)
      .setBackground("#f3f7ff"); 

    sheet.getRange(rSport, c0)
      .setValue("SPORTSKI (all variants): " + counts.sportTotal)
      .setBackground("#f6fff3"); 

    return; 
  } 

  const box = sheet.getRange(rKat, c0, 2, 2); 

  box.clearNote() 
    .setFontLine("none") 
    .setFontStyle("normal") 
    .setFontWeight("normal") 
    .setFontColor("black"); 

  _setReportMetricLabelCell_(sheet.getRange(rKat,  c0), "🚗", "KAT (all categories)", "#eefbf0"); 
  _setReportMetricValueCell_(sheet.getRange(rKat,  c1), counts.katTotal, "#ffffff"); 

  _setReportMetricLabelCell_(sheet.getRange(rSport, c0), "🏃", "SPORTSKI (all variants)", "#eef3ff"); 
  _setReportMetricValueCell_(sheet.getRange(rSport, c1), counts.sportTotal, "#ffffff"); 

  box.setBorder(true, true, true, true, true, true, "#b7b7b7", SpreadsheetApp.BorderStyle.SOLID_MEDIUM); 

  try { 
    sheet.setRowHeights(rKat, 2, sheet.getRowHeight(2)); 
  } catch (e) {} 
} 

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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 12 · REPORT EXPORT UI — Report export menu, status and user dialogs
 * ═══════════════════════════════════════════════════════════════════════ */ 
 
function onOpen(e) { 
  try { 
    const ui = SpreadsheetApp.getUi(); 

    ui.createMenu("Report") 
      .addItem("Save report…", "reportMenu_OpenSaveDialog") 
      .addToUi(); 

    ui.createMenu("Admin") 
      .addItem("Configuration…", "adminConfig_OpenGuard") 
      .addToUi(); 
  } catch (e2) {} 

  try { 
    _maybeShowHolidayGreetingToast_(); 
  } catch (e3) {} 
} 

// ── Modal: operator input ────────────────────────────────────────────── 

function reportMenu_OpenSaveDialog() { 
  const NAMES = [ 
    "Operator A", 
    "Operator B", 
    "Operator C", 
    "Operator D", 
    "Operator E", 
    "Operator F" 
  ]; 

  const chips = NAMES.map(n => { 
    const safe = n.replace(/'/g, "\\'"); 
    return `<button class="chip" onclick="pick('${safe}')">${n}</button>`; 
  }).join(""); 

  const html = `<!doctype html> 
<html> 
<head> 
<meta charset="utf-8"/> 
<meta name="viewport" content="width=device-width,initial-scale=1"/> 
<style> 
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap'); 
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } 
  :root { 
    --bg:#f8f7f4; --surface:#ffffff; --border:#e4e0d9; 
    --accent:#1a5c3a; --accent2:#2e7d52; --text:#1c1c1c; --muted:#7a7570; 
    --chip-bg:#eef5f1; --chip-border:#c6ddd0; --chip-hover:#d4ece0; 
    --danger:#c0392b; --radius:12px; 
  } 
  html, body { height:100%; font-family:'DM Sans',sans-serif; background:var(--bg); color:var(--text); } 
  .wrap { min-height:100%; display:flex; align-items:center; justify-content:center; padding:26px; } 
  .card { background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:36px 34px 28px; width:100%; max-width:590px; box-shadow:0 6px 32px rgba(0,0,0,.07); } 
  .header { display:flex; align-items:center; gap:14px; margin-bottom:26px; } 
  .icon-wrap { width:50px; height:50px; background:var(--accent); border-radius:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; } 
  .icon-wrap svg { width:26px; height:26px; } 
  .title { font-size:21px; font-weight:600; line-height:1.2; } 
  .sub   { font-size:14px; color:var(--muted); margin-top:3px; } 
  label  { display:block; font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; } 
  input[type=text] { width:100%; padding:13px 16px; border:1.5px solid var(--border); border-radius:var(--radius); font-family:inherit; font-size:16px; color:var(--text); background:var(--bg); outline:none; transition:border-color .15s; } 
  input[type=text]:focus { border-color:var(--accent2); background:#fff; } 
  input[type=text]::placeholder { color:#bfbab4; } 
  .chips-label { margin-top:20px; margin-bottom:9px; } 
  .chips { display:flex; flex-wrap:wrap; gap:8px; } 
  .chip { padding:7px 15px; border:1px solid var(--chip-border); border-radius:999px; background:var(--chip-bg); color:var(--accent); font-family:inherit; font-size:14px; font-weight:500; cursor:pointer; transition:background .12s,border-color .12s; } 
  .chip:hover { background:var(--chip-hover); border-color:var(--accent2); } 
  .chip.active { background:var(--accent); border-color:var(--accent); color:#fff; } 
  .divider { border:none; border-top:1px solid var(--border); margin:26px 0 20px; } 
  .actions { display:flex; gap:10px; justify-content:flex-end; } 
  .btn { padding:11px 22px; border-radius:var(--radius); font-family:inherit; font-size:15px; font-weight:600; cursor:pointer; border:none; transition:opacity .12s,background .12s; } 
  .btn:disabled { opacity:.45; cursor:default; } 
  .btn-secondary { background:transparent; border:1.5px solid var(--border); color:var(--muted); } 
  .btn-secondary:hover:not(:disabled) { background:var(--bg); } 
  .btn-primary { background:var(--accent); color:#fff; display:flex; align-items:center; gap:9px; } 
  .btn-primary:hover:not(:disabled) { background:var(--accent2); } 
  .btn-primary svg { width:18px; height:18px; } 
  .no-name { font-size:13px; color:var(--muted); text-decoration:underline; cursor:pointer; background:none; border:none; font-family:inherit; padding:0; margin-right:auto; align-self:center; } 
  .no-name:hover { color:var(--text); } 
  .status { font-size:13px; color:var(--muted); text-align:center; margin-top:12px; min-height:18px; } 
  .status.running { color:var(--accent2); } 
  .status.err     { color:var(--danger); } 
</style> 
</head> 
<body> 
<div class="wrap"> 
  <div class="card"> 
    <div class="header"> 
      <div class="icon-wrap"> 
        <svg viewBox="0 0 24 24" fill="none"> 
          <path d="M12 3v10m0 0 4-4m-4 4-4-4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/> 
          <path d="M5 16v3h14v-3" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/> 
        </svg> 
      </div> 
      <div> 
        <div class="title">Who is saving today’s report?</div> 
        <div class="sub">Select an operator or enter a custom name.</div> 
      </div> 
    </div> 

    <label for="nameInput">Operator name</label> 
    <input id="nameInput" type="text" placeholder="Example: Operator A" oninput="onInput()" autocomplete="off"/> 

    <label class="chips-label">Quick selection</label> 
    <div class="chips" id="chips">${chips}</div> 

    <hr class="divider"/> 

    <div class="actions"> 
      <button class="no-name" onclick="save('')">No name</button> 
      <button class="btn btn-secondary" onclick="google.script.host.close()">Cancel</button> 
      <button class="btn btn-primary" id="saveBtn" onclick="saveFromInput()"> 
        <svg viewBox="0 0 24 24" fill="none"> 
          <path d="M5 3h11l3 3v15H5V3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/> 
          <path d="M9 3v5h6V3" stroke="#fff" stroke-width="2" stroke-linejoin="round"/> 
          <rect x="7" y="13" width="10" height="6" rx="1" stroke="#fff" stroke-width="2"/> 
        </svg> 
        Save 
      </button> 
    </div> 

    <div class="status" id="status"></div> 
  </div> 
</div> 

<script> 
  const input   = document.getElementById('nameInput'); 
  const status  = document.getElementById('status'); 
  const saveBtn = document.getElementById('saveBtn'); 
  let saving = false; 

  function pick(name) { 
    input.value = name; 
    document.querySelectorAll('.chip').forEach(c => 
      c.classList.toggle('active', c.textContent.trim() === name)); 
  } 

  function onInput() { 
    const v = input.value.trim(); 
    document.querySelectorAll('.chip').forEach(c => 
      c.classList.toggle('active', c.textContent.trim() === v)); 
  } 

  function saveFromInput() { 
    save(input.value.trim()); 
  } 

  function save(name) { 
    if (saving) return; 

    saving = true; 
    saveBtn.disabled = true; 

    status.textContent = 'Export in progress…'; 
    status.className = 'status running'; 

    google.script.run 
      .withSuccessHandler(() => { 
        status.textContent = ''; 
        google.script.host.close(); 
      }) 
      .withFailureHandler(err => { 
        status.textContent = '⛔ ' + (err && err.message ? err.message : err); 
        status.className = 'status err'; 
        saving = false; 
        saveBtn.disabled = false; 
      }) 
      .reportMenu_SaveWithName(name); 
  } 
</script> 
</body> 
</html>`; 
 
  SpreadsheetApp.getUi().showModalDialog( 
    HtmlService.createHtmlOutput(html).setWidth(640).setHeight(560), 
    "Save report" 
  ); 
} 

function reportMenu_SaveWithName(name) { 
  reportExport_Run_(String(name || "").trim(), { showUiDialog: true }); 
} 

// ── Download dialog ──────────────────────────────────────────────────── 

function reportExport_ShowDownloadDialog_(downloadUrl, filename) { 
  const url = String(downloadUrl || "").trim(); 
  if (!url) return; 

  const esc = s => String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;"); 

  const safeName = String(filename || "report.xlsx").replace(/[<>]/g, ""); 

  const html = 
    '<!doctype html><html><head><meta charset="utf-8">' + 
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' + 
    '<style>:root{--btn:#2563eb;--btnHover:#1d4ed8;--border:#e5e7eb;--muted:#6b7280}' + 
    'html,body{height:100%;margin:0;font-family:system-ui,sans-serif}' + 
    '.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}' + 
    '.card{width:100%;max-width:520px;background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px;box-sizing:border-box}' + 
    '.title{margin:0 0 6px;font-size:18px;font-weight:700;text-align:center}' + 
    '.sub{margin:0 0 14px;color:var(--muted);font-size:13px;text-align:center}' + 
    '.file{display:flex;justify-content:center;margin:0 0 14px}' + 
    '.pill{padding:6px 10px;border:1px solid var(--border);border-radius:999px;font-size:12px;background:#f9fafb}' + 
    '.actions{display:flex;justify-content:center}' + 
    'a.btn{display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:12px;background:var(--btn);color:#fff;text-decoration:none;font-weight:700}' + 
    'a.btn:hover{background:var(--btnHover)}' + 
    '.icon{width:16px;height:16px}</style></head><body>' + 
    '<div class="wrap"><div class="card">' + 
    '<h2 class="title">Download XLSX report</h2>' + 
    '<p class="sub">The report is ready. Click the button to download it.</p>' + 
    '<div class="file"><span class="pill">' + esc(safeName) + '</span></div>' + 
    '<div class="actions"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + 
    '<svg class="icon" viewBox="0 0 24 24" fill="none">' + 
    '<path d="M12 3v10m0 0 4-4m-4 4-4-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' + 
    '<path d="M5 15v4h14v-4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' + 
    'Download</a></div>' + 
    '<div class="hint" style="margin-top:12px;color:var(--muted);font-size:12px;text-align:center">The download opens in a new tab.</div>' + 
    '</div></div></body></html>'; 

  SpreadsheetApp.getUi().showModalDialog( 
    HtmlService.createHtmlOutput(html).setWidth(600).setHeight(320), 
    "Download XLSX" 
  ); 
} 

// ── Export runner ────────────────────────────────────────────────────── 

function reportExport_Run_(tokenRaw, opts) { 
  opts = opts || {}; 

  const showUiDialog = (opts.showUiDialog !== false); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (!ss) throw new Error("No spreadsheet context found."); 

  const sheet = _getTargetSheet_() || ss.getActiveSheet(); 
  if (!sheet) throw new Error("No target sheet found."); 

  _setReportInterrupt_(REPORT_INTERRUPT_TTL_MS); 

  const props = PropertiesService.getScriptProperties(); 
  const dl    = LockService.getDocumentLock(); 
  const token = String(tokenRaw || "").trim(); 

  try { 
  dl.waitLock(30000); 
  _clearQueuesAndPendingsForReport_(props); 
} finally { 
  try { 
    dl.releaseLock(); 
  } catch (e1) {} 
} 

let ok = false; 
let errMsg = ""; 
let result = null; 

try { 
  if (typeof _saveXlsxToDrive_ !== "function") { 
    throw new Error("Missing _saveXlsxToDrive_ export helper."); 
  } 

  result = _saveXlsxToDrive_(sheet, "", token); 
  ok = true; 
} catch (err) { 
  errMsg = String(err && err.message ? err.message : err).slice(0, 180); 
}

  try { 
    dl.waitLock(30000); 

    let statusCell; 

    try { 
      statusCell = _pickReportStatusCell_(sheet); 
    } catch (e) { 
      statusCell = sheet.getRange(2, STUPAC_B); 
    } 

    if (ok) { 
      const stamp    = _stamp_(); 
      const baseText = "✅ SAVED " + stamp + (token ? " (" + token + ")" : ""); 
      const btnText  = (result && result.downloadUrl) ? "  ⬇️ DOWNLOAD" : ""; 
      const fullText = baseText + btnText; 

      try { 
        const b = SpreadsheetApp.newRichTextValue().setText(fullText); 

        if (btnText && result.downloadUrl) { 
          const start = baseText.length + 2; 

          b.setLinkUrl(start, fullText.length, result.downloadUrl); 
          b.setTextStyle(start, fullText.length, 
            SpreadsheetApp.newTextStyle()
              .setBold(true)
              .setFontSize(12)
              .setForegroundColor("#1a73e8")
              .build()); 
        } 

        statusCell.setRichTextValue(b.build()); 
      } catch (eRT) { 
        statusCell.setValue(fullText + (result && result.downloadUrl ? " " + result.downloadUrl : "")); 
      } 

      statusCell.setBackground("#d9ead3"); 
      SpreadsheetApp.flush(); 

      try { 
        _writeCountsBelowReportStatus_(sheet, statusCell); 
      } catch (e) {} 

      try { 
        const reportKey = Utilities.formatDate(_getReportDateFromSheet_(sheet), REPORT_TZ, "yyyy-MM-dd"); 
        _markReportSent_(reportKey); 
      } catch (e) {} 

      try { 
        ss.toast("Saved" + (token ? ": " + token : ""), "✅ Report", 5); 
      } catch (e) {} 

      if (showUiDialog) { 
        try { 
          reportExport_ShowDownloadDialog_(result && result.downloadUrl, result && result.filename); 
        } catch (e) {} 
      } 
    } else { 
      statusCell.setValue("⛔ ERROR: " + errMsg).setBackground("#f4cccc"); 
      SpreadsheetApp.flush(); 

      try { 
        ss.toast("Error: " + errMsg, "⛔ Report", 8); 
      } catch (e) {} 
    } 
  } finally { 
    try { 
      dl.releaseLock(); 
    } catch (e2) {} 

    _clearReportInterrupt_(); 
  } 

  if (!ok) throw new Error(errMsg || "Report export: unknown error."); 

  return result; 
} 

function _pickReportStatusCell_(sheet) { 
  const hardMax = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (hardMax < 2) return sheet.getRange(2, STUPAC_B); 

  const vB = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getDisplayValues(); 

  let lastNonEmpty = 1; 

  for (let i = vB.length - 1; i >= 0; i--) { 
    if (String(vB[i][0] || "").trim() !== "") { 
      lastNonEmpty = i + 2; 
      break; 
    } 
  } 

  let empties = 0; 
  let targetRow = Math.min(lastNonEmpty + 2, hardMax); 

  for (let r = lastNonEmpty + 1; r <= hardMax; r++) { 
    const idx = r - 2; 
    const val = (idx >= 0 && idx < vB.length) ? String(vB[idx][0] || "").trim() : ""; 

    if (val === "") { 
      if (++empties === 2) { 
        targetRow = r; 
        break; 
      } 
    } else { 
      empties = 0; 
    } 
  } 

  return sheet.getRange(targetRow, STUPAC_B); 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 13 · APPLY RULES — Central dispatcher for edit-based rule processing
 * ═══════════════════════════════════════════════════════════════════════ */ 

const UPPERCASE_COLS = new Set([STUPAC_B, STUPAC_C, STUPAC_D, STUPAC_E, STUPAC_F, STUPAC_G, STUPAC_H]); 

function _applyRulesForEdit_(sheet, range, inputValue, allowUi) { 
  const editedRow = range.getRow(); 
  const editedCol = range.getColumn(); 

  if (editedRow <= 1) return; 

  if (editedCol === STUPAC_J) { 
    _handleJCell_(sheet, editedRow, range, inputValue); 
    return; 
  } 

  if (editedCol === STUPAC_I) { 
    const cellB = sheet.getRange(editedRow, STUPAC_B); 
    _handleICell_(sheet, editedRow, range, inputValue, cellB); 
    return; 
  } 

  if (editedCol === STUPAC_L) { 
    const color = String(inputValue || "").includes("@") ? "#fff2cc" : null; 
    sheet.getRange(editedRow, STUPAC_L).setBackground(color); 
    return; 
  } 

  const ctx   = _buildRowContextLite_(sheet, editedRow, editedCol, allowUi, inputValue); 
  const patch = _newRowPatch_(); 

  const storedSignature = _getRowSysSignature_(sheet, editedRow); 

  if (UPPERCASE_COLS.has(editedCol)) { 
    const raw   = String(inputValue || ""); 
    const upper = raw.toUpperCase(); 

    _ctxSetVal_(ctx, editedCol, upper); 
    ctx.editedValue = upper; 

    if (raw !== upper) { 
      try { 
        sheet.getRange(editedRow, editedCol).setValue(upper); 
      } catch (e) { 
        console.error("_applyRulesForEdit_ uppercase write error:", e && e.stack ? e.stack : e); 
      } 
    } 
  } else { 
    const raw = String(inputValue || ""); 
    _ctxSetVal_(ctx, editedCol, raw); 
    ctx.editedValue = raw; 
  } 

  // Strip wait decorations from column B before the time handler.
  // Important: the line-through check must happen before stripping.
  // Otherwise, the strip operation could physically remove wait tags from
  // completed rows before the format cleaner handles them.
  if (editedCol === STUPAC_B && ctx.fontLineB !== "line-through") { 
    const bRaw   = String(_ctxVal_(ctx, STUPAC_B) || ""); 
    const isVip  = _isVipRowByI_(String(_ctxVal_(ctx, STUPAC_I) || "")); 
    const bClean = _cleanWaitDecorButPreserveVip_(bRaw, isVip); 

    if (bClean !== bRaw) { 
      _ctxSetVal_(ctx, STUPAC_B, bClean); 
      ctx.editedValue = bClean; 

      try { 
        sheet.getRange(editedRow, STUPAC_B).setValue(bClean); 
      } catch (e) {} 
    } 
  } 

  if (ctx.fontLineB === "line-through") return; 

  if (editedCol === STUPAC_B) { 
    _handleBCellTimeLite_(sheet, ctx, patch); 
  } 

  if (editedCol >= STUPAC_B && editedCol <= STUPAC_H) { 
    _handleCHRulesLite_(sheet, ctx, patch); 
  } 

  const meta = _patchFinalizeRowMeta_(ctx, patch); 

  const storedStateFinal = _getRowSysState_(sheet, editedRow); 

  const noBusinessWrites = 
    !Object.keys(patch.values || {}).some(k => { 
      const col = Number(k); 
      return col !== STUPAC_SYS_STATE && col !== STUPAC_SYS_SIG; 
    }) && 
    !(patch.backgrounds && patch.backgrounds.length) && 
    !(patch.richText && Object.keys(patch.richText).length) && 
    !(patch.clearNotes && Object.keys(patch.clearNotes).length) && 
    !(patch.fontColors && Object.keys(patch.fontColors).length); 

  if (noBusinessWrites && storedSignature === meta.sig && storedStateFinal === meta.state) return; 

  _applyRowPatchLite_(sheet, editedRow, patch); 

  // If the row was already in WAIT_SPORT state, restore the column B decoration immediately.
  if (editedCol === STUPAC_B && storedStateFinal === "WAIT_SPORT") { 
    try { 
      const bNow   = String(sheet.getRange(editedRow, STUPAC_B).getDisplayValue() || ""); 
      const bClean = _cleanWaitDecorButPreserveVip_(bNow, false); 

      if (bClean) { 
        const nT = bClean + " " + TEKST_CEKANJE_SPORT + " ⚠️"; 
        const builder = SpreadsheetApp.newRichTextValue().setText(nT); 

        const waitTagStart = bClean.length + 1; 
        const waitTagEnd   = waitTagStart + TEKST_CEKANJE_SPORT.length; 

        builder.setTextStyle( 
          waitTagStart, 
          waitTagEnd, 
          SpreadsheetApp.newTextStyle() 
            .setForegroundColor(BOJA_CEKANJE_SPORT) 
            .setBold(true) 
            .build() 
        ); 

        sheet.getRange(editedRow, STUPAC_B).setRichTextValue(builder.build()); 
        _refreshRowSystemMetaFromSheet_(sheet, editedRow, "WAIT_SPORT"); 
      } 
    } catch (e) {} 
  } 
} 

function _handleICell_(sheet, row, range, inputValue, cellB) { 
  const isVip = _isVipRowByI_(inputValue); 

  let oldB = ""; 
  let oldC = ""; 
  let sysState = ""; 

  try { 
    oldB = String(cellB.getDisplayValue() || ""); 
  } catch (e) {} 

  try { 
    oldC = String(sheet.getRange(row, STUPAC_C).getDisplayValue() || "").trim(); 
  } catch (e) {} 

  try { 
    sysState = _getRowSysState_(sheet, row); 
  } catch (e) {} 

  const isSportRow   = (_normUpperNoDiacritics_(oldC) === "SPORTSKI"); 
  const isWaitSport  = isSportRow && (sysState === "WAIT_SPORT" || _hasWaitSportTag_(oldB)); 
  const isWait2h     = (sysState === "WAIT_2H" || _hasWait2hTag_(oldB)); 

  try { 
    const newB = isVip ? _ensureAlarmEmojiInB_(oldB) : _stripAlarmEmoji_(oldB); 

    if (newB !== oldB) { 
      cellB.setValue(newB); 
      oldB = newB; 
    } 
  } catch (e) { 
    console.error("_handleICell_ emoji sync error:", e && e.stack ? e.stack : e); 
  } 

  try { 
    if (isVip) { 
      sheet.getRange(row, STUPAC_B, 1, 2) 
        .setFontWeight("bold") 
        .setFontSize(13) 
        .setBorder(true, true, true, true, true, true, "red", SpreadsheetApp.BorderStyle.SOLID_THICK); 
    } else if (isWait2h) { 
      _setRowBorderRespectVip_( 
        sheet, 
        row, 
        "black", 
        SpreadsheetApp.BorderStyle.SOLID_THICK, 
        "bold", 
        13 
      ); 
    } else if (isWaitSport) { 
      _setRowBorderRespectVip_( 
        sheet, 
        row, 
        "black", 
        SpreadsheetApp.BorderStyle.SOLID, 
        "normal", 
        12 
      ); 
    } else { 
      _setRowBorderRespectVip_( 
        sheet, 
        row, 
        "black", 
        SpreadsheetApp.BorderStyle.SOLID, 
        "normal", 
        12 
      ); 
    } 
  } catch (e) { 
    console.error("_handleICell_ border sync error:", e && e.stack ? e.stack : e); 
  } 

  try { 
    if (isVip) { 
      _refreshRowSystemMetaFromSheet_(sheet, row, "VIP"); 
    } else if (isWaitSport) { 
      _refreshRowSystemMetaFromSheet_(sheet, row, "WAIT_SPORT"); 
    } else if (isWait2h) { 
      _refreshRowSystemMetaFromSheet_(sheet, row, "WAIT_2H"); 
    } else { 
      _refreshRowSystemMetaFromSheet_(sheet, row, "ACTIVE"); 
    } 
  } catch (e) {} 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 14 · HANDLER J — Initials and location-tag handling
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _handleJCell_(sheet, row, cellRange, rawText) { 
  if (row <= 1) return; 

  const input = String(rawText || "").toLowerCase().trim(); 
  if (!input) return; 

  let matchedInitial = ""; 
  let remainingInput = ""; 

  for (const initial of _getAdminInitijalsSorted_()) { 
    if (input.startsWith(initial)) { 
      matchedInitial = initial; 
      remainingInput = input.substring(initial.length).trim(); 
      break; 
    } 
  } 

  if (!matchedInitial) return; 

  // Batch read: columns I and J together in one API call.
  const rowData = sheet.getRange(row, STUPAC_I, 1, 2).getDisplayValues()[0]; 
  const oldI    = String(rowData[0] || ""); 
  const oldJ    = String(rowData[1] || "").trim().toLowerCase(); 

  if (oldJ !== matchedInitial) cellRange.setValue(matchedInitial); 

  if (!remainingInput) { 
    try { _refreshRowSystemMetaFromSheet_(sheet, row); } catch (e) {} 
    return; 
  } 

  const LOCATION_SHORTCUTS = { 
    d:   "derma area", 
    oft: "ophthalmology area", 
    obt: "family medicine area", 
    lab: "lab area", 
    rad: "imaging area" 
  }; 

  let locationText = ""; 

  if (!isNaN(remainingInput)) { 
    locationText = "room " + String(Number(remainingInput)); 
  } else if (LOCATION_SHORTCUTS[remainingInput]) { 
    locationText = LOCATION_SHORTCUTS[remainingInput]; 
  } else { 
    try { _refreshRowSystemMetaFromSheet_(sheet, row); } catch (e) {} 
    return; 
  } 

  const tagTxt  = "[" + locationText + "]"; 
  const rest    = oldI.replace(/^\s*\[[^\]]+\]\s*/, "").trimStart(); 
  const tagPart = rest ? (tagTxt + " ") : tagTxt; 
  const newI    = tagPart + rest; 

  if (oldI === newI) { 
    try { _refreshRowSystemMetaFromSheet_(sheet, row); } catch (e) {} 
    return; 
  } 

  const tagStyle = SpreadsheetApp.newTextStyle() 
    .setBold(true) 
    .setFontSize(14) 
    .setForegroundColor("black") 
    .build(); 

  sheet.getRange(row, STUPAC_I).setRichTextValue( 
    SpreadsheetApp.newRichTextValue() 
      .setText(newI) 
      .setTextStyle(0, tagPart.length, tagStyle) 
      .build() 
  ); 

  try { _refreshRowSystemMetaFromSheet_(sheet, row); } catch (e) {} 
} 

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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 16 · HANDLER C/H — Business-rule processing across columns C–H
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _isZvuH_(txt) { 
  const s = _normTxt_(String(txt || "")); 
  if (/\bzvu\b/.test(s)) return true; 
  if (_textHasFlexiblePhrase_(s, "zdravstveno veleuciliste")) return true; 
  return false; 
} 

function _handleCHRulesLite_(sheet, ctx, patch) { 
  const row = ctx.row; 

  let finalC = String(_ctxVal_(ctx, STUPAC_C) || ""); 
  let finalD = String(_ctxVal_(ctx, STUPAC_D) || ""); 
  let finalE = String(_ctxVal_(ctx, STUPAC_E) || ""); 
  let finalF = String(_ctxVal_(ctx, STUPAC_F) || ""); 
  let finalG = String(_ctxVal_(ctx, STUPAC_G) || ""); 
  let finalH = String(_ctxVal_(ctx, STUPAC_H) || "").toUpperCase(); 
  let finalI = String(_ctxVal_(ctx, STUPAC_I) || ""); 
  let finalJ = String(_ctxVal_(ctx, STUPAC_J) || ""); 

  if (ctx.fontLineB === "line-through") return; 

  const SPORTSKI_PLACEHOLDER_TEXT       = "EKG+SPIRO"; 
  const SPORTSKI_PLACEHOLDER_FONT_COLOR = "#a6a6a6"; 

  const _isSlashOnly_ = v => String(v || "").trim() === "/"; 
  const _isEmptyLike_ = v => String(v || "").trim() === ""; 
  const _isSportskiPlaceholderExact_ = v => String(v || "").trim().toUpperCase() === SPORTSKI_PLACEHOLDER_TEXT; 

  // Special boxing cases.
  const cPhraseNorm        = _normPhrase_(finalC); 
  const isBoksGodisnji     = (cPhraseNorm === "boks godisnji"); 
  const isBoksPolugodisnji = (cPhraseNorm === "boks polugodisnji"); 
 
  if (isBoksGodisnji || isBoksPolugodisnji) finalC = "SPORTSKI"; 

  if (isBoksGodisnji) { 
    const label = "BOKS GODIŠNJI"; 
    if (!_textHasFlexiblePhrase_(finalI, label)) { 
      finalI = finalI.trim() ? (finalI.trim() + " " + label) : label; 
    } 
  } 

  // Standardize and normalize column C.
  const stdC = _standardizirajTipC_(finalC); 
  if (stdC && String(finalC).trim() !== stdC) finalC = stdC; 

  const invalidRegisterSanitized = _sanitizeInvalidRegisterType_(finalC); 
  if (invalidRegisterSanitized) finalC = invalidRegisterSanitized; 

  try { 
    const normRes = _normalizeC_forKATandSPORT_(finalC); 
    if (normRes && normRes.text) { 
      _patchClearNote_(patch, STUPAC_C); 
      if (String(finalC).trim() !== normRes.text) finalC = normRes.text; 
    } 
  } catch (e) {} 

  const invalidKatSanitized = _sanitizeInvalidKatType_(finalC); 
  if (invalidKatSanitized) finalC = invalidKatSanitized; 

  const cCurrent = String(_ctxVal_(ctx, STUPAC_C) || ""); 
  const cNext    = String(finalC || ""); 

  if (cCurrent !== cNext) { 
    _ctxSetVal_(ctx, STUPAC_C, cNext); 

    const invalidMatch = cNext.match(/\[[^\]]+\]/); 
    if (invalidMatch) { 
      const start = Number(invalidMatch.index) || 0; 
      const end   = start + invalidMatch[0].length; 

      _patchSetRichOrPlain_(patch, STUPAC_C, cNext, [{ 
        text: invalidMatch[0], 
        start, 
        end, 
        style: SpreadsheetApp.newTextStyle() 
          .setBold(true) 
          .build() 
      }]); 
    } else { 
      _patchSetRichOrPlain_(patch, STUPAC_C, cNext, []); 
    } 
  } 

  const vCLower      = String(finalC || "").toLowerCase().trim(); 
  const vCnorm       = _normTxt_(finalC); 
  const cUpperNoDia  = _normUpperNoDiacritics_(finalC); 
  const cTokens      = _tokenizeUpper_(cUpperNoDia); 

  const jeORS               = /\bors\b/i.test(vCnorm); 
  const jeEKG               = /\bekg\b/i.test(vCnorm); 
  const jeKardiolog         = /\bkardiolog\w*\b/i.test(vCnorm); 
  const jeLabos             = /\b(lab|labos|krv|vađ?enj[e]?\s*krvi)\b/i.test(vCLower); 
  const jeNocniRad          = /nocni[\s\W_]*rad/.test(vCnorm); 
  const isPeriodic          = _jePeriodic_Standard_(finalC); 

  // Demo/local compatibility:
  // The public-cleaned version uses REGISTER, but the original sheet/demo may still use PUR.
  // Treat PUR as equivalent to REGISTER for coloring and workflow pairing.
  const isRegister = 
    cTokens.includes("REGISTER") || 
    cTokens.includes("PUR") || 
    vCnorm.includes("register") || 
    vCnorm.includes("pur"); 

  const isOpcaRadna         = /opca[\s\W_]*radna/.test(vCnorm); 
  const isHealthPairingType = isRegister || isOpcaRadna || jeNocniRad; 
  const isRegisterOrGeneral = isRegister || isOpcaRadna; 
  const isSportski          = (vCLower === "sportski"); 
  const isRocnik            = (vCnorm === "rocnik"); 

  const isKatLike = 
    cTokens.includes("KAT") || 
    cTokens.some(_isFuzzyKategorija_) || 
    cTokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)); 

  const HAS_PAID_PL_TAG_REGEX = /\b\d+(?:[.,]\d+)?\s*€\s+PL\b/i; 

  // UI alerts.
  if (isSportski && ctx.allowUi) { 
    finalH = _handleUgovorKlubAlert_(sheet, row, String(finalH)); 
  } 

  // Training / invoice / contract corrections in column H.
  const imaEduTvrtku   = _hasEdukacijaTvrtka_(String(finalH)) || _hasEdukacijaTvrtka_(String(finalF)); 
  const trebaEdukacija = Boolean(isRegister && isPeriodic && imaEduTvrtku); 

  const _removeEdukacijaTag_ = txt => 
    String(txt || "").replace(/\s*;\s*EDUKACIJA\b/gi, "").replace(/\s{2,}/g, " ").trim(); 

  const _removeFakturaTag_ = txt => 
    String(txt || "").replace(/\s*\bFAKTURA\b/gi, "").replace(/\s{2,}/g, " ").trim(); 

  const fakturaCorrection = _getFakturaCorrection_(finalH); 
  if (fakturaCorrection && fakturaCorrection.correctedText) { 
    finalH = String(fakturaCorrection.correctedText || "").trim().toUpperCase(); 
  } 

  const ugovorCorrection = _getUgovorCorrection_(_stripPlTag_(finalH)); 
  if (ugovorCorrection && ugovorCorrection.correctedText) { 
    const existingPl = _extractPlTag_(finalH); 
    finalH = existingPl 
      ? _normalizeSinglePlTag_( 
          String(ugovorCorrection.correctedText || "").trim().toUpperCase() + " " + existingPl, 
          ugovorCorrection.entry && ugovorCorrection.entry.price 
        ) 
      : String(ugovorCorrection.correctedText || "").trim().toUpperCase(); 
  } 

  // Organization-name standardization only for relevant workflow types.
  if (isHealthPairingType) { 
    const zdravstvenaCorrection = _getZdravstvenaCorrection_(finalH); 
    if (zdravstvenaCorrection && zdravstvenaCorrection.correctedText) { 
      const existingPl = _extractPlTag_(finalH); 
      finalH = existingPl 
        ? _normalizeSinglePlTag_( 
            String(zdravstvenaCorrection.correctedText || "").trim().toUpperCase() + " " + existingPl, 
            null 
          ) 
        : String(zdravstvenaCorrection.correctedText || "").trim().toUpperCase(); 
    } 
  } 

  let hWork = String(finalH || ""); 

  if (trebaEdukacija) { 
    if (!/\bEDUKACIJA\b/i.test(hWork)) { 
      hWork = (_removeEdukacijaTag_(hWork) || "") + TEKST_EDUKACIJA; 
    } 
  } else if (/\bEDUKACIJA\b/i.test(hWork)) { 
    hWork = _removeEdukacijaTag_(hWork); 
  } 

  const isFakturaKlubAfterCorrection = _isFakturaKlub_(hWork); 

  if (isFakturaKlubAfterCorrection) { 
    if (!/\bFAKTURA\b/i.test(hWork)) { 
      hWork = (_removeFakturaTag_(hWork) ? _removeFakturaTag_(hWork) + " " : "") + "FAKTURA"; 
    } 
  } 

  // Billing-state transformation in column H.
  const billingRes = _transformBillingStateInH_(hWork); 
  if (billingRes && billingRes.text) { 
    hWork = billingRes.text; 
  } 

  finalH = hWork; 

  const cWordsNorm = _normTxt_(finalC).split(/\s+/).filter(Boolean); 
  const isNastavak = cWordsNorm.some(w => _levenshteinDistanceCapped_(w, "nastavak", 2) <= 2); 

  // Final row color.
  let konacnaBoja = "white"; 

  if      (isNastavak)            konacnaBoja = "#ead1dc"; 
  else if (jeORS)                 konacnaBoja = BOJA_ORS; 
  else if (jeEKG || jeKardiolog)  konacnaBoja = "#ea9999"; 
  else if (jeLabos)               konacnaBoja = BOJA_VADJENJE_KRVI; 
  else if (jeNocniRad && _isZdravstvenaUstanova_(finalH)) konacnaBoja = "#ea9999"; 
  else if (_isZdravstvenaUstanova_(finalH) && isRegisterOrGeneral) konacnaBoja = "#ea9999"; 
  else if (jeNocniRad)            konacnaBoja = "#fff2cc"; 
  else if (isRegisterOrGeneral)   konacnaBoja = "#fff2cc"; 
  else if (isRocnik)              konacnaBoja = "#fce5cd"; 
  else if (vCLower !== "") { 
    for (const p of BOJE_PRIORITETI_NORM) { 
      if (vCnorm.includes(p.normRijec)) { konacnaBoja = p.boja; break; } 
    } 
  } 

  _patchSetBackground_(patch, STUPAC_B, 2, konacnaBoja); 

  const hHasFakturaTag = /\bFAKTURA\b/i.test(finalH); 
  _patchSetBackground_(patch, STUPAC_H, 1, hHasFakturaTag ? "#fff2cc" : "white"); 

  // Slash-fill logic.
  const fillSlashLocal = v => String(v || "").trim() ? String(v) : "/"; 

  if (jeORS) { 
    finalD = fillSlashLocal(finalD); 
    finalE = fillSlashLocal(finalE); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    if (!String(finalJ).trim()) finalJ = "p"; 
  } 

  if (jeEKG) { 
    finalD = fillSlashLocal(finalD); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  if (jeKardiolog) { 
    finalD = fillSlashLocal(finalD); 
    finalE = ""; 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalI = ""; 
    finalJ = "k"; 
  } 

  if (jeLabos) { 
    finalE = fillSlashLocal(finalE); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  if (isBoksGodisnji) { 
    if (_isSlashOnly_(finalD)) finalD = ""; 
    if (_isEmptyLike_(finalE) || _isSlashOnly_(finalE)) finalE = SPORTSKI_PLACEHOLDER_TEXT; 
    if (_isSlashOnly_(finalF)) finalF = ""; 
    finalG = fillSlashLocal(finalG); 
  } else if (isSportski) { 
    if (_isSlashOnly_(finalD)) finalD = ""; 

    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 

    if (_isEmptyLike_(finalE) || _isSlashOnly_(finalE)) { 
      finalE = SPORTSKI_PLACEHOLDER_TEXT; 
    } 
  } 

  if (vCLower === "rnr") { 
    finalD = fillSlashLocal(finalD); 
    finalE = fillSlashLocal(finalE); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  // Additional-review logic.
  let trebaOFT = vCLower.includes("dno"); 

  if (!trebaOFT && _isZastitarskaTvrtka_(finalH) 
      && !vCLower.includes("sportski") && !vCLower.includes("rnr")) { 
    const fHasOft = String(finalF || "").includes(TEKST_ZA_DODATI_OFT); 

    if (!fHasOft && ctx.allowUi && _shouldAskOftNow_(sheet, row)) { 
      try { 
        const ui = SpreadsheetApp.getUi(); 
        if (ui.alert("Workflow check", "Does this row require additional review?", ui.ButtonSet.YES_NO) === ui.Button.YES) { 
          trebaOFT = true; 
        } 
      } catch (e) {} 
    } else if (fHasOft) { 
      trebaOFT = true; 
    } 
  } 

  // Additional-review logic for education-related entries.
  // The dialog appears only when column H is directly edited, not during B/C edits,
  // which prevents duplicate prompts.
  if (!trebaOFT && _isZvuH_(finalH)) { 
    const fHasOft = String(finalF || "").includes(TEKST_ZA_DODATI_OFT); 

    if (!fHasOft && ctx.allowUi && ctx.editedCol === STUPAC_H) { 
      try { 
        const ui = SpreadsheetApp.getUi(); 
        if (ui.alert("Workflow check", "Does this row require additional review?", ui.ButtonSet.YES_NO) === ui.Button.YES) { 
          trebaOFT = true; 
        } 
      } catch (e) {} 
    } else if (fHasOft) { 
      trebaOFT = true; 
    } 
  } 

  if (trebaOFT && !String(finalF || "").includes(TEKST_ZA_DODATI_OFT)) { 
    finalF = (String(finalF || "") + " " + TEKST_ZA_DODATI_OFT).trim(); 
  } 

  // KAT X / ROČNIK X.
  if ((isKatLike || isRocnik) && !String(finalG || "").trim()) { 
    finalG = TEKST_ZA_DODATI_KAT_X; 
  } 

  // Plain value writes.
  const maybeSetPlain = (col, finalVal) => { 
    const currentVal = String(_ctxVal_(ctx, col) || ""); 
    const nextVal    = String(finalVal || ""); 

    if (currentVal !== nextVal) { 
      _ctxSetVal_(ctx, col, nextVal); 
      _patchSetValue_(patch, col, nextVal); 
    } 
  }; 

  maybeSetPlain(STUPAC_D, finalD); 
  maybeSetPlain(STUPAC_G, finalG); 
  maybeSetPlain(STUPAC_I, finalI); 
  maybeSetPlain(STUPAC_J, finalJ); 

  // Column E rich/plain write with placeholder styling.
  if ((isSportski || isBoksGodisnji) && _isSportskiPlaceholderExact_(finalE)) { 
    const currentValE = String(_ctxVal_(ctx, STUPAC_E) || ""); 

    if (currentValE !== finalE) { 
      _ctxSetVal_(ctx, STUPAC_E, finalE); 
      _patchSetRichOrPlain_(patch, STUPAC_E, finalE, [{ 
        text: finalE, 
        start: 0, 
        end: finalE.length, 
        style: SpreadsheetApp.newTextStyle() 
          .setForegroundColor(SPORTSKI_PLACEHOLDER_FONT_COLOR) 
          .build() 
      }]); 
    } 
  } else { 
    maybeSetPlain(STUPAC_E, finalE); 

    if (String(finalE || "").trim() && !_isSportskiPlaceholderExact_(finalE)) { 
      _patchSetFontColor_(patch, STUPAC_E, "black"); 
    } 
  } 

  // Column F rich/plain write.
  if (String(finalF || "").includes(TEKST_ZA_DODATI_OFT)) { 
    const txt   = String(finalF || ""); 
    const start = txt.indexOf(TEKST_ZA_DODATI_OFT); 

    _ctxSetVal_(ctx, STUPAC_F, txt); 
    _patchSetRichOrPlain_(patch, STUPAC_F, txt, [{ 
      text: TEKST_ZA_DODATI_OFT, 
      start, 
      end: start + TEKST_ZA_DODATI_OFT.length, 
      style: SpreadsheetApp.newTextStyle() 
        .setBold()
        .setFontSize(14)
        .setForegroundColor("red")
        .build() 
    }]); 
  } else { 
    maybeSetPlain(STUPAC_F, finalF); 
  } 

  // Column H rich/plain write.
  if ( 
    /\bEDUKACIJA\b/i.test(finalH) || 
    /\bFAKTURA\b/i.test(finalH) || 
    /\bNAPLATITI\b/i.test(finalH) || 
    HAS_PAID_PL_TAG_REGEX.test(finalH) 
  ) { 
    const txt         = String(finalH || ""); 
    const taggedParts = _buildHRichTextTaggedParts_(txt); 

    _ctxSetVal_(ctx, STUPAC_H, txt); 
    _patchSetRichOrPlain_(patch, STUPAC_H, txt, taggedParts); 
  } else { 
    maybeSetPlain(STUPAC_H, finalH); 
  } 
} 

// Legacy wrapper.
function _handleCHRules_(sheet, row, allowUi, knownFontLine) { 
  const ctx = _buildRowContextLite_(sheet, row, STUPAC_C, allowUi, ""); 

  if (knownFontLine !== undefined && knownFontLine !== null) ctx.fontLineB = knownFontLine; 

  const patch = _newRowPatch_(); 

  _handleCHRulesLite_(sheet, ctx, patch); 
  _applyRowPatchLite_(sheet, row, patch); 
} 

function _oftPromptKey_(sheet, row) { 
  return "oftPrompt_" + sheet.getSheetId() + "_" + _todayZg_() + "_" + row; 
} 

function _fakturaPromptKey_(sheet, row) { 
  return "fakturaPrompt_" + sheet.getSheetId() + "_" + _todayZg_() + "_" + row; 
} 

function _shouldAskCachedPromptNow_(cacheKey, ttlSec) { 
  const cache = CacheService.getScriptCache(); 
  const key   = String(cacheKey || ""); 
  const ttl   = Math.max(1, Number(ttlSec) || 30); 
  const sk    = LockService.getScriptLock(); 
  let got     = false; 

  try { 
    got = sk.tryLock(50); 
  } catch (e) {} 

  if (!got) return false; 

  try { 
    if (cache.get(key)) return false; 

    cache.put(key, "1", ttl); 
    return true; 
  } finally { 
    try { 
      sk.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _shouldAskOftNow_(sheet, row) { 
  return _shouldAskCachedPromptNow_(_oftPromptKey_(sheet, row), OFT_PROMPT_TTL_SEC); 
} 

function _shouldAskFakturaNow_(sheet, row) { 
  return _shouldAskCachedPromptNow_(_fakturaPromptKey_(sheet, row), FAKTURA_PROMPT_TTL_SEC); 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 17 · WAIT CHECKER — Waiting-time evaluation and status escalation
 * ═══════════════════════════════════════════════════════════════════════ */ 

function provjeriVrijemeCekanja() { 
  const ran = _withDocumentLockOrPending_( 
    "provjeriVrijemeCekanja", 
    "pending_provjeriVrijemeCekanja", 
    (props, pendingKey) => { 
      _provjeriVrijemeCekanjaCore_(props, pendingKey); 
    } 
  ); 

  if (!ran && _isResetInProgress_()) { 
    console.log("provjeriVrijemeCekanja skipped: reset in progress"); 
  } 
} 

function provjeriVrijemeCekanja_TRIGGER() { 
  _withDocumentLockOrPending_( 
    "provjeriVrijemeCekanja_TRIGGER", 
    "pending_provjeriVrijemeCekanja", 
    (props, pendingKey) => { 
      _provjeriVrijemeCekanjaCore_(props, pendingKey); 
    } 
  ); 
} 

function _getRowVisualStateForBorder_(sheet, row) { 
  if (!sheet) return ""; 

  const maxRow = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (row <= 1 || row > maxRow) return ""; 

  try { 
    const sysState = _getRowSysState_(sheet, row); 

    if (sysState === "VIP" || sysState === "WAIT_2H" || sysState === "WAIT_SPORT") { 
      return sysState; 
    } 
  } catch (e) {} 

  try { 
    const i = String(sheet.getRange(row, STUPAC_I).getDisplayValue() || ""); 
    if (_isVipRowByI_(i)) return "VIP"; 
  } catch (e) {} 

  try { 
    const rowId = _getRowId_(sheet, row); 
    const cekKey = _cekFlagKey2h_(rowId); 

    if (cekKey) { 
      const cekVal = PropertiesService.getScriptProperties().getProperty(cekKey); 
      if (cekVal === "1") return "WAIT_2H"; 
    } 
  } catch (e) {} 

  try { 
    const b = String(sheet.getRange(row, STUPAC_B).getDisplayValue() || ""); 
    const c = String(sheet.getRange(row, STUPAC_C).getDisplayValue() || "").trim(); 

    if (_normUpperNoDiacritics_(c) === "SPORTSKI" && _hasWaitSportTag_(b)) { 
      return "WAIT_SPORT"; 
    } 
  } catch (e) {} 

  return ""; 
} 

function _isStrongEdgeOwnerState_(state) { 
  return state === "VIP" || state === "WAIT_2H"; 
} 

function _setRowBorderRespectVip_(sheet, row, color, style, fontWeight, fontSize) { 
  const maxRow = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 

  const prevState = row > 2      ? _getRowVisualStateForBorder_(sheet, row - 1) : ""; 
  const nextState = row < maxRow ? _getRowVisualStateForBorder_(sheet, row + 1) : ""; 

  const preserveTop    = _isStrongEdgeOwnerState_(prevState); 
  const preserveBottom = _isStrongEdgeOwnerState_(nextState); 

  sheet.getRange(row, STUPAC_B, 1, 2) 
    .setFontWeight(fontWeight) 
    .setFontSize(fontSize) 
    .setBorder( 
      preserveTop ? null : true, 
      true, 
      preserveBottom ? null : true, 
      true, 
      true, 
      true, 
      color, 
      style 
    ); 
} 

/**
 * WAIT_SPORT helper:
 * applies the border without changing font weight/size in B:C,
 * so rich text in column B keeps the bold wait tag.
 */
function _setRowBorderOnlyRespectVip_(sheet, row, color, style) { 
  const maxRow = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 

  const prevState = row > 2      ? _getRowVisualStateForBorder_(sheet, row - 1) : ""; 
  const nextState = row < maxRow ? _getRowVisualStateForBorder_(sheet, row + 1) : ""; 
 
  const preserveTop    = _isStrongEdgeOwnerState_(prevState); 
  const preserveBottom = _isStrongEdgeOwnerState_(nextState); 

  sheet.getRange(row, STUPAC_B, 1, 2).setBorder( 
    preserveTop ? null : true, 
    true, 
    preserveBottom ? null : true, 
    true, 
    true, 
    true, 
    color, 
    style 
  ); 
} 

function _provjeriVrijemeCekanjaCore_(props, pendingKey) { 
  const sheet = _getTargetSheet_(); 
  if (!sheet) return; 

  const endRow = _scanEndRowByColumnB_(sheet, MAX_TEMPLATE_ROW, CEKANJE_BUFFER_ROWS); 
  if (endRow < 2) return; 

  const n = endRow - 1; 

  const IDX_B  = 0; 
  const IDX_C  = STUPAC_C - STUPAC_B; 
  const IDX_I  = STUPAC_I - STUPAC_B; 
  const IDX_ID = STUPAC_ID - STUPAC_B; 

  const allData          = sheet.getRange(2, STUPAC_B, n, STUPAC_I - STUPAC_B + 1).getDisplayValues(); 
  const fL               = sheet.getRange(2, STUPAC_B, n, 1).getFontLines(); 
  const now              = new Date(); 
  const sportWaitEnabled = _isSportWaitCurrentlyActive_(); 

  const rowIdToRow = {}; 
  const vipRowsForReapply = []; 

  for (let i = 0; i < n; i++) { 
    if (i % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
      _bgYieldNow_(props, pendingKey); 
    } 

    const tB    = String(allData[i][IDX_B] || ""); 
    const tC    = String(allData[i][IDX_C] || "").trim(); 
    const tI    = String(allData[i][IDX_I] || "").trim(); 
    const isVip = _isVipRowByI_(tI); 

    if (fL[i][0] === "line-through" || !tB) continue; 

    const isSport = (_normUpperNoDiacritics_(tC) === "SPORTSKI"); 
    const row     = i + 2; 
    const rowId   = _ensureRowId_(sheet, row); 
    const cekKey  = _cekFlagKey2h_(rowId); 

    if (rowId) rowIdToRow[rowId] = row; 

    // VIP rows never enter the waiting-time escalation logic.
    if (isVip) { 
      vipRowsForReapply.push(row); 

      if (_hasWait2hTag_(tB) || _hasWaitSportTag_(tB)) { 
        const cleanedVip = _cleanWaitDecorButPreserveVip_(tB, true); 
        if (cleanedVip !== tB) sheet.getRange(row, STUPAC_B).setValue(cleanedVip); 
      } 

      if (cekKey) { 
        try { props.deleteProperty(cekKey); } catch (e) {} 
      } 

      _refreshRowSystemMetaFromSheet_(sheet, row, "VIP"); 
      continue; 
    } 

    const matchVrijeme = tB.match(REGEX_VRIJEME_HHMM); 

    // If column B has no time, waiting time cannot be calculated.
    if (!matchVrijeme) { 
      if (!isSport && cekKey) { 
        try { props.deleteProperty(cekKey); } catch (e) {} 
      } 

      if (isSport && (_hasWaitSportTag_(tB) || tB.startsWith("⚠️"))) { 
        const cleaned = _cleanWaitDecorButPreserveVip_(tB, false); 
        if (cleaned !== tB) sheet.getRange(row, STUPAC_B).setValue(cleaned); 
      } 

      _refreshRowSystemMetaFromSheet_(sheet, row, "ACTIVE"); 
      continue; 
    } 

    const [h0, m0] = matchVrijeme[0].split(":").map(Number); 
    const entryTime = new Date(); 

    entryTime.setHours(h0, m0, 0, 0); 
    if (entryTime > now) entryTime.setDate(entryTime.getDate() - 1); 

    const waitingMin = (now - entryTime) / 60000; 

    // SPORTSKI rows.
    if (isSport) { 
      if (!sportWaitEnabled) { 
        if (_hasWaitSportTag_(tB) || tB.startsWith("⚠️")) { 
          const cleaned = _cleanWaitDecorButPreserveVip_(tB, false); 
          if (cleaned !== tB) sheet.getRange(row, STUPAC_B).setValue(cleaned); 
        } 

        if (cekKey) { 
          try { props.deleteProperty(cekKey); } catch (e) {} 
        } 

        _refreshRowSystemMetaFromSheet_(sheet, row, "ACTIVE"); 
        continue; 
      } 

      if (waitingMin < 45) { 
        if (_hasWaitSportTag_(tB) || tB.startsWith("⚠️")) { 
          const cleaned = _cleanWaitDecorButPreserveVip_(tB, false); 
          if (cleaned !== tB) sheet.getRange(row, STUPAC_B).setValue(cleaned); 
        } 

        if (cekKey) { 
          try { props.deleteProperty(cekKey); } catch (e) {} 
        } 

        _refreshRowSystemMetaFromSheet_(sheet, row, "ACTIVE"); 
        continue; 
      } 

      // 45+ minutes: append short-wait tag and warning emoji to column B.
      const cT = _cleanWaitDecorButPreserveVip_(tB, false); 
      const nT = cT + " " + TEKST_CEKANJE_SPORT + " ⚠️"; 

      const builder = SpreadsheetApp.newRichTextValue().setText(nT); 
      const waitTagStart = cT.length + 1; 
      const waitTagEnd   = waitTagStart + TEKST_CEKANJE_SPORT.length; 

      builder.setTextStyle( 
        waitTagStart, 
        waitTagEnd, 
        SpreadsheetApp.newTextStyle() 
          .setForegroundColor(BOJA_CEKANJE_SPORT) 
          .setBold(true) 
          .build() 
      ); 

      sheet.getRange(row, STUPAC_B).setRichTextValue(builder.build()); 

      if (cekKey) { 
        try { props.deleteProperty(cekKey); } catch (e) {} 
      } 

      _refreshRowSystemMetaFromSheet_(sheet, row, "WAIT_SPORT"); 
      continue; 
    } 

    // Non-SPORTSKI rows.
    const hasLegacyTags = tB.includes(TEKST_CEKANJE) || tB.includes(TEKST_CEKANJE_SPORT) || tB.includes(EMOJI_ALARM); 

    if (hasLegacyTags) { 
      const cleaned = _cleanWaitDecorButPreserveVip_(tB, false); 
      if (cleaned !== tB) sheet.getRange(row, STUPAC_B).setValue(cleaned); 
    } 

    if (waitingMin < 120) { 
      if (cekKey) { 
        try { props.deleteProperty(cekKey); } catch (e) {} 
      } 

      _refreshRowSystemMetaFromSheet_(sheet, row, "ACTIVE"); 
      continue; 
    } 

    // 2h+ wait: bold B:C, increase font size and apply thick border.
    _setRowBorderRespectVip_( 
      sheet, 
      row, 
      "black", 
      SpreadsheetApp.BorderStyle.SOLID_THICK, 
      "bold", 
      13 
    ); 

    if (cekKey) { 
      try { props.setProperty(cekKey, "1"); } catch (e) {} 
    } 

    _refreshRowSystemMetaFromSheet_(sheet, row, "WAIT_2H"); 
  } 

  // Second pass: reapply 2h border for active non-SPORTSKI rows.
  const todayPrefix = "cek_" + _todayZg_() + "_2h_"; 
  const allProps    = props.getProperties(); 

  for (const key of Object.keys(allProps)) { 
    if (_shouldBackgroundYieldNow_()) { 
      _bgYieldNow_(props, pendingKey); 
    } 

    if (!key.startsWith(todayPrefix)) continue; 

    const rowId = key.substring(todayPrefix.length); 
    if (!rowId) continue; 

    const foundRow = rowIdToRow[rowId] || 0; 
    if (!foundRow) continue; 

    const idx = foundRow - 2; 
    if (idx < 0 || idx >= fL.length) continue; 
    if (fL[idx][0] === "line-through") continue; 

    const tCFound = (idx >= 0 && idx < allData.length) 
      ? String(allData[idx][IDX_C] || "").trim() 
      : ""; 

    const tIFound = (idx >= 0 && idx < allData.length) 
      ? String(allData[idx][IDX_I] || "") 
      : ""; 

    const tBFound = (idx >= 0 && idx < allData.length) 
      ? String(allData[idx][IDX_B] || "") 
      : ""; 

    const isSportFound = (_normUpperNoDiacritics_(tCFound) === "SPORTSKI"); 

    if (isSportFound) { 
      try { props.deleteProperty(key); } catch (e) {} 
      _refreshRowSystemMetaFromSheet_(sheet, foundRow, _hasWaitSportTag_(tBFound) ? "WAIT_SPORT" : "ACTIVE"); 
      continue; 
    } 
 
    if (_isVipRowByI_(tIFound)) { 
      sheet.getRange(foundRow, STUPAC_B, 1, 2) 
        .setFontWeight("bold") 
        .setFontSize(13) 
        .setBorder(true, true, true, true, true, true, "red", SpreadsheetApp.BorderStyle.SOLID_THICK); 

      _refreshRowSystemMetaFromSheet_(sheet, foundRow, "VIP"); 
      continue; 
    } 

    _setRowBorderRespectVip_( 
      sheet, 
      foundRow, 
      "black", 
      SpreadsheetApp.BorderStyle.SOLID_THICK, 
      "bold", 
      13 
    ); 

    _refreshRowSystemMetaFromSheet_(sheet, foundRow, "WAIT_2H"); 
  } 

  // Reapply red border for VIP rows.
  for (let vi = 0; vi < vipRowsForReapply.length; vi++) { 
    if (vi % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
      _bgYieldNow_(props, pendingKey); 
    } 

    const vRow = vipRowsForReapply[vi]; 

    sheet.getRange(vRow, STUPAC_B, 1, 2) 
      .setFontWeight("bold") 
      .setFontSize(13) 
      .setBorder( 
        true, true, true, true, true, true, 
        "red", SpreadsheetApp.BorderStyle.SOLID_THICK 
      ); 
  } 
} 

function _refreshRowSystemMetaFromSheet_(sheet, row, forcedState) { 
  try { 
    const ctx = _buildRowContextLite_(sheet, row, STUPAC_B, false, ""); 
    const sig = _buildRowSignatureLite_(ctx); 
    const st  = String(forcedState || _deriveRowStateLite_(ctx) || ""); 

    const oldState = _getRowSysState_(sheet, row); 
    const oldSig   = _getRowSysSignature_(sheet, row); 

    if (oldState === st && oldSig === sig) return; 

    sheet.getRange(row, STUPAC_SYS_STATE, 1, 2).setValues([[st, sig]]); 
  } catch (e) {} 
} 

/* ═══════════════════════════════════════════════════════════════════════ 
 * 18 · FORMAT CLEANER — Format and content cleanup for completed rows
 * ═══════════════════════════════════════════════════════════════════════ */ 

const CLEANER_RETRY_MAX      = 3; 
const CLEANER_RETRY_DELAY_MS = 2000; 

function cistacFormataGotovihPacijenata() { 
  for (let attempt = 0; attempt < CLEANER_RETRY_MAX; attempt++) { 
    const ran = _withDocumentLockOrPending_( 
      "cistacFormataGotovihPacijenata", 
      "pending_cistacFormataGotovihPacijenata", 
      (props, pendingKey) => { 
        const sheet = _getTargetSheet_(); 
        if (!sheet) return; 

        const endRow = _scanEndRowByLastStruckInB_(sheet, MAX_TEMPLATE_ROW, CLEANER_BUFFER_ROWS); 
        if (endRow < 2) return; 

        const n = endRow - 1; 

        const rangeBO = sheet.getRange(2, STUPAC_B, n, STUPAC_SYS_SIG - STUPAC_B + 1); 
        const vBO     = rangeBO.getDisplayValues(); 
        const fL      = sheet.getRange(2, STUPAC_B, n, 1).getFontLines(); 

        const IDX_B         = STUPAC_B - STUPAC_B; 
        const IDX_C         = STUPAC_C - STUPAC_B; 
        const IDX_I         = STUPAC_I - STUPAC_B; 
        const IDX_ID        = STUPAC_ID - STUPAC_B; 
        const IDX_SYS_STATE = STUPAC_SYS_STATE - STUPAC_B; 

        const getPrereadState = (rowNum) => { 
          const idx = rowNum - 2; 
          if (idx < 0 || idx >= n) return ""; 

          if (fL[idx][0] === "line-through") return "DONE"; 

          const iStr = String((vBO[idx] && vBO[idx][IDX_I]) || ""); 
          if (_isVipRowByI_(iStr)) return "VIP"; 

          return String((vBO[idx] && vBO[idx][IDX_SYS_STATE]) || "").trim() || ""; 
        }; 

        const struckIdx = fL.reduce((acc, row, i) => { 
          if (row[0] === "line-through") acc.push(i); 
          return acc; 
        }, []); 

        if (!struckIdx.length) { 
          try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
          return; 
        } 

        const TAG_RE           = /^\s*\[[^\]]+\]\s*/; 
        const headerDG         = sheet.getRange(1, STUPAC_D, 1, 4).getBackgrounds()[0]; 
        const sportWaitEnabled = _isSportWaitEnabled_(); 

        const waitRows = []; 
        const vipRows  = []; 

        for (let ii = 0; ii < fL.length; ii++) { 
          if (ii % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
            _bgYieldNow_(props, pendingKey); 
          } 

          const rowNum = ii + 2; 
          const tBStr  = String((vBO[ii] && vBO[ii][IDX_B]) || ""); 
          const tCStr  = String((vBO[ii] && vBO[ii][IDX_C]) || "").trim(); 
          const tIStr  = String((vBO[ii] && vBO[ii][IDX_I]) || ""); 
          const rowId  = String((vBO[ii] && vBO[ii][IDX_ID]) || "").trim(); 

          let sysState = String((vBO[ii] && vBO[ii][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          const cekKey  = rowId ? _cekFlagKey2h_(rowId) : ""; 
          const isSport = (_normUpperNoDiacritics_(tCStr) === "SPORTSKI"); 

          if (fL[ii][0] === "line-through") continue; 

          if (_isVipRowByI_(tIStr) || sysState === "VIP") { 
            vipRows.push(rowNum); 
            continue; 
          } 

          if (isSport) { 
            if (sysState === "WAIT_SPORT" || 
                (sportWaitEnabled && _hasWaitSportTag_(tBStr))) { 
              waitRows.push(rowNum); 
            } 
            continue; 
          } 

          if (sysState === "WAIT_2H" || 
              (cekKey && props.getProperty(cekKey) === "1") || 
              _hasWait2hTag_(tBStr)) { 
            waitRows.push(rowNum); 
            continue; 
          } 
        } 

        const getSpecialType = idx0 => { 
          if (idx0 < 0 || idx0 >= fL.length || fL[idx0][0] === "line-through") return null; 

          const rowNum   = idx0 + 2; 
          const tB       = String((vBO[idx0] && vBO[idx0][IDX_B]) || ""); 
          const tC       = String((vBO[idx0] && vBO[idx0][IDX_C]) || "").trim(); 
          const tI       = String((vBO[idx0] && vBO[idx0][IDX_I]) || ""); 
          const rowId    = String((vBO[idx0] && vBO[idx0][IDX_ID]) || "").trim(); 
          const cekKey   = rowId ? _cekFlagKey2h_(rowId) : ""; 
          const isSport  = (_normUpperNoDiacritics_(tC) === "SPORTSKI"); 

          let sysState = String((vBO[idx0] && vBO[idx0][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          if (_isVipRowByI_(tI) || sysState === "VIP") return "VIP_RED"; 

          if (isSport) { 
            if (sysState === "WAIT_SPORT" || (sportWaitEnabled && _hasWaitSportTag_(tB))) { 
              return "WAIT_SPORT_TEXT_ONLY"; 
            } 
            return null; 
          } 

          if (sysState === "WAIT_2H" || 
              (cekKey && props.getProperty(cekKey) === "1") || 
              _hasWait2hTag_(tB)) { 
            return "WAIT_BLACK"; 
          } 

          return null; 
        }; 

        const emptyStruckRows = []; 
        const workStruckRows  = []; 

        for (let si = 0; si < struckIdx.length; si++) { 
          if (si % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
            _bgYieldNow_(props, pendingKey); 
          } 

          const idx = struckIdx[si]; 

          vBO[idx].some(v => String(v || "").trim() !== "") 
            ? workStruckRows.push(idx + 2) 
            : emptyStruckRows.push(idx + 2); 
        } 

        if (!workStruckRows.length) { 
          _groupConsecutiveRows_(emptyStruckRows).forEach(g => { 
            sheet.getRange(g.start, STUPAC_B, g.len, 1).setFontLine("none"); 
          }); 

          try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
          return; 
        } 

        const groupsWork = _groupConsecutiveRows_(workStruckRows); 

        // 1) Clean wait tags and leading warning emoji from column B.
        for (let g = 0; g < groupsWork.length; g++) { 
          if (g % 5 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const { start: startRow, len } = groupsWork[g]; 
          const blockValues = []; 

          for (let r = 0; r < len; r++) { 
            const idx0 = startRow + r - 2; 
            let s = String(vBO[idx0][IDX_B] || ""); 

            if (s.startsWith("⚠️") || s.includes(TEKST_CEKANJE) || s.includes(TEKST_CEKANJE_SPORT) || s.includes(EMOJI_ALARM)) { 
              s = s 
                .replace(/^⚠️\s*/, "") 
                .replace(TEKST_CEKANJE, "") 
                .replace(TEKST_CEKANJE_SPORT, "") 
                .split(EMOJI_ALARM).join("") 
                .replace(/\s{2,}/g, " ") 
                .trim(); 
            } 

            blockValues.push([s]); 
          } 

          sheet.getRange(startRow, STUPAC_B, len, 1).setValues(blockValues); 
        } 

        const idsToDelete = []; 

        // 2) Clean format/content for completed work rows.
        for (let g = 0; g < groupsWork.length; g++) { 
          if (g % 8 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const { start: startRow, len } = groupsWork[g]; 

          const aboveState = getPrereadState(startRow - 1); 
          const belowState = getPrereadState(startRow + len); 

          const preserveTop    = _isStrongEdgeOwnerState_(aboveState); 
          const preserveBottom = _isStrongEdgeOwnerState_(belowState); 

          sheet.getRange(startRow, STUPAC_B, len, 2) 
            .setBackground("white") 
            .setFontColor("black") 
            .setFontWeight("normal") 
            .setFontStyle("normal") 
            .setFontSize(12) 
            .setBorder( 
              preserveTop    ? null : true, 
              true, 
              preserveBottom ? null : true, 
              true, 
              true, 
              true, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID 
            ); 

          sheet.getRange(startRow, STUPAC_D, len, 4) 
            .setBackgrounds(Array.from({ length: len }, () => headerDG.slice())); 

          const iVals = Array.from({ length: len }, (_, r) => { 
            const idx0 = startRow + r - 2; 
            return [String((vBO[idx0] && vBO[idx0][IDX_I]) || "").replace(TAG_RE, "").trim()]; 
          }); 

          sheet.getRange(startRow, STUPAC_I, len, 1) 
            .setValues(iVals) 
            .setFontWeight("normal") 
            .setFontSize(12) 
            .setFontStyle("normal") 
            .clearNote() 
            .setBackground("white"); 

          sheet.getRange(startRow, STUPAC_J, len, 1).setBackground("white"); 

          try { 
            sheet.getRange(startRow, STUPAC_SYS_STATE, len, 1).clearContent(); 
            sheet.getRange(startRow, STUPAC_SYS_SIG,   len, 1).clearContent(); 
          } catch (e) {} 

          const idVals = sheet.getRange(startRow, STUPAC_ID, len, 1).getValues(); 

          idVals.forEach(row => { 
            const id = String(row[0] || "").trim(); 
            if (id) idsToDelete.push(id); 
          }); 

          sheet.getRange(startRow, STUPAC_ID, len, 1).clearContent().setFontColor("black"); 
          sheet.getRange(startRow, STUPAC_B, len, 1).setFontLine("line-through"); 
          sheet.getRange(startRow, STUPAC_C, len, STUPAC_J - STUPAC_C + 1).setFontLine("none"); 
        } 

        // 3) Remove strike-through from empty struck rows.
        _groupConsecutiveRows_(emptyStruckRows).forEach(g => { 
          sheet.getRange(g.start, STUPAC_B, g.len, 1).setFontLine("none"); 
        }); 

        // 4) Delete stored time memory and 2h wait flag for completed rows.
        for (let di = 0; di < idsToDelete.length; di++) { 
          if (di % 80 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const idd = idsToDelete[di]; 

          try { memorijaSkripte.deleteProperty("vrijeme_id_" + idd); } catch (e) {} 
          try { CacheService.getScriptCache().remove("t_vrijeme_id_" + idd); } catch (e) {} 

          try { 
            const cekKey = _cekFlagKey2h_(idd); 
            if (cekKey) props.deleteProperty(cekKey); 
          } catch (e) {} 
        } 

        // 5) Restore default border to active rows only:
        // non-VIP, non-wait and non-struck rows.
        const vipSet  = new Set(vipRows); 
        const waitSet = new Set(waitRows); 

        const defaultActiveRows = []; 

        for (let ii2 = 0; ii2 < n; ii2++) { 
          const rowNum = ii2 + 2; 

          if (fL[ii2][0] === "line-through") continue; 
          if (vipSet.has(rowNum))  continue; 
          if (waitSet.has(rowNum)) continue; 

          defaultActiveRows.push(rowNum); 
        } 

        for (let a = 0; a < defaultActiveRows.length; a++) { 
          if (a % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const rowNum = defaultActiveRows[a]; 

          _setRowBorderRespectVip_( 
            sheet, 
            rowNum, 
            "black", 
            SpreadsheetApp.BorderStyle.SOLID, 
            "normal", 
            12 
          ); 
        } 

        const applySpecialVisual = (rowNum, type) => { 
          if (type === "VIP_RED") { 
            sheet.getRange(rowNum, STUPAC_B, 1, 2) 
              .setFontWeight("bold") 
              .setFontSize(13) 
              .setBorder(true, true, true, true, true, true, "red", SpreadsheetApp.BorderStyle.SOLID_THICK); 
            return; 
          } 

          if (type === "WAIT_BLACK") { 
            _setRowBorderRespectVip_( 
              sheet, 
              rowNum, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID_THICK, 
              "bold", 
              13 
            ); 
            return; 
          } 

          if (type === "WAIT_SPORT_TEXT_ONLY") { 
            _setRowBorderOnlyRespectVip_( 
              sheet, 
              rowNum, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID 
            ); 
            return; 
          } 
        }; 

        // 6) Reapply WAIT/VIP visuals only to active rows.
        waitRows.forEach((rowNum, w) => { 
          if (w % 20 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(rowNum, STUPAC_B).getFontLine() === "line-through") return; 

          const idx = rowNum - 2; 
          if (idx < 0 || idx >= vBO.length) return; 

          let sysState = String((vBO[idx] && vBO[idx][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          const rowB    = String((vBO[idx] && vBO[idx][IDX_B]) || ""); 
          const rowC    = String((vBO[idx] && vBO[idx][IDX_C]) || "").trim(); 
          const isSport = (_normUpperNoDiacritics_(rowC) === "SPORTSKI"); 

          if (isSport || sysState === "WAIT_SPORT" || (sportWaitEnabled && _hasWaitSportTag_(rowB))) { 
            applySpecialVisual(rowNum, "WAIT_SPORT_TEXT_ONLY"); 
            return; 
          } 

          applySpecialVisual(rowNum, "WAIT_BLACK"); 
        }); 

        vipRows.forEach((rowNum, v) => { 
          if (v % 20 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(rowNum, STUPAC_B).getFontLine() === "line-through") return; 

          applySpecialVisual(rowNum, "VIP_RED"); 
        }); 

        // Final pass: safety net for all non-struck rows with special visual state.
        for (let ii2 = 0; ii2 < fL.length; ii2++) { 
          if (ii2 % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(ii2 + 2, STUPAC_B).getFontLine() === "line-through") continue; 

          const type = getSpecialType(ii2); 
          if (type) applySpecialVisual(ii2 + 2, type); 
        } 

        try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
      } 
    ); 

    if (ran) return; 

    if (attempt < CLEANER_RETRY_MAX - 1) { 
      Utilities.sleep(CLEANER_RETRY_DELAY_MS); 
    } 
  } 
} 

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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 20 · XLSX AUTORESTORE — Revision-based XLSX auto-restore
 * ═══════════════════════════════════════════════════════════════════════ */ 

const AUTO_RESTORE_ROOT_FOLDER_ID = ""; // Set this in your private deployment.
const AUTO_RESTORE_TAG            = "AUTO-RESTORE";
const AUTO_RESTORE_BASELINE_RE    = /AUTO-RESTORE(?:\s+BASELINE_REV=([^\s]+))?/i;
const XLSX_MIME                   = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Compatibility wrapper.
 */
function autoRestoreRunOnce() { 
  autoRestoreHourly(); 
}

/**
 * Scans the configured Drive folder and restores tagged XLSX files to their pinned baseline revision.
 *
 * Safety:
 * - does nothing unless AUTO_RESTORE_ROOT_FOLDER_ID is configured
 * - only processes XLSX files
 * - only processes files tagged with AUTO-RESTORE in the file description
 */
function autoRestoreHourly() { 
  if (!AUTO_RESTORE_ROOT_FOLDER_ID) {
    console.log("XLSX auto-restore skipped: AUTO_RESTORE_ROOT_FOLDER_ID is not configured.");
    return;
  }

  const lock = LockService.getScriptLock(); 
  if (!lock.tryLock(5000)) return; 

  const start  = Date.now(); 
  const MAX_MS = 5.5 * 60000; 

  try { 
    _autoRestoreScanFolderRecursive_(AUTO_RESTORE_ROOT_FOLDER_ID, file => { 
      if (Date.now() - start > MAX_MS) throw new Error("__TIME_GUARD__"); 
      _autoRestoreProcessOneFile_(file); 
    }); 
  } catch (e) { 
    if (!String(e && e.message ? e.message : e).includes("__TIME_GUARD__")) { 
      console.error("autoRestoreHourly error:", e && e.stack ? e.stack : e); 
    } 
  } finally { 
    try { 
      lock.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _autoRestoreScanFolderRecursive_(folderId, onFile) { 
  let pageToken = null; 

  do { 
    const resp = Drive.Files.list({ 
      q: "'" + folderId + "' in parents and trashed=false", 
      fields: "items(id,title,mimeType,fileExtension,description),nextPageToken", 
      maxResults: 200, 
      pageToken: pageToken || undefined 
    }); 

    for (const it of (resp.items || [])) { 
      it.mimeType === "application/vnd.google-apps.folder" 
        ? _autoRestoreScanFolderRecursive_(it.id, onFile) 
        : onFile(it); 
    } 

    pageToken = resp.nextPageToken; 
  } while (pageToken); 
} 

function _autoRestoreProcessOneFile_(file) { 
  const ext = String(file.fileExtension || "").toLowerCase(); 
  const mt  = String(file.mimeType || "").toLowerCase(); 

  if (ext !== "xlsx" && mt !== XLSX_MIME.toLowerCase()) return; 

  const desc = String(file.description || ""); 

  // Public/demo safety: only explicitly tagged files are processed.
  if (!desc.toLowerCase().includes(AUTO_RESTORE_TAG.toLowerCase())) return;

  let baselineRevId = _autoRestoreParseBaselineRevFromDesc_(desc); 

  if (!baselineRevId) { 
    baselineRevId = _autoRestoreEnsureBaselinePinnedAndStored_(file.id, desc); 
    if (!baselineRevId) return; 
  } 

  const revs = (Drive.Revisions.list(file.id, { fields: "items(id,pinned)" }).items || []); 
  if (!revs.length) return; 

  const headRevId = revs[revs.length - 1].id; 

  if (String(headRevId) !== String(baselineRevId)) { 
    _autoRestoreFileToRevision_(file.id, file.title, baselineRevId, desc); 

    const revs2   = (Drive.Revisions.list(file.id, { fields: "items(id,pinned)" }).items || []); 
    const newHead = revs2.length ? revs2[revs2.length - 1].id : headRevId; 

    _autoRestoreCleanupRevisions_(file.id, baselineRevId, newHead); 
    return; 
  } 

  _autoRestoreCleanupRevisions_(file.id, baselineRevId, headRevId); 
} 

function _autoRestoreParseBaselineRevFromDesc_(desc) { 
  const m = String(desc || "").match(AUTO_RESTORE_BASELINE_RE); 
  return (m && m[1]) ? String(m[1]).trim() : null; 
} 

function _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc) { 
  const revs = (Drive.Revisions.list(fileId, { fields: "items(id,pinned)" }).items || []); 
  if (!revs.length) return null; 

  const headId = revs[revs.length - 1].id; 

  try { 
    Drive.Revisions.patch({ pinned: true }, fileId, headId); 
  } catch (e) {} 

  const newDesc = _autoRestoreUpsertBaselineInDesc_(oldDesc, headId); 

  try { 
    Drive.Files.patch({ description: newDesc }, fileId); 
  } catch (e) {} 

  return headId; 
} 

function _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId) { 
  let d = String(desc || ""); 

  if (!d.toLowerCase().includes(AUTO_RESTORE_TAG.toLowerCase())) { 
    d = (d ? d + "\n" : "") + AUTO_RESTORE_TAG; 
  } 

  d = d.replace(/AUTO-RESTORE\s+BASELINE_REV=[^\s]+/ig, AUTO_RESTORE_TAG); 
  d = d.replace(new RegExp(AUTO_RESTORE_TAG, "i"), AUTO_RESTORE_TAG + " BASELINE_REV=" + baselineRevId); 

  return d; 
} 

function _autoRestoreFileToRevision_(fileId, title, revisionId, description) { 
  const dl = Drive.Revisions.get(fileId, revisionId).downloadUrl; 

  if (!dl) throw new Error("No downloadUrl found for baseline revision."); 

  const resp = UrlFetchApp.fetch(dl, { 
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, 
    muteHttpExceptions: true 
  }); 

  const code = resp.getResponseCode(); 

  if (code < 200 || code >= 300) { 
    throw new Error("Restore download failed. HTTP " + code); 
  } 

  const blob = resp.getBlob()
    .setName(String(title || ""))
    .setContentType(XLSX_MIME); 

  Drive.Files.update(
    { 
      title: String(title || ""), 
      description: String(description || "") 
    }, 
    fileId, 
    blob
  ); 
} 

function _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId) { 
  let revs; 

  try { 
    revs = (Drive.Revisions.list(fileId, { fields: "items(id,pinned)" }).items || []); 
  } catch (e) { 
    return; 
  } 

  const baseId = String(baselineRevId || ""); 
  const headId = String(headRevId || ""); 

  for (const r of revs) { 
    const id = String(r.id); 

    if (id === baseId || id === headId) continue; 

    try { 
      Drive.Revisions.remove(fileId, r.id); 
    } catch (e) {} 
  } 

  if (baseId) { 
    try { 
      Drive.Revisions.patch({ pinned: true }, fileId, baseId); 
    } catch (e) {} 
  } 

  if (headId && headId !== baseId) { 
    try { 
      Drive.Revisions.patch({ pinned: false }, fileId, headId); 
    } catch (e) {} 
  } 
}

/**
 * Backwards-compatible aliases from the original implementation.
 */
function _autoRestoreScanFolderRecursive_(folderId, onFile) {
  return _autoRestoreScanFolderRecursive_(folderId, onFile);
}

function _autoRestoreProcessOneFile_(file) {
  return _autoRestoreProcessOneFile_(file);
}

function _autoRestoreParseBaselineRevFromDesc_(desc) {
  return _autoRestoreParseBaselineRevFromDesc_(desc);
}

function _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc) {
  return _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc);
}

function _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId) {
  return _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId);
}

function _autoRestoreFileToRevision_(fileId, title, revisionId, description) {
  return _autoRestoreFileToRevision_(fileId, title, revisionId, description);
}

function _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId) {
  return _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId);
}

/* ═══════════════════════════════════════════════════════════════════════ 
 * 21 · DRIVE AUTH — Initial Drive access authorization
 * ═══════════════════════════════════════════════════════════════════════ */ 

function authorizeDriveOnce() { 
  DriveApp.getRootFolder().getName(); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Drive authorization OK", "✅", 3); 
}

/* ═══════════════════════════════════════════════════════════════════════ 
 * 22 · TRIGGERS — Installed trigger management
 * ═══════════════════════════════════════════════════════════════════════ */ 

const _MANAGED_HANDLERS_ = [ 
  "mojInstaliraniOnEdit", 
  "obradiEditQueue", 
  "provjeriVrijemeCekanja_TRIGGER", 
  "cistacFormataGotovihPacijenata", 
  "resetirajDnevnuMemoriju", 
  "resetirajDnevnuMemoriju_FORCE", 
  "resetirajDnevnuMemoriju_RETRY", 
  "autoRestoreHourly", 
  "resetWatchdog_0630", 
  "reportFailSafeSend_2300" 
]; 

function instalirajTriggere() { 
  const ss = _getSpreadsheet_(); 
  if (!ss) throw new Error("Run zapamtiSpreadsheetId() once from the spreadsheet."); 

  ScriptApp.getProjectTriggers() 
    .filter(t => 
      _MANAGED_HANDLERS_.includes(t.getHandlerFunction()) || 
      t.getHandlerFunction() === "provjeriVrijemeCekanja"
    ) 
    .forEach(t => { 
      try { 
        ScriptApp.deleteTrigger(t); 
      } catch (e) {} 
    }); 

  ScriptApp.newTrigger("mojInstaliraniOnEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create(); 

  ScriptApp.newTrigger("obradiEditQueue")
    .timeBased()
    .everyMinutes(1)
    .create(); 

  ScriptApp.newTrigger("provjeriVrijemeCekanja_TRIGGER")
    .timeBased()
    .everyMinutes(5)
    .create(); 

  ScriptApp.newTrigger("cistacFormataGotovihPacijenata")
    .timeBased()
    .everyMinutes(5)
    .create(); 

  ScriptApp.newTrigger("resetirajDnevnuMemoriju")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .nearMinute(5)
    .create(); 

  ScriptApp.newTrigger("resetWatchdog_0630")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
    .create(); 

  ScriptApp.newTrigger("autoRestoreHourly")
    .timeBased()
    .everyHours(1)
    .create(); 

  ScriptApp.newTrigger("reportFailSafeSend_2300")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(0)
    .create(); 
} 

function obrisiMojeTriggere() { 
  ScriptApp.getProjectTriggers() 
    .filter(t => 
      _MANAGED_HANDLERS_.includes(t.getHandlerFunction()) || 
      t.getHandlerFunction() === "provjeriVrijemeCekanja"
    ) 
    .forEach(t => { 
      try { 
        ScriptApp.deleteTrigger(t); 
      } catch (e) {} 
    }); 
}

/* ═══════════════════════════════════════════════════════════════════════ 
 * 23 · ONEDIT — Entry point for edit-event processing
 * ═══════════════════════════════════════════════════════════════════════ */ 

function mojInstaliraniOnEdit(e) { 
  if (_isQuietHours_())      return; 
  if (_isResetInProgress_()) return; 

  if (_isReportInterruptActive_()) { 
    try { 
      _toastReportInterruptOnce_(_getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet()); 
    } catch (e0) {} 
    return; 
  } 

  _markOnEditIntent_(true); 

  try { 
    if (!e || !e.range) return; 

    const range = e.range; 
    const sheet = range.getSheet(); 

    if (sheet.getName() !== TARGET_SHEET_NAME) return; 

    const isSingleCell = (range.getNumRows() === 1 && range.getNumColumns() === 1); 

    if (!isSingleCell) { 
      if (range.getNumColumns() !== 1 || range.getColumn() !== STUPAC_J) { 
        for (let i = 0; i < range.getNumRows(); i++) { 
          _enqueueEdit_(sheet, sheet.getRange(range.getRow() + i, range.getColumn())); 
        } 
        return; 
      } 

      const sk = LockService.getScriptLock(); 
      let gotSk = false; 

      try { 
        gotSk = sk.tryLock(300); 
      } catch (e) {} 

      if (!gotSk) { 
        for (let ii = 0; ii < range.getNumRows(); ii++) { 
          _enqueueEdit_(sheet, sheet.getRange(range.getRow() + ii, STUPAC_J)); 
        } 
        return; 
      } 

      try { 
        const vals2 = range.getDisplayValues(); 

        for (let iii = 0; iii < vals2.length; iii++) { 
          _applyRulesForEdit_( 
            sheet, 
            sheet.getRange(range.getRow() + iii, STUPAC_J), 
            vals2[iii][0], 
            true 
          ); 
        } 
      } finally { 
        try { 
          sk.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    const editedRow = range.getRow(); 
    if (editedRow <= 1) return; 

    const editedCol = range.getColumn(); 

    let inputValue = ((e.value !== undefined ? e.value : range.getDisplayValue()) || "") 
      .toString() 
      .trim(); 

    if (editedCol >= STUPAC_B && editedCol <= STUPAC_H && inputValue) { 
      const upper = inputValue.toUpperCase(); 

      if (inputValue !== upper) { 
        try { 
          range.setValue(upper); 
        } catch (ig) {} 

        inputValue = upper; 
      } 
    } 

    if (editedCol >= STUPAC_B && editedCol <= STUPAC_H) { 
      try { 
        const fastRes = _maybeRunFastUgovorPromptPreLock_(sheet, editedRow, editedCol, inputValue); 

        if (fastRes && typeof fastRes.updatedInput === "string") { 
          inputValue = fastRes.updatedInput; 
        } 
      } catch (eFastUgovor) { 
        console.error( 
          "_maybeRunFastUgovorPromptPreLock_ error:", 
          eFastUgovor && eFastUgovor.stack ? eFastUgovor.stack : eFastUgovor 
        ); 
      } 
    } 

    if (editedCol === STUPAC_J) { 
      const sk2 = LockService.getScriptLock(); 
      let gotSk2 = false; 

      try { 
        gotSk2 = sk2.tryLock(300); 
      } catch (e) {} 

      if (!gotSk2) { 
        const queuedJ = _enqueueEdit_(sheet, range); 

        if (!queuedJ) { 
          console.error( 
            "Column J edit could not be queued: row=" + range.getRow() + 
            ", col=" + range.getColumn() 
          ); 
        } 

        return; 
      } 

      try { 
        if (_isResetInProgress_()) { 
          const queuedDuringReset = _enqueueEdit_(sheet, range); 

          if (!queuedDuringReset) { 
            console.error( 
              "Column J edit during reset could not be queued: row=" + range.getRow() + 
              ", col=" + range.getColumn() 
            ); 
          } 

          return; 
        } 

        _applyRulesForEdit_(sheet, range, inputValue, true); 
      } finally { 
        try { 
          sk2.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    const lock2 = LockService.getDocumentLock(); 
    let gotLock = false; 

    try { 
      gotLock = lock2.tryLock(ONEDIT_TRYLOCK_MS); 
    } catch (e) {} 

    if (gotLock) { 
      try { 
        if (_isResetInProgress_()) { 
          const queuedDuringReset = _enqueueEdit_(sheet, range); 

          if (!queuedDuringReset) { 
            console.error( 
              "Edit during reset could not be queued: row=" + range.getRow() + 
              ", col=" + range.getColumn() 
            ); 
          } 

          return; 
        } 

        _applyRulesForEdit_(sheet, range, inputValue, true); 
      } finally { 
        try { 
          lock2.releaseLock(); 
        } catch (e) {} 
      } 

      // Notification check. The lock has already been released; this is read-only.
      if (editedCol === STUPAC_B || 
          editedCol === STUPAC_C || 
          editedCol === STUPAC_H || 
          editedCol === STUPAC_I) { 
        try { 
          _provjeriNajaveZaRed_(sheet, editedRow, editedCol); 
        } catch (eN) { 
          console.error("_provjeriNajaveZaRed_ error:", eN && eN.stack ? eN.stack : eN); 
        } 
      } 

      return; 
    } 

    const queued = _enqueueEdit_(sheet, range); 

    if (queued) { 
      if (_isResetInProgress_()) return; 

      const inlineDone = _tryInlineAfterQueue_(sheet, range, inputValue); 
      if (inlineDone) return; 

      return; 
    } 

    if (_isResetInProgress_()) return; 

    const rescueLock = LockService.getDocumentLock(); 
    let rescueGot = false; 

    try { 
      rescueGot = rescueLock.tryLock(4000); 
    } catch (e) {} 

    if (rescueGot) { 
      try { 
        if (_isResetInProgress_()) return; 

        const currentValue = ((range.getDisplayValue() || "") + "").trim(); 
        _applyRulesForEdit_(sheet, range, currentValue || inputValue, true); 
      } catch (e) { 
        console.error("_rescue direct apply error:", e && e.stack ? e.stack : e); 
      } finally { 
        try { 
          rescueLock.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    console.error( 
      "CRITICAL: edit was not processed directly or through queue. " + 
      "row=" + range.getRow() + ", col=" + range.getColumn() + ", value=" + inputValue 
    ); 

  } catch (err) { 
    console.error("mojInstaliraniOnEdit error:", err && err.stack ? err.stack : err); 
  } finally { 
    _markOnEditIntent_(false); 
  } 
} 

function _tryInlineAfterQueue_(sheet, range, inputValue) { 
  if (_isResetInProgress_()) return false; 

  try { 
    const lock = LockService.getDocumentLock(); 
    let got = false; 

    try { 
      got = lock.tryLock(1500); 
    } catch (e) {} 

    if (!got) return false; 

    try { 
      if (_isResetInProgress_()) return false; 

      _dequeueSpecificEdit_(sheet.getSheetId(), range.getRow(), range.getColumn()); 

      if (_isResetInProgress_()) { 
        const requeued = _enqueueEdit_(sheet, range); 

        if (!requeued) { 
          console.error( 
            "_tryInlineAfterQueue_: requeue during reset failed. row=" + 
            range.getRow() + ", col=" + range.getColumn() 
          ); 
        } 

        return false; 
      } 

      const currentValue = ((range.getDisplayValue() || "") + "").trim(); 
      _applyRulesForEdit_(sheet, range, currentValue || inputValue, true); 

      return true; 
    } finally { 
      try { 
        lock.releaseLock(); 
      } catch (e) {} 
    } 
  } catch (e) { 
    console.error("_tryInlineAfterQueue_ error:", e && e.stack ? e.stack : e); 
    return false; 
  } 
} 

function _dequeueSpecificEdit_(sheetId, row, col) { 
  const sk = LockService.getScriptLock(); 

  if (!sk.tryLock(EDIT_QUEUE_LOCK_MS)) { 
    console.error( 
      "_dequeueSpecificEdit_: ScriptLock timeout, sheetId=" + sheetId + 
      ", row=" + row + ", col=" + col 
    ); 
    return; 
  } 

  try { 
    const props = PropertiesService.getScriptProperties(); 
    const json  = props.getProperty(EDIT_QUEUE_KEY); 

    if (!json) return; 

    const q   = _safeParseQueueJson_(json); 
    const key = _queueKey_(sheetId, row, col); 

    if (q[key]) { 
      delete q[key]; 

      Object.keys(q).length 
        ? props.setProperty(EDIT_QUEUE_KEY, JSON.stringify(q)) 
        : props.deleteProperty(EDIT_QUEUE_KEY); 
    } 
  } catch (e) { 
    console.error("_dequeueSpecificEdit_ error:", e && e.stack ? e.stack : e); 
  } finally { 
    try { 
      sk.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _maybeRunFastUgovorPromptPreLock_(sheet, row, editedCol, currentInput) { 
  try { 
    if (!sheet || row <= 1) return null; 
    if (editedCol < STUPAC_B || editedCol > STUPAC_H) return null; 
    if (_isResetInProgress_()) return null; 

    const rowVals = sheet.getRange(row, STUPAC_B, 1, STUPAC_H - STUPAC_B + 1).getDisplayValues()[0]; 

    let cVal = String(rowVals[STUPAC_C - STUPAC_B] || ""); 
    let hVal = String(rowVals[STUPAC_H - STUPAC_B] || ""); 

    if (editedCol === STUPAC_C) cVal = String(currentInput || ""); 
    if (editedCol === STUPAC_H) hVal = String(currentInput || ""); 

    const cNorm = _normTxt_(cVal).replace(/\s+/g, " ").trim(); 

    if (cNorm !== "sportski") return null; 
    if (!String(hVal || "").trim()) return null; 

    if (_isFakturaKlub_(hVal)) { 
      return { updatedInput: String(currentInput || "") }; 
    } 

    const matched = _matchUgovorKlub_(_stripPlTag_(hVal)); 
    if (!matched) return null; 

    const newH = _handleUgovorKlubAlert_(sheet, row, hVal); 

    if (newH !== hVal) { 
      if (editedCol === STUPAC_H) { 
        try { 
          sheet.getRange(row, STUPAC_H).setValue(newH); 
        } catch (e1) {} 

        return { updatedInput: newH }; 
      } 

      try { 
        sheet.getRange(row, STUPAC_H).setValue(newH); 
      } catch (e2) {} 
    } 

    return { updatedInput: String(currentInput || "") }; 
  } catch (e) { 
    console.error("_maybeRunFastUgovorPromptPreLock_ fatal:", e && e.stack ? e.stack : e); 
    return null; 
  } 
} 

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
  const html = HtmlService.createHtmlOutput(_adminConfig_buildPinHtml_()) 
    .setWidth(620) 
    .setHeight(560); 

  SpreadsheetApp.getUi().showModalDialog(html, "Admin access"); 
} 

function _adminConfig_buildPinHtml_() { 
  return `<!doctype html> 
<html> 
<head> 
<meta charset="utf-8"> 
<meta name="viewport" content="width=device-width,initial-scale=1"> 
<link rel="preconnect" href="https://fonts.googleapis.com"> 
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"> 
<style> 
* { box-sizing: border-box; } 
:root { 
  --bg: #f8fafc; --panel: #ffffff; --border: #e2e8f0; --border-strong: #cbd5e1; 
  --text: #0f172a; --muted: #64748b; --primary: #2563eb; --primary-2: #1d4ed8; 
  --danger: #dc2626; 
} 
html, body { margin:0; padding:0; height:100%; overflow:hidden; font-family:"DM Sans",system-ui,sans-serif; background:var(--bg); color:var(--text); } 
body { padding:24px; } 
.wrap { height:100%; display:flex; align-items:center; justify-content:center; } 
.panel { width:min(100%,420px); background:var(--panel); border:1px solid var(--border); border-radius:28px; padding:30px 28px 22px; box-shadow:0 22px 60px rgba(15,23,42,.10),0 8px 22px rgba(15,23,42,.05); position:relative; } 
.panel.shake { animation:shakeX .34s ease; } 
@keyframes shakeX { 0%{transform:translateX(0)} 20%{transform:translateX(-7px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(3px)} 100%{transform:translateX(0)} } 
.top { display:flex; align-items:flex-start; gap:18px; margin-bottom:24px; } 
.icon { width:78px; height:78px; border-radius:22px; background:linear-gradient(180deg,#eef4ff 0%,#e6efff 100%); display:flex; align-items:center; justify-content:center; font-size:34px; flex:0 0 auto; box-shadow:inset 0 1px 0 rgba(255,255,255,.96),0 8px 18px rgba(37,99,235,.10); } 
.head { flex:1 } 
h1 { margin:0 0 8px; font-size:30px; line-height:1.05; font-weight:800; letter-spacing:-0.035em; color:var(--text); } 
.sub { margin:0; font-size:15px; line-height:1.6; color:var(--muted); } 
label { display:block; font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:8px; } 
input[type=text],input[type=password] { width:100%; height:64px; padding:0 20px; border:2px solid var(--border-strong); border-radius:20px; font-family:inherit; font-size:28px; font-weight:800; text-align:center; letter-spacing:.18em; color:var(--text); background:var(--bg); outline:none; transition:border-color .15s ease,box-shadow .15s ease; } 
input:focus { border-color:var(--primary); background:#fff; box-shadow:0 0 0 5px rgba(37,99,235,.12); } 
.field.error input { border-color:var(--danger); box-shadow:0 0 0 5px rgba(220,38,38,.10); } 
.actions { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:20px; } 
button { width:100%; height:56px; border-radius:18px; font-family:inherit; font-size:17px; font-weight:800; cursor:pointer; transition:transform .05s ease,background-color .16s ease; } 
button:active { transform:translateY(1px); } 
.btn-secondary { border:2px solid var(--border-strong); background:#fff; color:#334155; } 
.btn-secondary:hover { background:#f8fafc; } 
.btn-primary { border:none; background:linear-gradient(180deg,#2f6df6 0%,#2563eb 100%); color:#fff; box-shadow:0 14px 28px rgba(37,99,235,.22); } 
.btn-primary:hover:not(:disabled) { background:linear-gradient(180deg,#2a63de 0%,#1d4ed8 100%); } 
.btn-primary:disabled { opacity:.45; cursor:default; box-shadow:none; } 
.status { min-height:26px; margin-top:14px; text-align:center; } 
.msg { display:block; font-size:14px; font-weight:700; color:var(--danger); opacity:0; transform:translateY(-2px); transition:opacity .16s,transform .16s; } 
.msg.show { opacity:1; transform:translateY(0); } 
.hint { margin-top:14px; padding-top:14px; border-top:1px solid #eef2f7; text-align:center; font-size:12px; color:#94a3b8; } 
</style> 
</head> 
<body> 
<div class="wrap"> 
  <div class="panel" id="panel"> 
    <div class="top"> 
      <div class="icon">🔐</div> 
      <div class="head"> 
        <h1>Admin PIN</h1> 
        <p class="sub">Enter the PIN to open admin configuration.</p> 
      </div> 
    </div> 
    <label for="pin">Security PIN</label> 
    <div class="field" id="field"> 
      <input id="pin" type="password" inputmode="numeric" maxlength="8" autofocus> 
    </div> 
    <div class="actions"> 
      <button class="btn-secondary" type="button" onclick="google.script.host.close()">Cancel</button> 
      <button class="btn-primary" type="button" id="okBtn" onclick="submitPin()">Open</button> 
    </div> 
    <div class="status"><span class="msg" id="msg"></span></div> 
    <div class="hint">For security, the PIN is checked every time this panel is opened.</div> 
  </div> 
</div> 
<script> 
  const pinEl=document.getElementById('pin'),msgEl=document.getElementById('msg'),okBtn=document.getElementById('okBtn'),fieldEl=document.getElementById('field'),panelEl=document.getElementById('panel'); 
  pinEl.addEventListener('keydown',function(e){if(e.key==='Enter')submitPin();}); 
  pinEl.addEventListener('input',function(){fieldEl.classList.remove('error');msgEl.classList.remove('show');msgEl.textContent='';}); 
  function showError(message){fieldEl.classList.add('error');msgEl.textContent=message||'Wrong PIN.';msgEl.classList.add('show');panelEl.classList.remove('shake');void panelEl.offsetWidth;panelEl.classList.add('shake');} 
  function submitPin(){ 
    const pin=(pinEl.value||'').trim(); 
    if(!pin){showError('Enter PIN.');pinEl.focus();return;} 
    okBtn.disabled=true; 
    google.script.run 
      .withSuccessHandler(function(){google.script.host.close();}) 
      .withFailureHandler(function(err){okBtn.disabled=false;const message=(err&&err.message?err.message:String(err)).replace(/^Error:\s*/i,'');showError(message);pinEl.focus();pinEl.select();}) 
      .adminConfig_VerifyPinAndOpen(pin); 
  } 
<\/script> 
</body> 
</html>`; 
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
  const html = HtmlService.createHtmlOutput(_adminConfig_buildHtml_()) 
    .setWidth(1280)
    .setHeight(920); 

  SpreadsheetApp.getUi().showModalDialog(html, "Admin configuration"); 
} 

/* ── HTML builder ────────────────────────────────────────────────────── */ 

function _adminConfig_buildHtml_() { 

  const css = ` 
:root{--blue:#2563eb;--blue-l:#eff6ff;--blue-b:#1d4ed8;--red:#dc2626;--red-l:#fef2f2;--grn:#16a34a;--grn-l:#f0fdf4;--amb:#d97706;--amb-l:#fffbeb;--register:#7c3aed;--register-l:#f5f3ff;--op:#0f766e;--op-l:#ecfeff;--nav:#be185d;--nav-l:#fdf2f8;--s0:#f8fafc;--s1:#f1f5f9;--s2:#e2e8f0;--s3:#cbd5e1;--s5:#64748b;--s7:#334155;--s9:#0f172a;--r:10px} 
*{box-sizing:border-box;margin:0;padding:0} 
body{font-family:"DM Sans",system-ui,sans-serif;font-size:18px;color:var(--s9);background:var(--s0);height:100vh;display:flex;flex-direction:column;overflow:hidden} 
.topnav{background:#fff;border-bottom:1px solid var(--s2);display:flex;align-items:center;flex-shrink:0;padding:0 20px;gap:2px;overflow-x:auto} 
.tab{padding:16px 18px;border:none;background:transparent;font-family:inherit;font-size:16px;font-weight:500;color:var(--s5);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:9px;transition:color .15s,border-color .15s;white-space:nowrap;flex-shrink:0} 
.tab .badge{background:var(--s1);color:var(--s5);padding:2px 10px;border-radius:99px;font-size:15px;font-weight:600;transition:all .15s} 
.tab.on{color:var(--blue);border-bottom-color:var(--blue)}.tab.on .badge{background:var(--blue-l);color:var(--blue)} 
.tab.on-amb{color:var(--amb);border-bottom-color:var(--amb)}.tab.on-amb .badge{background:var(--amb-l);color:var(--amb)} 
.tab.on-register{color:var(--register);border-bottom-color:var(--register)}.tab.on-register .badge{background:var(--register-l);color:var(--register)} 
.tab.on-grn{color:var(--grn);border-bottom-color:var(--grn)}.tab.on-grn .badge{background:var(--grn-l);color:var(--grn)} 
.tab.on-op{color:var(--op);border-bottom-color:var(--op)}.tab.on-op .badge{background:var(--op-l);color:var(--op)} 
.tab.on-nav{color:var(--nav);border-bottom-color:var(--nav)}.tab.on-nav .badge{background:var(--nav-l);color:var(--nav)} 
.tab:hover:not(.on):not(.on-amb):not(.on-register):not(.on-grn):not(.on-op):not(.on-nav){color:var(--s7);background:var(--s0)} 
.body{flex:1;overflow-y:auto;padding:28px} 
.pane{display:none}.pane.on{display:block} 
.subtabs{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap} 
.subtab{padding:10px 16px;border:1.5px solid var(--s2);border-radius:999px;background:#fff;color:var(--s7);font-family:inherit;font-size:16px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:8px} 
.subtab .badge{background:var(--s1);color:var(--s5);padding:1px 8px;border-radius:99px;font-size:14px;font-weight:600} 
.subtab.on{border-color:var(--op);background:var(--op-l);color:var(--op)} 
.subtab.on .badge{background:rgba(15,118,110,.15);color:var(--op)} 
.subpane{display:none}.subpane.on{display:block} 
.addcard{background:#fff;border:1px solid var(--s2);border-radius:var(--r);padding:22px 26px;margin-bottom:22px;box-shadow:0 1px 3px rgba(0,0,0,.07)} 
.addcard-title{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--s5);margin-bottom:16px} 
.addcard-desc{font-size:14px;color:var(--s5);margin-bottom:14px;line-height:1.5} 
.addrow{display:flex;gap:13px;align-items:center;flex-wrap:wrap} 
.inp{padding:11px 15px;border:1.5px solid var(--s2);border-radius:8px;font-family:inherit;font-size:18px;color:var(--s9);outline:none;background:#fff;transition:border-color .15s,box-shadow .15s} 
.inp:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.inp::placeholder{color:var(--s3)} 
.inp-init{width:130px;font-weight:600}.inp-name{flex:1;min-width:200px}.inp-wide{flex:1;min-width:270px}.inp-price{width:104px} 
.inp-alias{width:180px;padding:7px 11px;border:1.5px solid var(--blue);border-radius:6px;font-family:inherit;font-size:16px;outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.inp-price-edit{width:82px;padding:7px 10px;border:1.5px solid var(--blue);border-radius:6px;font-family:inherit;font-size:16px;font-weight:700;text-align:center;outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.btn-add{padding:11px 24px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-family:inherit;font-size:18px;font-weight:600;cursor:pointer;transition:background .15s} 
.btn-add:hover{background:var(--blue-b)}.btn-add:disabled{background:var(--s3);cursor:default} 
.msg{font-size:16px;padding:10px 14px;border-radius:6px;margin-top:11px;display:none} 
.msg.err{background:var(--red-l);color:var(--red);display:block} 
.msg.ok{background:var(--grn-l);color:var(--grn);display:block} 
.listhdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px} 
.listhdr-title{font-size:19px;font-weight:600;color:var(--s7)} 
.search{padding:10px 15px;border:1.5px solid var(--s2);border-radius:8px;font-family:inherit;font-size:17px;outline:none;width:240px;background:#fff;transition:border-color .15s,box-shadow .15s} 
.search:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.search::placeholder{color:var(--s3)} 
.card-tbl{background:#fff;border:1px solid var(--s2);border-radius:var(--r);overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.07)} 
table{width:100%;border-collapse:collapse;font-size:17px} 
thead th{padding:12px 20px;text-align:left;font-size:13px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--s5);background:var(--s0);border-bottom:1px solid var(--s2)} 
tbody td{padding:12px 20px;border-bottom:1px solid var(--s1);vertical-align:middle} 
tbody tr:last-child td{border-bottom:none} 
tbody tr:hover td{background:var(--s0)} 
.chip-blue,.chip-grn,.chip-amb,.chip-register,.chip-op,.chip-nav{display:inline-block;font-weight:700;font-size:16px;padding:5px 13px;border-radius:6px} 
.chip-blue{background:var(--blue-l);color:var(--blue)} 
.chip-grn{background:var(--grn-l);color:var(--grn)} 
.chip-amb{background:var(--amb-l);color:var(--amb)} 
.chip-register{background:var(--register-l);color:var(--register)} 
.chip-op{background:var(--op-l);color:var(--op)} 
.chip-nav{background:var(--nav-l);color:var(--nav)} 
.price-tag{display:inline-flex;align-items:center;gap:7px;background:var(--grn-l);color:var(--grn);font-weight:700;font-size:17px;padding:5px 15px;border-radius:6px} 
.doc-name{font-size:18px;color:var(--s7)} 
.edit-inp{padding:7px 11px;border:1.5px solid var(--blue);border-radius:6px;font-family:inherit;font-size:18px;outline:none;width:100%;box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.aliases-cell{display:flex;align-items:center;flex-wrap:wrap;gap:8px} 
.alias-chip{display:inline-flex;align-items:center;gap:7px;background:var(--s1);color:var(--s7);border:1px solid var(--s2);padding:5px 12px 5px 14px;border-radius:99px;font-size:16px;font-weight:500} 
.alias-chip button{background:none;border:none;cursor:pointer;color:var(--s3);font-size:18px;line-height:1;padding:0;display:flex;align-items:center;transition:color .1s} 
.alias-chip button:hover{color:var(--red)} 
.btn-add-alias{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border:1.5px dashed var(--s3);border-radius:99px;background:transparent;color:var(--s5);font-family:inherit;font-size:16px;cursor:pointer;transition:all .15s;white-space:nowrap} 
.btn-add-alias:hover{border-color:var(--blue);color:var(--blue);background:var(--blue-l)} 
.act-btns{display:flex;gap:8px} 
.btn-edit{padding:7px 16px;border:1.5px solid var(--s2);border-radius:6px;background:#fff;color:var(--s5);font-family:inherit;font-size:16px;font-weight:500;cursor:pointer;transition:all .15s} 
.btn-edit:hover{border-color:var(--blue);color:var(--blue);background:var(--blue-l)} 
.btn-save{padding:7px 16px;border:none;border-radius:6px;background:var(--blue);color:#fff;font-family:inherit;font-size:16px;font-weight:600;cursor:pointer} 
.btn-save:hover{background:var(--blue-b)} 
.btn-cancel{padding:7px 16px;border:1.5px solid var(--s2);border-radius:6px;background:#fff;color:var(--s5);font-family:inherit;font-size:16px;font-weight:500;cursor:pointer} 
.btn-cancel:hover{background:var(--s0)} 
.btn-del{padding:7px 16px;border:1.5px solid var(--s2);border-radius:6px;background:#fff;color:var(--s5);font-family:inherit;font-size:16px;font-weight:500;cursor:pointer;transition:all .15s} 
.btn-del:hover{border-color:var(--red);color:var(--red);background:var(--red-l)} 
.pr-list{display:flex;flex-wrap:wrap;gap:10px} 
.pr-chip{display:inline-flex;align-items:center;gap:9px;background:#fff;border:1px solid var(--s2);border-radius:999px;padding:8px 14px;font-size:16px;font-weight:600;color:var(--s7)} 
.pr-chip button{background:none;border:none;cursor:pointer;color:var(--s3);font-size:18px;line-height:1} 
.pr-chip button:hover{color:var(--red)} 
.empty{padding:60px;text-align:center;color:var(--s5);font-size:18px;background:#fff;border:1px solid var(--s2);border-radius:var(--r)} 
.loading{padding:60px;text-align:center;color:var(--s5);font-size:18px} 
.ftr{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:#fff;border-top:1px solid var(--s2);flex-shrink:0} 
.ftr-left{display:flex;gap:10px} 
.btn-ghost{padding:9px 18px;border:1.5px solid var(--s2);border-radius:7px;background:#fff;color:var(--s5);font-family:inherit;font-size:16px;font-weight:500;cursor:pointer;transition:all .15s} 
.btn-ghost:hover{border-color:var(--s3);background:var(--s0);color:var(--s7)} 
.btn-close{padding:10px 28px;border:1.5px solid var(--s2);border-radius:8px;background:#fff;color:var(--s7);font-family:inherit;font-size:18px;font-weight:600;cursor:pointer;transition:all .15s} 
.btn-close:hover{background:var(--s1);border-color:var(--s3)} 
.confirm-backdrop,.alert-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity .18s;pointer-events:none} 
.confirm-backdrop.show,.alert-backdrop.show{opacity:1;pointer-events:all} 
.confirm-box,.alert-box{background:#fff;border-radius:14px;padding:38px 34px 30px;width:460px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.18);transform:translateY(12px) scale(.97);transition:transform .18s,opacity .18s;opacity:0} 
.confirm-backdrop.show .confirm-box,.alert-backdrop.show .alert-box{transform:translateY(0) scale(1);opacity:1} 
.confirm-icon,.alert-icon{width:52px;height:52px;border-radius:50%;background:var(--red-l);display:flex;align-items:center;justify-content:center;margin-bottom:20px;font-size:24px} 
.confirm-icon.info,.alert-icon.info{background:var(--blue-l)} 
.confirm-title,.alert-title{font-size:20px;font-weight:700;color:var(--s9);margin-bottom:10px;line-height:1.3} 
.confirm-msg,.alert-msg{font-size:17px;color:var(--s5);line-height:1.6;margin-bottom:28px} 
.confirm-btns,.alert-btns{display:flex;gap:11px;justify-content:flex-end} 
.confirm-cancel{padding:10px 24px;border:1.5px solid var(--s2);border-radius:8px;background:#fff;color:var(--s7);font-family:inherit;font-size:17px;font-weight:600;cursor:pointer} 
.confirm-ok,.alert-ok{padding:10px 24px;border:none;border-radius:8px;background:var(--red);color:#fff;font-family:inherit;font-size:17px;font-weight:600;cursor:pointer} 
.confirm-ok.safe,.alert-ok.safe{background:var(--blue)} 
.confirm-ok:hover{background:#b91c1c}.confirm-ok.safe:hover{background:var(--blue-b)} 
.alert-ok:hover{background:#b91c1c}.alert-ok.safe:hover{background:var(--blue-b)} 
.n-form-section{display:flex;flex-direction:column;gap:20px;margin-top:4px} 
.n-form-label{display:block;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--s5);margin-bottom:8px} 
.inp-area{width:100%;padding:11px 15px;border:1.5px solid var(--s2);border-radius:8px;font-family:inherit;font-size:16px;color:var(--s9);outline:none;background:#fff;resize:vertical;min-height:90px;line-height:1.55;transition:border-color .15s,box-shadow .15s} 
.inp-area:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(37,99,235,.1)} 
.inp-area::placeholder{color:var(--s3)} 
.cal-wrap{background:var(--s0);border:1px solid var(--s2);border-radius:var(--r);padding:18px;margin-top:2px;max-width:300px} 
.cal-nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px} 
.cal-nav-btn{background:none;border:1.5px solid var(--s2);border-radius:8px;padding:4px 13px;cursor:pointer;font-size:20px;color:var(--s7);line-height:1.4;transition:all .1s;font-family:inherit} 
.cal-nav-btn:hover{background:#fff;border-color:var(--s3)} 
.cal-month-label{font-weight:700;font-size:15px;color:var(--s7);min-width:140px;text-align:center} 
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px} 
.cal-dow{text-align:center;font-size:12px;font-weight:700;color:var(--s5);padding:4px 0 8px;letter-spacing:.04em} 
.cal-day{text-align:center;padding:8px 4px;border-radius:7px;cursor:pointer;font-size:14px;font-weight:500;transition:background .1s;user-select:none;color:var(--s9)} 
.cal-day:hover{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.08)} 
.cal-day.cal-today{font-weight:800;color:var(--blue)} 
.cal-day.cal-sel-start,.cal-day.cal-sel-end{background:var(--blue)!important;color:#fff!important;font-weight:700;box-shadow:0 2px 8px rgba(37,99,235,.3)} 
.cal-day.cal-in-range{background:var(--blue-l);color:var(--blue)} 
.cal-selection{margin-top:12px;font-size:14px;font-weight:700;color:var(--s7);text-align:center;padding:9px 14px;background:#fff;border:1px solid var(--s2);border-radius:8px;min-height:38px;display:flex;align-items:center;justify-content:center} 
.najava-date-badge{display:inline-flex;align-items:center;gap:6px;background:var(--nav-l);color:var(--nav);font-weight:700;font-size:14px;padding:4px 12px;border-radius:6px;white-space:nowrap} 
.najava-msg-cell{font-size:14px;color:var(--s5);line-height:1.45;max-width:360px} 
.chips{display:flex;flex-wrap:wrap;gap:8px} 
.chip{padding:7px 15px;border:1px solid var(--s2);border-radius:999px;background:var(--s0);color:var(--s7);font-family:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background .12s,border-color .12s} 
.chip:hover{background:var(--s1)} 
.chip.active{background:var(--op);border-color:var(--op);color:#fff} 
`; 

  const html = ` 
<div class="topnav"> 
  <button class="tab on"  id="tabD" onclick="sw('D')">Staff <span class="badge" id="badgeD">0</span></button> 
  <button class="tab"     id="tabT" onclick="sw('T')">Training Clients <span class="badge" id="badgeT">0</span></button> 
  <button class="tab"     id="tabF" onclick="sw('F')">Invoice Clients <span class="badge" id="badgeF">0</span></button> 
  <button class="tab"     id="tabU" onclick="sw('U')">Contract Clubs <span class="badge" id="badgeU">0</span></button> 
  <button class="tab"     id="tabO" onclick="sw('O')">Operational Rules <span class="badge" id="badgeO">0</span></button> 
  <button class="tab"     id="tabN" onclick="sw('N')">Notifications <span class="badge" id="badgeN">0</span></button> 
</div> 

<div class="body"> 

  <div class="pane on" id="pD"> 
    <div class="addcard"> 
      <div class="addcard-title">Add staff member</div> 
      <div class="addrow"> 
        <input class="inp inp-init" id="dI" placeholder="initials" maxlength="6" autocomplete="off"> 
        <input class="inp inp-name" id="dN" placeholder="Full name" autocomplete="off"> 
        <button class="btn-add" id="dBtn" onclick="addDoc()">+ Add</button> 
      </div> 
      <div class="msg" id="dMsg"></div> 
    </div> 
    <div class="listhdr"> 
      <span class="listhdr-title">Staff list</span> 
      <input class="search" id="dSearch" placeholder="Search..." oninput="filterDocs()"> 
    </div> 
    <div id="dTable"><div class="loading">Loading…</div></div> 
  </div> 

  <div class="pane" id="pT"> 
    <div class="addcard"> 
      <div class="addcard-title">Add training client</div> 
      <div class="addrow"> 
        <input class="inp inp-wide" id="tN" placeholder="Client name" autocomplete="off"> 
        <button class="btn-add" id="tBtn" onclick="addTvrtka()">+ Add</button> 
      </div> 
      <div class="msg" id="tMsg"></div> 
    </div> 
    <div class="listhdr"> 
      <span class="listhdr-title">Training clients</span> 
      <input class="search" id="tSearch" placeholder="Search..." oninput="filterTvrtke()"> 
    </div> 
    <div id="tTable"><div class="loading">Loading…</div></div> 
  </div> 

  <div class="pane" id="pF"> 
    <div class="addcard"> 
      <div class="addcard-title">Add invoice client</div> 
      <div class="addcard-desc">Clients that automatically receive the <strong>INVOICE</strong> tag and highlighted background in column H.</div> 
      <div class="addrow"> 
        <input class="inp inp-wide" id="fN" placeholder="Client name" autocomplete="off"> 
        <button class="btn-add" id="fBtn" onclick="addFaktura()">+ Add</button> 
      </div> 
      <div class="msg" id="fMsg"></div> 
    </div> 
    <div class="listhdr"> 
      <span class="listhdr-title">Invoice clients</span> 
      <input class="search" id="fSearch" placeholder="Search..." oninput="filterFaktura()"> 
    </div> 
    <div id="fTable"><div class="loading">Loading…</div></div> 
  </div> 

  <div class="pane" id="pU"> 
    <div class="addcard"> 
      <div class="addcard-title">Add contract club</div> 
      <div class="addcard-desc">Sports clubs with contract pricing. Triggers a YES/NO prompt and can add a paid-tag to column H.</div> 
      <div class="addrow"> 
        <input class="inp inp-wide" id="uN" placeholder="Club name" autocomplete="off"> 
        <input class="inp inp-price" id="uP" placeholder="€" type="number" min="1" autocomplete="off"> 
        <button class="btn-add" id="uBtn" onclick="addUgovor()">+ Add</button> 
      </div> 
      <div class="msg" id="uMsg"></div> 
    </div> 
    <div class="listhdr"> 
      <span class="listhdr-title">Contract clubs</span> 
      <input class="search" id="uSearch" placeholder="Search..." oninput="filterUgovor()"> 
    </div> 
    <div id="uTable"><div class="loading">Loading…</div></div> 
  </div> 

  <div class="pane" id="pO"> 
    <div class="subtabs"> 
      <button class="subtab on" id="subtabZ" onclick="swOp('Z')">Security Companies</button> 
      <button class="subtab"    id="subtabH" onclick="swOp('H')">Health Institutions</button> 
      <button class="subtab"    id="subtabP" onclick="swOp('P')">Priority Rules</button> 
    </div> 

    <div class="subpane on" id="opZ"> 
      <div class="addcard"> 
        <div class="addcard-title">Add security company</div> 
        <div class="addcard-desc">Companies that can trigger an occupational-role prompt and add OFT when needed.</div> 
        <div class="addrow"> 
          <input class="inp inp-wide" id="ozN" placeholder="Company name" autocomplete="off"> 
          <button class="btn-add" id="ozBtn" onclick="addZastitarska()">+ Add</button> 
        </div> 
        <div class="msg" id="ozMsg"></div> 
      </div> 
      <div class="listhdr"> 
        <span class="listhdr-title">Security companies</span> 
        <input class="search" id="ozSearch" placeholder="Search..." oninput="filterZastitarske()"> 
      </div> 
      <div id="ozTable"><div class="loading">Loading…</div></div> 
    </div> 

    <div class="subpane" id="opH"> 
      <div class="addcard"> 
        <div class="addcard-title">Add health institution</div> 
        <div class="addcard-desc">Institution names and aliases used for row highlighting and normalization.</div> 
        <div class="addrow"> 
          <input class="inp inp-wide" id="ohN" placeholder="Institution name" autocomplete="off"> 
          <button class="btn-add" id="ohBtn" onclick="addZdravstvena()">+ Add</button> 
        </div> 
        <div class="msg" id="ohMsg"></div> 
      </div> 
      <div class="listhdr"> 
        <span class="listhdr-title">Health institutions</span> 
        <input class="search" id="ohSearch" placeholder="Search..." oninput="filterZdravstvene()"> 
      </div> 
      <div id="ohTable"><div class="loading">Loading…</div></div> 
    </div> 

    <div class="subpane" id="opP"> 
      <div class="addcard"> 
        <div class="addcard-title">Add priority rule</div> 
        <div class="addcard-desc">Terms in column I that visually mark the row as priority.</div> 
        <div class="addrow"> 
          <input class="inp inp-wide" id="opN" placeholder="Example: VIP, PRIORITY, URGENT..." autocomplete="off"> 
          <button class="btn-add" id="opBtn" onclick="addPrioritetno()">+ Add</button> 
        </div> 
        <div class="msg" id="opMsg"></div> 
      </div> 
      <div class="listhdr"> 
        <span class="listhdr-title">Priority rules</span> 
        <input class="search" id="opSearch" placeholder="Search..." oninput="filterPrioritetno()"> 
      </div> 
      <div id="opTable"><div class="loading">Loading…</div></div> 
    </div> 
  </div> 

  <div class="pane" id="pN"> 
    <div class="subtabs"> 
      <button class="subtab on" id="subtabNP" onclick="swNaj('P')">👤 Persons <span class="badge" id="badgeNP">0</span></button> 
      <button class="subtab"    id="subtabNT" onclick="swNaj('T')">🏢 Companies <span class="badge" id="badgeNT">0</span></button> 
      <button class="subtab"    id="subtabNK" onclick="swNaj('K')">🏷️ Keywords <span class="badge" id="badgeNK">0</span></button> 
      <button class="subtab"    id="subtabNA" onclick="swNaj('A')">✍️ Authors <span class="badge" id="badgeNA">0</span></button> 
    </div> 

    <div class="subpane on" id="najP"> 
      <div class="addcard"> 
        <div class="addcard-title">Add person notification</div> 
        <div class="addcard-desc">A modal appears when a matching person name or related exam type is entered.</div> 
        <div class="n-form-section"> 
          <div> 
            <label class="n-form-label">Person name</label> 
            <input class="inp" id="nPTrigger" placeholder="Example: John Smith" autocomplete="off" style="width:100%"> 
          </div> 
          <div> 
            <label class="n-form-label">Date or date range</label> 
            <div class="cal-wrap"> 
              <div class="cal-nav"> 
                <button class="cal-nav-btn" onclick="calNav('P',-1)">&#8249;</button> 
                <span class="cal-month-label" id="calLabelP">—</span> 
                <button class="cal-nav-btn" onclick="calNav('P',1)">&#8250;</button> 
              </div> 
              <div class="cal-grid" id="calGridP"></div> 
              <div class="cal-selection" id="calSelP">No date selected</div> 
            </div> 
          </div> 
          <div> 
            <label class="n-form-label">Message</label> 
            <textarea class="inp-area" id="nPMessage" placeholder="Instructions, special notes..."></textarea> 
          </div> 
          <div> 
            <label class="n-form-label">Author</label> 
            <div id="nPAuthorChips" class="chips" style="margin-bottom:10px"></div> 
            <input class="inp" id="nPAuthorCustom" placeholder="Or type manually..." autocomplete="off" style="width:100%"> 
          </div> 
        </div> 
        <div style="margin-top:20px"><button class="btn-add" id="nPBtn" onclick="addNajavaTyped('P')">+ Add notification</button></div> 
        <div class="msg" id="nPMsg"></div> 
      </div> 
      <div class="listhdr"><span class="listhdr-title">Active person notifications</span></div> 
      <div id="nPTable"><div class="loading">Loading…</div></div> 
    </div> 

    <div class="subpane" id="najT"> 
      <div class="addcard"> 
        <div class="addcard-title">Add company notification</div> 
        <div class="addcard-desc">A modal appears when a matching company name is entered in the selected date range.</div> 
        <div class="n-form-section"> 
          <div> 
            <label class="n-form-label">Company name</label> 
            <input class="inp" id="nTTrigger" placeholder="Example: Client Company..." autocomplete="off" style="width:100%"> 
          </div> 
          <div> 
            <label class="n-form-label">Date or date range</label> 
            <div class="cal-wrap"> 
              <div class="cal-nav"> 
                <button class="cal-nav-btn" onclick="calNav('T',-1)">&#8249;</button> 
                <span class="cal-month-label" id="calLabelT">—</span> 
                <button class="cal-nav-btn" onclick="calNav('T',1)">&#8250;</button> 
              </div> 
              <div class="cal-grid" id="calGridT"></div> 
              <div class="cal-selection" id="calSelT">No date selected</div> 
            </div> 
          </div> 
          <div> 
            <label class="n-form-label">Message</label> 
            <textarea class="inp-area" id="nTMessage" placeholder="Instructions for this company..."></textarea> 
          </div> 
          <div> 
            <label class="n-form-label">Author</label> 
            <div id="nTAuthorChips" class="chips" style="margin-bottom:10px"></div> 
            <input class="inp" id="nTAuthorCustom" placeholder="Or type manually..." autocomplete="off" style="width:100%"> 
          </div> 
          <div> 
            <label class="n-form-label">Optional action button for column I</label> 
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px"> 
              <input class="inp" id="nTActionLabel" placeholder="Button label" style="flex:2;min-width:200px" autocomplete="off"> 
              <input class="inp" id="nTActionValue" placeholder="Value for column I" style="flex:1;min-width:160px" autocomplete="off"> 
            </div> 
            <div style="font-size:13px;color:var(--s5)">If left empty, no action button will be shown.</div> 
          </div> 
        </div> 
        <div style="margin-top:20px"><button class="btn-add" id="nTBtn" onclick="addNajavaTyped('T')">+ Add notification</button></div> 
        <div class="msg" id="nTMsg"></div> 
      </div> 
      <div class="listhdr"><span class="listhdr-title">Active company notifications</span></div> 
      <div id="nTTable"><div class="loading">Loading…</div></div> 
    </div> 

    <div class="subpane" id="najK"> 
      <div class="addcard"> 
        <div class="addcard-title">Add keyword notification</div> 
        <div class="addcard-desc">A modal appears when a matching keyword or phrase is found.</div> 
        <div class="n-form-section"> 
          <div> 
            <label class="n-form-label">Keyword or phrase</label> 
            <input class="inp" id="nKTrigger" placeholder="Example: special discount, extra note..." autocomplete="off" style="width:100%"> 
          </div> 
          <div> 
            <label class="n-form-label">Date or date range</label> 
            <div class="cal-wrap"> 
              <div class="cal-nav"> 
                <button class="cal-nav-btn" onclick="calNav('K',-1)">&#8249;</button> 
                <span class="cal-month-label" id="calLabelK">—</span> 
                <button class="cal-nav-btn" onclick="calNav('K',1)">&#8250;</button> 
              </div> 
              <div class="cal-grid" id="calGridK"></div> 
              <div class="cal-selection" id="calSelK">No date selected</div> 
            </div> 
          </div> 
          <div> 
            <label class="n-form-label">Message</label> 
            <textarea class="inp-area" id="nKMessage" placeholder="Instructions for this keyword..."></textarea> 
          </div> 
          <div> 
            <label class="n-form-label">Author</label> 
            <div id="nKAuthorChips" class="chips" style="margin-bottom:10px"></div> 
            <input class="inp" id="nKAuthorCustom" placeholder="Or type manually..." autocomplete="off" style="width:100%"> 
          </div> 
          <div> 
            <label class="n-form-label">Optional action button</label> 
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:6px"> 
              <input class="inp" id="nKActionLabel" placeholder="Button label" style="flex:2;min-width:200px" autocomplete="off"> 
              <select class="inp" id="nKActionCol" style="width:80px"> 
                <option value="">Column</option> 
                <option value="H">H</option> 
                <option value="F">F</option> 
                <option value="I">I</option> 
              </select> 
              <input class="inp" id="nKActionValue" placeholder="Value" style="flex:1;min-width:120px" autocomplete="off"> 
            </div> 
            <div style="font-size:13px;color:var(--s5)">If left empty, no action button will be shown.</div> 
          </div> 
        </div> 
        <div style="margin-top:20px"><button class="btn-add" id="nKBtn" onclick="addNajavaTyped('K')">+ Add notification</button></div> 
        <div class="msg" id="nKMsg"></div> 
      </div> 
      <div class="listhdr"><span class="listhdr-title">Active keyword notifications</span></div> 
      <div id="nKTable"><div class="loading">Loading…</div></div> 
    </div> 

    <div class="subpane" id="najA"> 
      <div class="addcard"> 
        <div class="addcard-title">Add author</div> 
        <div class="addcard-desc">Authors are offered as quick choices when creating notifications.</div> 
        <div class="addrow"> 
          <input class="inp inp-wide" id="nAName" placeholder="Example: Staff Member" autocomplete="off"> 
          <button class="btn-add" id="nABtn" onclick="addNajavaAutor()">+ Add</button> 
        </div> 
        <div class="msg" id="nAMsg"></div> 
      </div> 
      <div class="listhdr"><span class="listhdr-title">Authors</span></div> 
      <div id="nATable"><div class="loading">Loading…</div></div> 
    </div> 
  </div> 

</div> 

<div class="ftr"> 
  <div class="ftr-left"> 
    <button class="btn-ghost" onclick="exportJson()">Export JSON</button> 
    <button class="btn-ghost" onclick="importJson()">Import JSON</button> 
  </div> 
  <button class="btn-close" onclick="google.script.host.close()">Close</button> 
</div> 

<div class="alert-backdrop" id="alertBackdrop"> 
  <div class="alert-box"> 
    <div class="alert-icon" id="alertIcon">⚠️</div> 
    <div class="alert-title" id="alertTitle">Error</div> 
    <div class="alert-msg"  id="alertMsg"></div> 
    <div class="alert-btns"><button class="alert-ok" id="alertOk">OK</button></div> 
  </div> 
</div> 

<div class="confirm-backdrop" id="confirmBackdrop"> 
  <div class="confirm-box"> 
    <div class="confirm-icon" id="confirmIcon">🗑️</div> 
    <div class="confirm-title" id="confirmTitle">Confirm</div> 
    <div class="confirm-msg"  id="confirmMsg"></div> 
    <div class="confirm-btns"> 
      <button class="confirm-cancel" id="confirmCancel">Cancel</button> 
      <button class="confirm-ok"     id="confirmOk">Delete</button> 
    </div> 
  </div> 
</div> 
`; 

const js = ` 
(function(){ 

  window.onerror = function(message, source, lineno, colno, error) { 
    document.body.innerHTML = 
      '<div style="padding:30px;font-family:sans-serif;color:#b91c1c">' + 
      '<h2>Admin UI JavaScript error</h2>' + 
      '<pre style="white-space:pre-wrap;font-size:14px;line-height:1.5">' + 
      String(message) + '\\nLine: ' + lineno + ':' + colno + 
      '\\n\\n' + (error && error.stack ? error.stack : '') + 
      '</pre></div>'; 
  }; 

  var D={mapping:{},tvrtke:[],faktura:[],ugovor:[],zastitarskeTvrtke:[],zdravstveneUstanove:[],prioritetno:[],najave:[],najaveAutori:[]}; 
  var docFilter='',tvrtFilter='',faktFilter='',ugFilter=''; 
  var zastFilter='',zdrFilter='',prFilter=''; 
  var editing={T:null,F:null,U:null,Z:null,H:null,P:null}; 

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');} 
  function showMsg(id,txt,type){ 
    if(type==='err'){alert_({msg:txt});return;} 
    var el=document.getElementById(id);el.className='msg '+type;el.textContent=txt; 
    if(type==='ok')setTimeout(function(){el.className='msg';},3000); 
  } 
  function busy(id,on){var b=document.getElementById(id);if(b)b.disabled=on;} 
  function em(e){return e&&e.message?e.message:String(e);} 
  function norm(s){return String(s||'').toLowerCase().trim();} 

  function alert_(opts){ 
    var bd=document.getElementById('alertBackdrop'); 
    document.getElementById('alertIcon').textContent=opts.icon||'⚠️'; 
    document.getElementById('alertTitle').textContent=opts.title||'Error'; 
    document.getElementById('alertMsg').textContent=opts.msg||''; 
    var ok=document.getElementById('alertOk'); 
    ok.className='alert-ok'+(opts.safe?' safe':''); 
    bd.classList.add('show');ok.focus(); 
    function close(){bd.classList.remove('show');ok.onclick=null;document.removeEventListener('keydown',onKey);} 
    function onKey(e){if(e.key==='Escape'||e.key==='Enter')close();} 
    ok.onclick=close;document.addEventListener('keydown',onKey); 
  } 

  function confirm_(opts,cb){ 
    var bd=document.getElementById('confirmBackdrop'); 
    document.getElementById('confirmIcon').textContent=opts.icon||'🗑️'; 
    document.getElementById('confirmIcon').className='confirm-icon'+(opts.iconClass?' '+opts.iconClass:''); 
    document.getElementById('confirmTitle').textContent=opts.title||'Confirm'; 
    document.getElementById('confirmMsg').textContent=opts.msg||''; 
    var ok=document.getElementById('confirmOk'); 
    var can=document.getElementById('confirmCancel'); 
    ok.textContent=opts.okLabel||'Confirm'; 
    ok.className='confirm-ok'+(opts.okClass?' '+opts.okClass:''); 
    bd.classList.add('show');ok.focus(); 
    function close(r){bd.classList.remove('show');ok.onclick=null;can.onclick=null;document.removeEventListener('keydown',onKey);if(r)cb();} 
    function onKey(e){if(e.key==='Escape')close(false);if(e.key==='Enter')close(true);} 
    ok.onclick=function(){close(true);};can.onclick=function(){close(false);}; 
    document.addEventListener('keydown',onKey); 
  } 

  var TAB_STYLES={D:'on',T:'on-grn',F:'on-amb',U:'on-register',O:'on-op',N:'on-nav'}; 

  window.sw=function(t){ 
    ['D','T','F','U','O','N'].forEach(function(x){ 
      document.getElementById('p'+x).className='pane'+(x===t?' on':''); 
      document.getElementById('tab'+x).className='tab'+(x===t?' '+TAB_STYLES[x]:''); 
    }); 
  }; 

  window.swOp=function(t){ 
    ['Z','H','P'].forEach(function(x){ 
      document.getElementById('op'+x).className='subpane'+(x===t?' on':''); 
      document.getElementById('subtab'+x).className='subtab'+(x===t?' on':''); 
    }); 
  }; 

  window.swNaj=function(t){ 
    ['P','T','K','A'].forEach(function(x){ 
      document.getElementById('naj'+x).className='subpane'+(x===t?' on':''); 
      document.getElementById('subtabN'+x).className='subtab'+(x===t?' on':''); 
    }); 
  }; 

  function clearEditing(type){editing[type]=null;} 
  function startEdit(type,key,extra){editing[type]=Object.assign({key:key},extra||{});rerenderType(type);} 

  function reload(){ 
    google.script.run 
      .withSuccessHandler(function(json){ 
        try{D=JSON.parse(json);}catch(e){console.error('Data parse error:',e);} 
        renderAll(); 
      }) 
      .withFailureHandler(function(e){alert_({msg:'Load error: '+em(e)});}) 
      .adminConfig_GetData(); 
  } 

  function renderAll(){ 
    renderDocs();renderTvrtke();renderFaktura();renderUgovor(); 
    renderZastitarske();renderZdravstvene();renderPrioritetno();renderNajave(); 
  } 

  function rerenderType(type){ 
    if(type==='T')renderTvrtke(); 
    else if(type==='F')renderFaktura(); 
    else if(type==='U')renderUgovor(); 
    else if(type==='Z')renderZastitarske(); 
    else if(type==='H')renderZdravstvene(); 
    else if(type==='P')renderPrioritetno(); 
  } 

  function renderAliasBlock(items,company,delAction,addAction){ 
    var aliases=''; 
    (items||[]).forEach(function(a){ 
      aliases+='<span class="alias-chip">'+esc(a)+'<button data-action="'+delAction+'" data-company="'+esc(company)+'" data-alias="'+esc(a)+'" title="Remove">×</button></span>'; 
    }); 
    aliases+='<button class="btn-add-alias" data-action="'+addAction+'" data-company="'+esc(company)+'">+ Alias</button>'; 
    return '<div class="aliases-cell">'+aliases+'</div>'; 
  } 

  function isEditing(type,key){return editing[type]&&norm(editing[type].key)===norm(key);} 
  function getEditNameInput(type){return document.getElementById('edit_name_'+type);} 
  function getEditPriceInput(type){return document.getElementById('edit_price_'+type);} 

  function saveRowEdit(type,oldKey){ 
    var fn,msgId,payload; 
    if(type==='T'){ 
      var nT=(getEditNameInput('T').value||'').trim(); 
      if(!nT){showMsg('tMsg','Name is required.','err');return;} 
      fn='adminConfig_UpdateTvrtkaRow';msgId='tMsg';payload={oldName:oldKey,newName:nT}; 
    }else if(type==='F'){ 
      var nF=(getEditNameInput('F').value||'').trim(); 
      if(!nF){showMsg('fMsg','Name is required.','err');return;} 
      fn='adminConfig_UpdateFakturaRow';msgId='fMsg';payload={oldName:oldKey,newName:nF}; 
    }else if(type==='U'){ 
      var nU=(getEditNameInput('U').value||'').trim(); 
      var pU=Number((getEditPriceInput('U').value||'').trim())||0; 
      if(!nU){showMsg('uMsg','Name is required.','err');return;} 
      if(pU<=0){showMsg('uMsg','Price must be greater than 0.','err');return;} 
      fn='adminConfig_UpdateUgovorRow';msgId='uMsg';payload={oldName:oldKey,newName:nU,newPrice:pU}; 
    }else if(type==='Z'){ 
      var nZ=(getEditNameInput('Z').value||'').trim(); 
      if(!nZ){showMsg('ozMsg','Name is required.','err');return;} 
      fn='adminConfig_UpdateZastitarskaRow';msgId='ozMsg';payload={oldName:oldKey,newName:nZ}; 
    }else if(type==='H'){ 
      var nH=(getEditNameInput('H').value||'').trim(); 
      if(!nH){showMsg('ohMsg','Name is required.','err');return;} 
      fn='adminConfig_UpdateZdravstvenaRow';msgId='ohMsg';payload={oldName:oldKey,newName:nH}; 
    }else if(type==='P'){ 
      var nP=(document.getElementById('edit_value_P').value||'').trim(); 
      if(!nP){showMsg('opMsg','Value is required.','err');return;} 
      fn='adminConfig_UpdatePrioritetnoRow';msgId='opMsg';payload={oldValue:oldKey,newValue:nP}; 
    }else{return;} 
    google.script.run 
      .withSuccessHandler(function(){clearEditing(type);showMsg(msgId,'Updated.','ok');reload();}) 
      .withFailureHandler(function(e){showMsg(msgId,em(e),'err');})[fn](JSON.stringify(payload)); 
  } 

  function cancelRowEdit(type){clearEditing(type);rerenderType(type);} 
  function onEditKeydown(ev,type,oldKey){if(ev.key==='Enter')saveRowEdit(type,oldKey);if(ev.key==='Escape')cancelRowEdit(type);} 

  var calState={ 
    P:{year:0,month:0,start:null,end:null}, 
    T:{year:0,month:0,start:null,end:null}, 
    K:{year:0,month:0,start:null,end:null} 
  }; 

  function calPad(n){return String(n).padStart(2,'0');} 
  function calFmt(y,m,d){return y+'-'+calPad(m+1)+'-'+calPad(d);} 
  function calToday(){var n=new Date();return calFmt(n.getFullYear(),n.getMonth(),n.getDate());} 

  var MONTHS_HR=['January','February','March','April','May','June','July','August','September','October','November','December']; 
  var DAYS_HR=['Mo','Tu','We','Th','Fr','Sa','Su']; 

  function calInitAll(){ 
    var n=new Date(); 
    ['P','T','K'].forEach(function(id){ 
      calState[id].year=n.getFullYear(); 
      calState[id].month=n.getMonth(); 
      calState[id].start=null; 
      calState[id].end=null; 
      calRender(id); 
    }); 
  } 

  window.calNav=function(id,dir){ 
    calState[id].month+=dir; 
    if(calState[id].month<0){calState[id].month=11;calState[id].year--;} 
    if(calState[id].month>11){calState[id].month=0;calState[id].year++;} 
    calRender(id); 
  }; 

  function calRender(id){ 
    var st=calState[id]; 
    document.getElementById('calLabel'+id).textContent=MONTHS_HR[st.month]+' '+st.year; 
    var grid=document.getElementById('calGrid'+id); 
    var today=calToday(); 
    var h=''; 
    DAYS_HR.forEach(function(d){h+='<div class="cal-dow">'+d+'</div>';}); 
    var firstDay=new Date(st.year,st.month,1).getDay(); 
    var startOffset=(firstDay===0)?6:firstDay-1; 
    var daysInMonth=new Date(st.year,st.month+1,0).getDate(); 
    for(var i=0;i<startOffset;i++)h+='<div></div>'; 
    for(var d=1;d<=daysInMonth;d++){ 
      var key=calFmt(st.year,st.month,d); 
      var cls='cal-day'; 
      if(key===today)cls+=' cal-today'; 
      if(st.start&&st.end){ 
        if(key===st.start)cls+=' cal-sel-start'; 
        else if(key===st.end)cls+=' cal-sel-end'; 
        else if(key>st.start&&key<st.end)cls+=' cal-in-range'; 
      }else if(st.start&&key===st.start){cls+=' cal-sel-start';} 
      h+='<div class="'+cls+'" data-key="'+key+'">'+d+'</div>'; 
    } 
    grid.innerHTML=h; 
    (function(capturedId){ 
      grid.onclick=function(e){ 
        var el=e.target.closest('.cal-day');if(!el)return; 
        var k=el.dataset.key;if(!k)return; 
        var s=calState[capturedId]; 
        if(!s.start||s.end){s.start=k;s.end=null;} 
        else{if(k===s.start){s.end=null;}else if(k<s.start){s.end=s.start;s.start=k;}else{s.end=k;}} 
        calRender(capturedId);calUpdateSel(capturedId); 
      }; 
    })(id); 
    calUpdateSel(id); 
  } 

  function calUpdateSel(id){ 
    var st=calState[id]; 
    var el=document.getElementById('calSel'+id); 
    if(!st.start){el.textContent='No date selected';return;} 
    if(!st.end){el.textContent='From: '+st.start;return;} 
    el.textContent='From: '+st.start+' \\u2192 To: '+st.end; 
  } 

  function calGetDates(id){ 
    var st=calState[id]; 
    if(!st.start)return[]; 
    if(!st.end)return[st.start]; 
    var dates=[],cur=new Date(st.start+'T12:00:00'),end=new Date(st.end+'T12:00:00'); 
    while(cur<=end){ 
      dates.push(calFmt(cur.getFullYear(),cur.getMonth(),cur.getDate())); 
      cur.setDate(cur.getDate()+1); 
    } 
    return dates; 
  } 

  function calReset(id){calState[id].start=null;calState[id].end=null;calRender(id);} 

  function renderAuthorChips(containerId,customInputId){ 
    var container=document.getElementById(containerId); 
    if(!container)return; 

    var autori=D.najaveAutori||[]; 
    var h=''; 

    autori.forEach(function(a){ 
      h+='<button class="chip" type="button" data-author="'+esc(a)+'" data-custom-id="'+esc(customInputId)+'">'+esc(a)+'</button>'; 
    }); 

    container.innerHTML=h; 

    container.onclick=function(e){ 
      var btn=e.target.closest('.chip'); 
      if(!btn)return; 
      pickAuthor(btn,btn.dataset.customId); 
    }; 
  } 

  window.pickAuthor=function(btn,customInputId){ 
    var author=btn.dataset.author; 

    document.querySelectorAll('#nPAuthorChips .chip,#nTAuthorChips .chip,#nKAuthorChips .chip').forEach(function(c){ 
      if(c.dataset.author===author){c.classList.toggle('active');}else{c.classList.remove('active');} 
    }); 

    var customInput=document.getElementById(customInputId); 
    if(customInput&&btn.classList.contains('active')){customInput.value='';} 
  }; 

  function getSelectedAuthor(chipsId,customId){ 
    var chip=document.querySelector('#'+chipsId+' .chip.active'); 
    if(chip)return chip.dataset.author; 
    return(document.getElementById(customId).value||'').trim(); 
  } 

  function renderNajave(){ 
    var arr=(D.najave||[]); 
    var today=calToday(); 
    var active=arr.map(function(n,i){return Object.assign({},n,{_idx:i});}) 
      .filter(function(n){return Array.isArray(n.dates)&&n.dates.length&&n.dates[n.dates.length-1]>=today;}); 

    var byType={pacijent:[],tvrtka:[],kljucnarijec:[]}; 
    active.forEach(function(n){if(byType[n.type])byType[n.type].push(n);}); 

    document.getElementById('badgeN').textContent=active.length; 
    document.getElementById('badgeNP').textContent=byType.pacijent.length; 
    document.getElementById('badgeNT').textContent=byType.tvrtka.length; 
    document.getElementById('badgeNK').textContent=byType.kljucnarijec.length; 
    document.getElementById('badgeNA').textContent=(D.najaveAutori||[]).length; 

    renderNajaveTable('nPTable',byType.pacijent); 
    renderNajaveTable('nTTable',byType.tvrtka); 
    renderNajaveTable('nKTable',byType.kljucnarijec); 
    renderAutoriTable(); 
    renderAuthorChips('nPAuthorChips','nPAuthorCustom'); 
    renderAuthorChips('nTAuthorChips','nTAuthorCustom'); 
    renderAuthorChips('nKAuthorChips','nKAuthorCustom'); 
  } 

  function renderNajaveTable(tableId,arr){ 
    if(!arr.length){ 
      document.getElementById(tableId).innerHTML='<div class="empty">No active entries.</div>'; 
      return; 
    } 
    arr.sort(function(a,b){return(a.dates[0]||'').localeCompare(b.dates[0]||'');}); 
    var h='<div class="card-tbl"><table><thead><tr>' 
      +'<th style="width:180px">Trigger</th>' 
      +'<th style="width:180px">Date</th>' 
      +'<th>Message</th>' 
      +'<th style="width:80px">Author</th>' 
      +'<th style="width:80px"></th>' 
      +'</tr></thead><tbody>'; 
    arr.forEach(function(n){ 
      var dateLabel=n.dates.length===1 
        ?'<span class="najava-date-badge">📅 '+esc(n.dates[0])+'</span>' 
        :'<span class="najava-date-badge">📅 '+esc(n.dates[0])+' \\u2192 '+esc(n.dates[n.dates.length-1])+'</span>'; 
      var actionLabel=n.action&&n.action.label 
        ?('<div style="margin-top:4px;font-size:12px;color:var(--grn)">▶ '+esc(n.action.label)+'</div>'):''; 
      h+='<tr>' 
        +'<td><span class="chip-nav">'+esc(n.trigger||n.name||'')+'</span></td>' 
        +'<td>'+dateLabel+'</td>' 
        +'<td><div class="najava-msg-cell">'+esc(n.message)+actionLabel+'</div></td>' 
        +'<td style="font-size:13px;color:var(--s5);font-style:italic">'+esc(n.author||'')+'</td>' 
        +'<td><button class="btn-del" data-action="del-najava" data-idx="'+n._idx+'">Delete</button></td>' 
        +'</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById(tableId).innerHTML=h; 
    document.querySelector('#'+tableId+' table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      if(btn.dataset.action==='del-najava')delNajava(Number(btn.dataset.idx)); 
    }); 
  } 

  function renderAutoriTable(){ 
    var arr=(D.najaveAutori||[]); 
    if(!arr.length){ 
      document.getElementById('nATable').innerHTML='<div class="empty">No authors yet.</div>'; 
      return; 
    } 
    var h='<div class="pr-list" style="padding:18px">'; 
    arr.forEach(function(a){ 
      h+='<span class="pr-chip">'+esc(a) 
        +'<button data-action="del-autor" data-name="'+esc(a)+'" title="Remove">×</button></span>'; 
    }); 
    h+='</div>'; 
    document.getElementById('nATable').innerHTML=h; 
    document.getElementById('nATable').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      if(btn.dataset.action==='del-autor')delNajavaAutor(btn.dataset.name); 
    },{once:true}); 
  } 

  var TYPE_MAP={P:'pacijent',T:'tvrtka',K:'kljucnarijec'}; 
  var MSG_ID={P:'nPMsg',T:'nTMsg',K:'nKMsg'}; 
  var BTN_ID={P:'nPBtn',T:'nTBtn',K:'nKBtn'}; 

  window.addNajavaTyped=function(t){ 
    var trigger=(document.getElementById('n'+t+'Trigger').value||'').trim(); 
    var msg=(document.getElementById('n'+t+'Message').value||'').trim(); 
    var dates=calGetDates(t); 
    var author=getSelectedAuthor('n'+t+'AuthorChips','n'+t+'AuthorCustom'); 
    var action=null; 

    if(!trigger){showMsg(MSG_ID[t],'Trigger is required.','err');return;} 
    if(!dates.length){showMsg(MSG_ID[t],'Select at least one date.','err');return;} 
    if(!msg){showMsg(MSG_ID[t],'Message is required.','err');return;} 

    if(t==='T'){ 
      var tLabel=(document.getElementById('nTActionLabel').value||'').trim(); 
      var tVal=(document.getElementById('nTActionValue').value||'').trim(); 
      if(tLabel&&tVal){action={label:tLabel,writeCol:'I',writeValue:tVal};} 
    } 

    if(t==='K'){ 
      var aLabel=(document.getElementById('nKActionLabel').value||'').trim(); 
      var aCol=(document.getElementById('nKActionCol').value||'').trim(); 
      var aVal=(document.getElementById('nKActionValue').value||'').trim(); 
      if(aLabel&&aCol&&aVal){action={label:aLabel,writeCol:aCol,writeValue:aVal};} 
    } 

    busy(BTN_ID[t],true); 
    google.script.run 
      .withSuccessHandler(function(){ 
        busy(BTN_ID[t],false); 
        document.getElementById('n'+t+'Trigger').value=''; 
        document.getElementById('n'+t+'Message').value=''; 

        if(t==='T'){document.getElementById('nTActionLabel').value='';document.getElementById('nTActionValue').value='';} 
        if(t==='K'){document.getElementById('nKActionLabel').value='';document.getElementById('nKActionCol').value='';document.getElementById('nKActionValue').value='';} 

        calReset(t); 

        document.querySelectorAll('#n'+t+'AuthorChips .chip').forEach(function(c){c.classList.remove('active');}); 
        document.getElementById('n'+t+'AuthorCustom').value=''; 

        showMsg(MSG_ID[t],'Added.','ok'); 
        reload(); 
      }) 
      .withFailureHandler(function(e){busy(BTN_ID[t],false);showMsg(MSG_ID[t],em(e),'err');}) 
      .adminConfig_SaveNajava(JSON.stringify({ 
        type:TYPE_MAP[t], 
        trigger:trigger, 
        dates:dates, 
        message:msg, 
        author:author, 
        action:action 
      })); 
  }; 

  function delNajava(idx){ 
    confirm_({title:'Delete notification',msg:'Delete this notification?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run 
        .withSuccessHandler(function(){reload();}) 
        .withFailureHandler(function(e){alert_({msg:em(e)});}) 
        .adminConfig_DeleteNajava(idx); 
    }); 
  } 

  window.addNajavaAutor=function(){ 
    var n=(document.getElementById('nAName').value||'').trim(); 
    if(!n){showMsg('nAMsg','Name is required.','err');return;} 
    busy('nABtn',true); 
    google.script.run 
      .withSuccessHandler(function(){busy('nABtn',false);document.getElementById('nAName').value='';showMsg('nAMsg','Added.','ok');reload();}) 
      .withFailureHandler(function(e){busy('nABtn',false);showMsg('nAMsg',em(e),'err');}) 
      .adminConfig_SaveNajavaAutor(n); 
  }; 

  function delNajavaAutor(name){ 
    confirm_({title:'Delete author',msg:'Delete "'+name+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run 
        .withSuccessHandler(function(){reload();}) 
        .withFailureHandler(function(e){alert_({msg:em(e)});}) 
        .adminConfig_DeleteNajavaAutor(name); 
    }); 
  } 

  function renderDocs(){ 
    var m=D.mapping||{}; 
    var keys=Object.keys(m).sort(function(a,b){return a.localeCompare(b,'hr');}); 
    var q=docFilter.toLowerCase(); 
    var vis=q?keys.filter(function(k){return k.includes(q)||m[k].toLowerCase().includes(q);}):keys; 
    document.getElementById('badgeD').textContent=keys.length; 
    if(!vis.length){document.getElementById('dTable').innerHTML='<div class="empty">'+(keys.length?'No results.':'No staff members.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:130px">Initials</th><th>Full name</th><th style="width:110px"></th></tr></thead><tbody>'; 
    vis.forEach(function(k){ 
      h+='<tr data-k="'+esc(k)+'"><td><span class="chip-blue">'+esc(k)+'</span></td>' 
        +'<td class="doc-name">'+esc(m[k])+'</td>' 
        +'<td><div class="act-btns"><button class="btn-del" data-action="del">Delete</button></div></td></tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('dTable').innerHTML=h; 
    document.querySelector('#dTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var row=e.target.closest('tr[data-k]');if(!row)return; 
      if(btn.dataset.action==='del')delDoc(row.dataset.k); 
    }); 
  } 
  window.filterDocs=function(){docFilter=document.getElementById('dSearch').value;renderDocs();}; 
  window.addDoc=function(){ 
    var inic=document.getElementById('dI').value.trim().toLowerCase(); 
    var ime=document.getElementById('dN').value.trim(); 
    if(!inic||!ime){showMsg('dMsg','Initials and name are required.','err');return;} 
    busy('dBtn',true); 
    google.script.run 
      .withSuccessHandler(function(){busy('dBtn',false);document.getElementById('dI').value='';document.getElementById('dN').value='';showMsg('dMsg','Added.','ok');reload();}) 
      .withFailureHandler(function(e){busy('dBtn',false);showMsg('dMsg',em(e),'err');}) 
      .adminConfig_SaveDoktor(JSON.stringify({initials:inic,name:ime})); 
  }; 
  function delDoc(k){ 
    confirm_({title:'Delete staff member',msg:'Delete "'+k+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('dMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('dMsg',em(e),'err');}).adminConfig_DeleteDoktor(k); 
    }); 
  } 

  function renderTvrtke(){ 
    var arr=(D.tvrtke||[]).slice().sort(function(a,b){return a.name.toLowerCase().localeCompare(b.name.toLowerCase(),'hr');}); 
    var q=tvrtFilter.toLowerCase(); 
    var vis=q?arr.filter(function(g){return g.name.toLowerCase().includes(q)||g.aliases.some(function(a){return a.toLowerCase().includes(q);});}):arr; 
    document.getElementById('badgeT').textContent=(D.tvrtke||[]).length; 
    if(!vis.length){document.getElementById('tTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No training clients.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:260px">Client name</th><th>Aliases</th><th style="width:170px"></th></tr></thead><tbody>'; 
    vis.forEach(function(g){ 
      var edit=isEditing('T',g.name); 
      h+='<tr>'; 
      if(edit){ 
        h+='<td><input id="edit_name_T" class="edit-inp" value="'+esc(g.name)+'" onkeydown="onEditKeydown(event,&quot;T&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-alias','add-alias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-save" data-action="save-row" data-type="T" data-key="'+esc(g.name)+'">Save</button><button class="btn-cancel" data-action="cancel-row" data-type="T">Cancel</button></div></td>'; 
      }else{ 
        h+='<td><span class="chip-grn">'+esc(g.name)+'</span></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-alias','add-alias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-edit" data-action="edit-row" data-type="T" data-key="'+esc(g.name)+'">Edit</button><button class="btn-del" data-action="del-tvrtka" data-company="'+esc(g.name)+'">Delete</button></div></td>'; 
      } 
      h+='</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('tTable').innerHTML=h; 
    document.querySelector('#tTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-tvrtka')delTvrtka(btn.dataset.company); 
      else if(act==='del-alias')delAlias(btn.dataset.company,btn.dataset.alias); 
      else if(act==='add-alias')showAliasInput(btn,'T'); 
      else if(act==='edit-row')startEdit('T',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    }); 
  } 

  window.filterTvrtke=function(){tvrtFilter=document.getElementById('tSearch').value;renderTvrtke();}; 
  window.addTvrtka=function(){ 
    var n=document.getElementById('tN').value.trim().toUpperCase(); 
    if(!n){showMsg('tMsg','Name is required.','err');return;} 
    document.getElementById('tN').value=n; 
    busy('tBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('tBtn',false);document.getElementById('tN').value='';showMsg('tMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('tBtn',false);showMsg('tMsg',em(e),'err');}).adminConfig_SaveTvrtka(n); 
  }; 

  function delTvrtka(n){ 
    confirm_({title:'Delete training client',msg:'Delete "'+n+'"?',okLabel:'Delete',icon:'🏢'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('tMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('tMsg',em(e),'err');}).adminConfig_DeleteTvrtka(n); 
    }); 
  } 

  function delAlias(company,alias){ 
    confirm_({title:'Remove alias',msg:'Remove "'+alias+'" as an alias for "'+company+'"?',okLabel:'Remove',icon:'✕',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg('tMsg',em(e),'err');}).adminConfig_DeleteAlias(JSON.stringify({company:company,alias:alias})); 
    }); 
  } 

  function renderFaktura(){ 
    var arr=(D.faktura||[]).slice().sort(function(a,b){return a.name.toLowerCase().localeCompare(b.name.toLowerCase(),'hr');}); 
    var q=faktFilter.toLowerCase(); 
    var vis=q?arr.filter(function(g){return g.name.toLowerCase().includes(q)||g.aliases.some(function(a){return a.toLowerCase().includes(q);});}):arr; 
    document.getElementById('badgeF').textContent=(D.faktura||[]).length; 
    if(!vis.length){document.getElementById('fTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No invoice clients.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:260px">Client</th><th>Aliases</th><th style="width:170px"></th></tr></thead><tbody>'; 
    vis.forEach(function(g){ 
      var edit=isEditing('F',g.name); 
      h+='<tr>'; 
      if(edit){ 
        h+='<td><input id="edit_name_F" class="edit-inp" value="'+esc(g.name)+'" onkeydown="onEditKeydown(event,&quot;F&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-falias','add-falias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-save" data-action="save-row" data-type="F" data-key="'+esc(g.name)+'">Save</button><button class="btn-cancel" data-action="cancel-row" data-type="F">Cancel</button></div></td>'; 
      }else{ 
        h+='<td><span class="chip-amb">'+esc(g.name)+'</span></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-falias','add-falias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-edit" data-action="edit-row" data-type="F" data-key="'+esc(g.name)+'">Edit</button><button class="btn-del" data-action="del-faktura" data-company="'+esc(g.name)+'">Delete</button></div></td>'; 
      } 
      h+='</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('fTable').innerHTML=h; 
    document.querySelector('#fTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-faktura')delFaktura(btn.dataset.company); 
      else if(act==='del-falias')delFakturaAlias(btn.dataset.company,btn.dataset.alias); 
      else if(act==='add-falias')showAliasInput(btn,'F'); 
      else if(act==='edit-row')startEdit('F',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    }); 
  } 

  window.filterFaktura=function(){faktFilter=document.getElementById('fSearch').value;renderFaktura();}; 
  window.addFaktura=function(){ 
    var n=document.getElementById('fN').value.trim(); 
    if(!n){showMsg('fMsg','Name is required.','err');return;} 
    busy('fBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('fBtn',false);document.getElementById('fN').value='';showMsg('fMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('fBtn',false);showMsg('fMsg',em(e),'err');}).adminConfig_SaveFakturaKlijent(n); 
  }; 

  function delFaktura(n){ 
    confirm_({title:'Delete invoice client',msg:'Delete "'+n+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('fMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('fMsg',em(e),'err');}).adminConfig_DeleteFakturaKlijent(n); 
    }); 
  } 

  function delFakturaAlias(company,alias){ 
    confirm_({title:'Remove alias',msg:'Remove "'+alias+'" as an alias for "'+company+'"?',okLabel:'Remove',icon:'✕',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg('fMsg',em(e),'err');}).adminConfig_DeleteFakturaAlias(JSON.stringify({company:company,alias:alias})); 
    }); 
  } 

  function renderUgovor(){ 
    var arr=(D.ugovor||[]).slice().sort(function(a,b){return a.name.toLowerCase().localeCompare(b.name.toLowerCase(),'hr');}); 
    var q=ugFilter.toLowerCase(); 
    var vis=q?arr.filter(function(g){return g.name.toLowerCase().includes(q)||g.aliases.some(function(a){return a.toLowerCase().includes(q);});}):arr; 
    document.getElementById('badgeU').textContent=(D.ugovor||[]).length; 
    if(!vis.length){document.getElementById('uTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No contract clubs.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:260px">Club</th><th style="width:140px">Price</th><th>Aliases</th><th style="width:190px"></th></tr></thead><tbody>'; 
    vis.forEach(function(g){ 
      var edit=isEditing('U',g.name); 
      h+='<tr>'; 
      if(edit){ 
        h+='<td><input id="edit_name_U" class="edit-inp" value="'+esc(g.name)+'" onkeydown="onEditKeydown(event,&quot;U&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td><input id="edit_price_U" class="inp-price-edit" type="number" min="1" value="'+esc(g.price)+'" onkeydown="onEditKeydown(event,&quot;U&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-ualias','add-ualias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-save" data-action="save-row" data-type="U" data-key="'+esc(g.name)+'">Save</button><button class="btn-cancel" data-action="cancel-row" data-type="U">Cancel</button></div></td>'; 
      }else{ 
        h+='<td><span class="chip-register">'+esc(g.name)+'</span></td>'; 
        h+='<td><span class="price-tag">'+esc(g.price)+' €</span></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-ualias','add-ualias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-edit" data-action="edit-row" data-type="U" data-key="'+esc(g.name)+'">Edit</button><button class="btn-del" data-action="del-ugovor" data-company="'+esc(g.name)+'">Delete</button></div></td>'; 
      } 
      h+='</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('uTable').innerHTML=h; 
    document.querySelector('#uTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-ugovor')delUgovor(btn.dataset.company); 
      else if(act==='del-ualias')delUgovorAlias(btn.dataset.company,btn.dataset.alias); 
      else if(act==='add-ualias')showAliasInput(btn,'U'); 
      else if(act==='edit-row')startEdit('U',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    }); 
  } 

  window.filterUgovor=function(){ugFilter=document.getElementById('uSearch').value;renderUgovor();}; 
  window.addUgovor=function(){ 
    var n=document.getElementById('uN').value.trim(); 
    var p=Number(document.getElementById('uP').value)||0; 
    if(!n){showMsg('uMsg','Name is required.','err');return;} 
    if(p<=0){showMsg('uMsg','Price must be greater than 0.','err');return;} 
    busy('uBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('uBtn',false);document.getElementById('uN').value='';document.getElementById('uP').value='';showMsg('uMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('uBtn',false);showMsg('uMsg',em(e),'err');}).adminConfig_SaveUgovorKlub(JSON.stringify({name:n,price:p})); 
  }; 

  function delUgovor(n){ 
    confirm_({title:'Delete contract club',msg:'Delete "'+n+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('uMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('uMsg',em(e),'err');}).adminConfig_DeleteUgovorKlub(n); 
    }); 
  } 

  function delUgovorAlias(company,alias){ 
    confirm_({title:'Remove alias',msg:'Remove "'+alias+'" as an alias for "'+company+'"?',okLabel:'Remove',icon:'✕',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg('uMsg',em(e),'err');}).adminConfig_DeleteUgovorAlias(JSON.stringify({company:company,alias:alias})); 
    }); 
  } 

  function renderZastitarske(){ 
    var arr=(D.zastitarskeTvrtke||[]).slice().sort(function(a,b){return a.name.toLowerCase().localeCompare(b.name.toLowerCase(),'hr');}); 
    var q=zastFilter.toLowerCase(); 
    var vis=q?arr.filter(function(g){return g.name.toLowerCase().includes(q)||g.aliases.some(function(a){return a.toLowerCase().includes(q);});}):arr; 
    updateOperativeBadge(); 
    if(!vis.length){document.getElementById('ozTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No security companies.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:260px">Company</th><th>Aliases</th><th style="width:170px"></th></tr></thead><tbody>'; 
    vis.forEach(function(g){ 
      var edit=isEditing('Z',g.name); 
      h+='<tr>'; 
      if(edit){ 
        h+='<td><input id="edit_name_Z" class="edit-inp" value="'+esc(g.name)+'" onkeydown="onEditKeydown(event,&quot;Z&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-zalias','add-zalias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-save" data-action="save-row" data-type="Z" data-key="'+esc(g.name)+'">Save</button><button class="btn-cancel" data-action="cancel-row" data-type="Z">Cancel</button></div></td>'; 
      }else{ 
        h+='<td><span class="chip-op">'+esc(g.name)+'</span></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-zalias','add-zalias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-edit" data-action="edit-row" data-type="Z" data-key="'+esc(g.name)+'">Edit</button><button class="btn-del" data-action="del-zast" data-company="'+esc(g.name)+'">Delete</button></div></td>'; 
      } 
      h+='</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('ozTable').innerHTML=h; 
    document.querySelector('#ozTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-zast')delZastitarska(btn.dataset.company); 
      else if(act==='del-zalias')delZastitarskaAlias(btn.dataset.company,btn.dataset.alias); 
      else if(act==='add-zalias')showAliasInput(btn,'Z'); 
      else if(act==='edit-row')startEdit('Z',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    }); 
  } 

  function updateOperativeBadge(){ 
    var total=(D.zastitarskeTvrtke||[]).length+(D.zdravstveneUstanove||[]).length+(D.prioritetno||[]).length; 
    document.getElementById('badgeO').textContent=total; 
  } 

  window.filterZastitarske=function(){zastFilter=document.getElementById('ozSearch').value;renderZastitarske();}; 
  window.addZastitarska=function(){ 
    var n=document.getElementById('ozN').value.trim(); 
    if(!n){showMsg('ozMsg','Name is required.','err');return;} 
    busy('ozBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('ozBtn',false);document.getElementById('ozN').value='';showMsg('ozMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('ozBtn',false);showMsg('ozMsg',em(e),'err');}).adminConfig_SaveZastitarskaTvrtka(n); 
  }; 

  function delZastitarska(n){ 
    confirm_({title:'Delete security company',msg:'Delete "'+n+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('ozMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('ozMsg',em(e),'err');}).adminConfig_DeleteZastitarskaTvrtka(n); 
    }); 
  } 

  function delZastitarskaAlias(company,alias){ 
    confirm_({title:'Remove alias',msg:'Remove "'+alias+'" as an alias for "'+company+'"?',okLabel:'Remove',icon:'✕',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg('ozMsg',em(e),'err');}).adminConfig_DeleteZastitarskaAlias(JSON.stringify({company:company,alias:alias})); 
    }); 
  } 

  function renderZdravstvene(){ 
    var arr=(D.zdravstveneUstanove||[]).slice().sort(function(a,b){return a.name.toLowerCase().localeCompare(b.name.toLowerCase(),'hr');}); 
    var q=zdrFilter.toLowerCase(); 
    var vis=q?arr.filter(function(g){return g.name.toLowerCase().includes(q)||g.aliases.some(function(a){return a.toLowerCase().includes(q);});}):arr; 
    updateOperativeBadge(); 
    if(!vis.length){document.getElementById('ohTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No health institutions.')+'</div>';return;} 
    var h='<div class="card-tbl"><table><thead><tr><th style="width:260px">Institution</th><th>Aliases</th><th style="width:170px"></th></tr></thead><tbody>'; 
    vis.forEach(function(g){ 
      var edit=isEditing('H',g.name); 
      h+='<tr>'; 
      if(edit){ 
        h+='<td><input id="edit_name_H" class="edit-inp" value="'+esc(g.name)+'" onkeydown="onEditKeydown(event,&quot;H&quot;,&quot;'+esc(g.name)+'&quot;)"></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-halias','add-halias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-save" data-action="save-row" data-type="H" data-key="'+esc(g.name)+'">Save</button><button class="btn-cancel" data-action="cancel-row" data-type="H">Cancel</button></div></td>'; 
      }else{ 
        h+='<td><span class="chip-op">'+esc(g.name)+'</span></td>'; 
        h+='<td>'+renderAliasBlock(g.aliases,g.name,'del-halias','add-halias')+'</td>'; 
        h+='<td><div class="act-btns"><button class="btn-edit" data-action="edit-row" data-type="H" data-key="'+esc(g.name)+'">Edit</button><button class="btn-del" data-action="del-zdr" data-company="'+esc(g.name)+'">Delete</button></div></td>'; 
      } 
      h+='</tr>'; 
    }); 
    h+='</tbody></table></div>'; 
    document.getElementById('ohTable').innerHTML=h; 
    document.querySelector('#ohTable table').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-zdr')delZdravstvena(btn.dataset.company); 
      else if(act==='del-halias')delZdravstvenaAlias(btn.dataset.company,btn.dataset.alias); 
      else if(act==='add-halias')showAliasInput(btn,'H'); 
      else if(act==='edit-row')startEdit('H',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    }); 
  } 

  window.filterZdravstvene=function(){zdrFilter=document.getElementById('ohSearch').value;renderZdravstvene();}; 
  window.addZdravstvena=function(){ 
    var n=document.getElementById('ohN').value.trim(); 
    if(!n){showMsg('ohMsg','Name is required.','err');return;} 
    busy('ohBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('ohBtn',false);document.getElementById('ohN').value='';showMsg('ohMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('ohBtn',false);showMsg('ohMsg',em(e),'err');}).adminConfig_SaveZdravstvenaUstanova(n); 
  }; 

  function delZdravstvena(n){ 
    confirm_({title:'Delete health institution',msg:'Delete "'+n+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('ohMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('ohMsg',em(e),'err');}).adminConfig_DeleteZdravstvenaUstanova(n); 
    }); 
  } 

  function delZdravstvenaAlias(company,alias){ 
    confirm_({title:'Remove alias',msg:'Remove "'+alias+'" as an alias for "'+company+'"?',okLabel:'Remove',icon:'✕',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg('ohMsg',em(e),'err');}).adminConfig_DeleteZdravstvenaAlias(JSON.stringify({company:company,alias:alias})); 
    }); 
  } 

  function renderPrioritetno(){ 
    var arr=(D.prioritetno||[]).slice().sort(function(a,b){return a.localeCompare(b,'hr');}); 
    var q=prFilter.toLowerCase(); 
    var vis=q?arr.filter(function(x){return String(x).toLowerCase().includes(q);}):arr; 
    updateOperativeBadge(); 
    if(!vis.length){document.getElementById('opTable').innerHTML='<div class="empty">'+(arr.length?'No results.':'No priority rules.')+'</div>';return;} 
    var h='<div class="card-tbl" style="padding:18px"><div class="pr-list">'; 
    vis.forEach(function(v){ 
      if(isEditing('P',v)){ 
        h+='<span class="pr-chip"><input id="edit_value_P" class="edit-inp" style="width:220px" value="'+esc(v)+'" onkeydown="onEditKeydown(event,&quot;P&quot;,&quot;'+esc(v)+'&quot;)"><button class="btn-save" data-action="save-row" data-type="P" data-key="'+esc(v)+'">✓</button><button class="btn-cancel" data-action="cancel-row" data-type="P">×</button></span>'; 
      }else{ 
        h+='<span class="pr-chip">'+esc(v)+'<button data-action="edit-row" data-type="P" data-key="'+esc(v)+'" title="Edit">✎</button><button data-action="del-pr" data-value="'+esc(v)+'" title="Remove">×</button></span>'; 
      } 
    }); 
    h+='</div></div>'; 
    document.getElementById('opTable').innerHTML=h; 
    document.getElementById('opTable').addEventListener('click',function(e){ 
      var btn=e.target.closest('[data-action]');if(!btn)return; 
      var act=btn.dataset.action; 
      if(act==='del-pr')delPrioritetno(btn.dataset.value); 
      else if(act==='edit-row')startEdit('P',btn.dataset.key); 
      else if(act==='save-row')saveRowEdit(btn.dataset.type,btn.dataset.key); 
      else if(act==='cancel-row')cancelRowEdit(btn.dataset.type); 
    },{once:true}); 
  } 

  window.filterPrioritetno=function(){prFilter=document.getElementById('opSearch').value;renderPrioritetno();}; 
  window.addPrioritetno=function(){ 
    var n=document.getElementById('opN').value.trim(); 
    if(!n){showMsg('opMsg','Value is required.','err');return;} 
    busy('opBtn',true); 
    google.script.run.withSuccessHandler(function(){busy('opBtn',false);document.getElementById('opN').value='';showMsg('opMsg','Added.','ok');reload();}).withFailureHandler(function(e){busy('opBtn',false);showMsg('opMsg',em(e),'err');}).adminConfig_SavePrioritetno(n); 
  }; 

  function delPrioritetno(v){ 
    confirm_({title:'Delete priority rule',msg:'Delete "'+v+'"?',okLabel:'Delete',icon:'🗑️'},function(){ 
      google.script.run.withSuccessHandler(function(){showMsg('opMsg','Deleted.','ok');reload();}).withFailureHandler(function(e){showMsg('opMsg',em(e),'err');}).adminConfig_DeletePrioritetno(v); 
    }); 
  } 

  function showAliasInput(btn,tab){ 
    var company=btn.dataset.company; 
    var container=btn.parentElement; 
    btn.style.display='none'; 
    var inp=document.createElement('input');inp.className='inp-alias';inp.placeholder='Add alias...'; 
    var ok_=document.createElement('button');ok_.textContent='✓';ok_.style.cssText='padding:5px 12px;background:var(--blue);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:15px;font-weight:700'; 
    var can_=document.createElement('button');can_.textContent='×';can_.style.cssText='padding:5px 9px;background:none;border:1.5px solid var(--s2);border-radius:6px;cursor:pointer;font-size:15px;color:var(--s5)'; 
    function doAdd(){ 
      var v=inp.value.trim();if(!v)return; 
      inp.disabled=true;ok_.disabled=true; 
      var fn,msgId; 
      if(tab==='T'){fn='adminConfig_AddAlias';msgId='tMsg';} 
      else if(tab==='F'){fn='adminConfig_AddFakturaAlias';msgId='fMsg';} 
      else if(tab==='U'){fn='adminConfig_AddUgovorAlias';msgId='uMsg';} 
      else if(tab==='Z'){fn='adminConfig_AddZastitarskaAlias';msgId='ozMsg';} 
      else if(tab==='H'){fn='adminConfig_AddZdravstvenaAlias';msgId='ohMsg';} 
      else return; 
      google.script.run.withSuccessHandler(function(){reload();}).withFailureHandler(function(e){showMsg(msgId,em(e),'err');cleanup();})[fn](JSON.stringify({company:company,alias:v})); 
    } 
    function cleanup(){btn.style.display='';if(inp.parentElement)container.removeChild(inp);if(ok_.parentElement)container.removeChild(ok_);if(can_.parentElement)container.removeChild(can_);} 
    inp.addEventListener('keydown',function(ev){if(ev.key==='Enter')doAdd();if(ev.key==='Escape')cleanup();}); 
    ok_.addEventListener('click',doAdd);can_.addEventListener('click',cleanup); 
    container.appendChild(inp);container.appendChild(ok_);container.appendChild(can_); 
    inp.focus(); 
  } 

  window.exportJson=function(){ 
    google.script.run.withSuccessHandler(function(json){ 
      try{navigator.clipboard.writeText(json).then(function(){alert_({title:'Export OK',msg:'JSON copied to clipboard.',icon:'📋',safe:true});}).catch(function(){promptCopy(json);});}catch(e){promptCopy(json);} 
    }).withFailureHandler(function(e){alert_({msg:em(e)});}).adminConfig_ExportJson(); 
  }; 

  function promptCopy(txt){ 
    var ta=document.createElement('textarea');ta.value=txt; 
    ta.style.cssText='position:fixed;top:50%;left:50%;width:80%;height:60%;transform:translate(-50%,-50%);z-index:9999;font-family:monospace;font-size:13px;padding:14px;border:2px solid #2563eb;border-radius:8px'; 
    document.body.appendChild(ta);ta.focus();ta.select(); 
    var ok=document.createElement('button');ok.textContent='× Close'; 
    ok.style.cssText='position:fixed;top:calc(50% - 33%);left:50%;transform:translateX(-50%);z-index:10000;padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:15px'; 
    ok.onclick=function(){document.body.removeChild(ta);document.body.removeChild(ok);}; 
    document.body.appendChild(ok); 
  } 

  window.importJson=function(){ 
    var json=prompt('Paste JSON from Export:');if(!json)return; 
    confirm_({title:'Import data',msg:'This will replace existing configuration with imported data. Continue?',okLabel:'Replace',icon:'📥',iconClass:'info'},function(){ 
      google.script.run.withSuccessHandler(function(){alert_({title:'Import OK',msg:'Data imported successfully.',icon:'✅',safe:true});reload();}).withFailureHandler(function(e){alert_({msg:em(e)});}).adminConfig_ImportJson(json); 
    }); 
  }; 

  window.onEditKeydown=onEditKeydown; 

  document.getElementById('dI').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('dN').focus();}); 
  document.getElementById('dN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addDoc();}); 
  document.getElementById('tN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addTvrtka();}); 
  document.getElementById('fN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addFaktura();}); 
  document.getElementById('uN').addEventListener('keydown',function(e){if(e.key==='Enter')document.getElementById('uP').focus();}); 
  document.getElementById('uP').addEventListener('keydown',function(e){if(e.key==='Enter')window.addUgovor();}); 
  document.getElementById('ozN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addZastitarska();}); 
  document.getElementById('ohN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addZdravstvena();}); 
  document.getElementById('opN').addEventListener('keydown',function(e){if(e.key==='Enter')window.addPrioritetno();}); 
  document.getElementById('nAName').addEventListener('keydown',function(e){if(e.key==='Enter')window.addNajavaAutor();}); 

  try { 
    calInitAll(); 
    document.getElementById('dTable').innerHTML='<div class="loading">Fetching data…</div>'; 
    google.script.run 
      .withSuccessHandler(function(json){ 
        try{D=JSON.parse(json);renderAll();} 
        catch(e){ 
          document.body.innerHTML='<div style="padding:30px;font-family:sans-serif;color:#b91c1c"><h2>Render error</h2><pre style="white-space:pre-wrap;font-size:14px">'+String(e&&e.stack?e.stack:e)+'</pre></div>'; 
        } 
      }) 
      .withFailureHandler(function(e){ 
        document.body.innerHTML='<div style="padding:30px;font-family:sans-serif;color:#b91c1c"><h2>Load error</h2><pre style="white-space:pre-wrap;font-size:14px">'+String(e&&e.message?e.message:e)+'</pre></div>'; 
      }) 
      .adminConfig_GetData(); 
  } catch(e) { 
    document.body.innerHTML='<div style="padding:30px;font-family:sans-serif;color:#b91c1c"><h2>Startup error</h2><pre style="white-space:pre-wrap;font-size:14px">'+String(e&&e.stack?e.stack:e)+'</pre></div>'; 
  } 
 
})(); 
`; 

  const jsSafe = JSON.stringify(js); 

  return '<!doctype html><html><head><meta charset="utf-8">' + 
    '<link rel="preconnect" href="https://fonts.googleapis.com">' + 
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">' + 
    '<style>' + css + '</style></head><body>' + 
    html + 
    '<script>' + 
    'document.getElementById("dTable").innerHTML="<div class=\\"loading\\">Initializing…</div>";' + 
    'try{' + 
      'var code=' + jsSafe + ';' + 
      '(0,eval)(code);' + 
    '}catch(e){' + 
      'var stack=String(e&&e.stack?e.stack:e);' + 
      'var line=0,col=0,pos=0;' + 
      'var m=stack.match(/<anonymous>:(\\d+):(\\d+)/)||stack.match(/eval.*?:(\\d+):(\\d+)/);' + 
      'if(m){line=Number(m[1])||0;col=Number(m[2])||0;}' + 
      'if(line===1&&col>0){pos=col;}' + 
      'var snippet=pos?code.slice(Math.max(0,pos-700),pos+700):code.slice(0,1800);' + 
      'var esc=function(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");};' + 
      'document.body.innerHTML=' + 
        '"<div style=\\"padding:30px;font-family:sans-serif;color:#b91c1c\\">" +' + 
        '"<h2>Syntax/runtime error in Admin UI JS</h2>" +' + 
        '"<div style=\\"margin:10px 0 18px;color:#991b1b;font-size:14px\\">Line: " + line + " · Col: " + col + "</div>" +' + 
        '"<pre style=\\"white-space:pre-wrap;font-size:14px;line-height:1.5;background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:14px\\">" +' + 
        'esc(stack) +' + 
        '"\\n\\n--- AROUND ERROR ---\\n" +' + 
        'esc(snippet) +' + 
        '"</pre></div>";' + 
    '}' + 
    '<\/script>' + 
    '</body></html>'; 
}

/* ═══════════════════════════════════════════════════════════════════════
 * 25 · OPERATIVE SETTINGS — Clients, clubs, institutions and business rules
 * ═══════════════════════════════════════════════════════════════════════ */

const ADMIN_FAKTURA_KEY              = "admin_faktura_v1";
const ADMIN_UGOVOR_KEY               = "admin_ugovor_v1";
const ADMIN_ZASTITARSKE_TVRTKE_KEY   = "admin_zastitarske_tvrtke_v1";
const ADMIN_ZDRAVSTVENE_USTANOVE_KEY = "admin_zdravstvene_ustanove_v1";
const ADMIN_PRIORITETNO_KEY          = "admin_prioritetno_v1";
const UGOVOR_PROMPT_TTL_SEC          = 20;

let _adminFakturaCache       = null, _adminFakturaCacheTs       = 0;
let _adminUgovorCache        = null, _adminUgovorCacheTs        = 0;
let _adminZastitarskeCache   = null, _adminZastitarskeCacheTs   = 0;
let _adminZdravstveneCache   = null, _adminZdravstveneCacheTs   = 0;
let _adminPrioritetnoCache   = null, _adminPrioritetnoCacheTs   = 0;

/* ── Parse helpers ───────────────────────────────────────────────────── */

function _adminParseFaktura_(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

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

function _adminParseUgovor_(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    return arr.map(item => ({
      name: String(item.name || "").trim(),
      aliases: Array.isArray(item.aliases)
        ? item.aliases.map(a => String(a || "").trim()).filter(Boolean)
        : [],
      price: Number(item.price) || 0
    })).filter(g => g.name);
  } catch (e) {
    return [];
  }
}

function _adminParseGroupedSimple_(raw) {
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

function _adminParseZastitarskeTvrtke_(raw) {
  return _adminParseGroupedSimple_(raw);
}

function _adminParseZdravstveneUstanove_(raw) {
  return _adminParseGroupedSimple_(raw);
}

function _adminParsePrioritetno_(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    const seen = {};
    return arr.map(v => String(v || "").trim()).filter(v => {
      const k = _normTxt_(v);
      if (!k || seen[k]) return false;
      seen[k] = true;
      return true;
    });
  } catch (e) {
    return [];
  }
}

/* ── Load / save helpers ─────────────────────────────────────────────── */

function _adminLoadFakturaGrouped_() {
  return _adminParseFaktura_(
    PropertiesService.getScriptProperties().getProperty(ADMIN_FAKTURA_KEY)
  );
}

function _adminSaveFakturaGrouped_(arr) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_FAKTURA_KEY, JSON.stringify(arr));
  _adminFakturaCache = null;
  _adminFakturaCacheTs = 0;
}

function _adminLoadUgovorGrouped_() {
  return _adminParseUgovor_(
    PropertiesService.getScriptProperties().getProperty(ADMIN_UGOVOR_KEY)
  );
}

function _adminSaveUgovorGrouped_(arr) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_UGOVOR_KEY, JSON.stringify(arr));
  _adminUgovorCache = null;
  _adminUgovorCacheTs = 0;
}

function _adminLoadZastitarskeTvrtkeGrouped_() {
  return _adminParseGroupedSimple_(
    PropertiesService.getScriptProperties().getProperty(ADMIN_ZASTITARSKE_TVRTKE_KEY)
  );
}

function _adminSaveZastitarskeTvrtkeGrouped_(arr) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_ZASTITARSKE_TVRTKE_KEY, JSON.stringify(arr));
  _adminZastitarskeCache = null;
  _adminZastitarskeCacheTs = 0;
}

function _adminLoadZdravstveneUstanoveGrouped_() {
  return _adminParseGroupedSimple_(
    PropertiesService.getScriptProperties().getProperty(ADMIN_ZDRAVSTVENE_USTANOVE_KEY)
  );
}

function _adminSaveZdravstveneUstanoveGrouped_(arr) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_ZDRAVSTVENE_USTANOVE_KEY, JSON.stringify(arr));
  _adminZdravstveneCache = null;
  _adminZdravstveneCacheTs = 0;
}

function _adminLoadPrioritetnoList_() {
  return _adminParsePrioritetno_(
    PropertiesService.getScriptProperties().getProperty(ADMIN_PRIORITETNO_KEY)
  );
}

function _adminSavePrioritetnoList_(arr) {
  PropertiesService.getScriptProperties().setProperty(ADMIN_PRIORITETNO_KEY, JSON.stringify(arr));
  _adminPrioritetnoCache = null;
  _adminPrioritetnoCacheTs = 0;
}

/* ── Public getters with cache ───────────────────────────────────────── */

function _getAdminFakturaKlijenti_() {
  const now = Date.now();

  if (_adminFakturaCache && (now - _adminFakturaCacheTs) < ADMIN_CACHE_TTL_MS) {
    return _adminFakturaCache;
  }

  const flat = [];
  _adminLoadFakturaGrouped_().forEach(g => {
    flat.push(g.name);
    (g.aliases || []).forEach(a => flat.push(a));
  });

  _adminFakturaCache = flat;
  _adminFakturaCacheTs = now;
  return flat;
}

function _getAdminUgovorKlubovi_() {
  const now = Date.now();

  if (_adminUgovorCache && (now - _adminUgovorCacheTs) < ADMIN_CACHE_TTL_MS) {
    return _adminUgovorCache;
  }

  const data = _adminLoadUgovorGrouped_();
  _adminUgovorCache = data;
  _adminUgovorCacheTs = now;
  return data;
}

function _getAdminZastitarskeTvrtke_() {
  const now = Date.now();

  if (_adminZastitarskeCache && (now - _adminZastitarskeCacheTs) < ADMIN_CACHE_TTL_MS) {
    return _adminZastitarskeCache;
  }

  const data = _adminLoadZastitarskeTvrtkeGrouped_();
  _adminZastitarskeCache = data;
  _adminZastitarskeCacheTs = now;
  return data;
}

function _getAdminZdravstveneUstanove_() {
  const now = Date.now();

  if (_adminZdravstveneCache && (now - _adminZdravstveneCacheTs) < ADMIN_CACHE_TTL_MS) {
    return _adminZdravstveneCache;
  }

  const data = _adminLoadZdravstveneUstanoveGrouped_();
  _adminZdravstveneCache = data;
  _adminZdravstveneCacheTs = now;
  return data;
}

function _getAdminPrioritetno_() {
  const now = Date.now();

  if (_adminPrioritetnoCache && (now - _adminPrioritetnoCacheTs) < ADMIN_CACHE_TTL_MS) {
    return _adminPrioritetnoCache;
  }

  const data = _adminLoadPrioritetnoList_();
  _adminPrioritetnoCache = data;
  _adminPrioritetnoCacheTs = now;
  return data;
}

/* ── Matching helpers ────────────────────────────────────────────────── */

function _isFakturaKlub_(txt) {
  const entries = _adminLoadFakturaGrouped_();
  if (!entries.length) return false;
  return !!_matchGroupedEntryByText_(String(txt || ""), entries);
}

function _matchUgovorKlub_(txt) {
  const entries = _getAdminUgovorKlubovi_();
  if (!entries.length) return null;
  return _matchGroupedEntryByText_(String(txt || ""), entries);
}

function _isZastitarskaTvrtka_(txt) {
  const entries = _getAdminZastitarskeTvrtke_();
  if (!entries.length) return false;
  return !!_matchGroupedEntryByText_(String(txt || ""), entries);
}

function _isZdravstvenaUstanova_(txt) {
  const entries = _getAdminZdravstveneUstanove_();
  if (!entries.length) return false;
  return !!_matchGroupedEntryByText_(String(txt || ""), entries);
}

function _isPrioritetnoText_(txt) {
  const items = _getAdminPrioritetno_();
  if (!items || !items.length) return false;
  return sadrziJednuOdRijeci(String(txt || ""), items);
}

function _matchGroupedEntryByTextDetailed_(text, groupedEntries) {
  const detail = _matchGroupedEntryDetailedByText_(String(text || ""), groupedEntries);
  if (!detail || !detail.entry) return null;

  return {
    entry: detail.entry,
    mode: detail.mode,
    term: detail.term,
    totalDist: detail.totalDist || 0,
    exactCount: detail.exactCount || 0,
    termLen: detail.termLen || 0,
    tokenCount: detail.tokenCount || 0,
    matchedText: detail.matchedSegment || detail.term,
    correctedText: String(detail.entry.name || "").trim()
  };
}

function _replaceOnlyMatchedSegmentForGroupedEntry_(text, detail) {
  const original = String(text || "");
  if (!original || !detail || !detail.entry) return original;

  const corrected = String(detail.entry.name || "").trim();
  if (!corrected) return original;

  const matchedSegment = String(detail.matchedText || detail.term || "").trim();
  if (!matchedSegment) return original;

  return _replaceMatchedSegmentOnly_(original, matchedSegment, corrected);
}

function _getFakturaCorrection_(txt) {
  const source = String(txt || "").trim();
  if (!source) return null;

  const entries = _adminLoadFakturaGrouped_();
  if (!entries.length) return null;

  const detail = _matchGroupedEntryDetailedByText_(source, entries);
  if (!detail || !detail.entry) return null;

  const correctedText = _replaceMatchedSegmentOnly_(
    source,
    String(detail.matchedSegment || detail.term || ""),
    String(detail.entry.name || "").trim()
  );

  return { entry: detail.entry, correctedText };
}

function _getUgovorCorrection_(txt) {
  const source = String(txt || "").trim();
  if (!source) return null;

  const entries = _getAdminUgovorKlubovi_();
  if (!entries.length) return null;

  const detail = _matchGroupedEntryDetailedByText_(source, entries);
  if (!detail || !detail.entry) return null;

  return {
    entry: detail.entry,
    correctedText: _replaceMatchedSegmentOnly_(
      source,
      String(detail.matchedSegment || detail.term || ""),
      String(detail.entry.name || "").trim()
    )
  };
}

/* ── Health institution correction ───────────────────────────────────── */

function _isProtectedHealthAcronym_(term) {
  const t = _normPhrase_(term).replace(/\s+/g, "").toUpperCase();
  if (!t) return false;

  const protectedSet = {
    KB: true,
    KBC: true,
    OB: true,
    DZ: true,
    HZJZ: true,
    ZZJZ: true,
    NZJZ: true
  };

  return !!protectedSet[t];
}

function _getZdravstvenaCorrection_(txt) {
  const source = String(txt || "").trim();
  if (!source) return null;

  const entries = _getAdminZdravstveneUstanove_();
  if (!entries.length) return null;

  const detail = _matchGroupedEntryDetailedByText_(source, entries);
  if (!detail || !detail.entry) return null;

  const correctedName = String(detail.entry.name || "").trim();
  const matchedTerm = String(detail.term || "").trim();

  if (!correctedName || !matchedTerm) return null;

  if (detail.mode === "fuzzy") {
    if (_isProtectedHealthAcronym_(matchedTerm)) return null;
    if (_isProtectedHealthAcronym_(detail.matchedSegment || "")) return null;
  }

  return {
    entry: detail.entry,
    correctedText: _replaceMatchedSegmentOnly_(
      source,
      String(detail.matchedSegment || matchedTerm),
      correctedName
    )
  };
}

/* ── Paid label helpers ──────────────────────────────────────────────── */

function _stripPlTag_(txt) {
  let s = String(txt || "");

  s = s.replace(/\s*\d+(?:[.,]\d+)?\s*(?:€|E)?\s*P\s*L\b/gi, " ");
  s = s.replace(/\s*P\s*L\s+\d+(?:[.,]\d+)?\s*(?:€|E)\b/gi, " ");
  s = s.replace(/\s*(?:€|E)\s*P\s*L\s+\d+(?:[.,]\d+)?\b/gi, " ");

  return s.replace(/\s{2,}/g, " ").trim();
}

function _extractPlTag_(txt) {
  const s = String(txt || "");

  let m = s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:€|E)?\s*P\s*L\b/i);
  if (m) return _buildBillingSegmentPaid_(_normalizeMoneyAmountToken_(m[1]));

  m = s.match(/\bP\s*L\s+(\d+(?:[.,]\d+)?)\s*(?:€|E)\b/i);
  if (m) return _buildBillingSegmentPaid_(_normalizeMoneyAmountToken_(m[1]));

  return "";
}

function _buildPlTag_(price) {
  return _buildBillingSegmentPaid_(_normalizeMoneyAmountToken_(price));
}

function _ensurePlTag_(txt, price) {
  const base = _stripPlTag_(txt);
  const tag = _buildPlTag_(price);
  return base ? (base + " " + tag).trim() : tag;
}

function _normalizeSinglePlTag_(txt, fallbackPrice) {
  const raw = String(txt || "").trim();
  if (!raw) return raw;

  const billingRes = _transformBillingStateInH_(raw);
  if (billingRes && billingRes.state === "PAID") return billingRes.text;

  const existing = _extractPlTag_(raw);
  const priceTag = existing || (fallbackPrice ? _buildPlTag_(fallbackPrice) : "");
  const base = _stripPlTag_(raw);

  if (!priceTag) return base;
  return base ? (base + " " + priceTag).trim() : priceTag;
}

/* ── Billing helpers for column H ────────────────────────────────────── */

function _normalizeMoneyAmountToken_(rawAmount) {
  const num = String(rawAmount || "").trim().replace(",", ".");
  if (!num) return "";

  const n = Number(num);
  if (!isFinite(n)) return "";

  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

function _extractBillingAmountFromText_(txt) {
  const s = String(txt || "");

  let m = s.match(/\b(\d+(?:[.,]\d+)?)\s*(?:€|E)?\s*P\s*L\b/i);
  if (m) return _normalizeMoneyAmountToken_(m[1]);

  m = s.match(/(?:^|[^A-Z0-9])(\d+(?:[.,]\d+)?)\s*(?:€|E)(?![A-Z0-9])/i);
  if (m) return _normalizeMoneyAmountToken_(m[1]);

  return "";
}

function _hasBillingAmountInText_(txt) {
  return !!_extractBillingAmountFromText_(txt);
}

function _containsPlMarker_(txt) {
  const s = String(txt || "");

  return /\b\d+(?:[.,]\d+)?\s*(?:€|E)?\s*P\s*L\b/i.test(s)
      || /\bP\s*L\b/i.test(s);
}

function _containsNaplatitiMarker_(txt) {
  return /\bNAPLATITI\b/i.test(String(txt || ""));
}

function _removeBillingTokensPreserveRest_(txt) {
  let s = String(txt || "");

  s = s.replace(/\bNAPLATITI\b/gi, " ");
  s = s.replace(/\b\d+(?:[.,]\d+)?\s*(?:€|E)?\s*P\s*L\b/gi, " ");
  s = s.replace(/\bP\s*L\b/gi, " ");

  s = s.replace(/(^|[^A-Z0-9])\d+(?:[.,]\d+)?\s*(?:€|E)(?![A-Z0-9])/gi, function(full, lead) {
    return lead || " ";
  });

  return s.replace(/\s{2,}/g, " ").trim();
}

function _buildBillingSegmentPending_(amountNorm) {
  return "NAPLATITI " + amountNorm + " €";
}

function _buildBillingSegmentPaid_(amountNorm) {
  return amountNorm + " € PL";
}

function _composeHWithBillingSegment_(baseText, billingSegment) {
  const base = String(baseText || "").trim();
  const seg = String(billingSegment || "").trim();

  if (!seg) return base;
  return base ? (base + " " + seg).replace(/\s{2,}/g, " ").trim() : seg;
}

function _transformBillingStateInH_(txt) {
  const raw = String(txt || "").trim();
  if (!raw) return null;

  const amount = _extractBillingAmountFromText_(raw);
  if (!amount) return null;

  const hasPl = _containsPlMarker_(raw);
  const base = _removeBillingTokensPreserveRest_(raw);

  if (hasPl) {
    return {
      text: _composeHWithBillingSegment_(base, _buildBillingSegmentPaid_(amount)),
      state: "PAID",
      amount: amount
    };
  }

  return {
    text: _composeHWithBillingSegment_(base, _buildBillingSegmentPending_(amount)),
    state: "PENDING",
    amount: amount
  };
}

function _buildHRichTextTaggedParts_(txt) {
  const text = String(txt || "");
  const parts = [];

  let m;

  const edukRx = /\bEDUKACIJA\b/gi;
  while ((m = edukRx.exec(text)) !== null) {
    parts.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      style: SpreadsheetApp.newTextStyle()
        .setBold(true)
        .setForegroundColor(BOJA_EDUKACIJA)
        .build()
    });
  }

  const faktRx = /\bFAKTURA\b/gi;
  while ((m = faktRx.exec(text)) !== null) {
    parts.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      style: SpreadsheetApp.newTextStyle()
        .setBold(true)
        .setForegroundColor("#000000")
        .build()
    });
  }

  const pendingRx = /\bNAPLATITI\s+(\d+(?:[.,]\d+)?)\s*€/gi;
  while ((m = pendingRx.exec(text)) !== null) {
    const whole = m[0];
    const start = m.index;
    const napStart = start;
    const napEnd = start + "NAPLATITI".length;

    parts.push({
      text: "NAPLATITI",
      start: napStart,
      end: napEnd,
      style: SpreadsheetApp.newTextStyle()
        .setBold(true)
        .setForegroundColor("#cc0000")
        .build()
    });

    const amountMatch = whole.match(/(\d+(?:[.,]\d+)?)\s*€/i);
    if (amountMatch) {
      const rel = whole.indexOf(amountMatch[0]);
      const absStart = start + rel;
      const absEnd = absStart + amountMatch[0].length;

      parts.push({
        text: amountMatch[0],
        start: absStart,
        end: absEnd,
        style: SpreadsheetApp.newTextStyle()
          .setBold(true)
          .setForegroundColor("#000000")
          .build()
      });
    }
  }

  const paidRx = /(\d+(?:[.,]\d+)?)\s*€\s+PL\b/gi;
  while ((m = paidRx.exec(text)) !== null) {
    const whole = m[0];
    const start = m.index;
    const plRel = whole.toUpperCase().lastIndexOf("PL");

    if (plRel >= 0) {
      parts.push({
        text: "PL",
        start: start + plRel,
        end: start + plRel + 2,
        style: SpreadsheetApp.newTextStyle()
          .setBold(true)
          .setForegroundColor("#000000")
          .build()
      });
    }
  }

  return parts;
}

/* ── Prompt / throttle helpers ───────────────────────────────────────── */

function _ugovorPromptAskKey_(sheet, row) {
  return "ugovorAsked_" + sheet.getSheetId() + "_" + row + "_" + _todayZg_();
}

function _ugovorPromptCacheKey_(sheet, row) {
  return "ugovorPrompt_" + sheet.getSheetId() + "_" + _todayZg_() + "_" + row;
}

function _shouldAskUgovorNow_(sheet, row) {
  return _shouldAskCachedPromptNow_(_ugovorPromptCacheKey_(sheet, row), UGOVOR_PROMPT_TTL_SEC);
}

function _hasAskedUgovorToday_(sheet, row) {
  try {
    return !!PropertiesService.getScriptProperties().getProperty(_ugovorPromptAskKey_(sheet, row));
  } catch (e) {
    return false;
  }
}

function _markAskedUgovorToday_(sheet, row) {
  try {
    PropertiesService.getScriptProperties().setProperty(_ugovorPromptAskKey_(sheet, row), "1");
  } catch (e) {}
}

function _clearAskedUgovorToday_(sheet, row) {
  try {
    PropertiesService.getScriptProperties().deleteProperty(_ugovorPromptAskKey_(sheet, row));
  } catch (e) {}
}

/* ── Contract club alert handler ─────────────────────────────────────── */

function _handleUgovorKlubAlert_(sheet, row, vH) {
  const raw = String(vH || "").trim();
  if (!raw) return vH;

  if (_isFakturaKlub_(raw)) return raw;

  const rawWithoutPl = _stripPlTag_(raw);

  const correction = _getUgovorCorrection_(rawWithoutPl);
  if (!correction || !correction.entry) {
    return _normalizeSinglePlTag_(raw, null);
  }

  const klub = correction.entry;
  const correctedBase = String(correction.correctedText || rawWithoutPl).trim();
  const existingPl = _extractPlTag_(raw);

  if (existingPl) {
    return _normalizeSinglePlTag_(correctedBase + " " + existingPl, klub.price);
  }

  if (!_shouldAskUgovorNow_(sheet, row)) {
    return correctedBase;
  }

  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      "💰 CONTRACT CLIENT / CLUB",
      "═══════════════════════════════\n\n" +
      klub.name + "\nPrice: " + klub.price + " €\n\n" +
      "Add \"" + klub.price + " € PL\" to column H?\n\n" +
      "═══════════════════════════════",
      ui.ButtonSet.YES_NO
    );

    if (result === ui.Button.YES) {
      return _ensurePlTag_(correctedBase, klub.price);
    }

    return correctedBase;
  } catch (e) {
    console.error("_handleUgovorKlubAlert_ UI error:", e && e.stack ? e.stack : e);
    return correctedBase;
  }
}

/* ── Admin UI backend callbacks: invoice clients ────────────────────── */

function adminConfig_SaveFakturaKlijent(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Name is required.");

  const arr = _adminLoadFakturaGrouped_();
  const all = new Set();

  arr.forEach(g => {
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
  });

  if (all.has(n.toLowerCase())) throw new Error('"' + n + '" already exists.');

  arr.push({ name: n, aliases: [] });
  _adminSaveFakturaGrouped_(arr);
}

function adminConfig_DeleteFakturaKlijent(name) {
  const n = String(name || "").trim();
  const arr = _adminLoadFakturaGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === n.toLowerCase());

  if (idx === -1) throw new Error('"' + n + '" does not exist.');

  arr.splice(idx, 1);
  _adminSaveFakturaGrouped_(arr);
}

function adminConfig_AddFakturaAlias(jsonStr) {
  const { company, alias } = JSON.parse(jsonStr);
  const a = String(alias || "").trim();

  if (!a) throw new Error("Alias is required.");

  const arr = _adminLoadFakturaGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

  if (idx === -1) throw new Error('"' + company + '" does not exist.');

  const all = new Set();
  arr.forEach(g => {
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(x => all.add(x.toLowerCase()));
  });

  if (all.has(a.toLowerCase())) throw new Error('"' + a + '" already exists.');

  arr[idx].aliases.push(a);
  _adminSaveFakturaGrouped_(arr);
}

function adminConfig_DeleteFakturaAlias(jsonStr) {
  const { company, alias } = JSON.parse(jsonStr);
  const arr = _adminLoadFakturaGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

  if (idx === -1) throw new Error('"' + company + '" does not exist.');

  const ai = arr[idx].aliases.findIndex(a => a.toLowerCase() === String(alias || "").toLowerCase());

  if (ai === -1) throw new Error('"' + alias + '" does not exist.');

  arr[idx].aliases.splice(ai, 1);
  _adminSaveFakturaGrouped_(arr);
}

function adminConfig_UpdateFakturaRow(jsonStr) {
  const { oldName, newName } = JSON.parse(jsonStr);
  const on = String(oldName || "").trim();
  const nn = String(newName || "").trim();

  if (!on || !nn) throw new Error("Name is required.");

  const arr = _adminLoadFakturaGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === on.toLowerCase());

  if (idx === -1) throw new Error('"' + on + '" does not exist.');

  const all = new Set();
  arr.forEach((g, i) => {
    if (i === idx) return;
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
  });

  if (all.has(nn.toLowerCase())) throw new Error('"' + nn + '" already exists.');

  arr[idx].name = nn;
  _adminSaveFakturaGrouped_(arr);
}

/* ── Admin UI backend callbacks: contract clubs ─────────────────────── */

function adminConfig_SaveUgovorKlub(jsonStr) {
  const { name, price } = JSON.parse(jsonStr);
  const n = String(name || "").trim();
  const p = Number(price) || 0;

  if (!n) throw new Error("Name is required.");
  if (p <= 0) throw new Error("Price must be greater than 0.");

  const arr = _adminLoadUgovorGrouped_();
  const all = new Set();

  arr.forEach(g => {
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
  });

  if (all.has(n.toLowerCase())) throw new Error('"' + n + '" already exists.');

  arr.push({ name: n, aliases: [], price: p });
  _adminSaveUgovorGrouped_(arr);
}

function adminConfig_DeleteUgovorKlub(name) {
  const n = String(name || "").trim();
  const arr = _adminLoadUgovorGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === n.toLowerCase());

  if (idx === -1) throw new Error('"' + n + '" does not exist.');

  arr.splice(idx, 1);
  _adminSaveUgovorGrouped_(arr);
}

function adminConfig_AddUgovorAlias(jsonStr) {
  const { company, alias } = JSON.parse(jsonStr);
  const a = String(alias || "").trim();

  if (!a) throw new Error("Alias is required.");

  const arr = _adminLoadUgovorGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

  if (idx === -1) throw new Error('"' + company + '" does not exist.');

  const all = new Set();
  arr.forEach(g => {
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(x => all.add(x.toLowerCase()));
  });

  if (all.has(a.toLowerCase())) throw new Error('"' + a + '" already exists.');

  arr[idx].aliases.push(a);
  _adminSaveUgovorGrouped_(arr);
}

function adminConfig_DeleteUgovorAlias(jsonStr) {
  const { company, alias } = JSON.parse(jsonStr);
  const arr = _adminLoadUgovorGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

  if (idx === -1) throw new Error('"' + company + '" does not exist.');

  const ai = arr[idx].aliases.findIndex(a => a.toLowerCase() === String(alias || "").toLowerCase());

  if (ai === -1) throw new Error('"' + alias + '" does not exist.');

  arr[idx].aliases.splice(ai, 1);
  _adminSaveUgovorGrouped_(arr);
}

function adminConfig_UpdateUgovorPrice(jsonStr) {
  const { name, price } = JSON.parse(jsonStr);
  const p = Number(price) || 0;

  if (p <= 0) throw new Error("Price must be greater than 0.");

  const arr = _adminLoadUgovorGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === String(name || "").toLowerCase());

  if (idx === -1) throw new Error('"' + name + '" does not exist.');

  arr[idx].price = p;
  _adminSaveUgovorGrouped_(arr);
}

function adminConfig_UpdateUgovorRow(jsonStr) {
  const { oldName, newName, newPrice } = JSON.parse(jsonStr);
  const on = String(oldName || "").trim();
  const nn = String(newName || "").trim();
  const p = Number(newPrice) || 0;

  if (!on || !nn) throw new Error("Name is required.");
  if (p <= 0) throw new Error("Price must be greater than 0.");

  const arr = _adminLoadUgovorGrouped_();
  const idx = arr.findIndex(g => g.name.toLowerCase() === on.toLowerCase());

  if (idx === -1) throw new Error('"' + on + '" does not exist.');

  const all = new Set();
  arr.forEach((g, i) => {
    if (i === idx) return;
    all.add(g.name.toLowerCase());
    (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
  });

  if (all.has(nn.toLowerCase())) throw new Error('"' + nn + '" already exists.');

  arr[idx].name = nn;
  arr[idx].price = p;
  _adminSaveUgovorGrouped_(arr);
}

/* ── Generic grouped CRUD helper ─────────────────────────────────────── */

function _makeGroupedCrud_(loadFn, saveFn) {
  return {
    save: function(name) {
      const n = String(name || "").trim();
      if (!n) throw new Error("Name is required.");

      const arr = loadFn();
      const all = new Set();

      arr.forEach(g => {
        all.add(g.name.toLowerCase());
        (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
      });

      if (all.has(n.toLowerCase())) throw new Error('"' + n + '" already exists.');

      arr.push({ name: n, aliases: [] });
      saveFn(arr);
    },

    del: function(name) {
      const n = String(name || "").trim();
      const arr = loadFn();
      const idx = arr.findIndex(g => g.name.toLowerCase() === n.toLowerCase());

      if (idx === -1) throw new Error('"' + n + '" does not exist.');

      arr.splice(idx, 1);
      saveFn(arr);
    },

    addAlias: function(jsonStr) {
      const { company, alias } = JSON.parse(jsonStr);
      const a = String(alias || "").trim();

      if (!a) throw new Error("Alias is required.");

      const arr = loadFn();
      const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

      if (idx === -1) throw new Error('"' + company + '" does not exist.');

      const all = new Set();
      arr.forEach(g => {
        all.add(g.name.toLowerCase());
        (g.aliases || []).forEach(x => all.add(x.toLowerCase()));
      });

      if (all.has(a.toLowerCase())) throw new Error('"' + a + '" already exists.');

      arr[idx].aliases.push(a);
      saveFn(arr);
    },

    delAlias: function(jsonStr) {
      const { company, alias } = JSON.parse(jsonStr);
      const arr = loadFn();
      const idx = arr.findIndex(g => g.name.toLowerCase() === String(company || "").toLowerCase());

      if (idx === -1) throw new Error('"' + company + '" does not exist.');

      const ai = arr[idx].aliases.findIndex(a => a.toLowerCase() === String(alias || "").toLowerCase());

      if (ai === -1) throw new Error('"' + alias + '" does not exist.');

      arr[idx].aliases.splice(ai, 1);
      saveFn(arr);
    },

    updateRow: function(jsonStr) {
      const { oldName, newName } = JSON.parse(jsonStr);
      const on = String(oldName || "").trim();
      const nn = String(newName || "").trim();

      if (!on || !nn) throw new Error("Name is required.");

      const arr = loadFn();
      const idx = arr.findIndex(g => g.name.toLowerCase() === on.toLowerCase());

      if (idx === -1) throw new Error('"' + on + '" does not exist.');

      const all = new Set();
      arr.forEach((g, i) => {
        if (i === idx) return;
        all.add(g.name.toLowerCase());
        (g.aliases || []).forEach(a => all.add(a.toLowerCase()));
      });

      if (all.has(nn.toLowerCase())) throw new Error('"' + nn + '" already exists.');

      arr[idx].name = nn;
      saveFn(arr);
    }
  };
}

const _zastCrud_ = _makeGroupedCrud_(
  _adminLoadZastitarskeTvrtkeGrouped_,
  _adminSaveZastitarskeTvrtkeGrouped_
);

const _zdrCrud_ = _makeGroupedCrud_(
  _adminLoadZdravstveneUstanoveGrouped_,
  _adminSaveZdravstveneUstanoveGrouped_
);

/* ── Admin UI backend callbacks: security companies ─────────────────── */

function adminConfig_SaveZastitarskaTvrtka(n) {
  _zastCrud_.save(n);
}

function adminConfig_DeleteZastitarskaTvrtka(n) {
  _zastCrud_.del(n);
}

function adminConfig_AddZastitarskaAlias(j) {
  _zastCrud_.addAlias(j);
}

function adminConfig_DeleteZastitarskaAlias(j) {
  _zastCrud_.delAlias(j);
}

function adminConfig_UpdateZastitarskaRow(j) {
  _zastCrud_.updateRow(j);
}

/* ── Admin UI backend callbacks: health institutions ────────────────── */

function adminConfig_SaveZdravstvenaUstanova(n) {
  _zdrCrud_.save(n);
}

function adminConfig_DeleteZdravstvenaUstanova(n) {
  _zdrCrud_.del(n);
}

function adminConfig_AddZdravstvenaAlias(j) {
  _zdrCrud_.addAlias(j);
}

function adminConfig_DeleteZdravstvenaAlias(j) {
  _zdrCrud_.delAlias(j);
}

function adminConfig_UpdateZdravstvenaRow(j) {
  _zdrCrud_.updateRow(j);
}

/* ── Admin UI backend callbacks: priority rules ─────────────────────── */

function adminConfig_SavePrioritetno(value) {
  const n = String(value || "").trim();
  if (!n) throw new Error("Value is required.");

  const arr = _adminLoadPrioritetnoList_();

  if (arr.some(x => _normTxt_(x) === _normTxt_(n))) {
    throw new Error('"' + n + '" already exists.');
  }

  arr.push(n);
  _adminSavePrioritetnoList_(arr);
}

function adminConfig_DeletePrioritetno(value) {
  const n = String(value || "").trim();
  const arr = _adminLoadPrioritetnoList_();
  const idx = arr.findIndex(x => _normTxt_(x) === _normTxt_(n));

  if (idx === -1) throw new Error('"' + n + '" does not exist.');

  arr.splice(idx, 1);
  _adminSavePrioritetnoList_(arr);
}

function adminConfig_UpdatePrioritetnoRow(jsonStr) {
  const { oldValue, newValue } = JSON.parse(jsonStr);
  const ov = String(oldValue || "").trim();
  const nv = String(newValue || "").trim();

  if (!ov || !nv) throw new Error("Value is required.");

  const arr = _adminLoadPrioritetnoList_();
  const idx = arr.findIndex(x => _normTxt_(x) === _normTxt_(ov));

  if (idx === -1) throw new Error('"' + ov + '" does not exist.');

  if (arr.some((x, i) => i !== idx && _normTxt_(x) === _normTxt_(nv))) {
    throw new Error('"' + nv + '" already exists.');
  }

  arr[idx] = nv;
  _adminSavePrioritetnoList_(arr);
}

/* ═══════════════════════════════════════════════════════════════════════
 * 26 · ANNOUNCEMENTS — Patient, company and keyword announcement system
 * ═══════════════════════════════════════════════════════════════════════ */

const ADMIN_NAJAVE_KEY        = "admin_najave_v1";
const ADMIN_NAJAVE_AUTORI_KEY = "admin_najave_autori_v1";

/* ── Load / save: announcements ──────────────────────────────────────── */

function _adminLoadNajave_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ADMIN_NAJAVE_KEY);
    if (!raw) return [];

    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function _adminSaveNajave_(arr) {
  PropertiesService.getScriptProperties()
    .setProperty(ADMIN_NAJAVE_KEY, JSON.stringify(arr || []));
}

/* ── Load / save: announcement authors ───────────────────────────────── */

function _adminLoadNajaveAutori_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(ADMIN_NAJAVE_AUTORI_KEY);
    if (!raw) return [];

    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.map(a => String(a || "").trim()).filter(Boolean)
      : [];
  } catch (e) {
    return [];
  }
}

function _adminSaveNajaveAutori_(arr) {
  PropertiesService.getScriptProperties()
    .setProperty(ADMIN_NAJAVE_AUTORI_KEY, JSON.stringify(arr || []));
}

/* ── Cleanup ─────────────────────────────────────────────────────────── */

function _najavaCleanupStale_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(ADMIN_NAJAVE_KEY);
    if (!raw) return;

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 2);

    const cutoffStr = Utilities.formatDate(cutoff, "Europe/Zagreb", "yyyy-MM-dd");

    const filtered = arr.filter(n => {
      if (!n.dates || !n.dates.length) return false;
      return n.dates[n.dates.length - 1] >= cutoffStr;
    });

    if (filtered.length !== arr.length) {
      props.setProperty(ADMIN_NAJAVE_KEY, JSON.stringify(filtered));
      console.log("Announcement cleanup: removed " + (arr.length - filtered.length) + " stale announcement(s)");
    }
  } catch (e) {
    console.error("_najavaCleanupStale_ error:", e && e.stack ? e.stack : e);
  }
}

/* ── Token matching ──────────────────────────────────────────────────── */

function _najavaTokenize_(text) {
  return String(text || "")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function _najavaLevenshtein1_(a, b) {
  if (a === b) return true;

  const la = a.length;
  const lb = b.length;

  if (Math.abs(la - lb) > 1) return false;

  if (la === lb) {
    let diffs = 0;

    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false;
    }

    return true;
  }

  const longer = la > lb ? a : b;
  const shorter = la > lb ? b : a;

  let i = 0;
  let j = 0;
  let skipped = false;

  while (i < longer.length && j < shorter.length) {
    if (longer[i] !== shorter[j]) {
      if (skipped) return false;
      skipped = true;
      i++;
    } else {
      i++;
      j++;
    }
  }

  return true;
}

function _najavaTokenMatch_(triggerToken, textToken) {
  if (triggerToken === textToken) return true;
  if (triggerToken.length <= 4) return false;

  return _najavaLevenshtein1_(triggerToken, textToken);
}

function _najavaMatch_(trigger, text) {
  const triggerTokens = _najavaTokenize_(String(trigger || ""));
  const textTokens = _najavaTokenize_(String(text || ""));

  if (!triggerTokens.length || !textTokens.length) return false;

  return triggerTokens.every(triggerToken =>
    textTokens.some(textToken => _najavaTokenMatch_(triggerToken, textToken))
  );
}

/* ── Handled-row cache ───────────────────────────────────────────────── */

function _najavaCacheKey_(sheetId, row) {
  const today = Utilities.formatDate(new Date(), "Europe/Zagreb", "yyyy-MM-dd");
  return "najava_handled_" + sheetId + "_" + row + "_" + today;
}

function _isNajavaHandled_(sheetId, row) {
  try {
    return !!CacheService.getScriptCache().get(_najavaCacheKey_(sheetId, row));
  } catch (e) {
    return false;
  }
}

function _markNajavaHandled_(sheetId, row) {
  try {
    CacheService.getScriptCache().put(_najavaCacheKey_(sheetId, row), "1", 86400);
  } catch (e) {}
}

/* ── Announcement check and display ──────────────────────────────────── */

function _provjeriNajaveZaRed_(sheet, row, editedCol) {
  if (!sheet || row <= 1) return;
  if (_isQuietHours_() || _isResetInProgress_()) return;
  if (_isNajavaHandled_(sheet.getSheetId(), row)) return;

  const today = Utilities.formatDate(new Date(), "Europe/Zagreb", "yyyy-MM-dd");
  const najave = _adminLoadNajave_();

  if (!najave.length) return;

  const col = Number(editedCol);

  const bVal = (col === STUPAC_B || col === STUPAC_C)
    ? String(sheet.getRange(row, STUPAC_B).getDisplayValue() || "").trim()
    : "";

  const cVal = (col === STUPAC_C || col === STUPAC_I)
    ? String(sheet.getRange(row, STUPAC_C).getDisplayValue() || "").trim()
    : "";

  const hVal = (col === STUPAC_H)
    ? String(sheet.getRange(row, STUPAC_H).getDisplayValue() || "").trim()
    : "";

  const iVal = (col === STUPAC_I)
    ? String(sheet.getRange(row, STUPAC_I).getDisplayValue() || "").trim()
    : "";

  let match = null;

  if ((col === STUPAC_B || col === STUPAC_C) && bVal && cVal) {
    match = najave.find(n =>
      n.type === "pacijent" &&
      Array.isArray(n.dates) &&
      n.dates.includes(today) &&
      _najavaMatch_(n.trigger || n.name || "", bVal)
    );
  }

  if (!match && col === STUPAC_H && hVal) {
    match = najave.find(n =>
      n.type === "tvrtka" &&
      Array.isArray(n.dates) &&
      n.dates.includes(today) &&
      _najavaMatch_(n.trigger || "", hVal)
    );
  }

  if (!match && (col === STUPAC_C || col === STUPAC_I)) {
    const searchVal = col === STUPAC_C ? cVal : iVal;

    if (searchVal) {
      match = najave.find(n =>
        n.type === "kljucnarijec" &&
        Array.isArray(n.dates) &&
        n.dates.includes(today) &&
        _najavaMatch_(n.trigger || "", searchVal)
      );
    }
  }

  if (!match) return;

  const displayTrigger = String(match.trigger || match.name || "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  _najavaShowModal_(
    displayTrigger,
    match.message,
    match.author || "",
    match.type || "pacijent",
    match.action || null,
    row,
    sheet.getSheetId()
  );
}

/* ── Modal ───────────────────────────────────────────────────────────── */

function _najavaShowModal_(displayTrigger, message, author, type, action, row, sheetId) {
  const safeData = JSON.stringify({
    trigger: String(displayTrigger || ""),
    message: String(message || ""),
    author: String(author || ""),
    type: String(type || "pacijent"),
    action: action || null,
    row: Number(row),
    sheetId: Number(sheetId)
  }).replace(/<\/script/gi, "<\\/script");

  const html =
'<!doctype html><html><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<link rel="preconnect" href="https://fonts.googleapis.com">' +
'<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">' +
'<style>' +
'*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}' +
':root{--bg:#f8fafc;--surface:#fff;--border:#e2e8f0;--text:#0f172a;--muted:#64748b;' +
'--red:#b91c1c;--red-l:#fef2f2;--red-b:#fecaca;--blue:#2563eb;--grn:#16a34a;--grn-l:#f0fdf4;}' +
'html,body{height:100%;font-family:"DM Sans",system-ui,sans-serif;background:var(--bg);color:var(--text)}' +
'.wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:22px}' +
'.card{background:var(--surface);border:1px solid var(--border);border-radius:24px;' +
'padding:36px 32px 28px;width:100%;max-width:560px;' +
'box-shadow:0 20px 60px rgba(15,23,42,.11),0 4px 16px rgba(15,23,42,.06)}' +
'.header{display:flex;align-items:center;gap:16px;margin-bottom:24px}' +
'.icon-wrap{width:56px;height:56px;background:var(--red-l);border-radius:16px;' +
'display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;' +
'box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}' +
'.htxt{flex:1}.htitle{font-size:21px;font-weight:800;letter-spacing:-.03em;color:var(--text)}' +
'.hsub{font-size:14px;color:var(--muted);margin-top:3px}' +
'.trigger-box{font-size:15px;font-weight:700;color:var(--red);' +
'background:var(--red-l);border:1px solid var(--red-b);' +
'border-radius:10px;padding:10px 16px;margin-bottom:20px;' +
'display:flex;align-items:center;gap:10px}' +
'.msg-box{background:var(--bg);border:1px solid var(--border);' +
'border-radius:14px;padding:22px 24px;margin-bottom:28px}' +
'.msg-text{font-size:16px;font-weight:600;color:var(--text);' +
'line-height:1.7;white-space:pre-wrap;word-break:break-word}' +
'.msg-author{margin-top:12px;font-size:13px;font-style:italic;' +
'color:var(--muted);text-align:right}' +
'.actions{display:flex;gap:10px;flex-wrap:wrap}' +
'.btn{flex:1;min-width:120px;padding:13px 16px;border-radius:12px;' +
'font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;border:none;' +
'transition:all .15s;letter-spacing:-.01em}' +
'.btn-sec{background:var(--bg);border:1.5px solid var(--border);color:var(--muted)}' +
'.btn-sec:hover{background:#f1f5f9;border-color:#cbd5e1;color:var(--text)}' +
'.btn-pri{background:linear-gradient(180deg,#2f6df6 0%,#2563eb 100%);color:#fff;' +
'box-shadow:0 8px 20px rgba(37,99,235,.18),inset 0 1px 0 rgba(255,255,255,.15)}' +
'.btn-pri:hover:not(:disabled){background:linear-gradient(180deg,#2a63de 0%,#1d4ed8 100%)}' +
'.btn-grn{background:linear-gradient(180deg,#22c55e 0%,#16a34a 100%);color:#fff;' +
'box-shadow:0 8px 20px rgba(22,163,74,.18),inset 0 1px 0 rgba(255,255,255,.15)}' +
'.btn-grn:hover:not(:disabled){background:linear-gradient(180deg,#16a34a 0%,#15803d 100%)}' +
'.btn-pri:disabled,.btn-grn:disabled{opacity:.5;cursor:default;box-shadow:none}' +
'.status{text-align:center;font-size:13px;color:var(--muted);margin-top:12px;min-height:18px}' +
'</style></head><body>' +
'<div class="wrap"><div class="card">' +
'<div class="header">' +
'<div class="icon-wrap" id="iconWrap">📋</div>' +
'<div class="htxt"><div class="htitle">Najava</div><div class="hsub" id="subtitleEl"></div></div>' +
'</div>' +
'<div class="trigger-box"><span id="triggerIcon"></span><span id="triggerText"></span></div>' +
'<div class="msg-box">' +
'<div class="msg-text" id="msgText"></div>' +
'<div class="msg-author" id="msgAuthor"></div>' +
'</div>' +
'<div class="actions" id="actionsEl"></div>' +
'<div class="status" id="status"></div>' +
'</div></div>' +
'<script>' +
'var D=' + safeData + ';' +
'var ICONS={pacijent:"👤",tvrtka:"🏢",kljucnarijec:"🏷️"};' +
'var SUBS={pacijent:"Primljena najava za danas",tvrtka:"Obavijest za tvrtku",kljucnarijec:"Obavijest za vrstu pregleda"};' +
'document.getElementById("iconWrap").textContent=ICONS[D.type]||"📋";' +
'document.getElementById("subtitleEl").textContent=SUBS[D.type]||"Obavijest";' +
'document.getElementById("triggerIcon").textContent=ICONS[D.type]||"📋";' +
'document.getElementById("triggerText").textContent=D.trigger;' +
'document.getElementById("msgText").textContent=D.message;' +
'document.getElementById("msgAuthor").textContent=D.author?("— "+D.author):"";' +
'var acts=document.getElementById("actionsEl");' +
'var st=document.getElementById("status");' +

'var dismissBtn=document.createElement("button");' +
'dismissBtn.className="btn btn-sec";dismissBtn.textContent="Odbaci";' +
'dismissBtn.onclick=function(){dismissBtn.disabled=true;' +
'  google.script.run' +
'    .withSuccessHandler(function(){google.script.host.close();})' +
'    .withFailureHandler(function(){google.script.host.close();})' +
'    .najavaOdbaci(D.row,D.sheetId);' +
'};' +
'acts.appendChild(dismissBtn);' +

'if(D.type==="pacijent"){' +
'  var copyBtn=document.createElement("button");' +
'  copyBtn.className="btn btn-pri";copyBtn.textContent="Kopiraj u stupac I";' +
'  copyBtn.onclick=function(){' +
'    copyBtn.disabled=true;st.textContent="Kopiranje\u2026";' +
'    google.script.run' +
'      .withSuccessHandler(function(){google.script.host.close();})' +
'      .withFailureHandler(function(e){st.textContent="\u26D4 "+(e&&e.message?e.message:String(e));copyBtn.disabled=false;})' +
'      .najavaKopirajUStupacI(D.row,D.sheetId,D.message);' +
'  };' +
'  acts.appendChild(copyBtn);' +
'}' +

'if(D.action&&D.action.label){' +
'  var actionBtn=document.createElement("button");' +
'  actionBtn.className="btn btn-grn";actionBtn.textContent=D.action.label;' +
'  actionBtn.onclick=function(){' +
'    actionBtn.disabled=true;st.textContent="Primjenjujem\u2026";' +
'    google.script.run' +
'      .withSuccessHandler(function(){google.script.host.close();})' +
'      .withFailureHandler(function(e){st.textContent="\u26D4 "+(e&&e.message?e.message:String(e));actionBtn.disabled=false;})' +
'      .najavaIzvrsiAkciju(D.row,D.sheetId,D.action.writeCol,D.action.writeValue);' +
'  };' +
'  acts.appendChild(actionBtn);' +
'}' +
'<\/script></body></html>';

  try {
    SpreadsheetApp.getUi().showModalDialog(
      HtmlService.createHtmlOutput(html).setWidth(620).setHeight(510),
      "Najava"
    );
  } catch (e) {
    console.error("_najavaShowModal_ error:", e && e.stack ? e.stack : e);
  }
}

/* ── Google Apps Script callbacks ────────────────────────────────────── */

function najavaOdbaci(row, sheetId) {
  _markNajavaHandled_(Number(sheetId), Number(row));
}

function najavaKopirajUStupacI(row, sheetId, message) {
  const ss = _getSpreadsheet_();
  if (!ss) throw new Error("No spreadsheet context.");

  const sheet = ss.getSheets().find(sh => sh.getSheetId() === Number(sheetId));
  if (!sheet) throw new Error("Sheet was not found.");

  const r = Number(row);
  const sh = Number(sheetId);
  const msg = String(message || "").trim();

  if (!msg) return;

  const cellI = sheet.getRange(r, STUPAC_I);
  const existing = String(cellI.getDisplayValue() || "").trim();

  const finalText = existing
    ? (msg + " " + existing).replace(/\s{2,}/g, " ").trim()
    : (msg + " ");

  try {
    if (_isPrioritetnoText_(finalText)) {
      _handleICell_(sheet, r, cellI, finalText, sheet.getRange(r, STUPAC_B));
    } else {
      _refreshRowSystemMetaFromSheet_(sheet, r);
    }
  } catch (e) {
    console.error("najavaKopirajUStupacI priority sync error:", e && e.stack ? e.stack : e);
  }

  const baseStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily("Arial")
    .setFontSize(11)
    .setForegroundColor("#000000")
    .setBold(false)
    .build();

  const announcementStyle = SpreadsheetApp.newTextStyle()
    .setFontFamily("Roboto Mono")
    .setFontSize(14)
    .setForegroundColor("#A0293A")
    .setBold(true)
    .build();

  const builder = SpreadsheetApp.newRichTextValue().setText(finalText);
  builder.setTextStyle(0, finalText.length, baseStyle);
  builder.setTextStyle(0, Math.min(msg.length, finalText.length), announcementStyle);
  cellI.setRichTextValue(builder.build());

  _markNajavaHandled_(sh, r);
}

function najavaIzvrsiAkciju(row, sheetId, writeCol, writeValue) {
  const ss = _getSpreadsheet_();
  if (!ss) throw new Error("No spreadsheet context.");

  const sheet = ss.getSheets().find(sh => sh.getSheetId() === Number(sheetId));
  if (!sheet) throw new Error("Sheet was not found.");

  const r = Number(row);
  const sh = Number(sheetId);
  const col = String(writeCol || "").trim().toUpperCase();
  const val = String(writeValue || "").trim();

  if (!col || !val) return;

  const COL_MAP = {
    "B": STUPAC_B,
    "C": STUPAC_C,
    "D": STUPAC_D,
    "E": STUPAC_E,
    "F": STUPAC_F,
    "G": STUPAC_G,
    "H": STUPAC_H,
    "I": STUPAC_I,
    "J": STUPAC_J
  };

  const colIdx = COL_MAP[col];
  if (!colIdx) throw new Error("Unknown column: " + col);

  sheet.getRange(r, colIdx).setValue(val);

  if (colIdx === STUPAC_H) {
    try {
      _applyRulesForEdit_(sheet, sheet.getRange(r, colIdx), val, false);
    } catch (e) {
      console.error("najavaIzvrsiAkciju applyRules error:", e && e.stack ? e.stack : e);
    }
  }

  _markNajavaHandled_(sh, r);
}

/* ── Admin UI callbacks ──────────────────────────────────────────────── */

function adminConfig_SaveNajava(jsonStr) {
  const data = JSON.parse(jsonStr);

  const type = String(data.type || "pacijent").trim();
  const trigger = String(data.trigger || data.name || "").trim();
  const dates = Array.isArray(data.dates) ? data.dates : [];
  const message = String(data.message || "").trim();
  const author = String(data.author || "").trim();
  const action = (data.action && data.action.label) ? data.action : null;

  if (!trigger) throw new Error("Trigger is required.");
  if (!dates.length) throw new Error("Select at least one date.");
  if (!message) throw new Error("Message is required.");

  const arr = _adminLoadNajave_();
  arr.push({ type, trigger, dates, message, author, action });

  _adminSaveNajave_(arr);
}

function adminConfig_DeleteNajava(index) {
  const arr = _adminLoadNajave_();
  const idx = Number(index);

  if (idx < 0 || idx >= arr.length) {
    throw new Error("Announcement does not exist.");
  }

  arr.splice(idx, 1);
  _adminSaveNajave_(arr);
}

function adminConfig_SaveNajavaAutor(name) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Name is required.");

  const arr = _adminLoadNajaveAutori_();

  if (arr.some(a => a.toLowerCase() === n.toLowerCase())) {
    throw new Error('"' + n + '" already exists.');
  }

  arr.push(n);
  _adminSaveNajaveAutori_(arr);
}

function adminConfig_DeleteNajavaAutor(name) {
  const n = String(name || "").trim();
  const arr = _adminLoadNajaveAutori_();
  const idx = arr.findIndex(a => a.toLowerCase() === n.toLowerCase());

  if (idx === -1) {
    throw new Error('"' + n + '" does not exist.');
  }

  arr.splice(idx, 1);
  _adminSaveNajaveAutori_(arr);
}


/**
 * ═══════════════════════════════════════════════════════════════════════
 * 27 · REPORT EXPORT BACKEND — XLSX save, auto-restore baseline and failsafe
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Saves the full spreadsheet as XLSX into:
 * REPORT_ROOT_FOLDER_ID / YEAR / MONTH / dd.MM.yyyy. WORKFLOW_REGISTER.xlsx
 *
 * Behavior:
 * - If a file with the same name already exists in the target month folder,
 *   only that file is moved to Trash.
 * - The new XLSX file receives an AUTO-RESTORE baseline revision immediately.
 * - No email is sent.
 * - Failsafe trigger at 23:00 saves the report if it was not already saved
 *   for the date shown in A1.
 *
 * Requirements:
 * - Advanced Google Drive service must be enabled.
 * - REPORT_ROOT_FOLDER_ID must point to the target Drive folder.
 * ═══════════════════════════════════════════════════════════════════════
 */

const REPORT_ROOT_FOLDER_ID = "1BsaxmFBxmexIZgdePF4nLdNRcDYnyvDC";
const REPORT_TZ             = "Europe/Zagreb";

const REPORT_SENT_DATE_KEY          = "report_sent_date_yyyy_mm_dd";
const REPORT_SPREADSHEET_ID_PROP    = "SPREADSHEET_ID_BOUND";
const REPORT_TARGET_SHEET_FALLBACK  = "WORKFLOW_REGISTER";
const REPORT_FILE_BASE_NAME         = "WORKFLOW_REGISTER";

const REPORT_AUTO_RESTORE_TAG         = "AUTO-RESTORE";
const REPORT_AUTO_RESTORE_BASELINE_RE = /AUTO-RESTORE(?:\s+BASELINE_REV=([^\s]+))?/i;

const REPORT_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* ── Basic helpers ───────────────────────────────────────────────────── */

function _reportNormTxt_(s) {
  if (typeof _normTxt_ === "function") return _normTxt_(s);

  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function _hrMonthNameUpper_(dateObj) {
  const months = [
    "SIJEČANJ", "VELJAČA", "OŽUJAK", "TRAVANJ",
    "SVIBANJ", "LIPANJ", "SRPANJ", "KOLOVOZ",
    "RUJAN", "LISTOPAD", "STUDENI", "PROSINAC"
  ];

  return months[dateObj.getMonth()] || String(dateObj.getMonth() + 1);
}

function _getOrCreateFolderByName_(parentFolder, name) {
  const folderName = String(name || "").trim();
  if (!folderName) throw new Error("Folder name is empty.");

  const it = parentFolder.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();

  return parentFolder.createFolder(folderName);
}

function _getReportDateFromSheet_(sheet) {
  const v = sheet.getRange("A1").getValue();

  if (v instanceof Date && !isNaN(v.getTime())) {
    return v;
  }

  const s = String(sheet.getRange("A1").getDisplayValue() || "");
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);

  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  }

  return new Date();
}

function _exportSpreadsheetAsXlsxBlob_(spreadsheetId, filename) {
  const url = "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/export?format=xlsx";
  const token = ScriptApp.getOAuthToken();

  const resp = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: "Bearer " + token
    },
    muteHttpExceptions: true
  });

  const code = resp.getResponseCode();

  if (code < 200 || code >= 300) {
    throw new Error(
      "XLSX export failed (HTTP " + code + "): " +
      String(resp.getContentText()).slice(0, 200)
    );
  }

  return resp.getBlob()
    .setName(filename)
    .setContentType(REPORT_XLSX_MIME);
}

/* ── Auto-restore metadata helpers ───────────────────────────────────── */

function _upsertAutoRestoreBaselineInDesc_(desc, baselineRevId) {
  const currentDesc = String(desc || "");
  const hasTag = currentDesc
    .toLowerCase()
    .includes(REPORT_AUTO_RESTORE_TAG.toLowerCase());

  let out = currentDesc;

  if (!hasTag) {
    out = (out ? out + "\n" : "") + REPORT_AUTO_RESTORE_TAG;
  }

  out = out.replace(
    /AUTO-RESTORE\s+BASELINE_REV=[^\s]+/ig,
    REPORT_AUTO_RESTORE_TAG
  );

  out = out.replace(
    new RegExp(REPORT_AUTO_RESTORE_TAG, "i"),
    REPORT_AUTO_RESTORE_TAG + " BASELINE_REV=" + String(baselineRevId)
  );

  return out;
}

function _driveInsertXlsxWithDesc_(parentFolderId, filename, blob, description) {
  const resource = {
    title: filename,
    mimeType: REPORT_XLSX_MIME,
    description: String(description || ""),
    parents: [{ id: parentFolderId }]
  };

  const created = Drive.Files.insert(resource, blob);

  if (!created || !created.id) {
    throw new Error("Drive.Files.insert did not return a file ID.");
  }

  return {
    id: created.id,
    title: created.title || filename
  };
}

function _drivePinBaselineNow_(fileId) {
  const revList = Drive.Revisions.list(fileId, {
    fields: "items(id,pinned)"
  });

  const revs = revList.items || [];
  if (!revs.length) return null;

  const headId = revs[revs.length - 1].id;

  try {
    Drive.Revisions.patch({ pinned: true }, fileId, headId);
  } catch (e) {}

  let oldDesc = "";

  try {
    const fileMeta = Drive.Files.get(fileId, {
      fields: "description"
    });

    oldDesc = fileMeta && fileMeta.description
      ? String(fileMeta.description)
      : "";
  } catch (e2) {
    oldDesc = REPORT_AUTO_RESTORE_TAG;
  }

  const newDesc = _upsertAutoRestoreBaselineInDesc_(oldDesc, headId);

  try {
    Drive.Files.patch({ description: newDesc }, fileId);
  } catch (e3) {}

  return headId;
}

/* ── Report sent marker ──────────────────────────────────────────────── */

function _markReportSent_(yyyyMmDd) {
  try {
    PropertiesService.getScriptProperties()
      .setProperty(REPORT_SENT_DATE_KEY, String(yyyyMmDd));
  } catch (e) {}
}

function _wasReportSentFor_(yyyyMmDd) {
  try {
    const v = PropertiesService.getScriptProperties().getProperty(REPORT_SENT_DATE_KEY);
    return String(v || "") === String(yyyyMmDd);
  } catch (e) {
    return false;
  }
}

/* ── Spreadsheet / sheet binding helpers ─────────────────────────────── */

function _getBoundSpreadsheet_() {
  if (typeof _getSpreadsheet_ === "function") {
    const ss = _getSpreadsheet_();
    if (ss) return ss;
  }

  const id = PropertiesService.getScriptProperties().getProperty(REPORT_SPREADSHEET_ID_PROP);
  if (!id) return null;

  return SpreadsheetApp.openById(id);
}

function _getTargetSheetForReport_(ss) {
  if (!ss) return null;

  let name = REPORT_TARGET_SHEET_FALLBACK;

  try {
    if (typeof TARGET_SHEET_NAME === "string" && TARGET_SHEET_NAME) {
      name = TARGET_SHEET_NAME;
    }
  } catch (e) {}

  return ss.getSheetByName(name) || ss.getActiveSheet();
}

/* ── Drive URLs ──────────────────────────────────────────────────────── */

function _driveViewUrl_(fileId) {
  return "https://drive.google.com/file/d/" +
    encodeURIComponent(String(fileId)) +
    "/view";
}

function _driveDownloadUrl_(fileId) {
  return "https://drive.google.com/uc?export=download&id=" +
    encodeURIComponent(String(fileId));
}

/* ── Main XLSX save ──────────────────────────────────────────────────── */

function _saveXlsxToDrive_(sheet, senderName, tokenRaw) {
  void senderName;
  void tokenRaw;

  if (!sheet) {
    throw new Error("Missing sheet for report export.");
  }

  if (!REPORT_ROOT_FOLDER_ID || REPORT_ROOT_FOLDER_ID === "PASTE_REPORT_ROOT_FOLDER_ID_HERE") {
    throw new Error("REPORT_ROOT_FOLDER_ID is not configured.");
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("Report export: could not obtain ScriptLock within 30 seconds.");
  }

  try {
    const ss = sheet.getParent();

    const root = DriveApp.getFolderById(REPORT_ROOT_FOLDER_ID);
    const reportDate = _getReportDateFromSheet_(sheet);

    const yyyy      = Utilities.formatDate(reportDate, REPORT_TZ, "yyyy");
    const yyyyMmDd  = Utilities.formatDate(reportDate, REPORT_TZ, "yyyy-MM-dd");
    const fileDate  = Utilities.formatDate(reportDate, REPORT_TZ, "dd.MM.yyyy.");
    const monthName = _hrMonthNameUpper_(reportDate);

    const yearFolder  = _getOrCreateFolderByName_(root, yyyy);
    const monthFolder = _getOrCreateFolderByName_(yearFolder, monthName);

    const filename = fileDate + " " + REPORT_FILE_BASE_NAME + ".xlsx";

    const existing = monthFolder.getFilesByName(filename);
    while (existing.hasNext()) {
      try {
        existing.next().setTrashed(true);
      } catch (e) {}
    }

    const blob = _exportSpreadsheetAsXlsxBlob_(ss.getId(), filename);

    const created = _driveInsertXlsxWithDesc_(
      monthFolder.getId(),
      filename,
      blob,
      REPORT_AUTO_RESTORE_TAG
    );

    _drivePinBaselineNow_(created.id);

    return {
      yyyy: yyyy,
      yyyyMmDd: yyyyMmDd,
      monthName: monthName,
      fileDate: fileDate,
      filename: filename,
      fileId: created.id,
      viewUrl: _driveViewUrl_(created.id),
      downloadUrl: _driveDownloadUrl_(created.id)
    };
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}


/* ── Failsafe save ───────────────────────────────────────────────────── */

function reportFailSafeSend_2300() {
  const ss = _getBoundSpreadsheet_();

  if (!ss) {
    console.error("reportFailSafeSend_2300: could not open spreadsheet. Missing bound spreadsheet ID.");
    return;
  }

  const sheet = _getTargetSheetForReport_(ss);

  if (!sheet) {
    console.error("reportFailSafeSend_2300: target sheet was not found.");
    return;
  }

  const reportDate = _getReportDateFromSheet_(sheet);
  const reportKey = Utilities.formatDate(reportDate, REPORT_TZ, "yyyy-MM-dd");

  if (_wasReportSentFor_(reportKey)) return;

  try {
    _saveXlsxToDrive_(sheet, "", "");
    _markReportSent_(reportKey);

    console.log("Failsafe 23:00 saved report for " + reportKey);
  } catch (e) {
    console.error("reportFailSafeSend_2300 error:", e && e.stack ? e.stack : e);
  }
}
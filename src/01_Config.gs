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

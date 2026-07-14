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

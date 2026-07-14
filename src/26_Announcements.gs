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

  try {
    const template = HtmlService.createTemplateFromFile("AnnouncementModal");
    template.safeData = safeData;

    const html = template.evaluate()
      .setWidth(620)
      .setHeight(510);

    SpreadsheetApp.getUi().showModalDialog(html, "Najava");
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

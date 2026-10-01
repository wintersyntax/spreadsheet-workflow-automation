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

const REPORT_ROOT_FOLDER_ID = "PASTE_REPORT_ROOT_FOLDER_ID_HERE";
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

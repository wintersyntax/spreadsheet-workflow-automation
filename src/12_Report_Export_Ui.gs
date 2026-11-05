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

  const template = HtmlService.createTemplateFromFile("ReportSaveDialog");
  template.chips = chips;

  const html = template.evaluate()
    .setWidth(640)
    .setHeight(560);

  SpreadsheetApp.getUi().showModalDialog(html, "Save report"); 
} 

function reportMenu_SaveWithName(name) { 
  reportExport_Run_(String(name || "").trim(), { showUiDialog: true }); 
} 

// ── Download dialog ──────────────────────────────────────────────────── 

function reportExport_ShowDownloadDialog_(downloadUrl, filename) { 
  const url = String(downloadUrl || "").trim(); 
  if (!url) return; 

  const safeName = String(filename || "report.xlsx").replace(/[<>]/g, ""); 

  const template = HtmlService.createTemplateFromFile("ReportDownloadDialog");
  template.downloadUrl = url;
  template.filename = safeName;

  const html = template.evaluate()
    .setWidth(600)
    .setHeight(320);

  SpreadsheetApp.getUi().showModalDialog(html, "Download XLSX"); 
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

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

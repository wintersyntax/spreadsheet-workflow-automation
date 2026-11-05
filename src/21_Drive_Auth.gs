/* ═══════════════════════════════════════════════════════════════════════ 
 * 21 · DRIVE AUTH — Initial Drive access authorization
 * ═══════════════════════════════════════════════════════════════════════ */ 

function authorizeDriveOnce() { 
  DriveApp.getRootFolder().getName(); 

  const ss = _getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet(); 
  if (ss) ss.toast("Drive authorization OK", "✅", 3); 
}

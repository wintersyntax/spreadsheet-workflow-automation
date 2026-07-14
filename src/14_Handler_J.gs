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

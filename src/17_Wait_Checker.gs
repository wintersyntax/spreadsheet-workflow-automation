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

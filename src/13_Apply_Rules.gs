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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 23 · ONEDIT — Entry point for edit-event processing
 * ═══════════════════════════════════════════════════════════════════════ */ 

function mojInstaliraniOnEdit(e) { 
  if (_isQuietHours_())      return; 
  if (_isResetInProgress_()) return; 

  if (_isReportInterruptActive_()) { 
    try { 
      _toastReportInterruptOnce_(_getSpreadsheet_() || SpreadsheetApp.getActiveSpreadsheet()); 
    } catch (e0) {} 
    return; 
  } 

  _markOnEditIntent_(true); 

  try { 
    if (!e || !e.range) return; 

    const range = e.range; 
    const sheet = range.getSheet(); 

    if (sheet.getName() !== TARGET_SHEET_NAME) return; 

    const isSingleCell = (range.getNumRows() === 1 && range.getNumColumns() === 1); 

    if (!isSingleCell) { 
      if (range.getNumColumns() !== 1 || range.getColumn() !== STUPAC_J) { 
        for (let i = 0; i < range.getNumRows(); i++) { 
          _enqueueEdit_(sheet, sheet.getRange(range.getRow() + i, range.getColumn())); 
        } 
        return; 
      } 

      const sk = LockService.getScriptLock(); 
      let gotSk = false; 

      try { 
        gotSk = sk.tryLock(300); 
      } catch (e) {} 

      if (!gotSk) { 
        for (let ii = 0; ii < range.getNumRows(); ii++) { 
          _enqueueEdit_(sheet, sheet.getRange(range.getRow() + ii, STUPAC_J)); 
        } 
        return; 
      } 

      try { 
        const vals2 = range.getDisplayValues(); 

        for (let iii = 0; iii < vals2.length; iii++) { 
          _applyRulesForEdit_( 
            sheet, 
            sheet.getRange(range.getRow() + iii, STUPAC_J), 
            vals2[iii][0], 
            true 
          ); 
        } 
      } finally { 
        try { 
          sk.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    const editedRow = range.getRow(); 
    if (editedRow <= 1) return; 

    const editedCol = range.getColumn(); 

    let inputValue = ((e.value !== undefined ? e.value : range.getDisplayValue()) || "") 
      .toString() 
      .trim(); 

    if (editedCol >= STUPAC_B && editedCol <= STUPAC_H && inputValue) { 
      const upper = inputValue.toUpperCase(); 

      if (inputValue !== upper) { 
        try { 
          range.setValue(upper); 
        } catch (ig) {} 

        inputValue = upper; 
      } 
    } 

    if (editedCol >= STUPAC_B && editedCol <= STUPAC_H) { 
      try { 
        const fastRes = _maybeRunFastUgovorPromptPreLock_(sheet, editedRow, editedCol, inputValue); 

        if (fastRes && typeof fastRes.updatedInput === "string") { 
          inputValue = fastRes.updatedInput; 
        } 
      } catch (eFastUgovor) { 
        console.error( 
          "_maybeRunFastUgovorPromptPreLock_ error:", 
          eFastUgovor && eFastUgovor.stack ? eFastUgovor.stack : eFastUgovor 
        ); 
      } 
    } 

    if (editedCol === STUPAC_J) { 
      const sk2 = LockService.getScriptLock(); 
      let gotSk2 = false; 

      try { 
        gotSk2 = sk2.tryLock(300); 
      } catch (e) {} 

      if (!gotSk2) { 
        const queuedJ = _enqueueEdit_(sheet, range); 

        if (!queuedJ) { 
          console.error( 
            "Column J edit could not be queued: row=" + range.getRow() + 
            ", col=" + range.getColumn() 
          ); 
        } 

        return; 
      } 

      try { 
        if (_isResetInProgress_()) { 
          const queuedDuringReset = _enqueueEdit_(sheet, range); 

          if (!queuedDuringReset) { 
            console.error( 
              "Column J edit during reset could not be queued: row=" + range.getRow() + 
              ", col=" + range.getColumn() 
            ); 
          } 

          return; 
        } 

        _applyRulesForEdit_(sheet, range, inputValue, true); 
      } finally { 
        try { 
          sk2.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    const lock2 = LockService.getDocumentLock(); 
    let gotLock = false; 

    try { 
      gotLock = lock2.tryLock(ONEDIT_TRYLOCK_MS); 
    } catch (e) {} 

    if (gotLock) { 
      try { 
        if (_isResetInProgress_()) { 
          const queuedDuringReset = _enqueueEdit_(sheet, range); 

          if (!queuedDuringReset) { 
            console.error( 
              "Edit during reset could not be queued: row=" + range.getRow() + 
              ", col=" + range.getColumn() 
            ); 
          } 

          return; 
        } 

        _applyRulesForEdit_(sheet, range, inputValue, true); 
      } finally { 
        try { 
          lock2.releaseLock(); 
        } catch (e) {} 
      } 

      // Notification check. The lock has already been released; this is read-only.
      if (editedCol === STUPAC_B || 
          editedCol === STUPAC_C || 
          editedCol === STUPAC_H || 
          editedCol === STUPAC_I) { 
        try { 
          _provjeriNajaveZaRed_(sheet, editedRow, editedCol); 
        } catch (eN) { 
          console.error("_provjeriNajaveZaRed_ error:", eN && eN.stack ? eN.stack : eN); 
        } 
      } 

      return; 
    } 

    const queued = _enqueueEdit_(sheet, range); 

    if (queued) { 
      if (_isResetInProgress_()) return; 

      const inlineDone = _tryInlineAfterQueue_(sheet, range, inputValue); 
      if (inlineDone) return; 

      return; 
    } 

    if (_isResetInProgress_()) return; 

    const rescueLock = LockService.getDocumentLock(); 
    let rescueGot = false; 

    try { 
      rescueGot = rescueLock.tryLock(4000); 
    } catch (e) {} 

    if (rescueGot) { 
      try { 
        if (_isResetInProgress_()) return; 

        const currentValue = ((range.getDisplayValue() || "") + "").trim(); 
        _applyRulesForEdit_(sheet, range, currentValue || inputValue, true); 
      } catch (e) { 
        console.error("_rescue direct apply error:", e && e.stack ? e.stack : e); 
      } finally { 
        try { 
          rescueLock.releaseLock(); 
        } catch (e) {} 
      } 

      return; 
    } 

    console.error( 
      "CRITICAL: edit was not processed directly or through queue. " + 
      "row=" + range.getRow() + ", col=" + range.getColumn() + ", value=" + inputValue 
    ); 

  } catch (err) { 
    console.error("mojInstaliraniOnEdit error:", err && err.stack ? err.stack : err); 
  } finally { 
    _markOnEditIntent_(false); 
  } 
} 

function _tryInlineAfterQueue_(sheet, range, inputValue) { 
  if (_isResetInProgress_()) return false; 

  try { 
    const lock = LockService.getDocumentLock(); 
    let got = false; 

    try { 
      got = lock.tryLock(1500); 
    } catch (e) {} 

    if (!got) return false; 

    try { 
      if (_isResetInProgress_()) return false; 

      _dequeueSpecificEdit_(sheet.getSheetId(), range.getRow(), range.getColumn()); 

      if (_isResetInProgress_()) { 
        const requeued = _enqueueEdit_(sheet, range); 

        if (!requeued) { 
          console.error( 
            "_tryInlineAfterQueue_: requeue during reset failed. row=" + 
            range.getRow() + ", col=" + range.getColumn() 
          ); 
        } 

        return false; 
      } 

      const currentValue = ((range.getDisplayValue() || "") + "").trim(); 
      _applyRulesForEdit_(sheet, range, currentValue || inputValue, true); 

      return true; 
    } finally { 
      try { 
        lock.releaseLock(); 
      } catch (e) {} 
    } 
  } catch (e) { 
    console.error("_tryInlineAfterQueue_ error:", e && e.stack ? e.stack : e); 
    return false; 
  } 
} 

function _dequeueSpecificEdit_(sheetId, row, col) { 
  const sk = LockService.getScriptLock(); 

  if (!sk.tryLock(EDIT_QUEUE_LOCK_MS)) { 
    console.error( 
      "_dequeueSpecificEdit_: ScriptLock timeout, sheetId=" + sheetId + 
      ", row=" + row + ", col=" + col 
    ); 
    return; 
  } 

  try { 
    const props = PropertiesService.getScriptProperties(); 
    const json  = props.getProperty(EDIT_QUEUE_KEY); 

    if (!json) return; 

    const q   = _safeParseQueueJson_(json); 
    const key = _queueKey_(sheetId, row, col); 

    if (q[key]) { 
      delete q[key]; 

      Object.keys(q).length 
        ? props.setProperty(EDIT_QUEUE_KEY, JSON.stringify(q)) 
        : props.deleteProperty(EDIT_QUEUE_KEY); 
    } 
  } catch (e) { 
    console.error("_dequeueSpecificEdit_ error:", e && e.stack ? e.stack : e); 
  } finally { 
    try { 
      sk.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _maybeRunFastUgovorPromptPreLock_(sheet, row, editedCol, currentInput) { 
  try { 
    if (!sheet || row <= 1) return null; 
    if (editedCol < STUPAC_B || editedCol > STUPAC_H) return null; 
    if (_isResetInProgress_()) return null; 

    const rowVals = sheet.getRange(row, STUPAC_B, 1, STUPAC_H - STUPAC_B + 1).getDisplayValues()[0]; 

    let cVal = String(rowVals[STUPAC_C - STUPAC_B] || ""); 
    let hVal = String(rowVals[STUPAC_H - STUPAC_B] || ""); 

    if (editedCol === STUPAC_C) cVal = String(currentInput || ""); 
    if (editedCol === STUPAC_H) hVal = String(currentInput || ""); 

    const cNorm = _normTxt_(cVal).replace(/\s+/g, " ").trim(); 

    if (cNorm !== "sportski") return null; 
    if (!String(hVal || "").trim()) return null; 

    if (_isFakturaKlub_(hVal)) { 
      return { updatedInput: String(currentInput || "") }; 
    } 

    const matched = _matchUgovorKlub_(_stripPlTag_(hVal)); 
    if (!matched) return null; 

    const newH = _handleUgovorKlubAlert_(sheet, row, hVal); 

    if (newH !== hVal) { 
      if (editedCol === STUPAC_H) { 
        try { 
          sheet.getRange(row, STUPAC_H).setValue(newH); 
        } catch (e1) {} 

        return { updatedInput: newH }; 
      } 

      try { 
        sheet.getRange(row, STUPAC_H).setValue(newH); 
      } catch (e2) {} 
    } 

    return { updatedInput: String(currentInput || "") }; 
  } catch (e) { 
    console.error("_maybeRunFastUgovorPromptPreLock_ fatal:", e && e.stack ? e.stack : e); 
    return null; 
  } 
}

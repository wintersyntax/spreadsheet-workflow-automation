/* ═══════════════════════════════════════════════════════════════════════ 
 * 18 · FORMAT CLEANER — Format and content cleanup for completed rows
 * ═══════════════════════════════════════════════════════════════════════ */ 

const CLEANER_RETRY_MAX      = 3; 
const CLEANER_RETRY_DELAY_MS = 2000; 

function cistacFormataGotovihPacijenata() { 
  for (let attempt = 0; attempt < CLEANER_RETRY_MAX; attempt++) { 
    const ran = _withDocumentLockOrPending_( 
      "cistacFormataGotovihPacijenata", 
      "pending_cistacFormataGotovihPacijenata", 
      (props, pendingKey) => { 
        const sheet = _getTargetSheet_(); 
        if (!sheet) return; 

        const endRow = _scanEndRowByLastStruckInB_(sheet, MAX_TEMPLATE_ROW, CLEANER_BUFFER_ROWS); 
        if (endRow < 2) return; 

        const n = endRow - 1; 

        const rangeBO = sheet.getRange(2, STUPAC_B, n, STUPAC_SYS_SIG - STUPAC_B + 1); 
        const vBO     = rangeBO.getDisplayValues(); 
        const fL      = sheet.getRange(2, STUPAC_B, n, 1).getFontLines(); 

        const IDX_B         = STUPAC_B - STUPAC_B; 
        const IDX_C         = STUPAC_C - STUPAC_B; 
        const IDX_I         = STUPAC_I - STUPAC_B; 
        const IDX_ID        = STUPAC_ID - STUPAC_B; 
        const IDX_SYS_STATE = STUPAC_SYS_STATE - STUPAC_B; 

        const getPrereadState = (rowNum) => { 
          const idx = rowNum - 2; 
          if (idx < 0 || idx >= n) return ""; 

          if (fL[idx][0] === "line-through") return "DONE"; 

          const iStr = String((vBO[idx] && vBO[idx][IDX_I]) || ""); 
          if (_isVipRowByI_(iStr)) return "VIP"; 

          return String((vBO[idx] && vBO[idx][IDX_SYS_STATE]) || "").trim() || ""; 
        }; 

        const struckIdx = fL.reduce((acc, row, i) => { 
          if (row[0] === "line-through") acc.push(i); 
          return acc; 
        }, []); 

        if (!struckIdx.length) { 
          try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
          return; 
        } 

        const TAG_RE           = /^\s*\[[^\]]+\]\s*/; 
        const headerDG         = sheet.getRange(1, STUPAC_D, 1, 4).getBackgrounds()[0]; 
        const sportWaitEnabled = _isSportWaitEnabled_(); 

        const waitRows = []; 
        const vipRows  = []; 

        for (let ii = 0; ii < fL.length; ii++) { 
          if (ii % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
            _bgYieldNow_(props, pendingKey); 
          } 

          const rowNum = ii + 2; 
          const tBStr  = String((vBO[ii] && vBO[ii][IDX_B]) || ""); 
          const tCStr  = String((vBO[ii] && vBO[ii][IDX_C]) || "").trim(); 
          const tIStr  = String((vBO[ii] && vBO[ii][IDX_I]) || ""); 
          const rowId  = String((vBO[ii] && vBO[ii][IDX_ID]) || "").trim(); 

          let sysState = String((vBO[ii] && vBO[ii][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          const cekKey  = rowId ? _cekFlagKey2h_(rowId) : ""; 
          const isSport = (_normUpperNoDiacritics_(tCStr) === "SPORTSKI"); 

          if (fL[ii][0] === "line-through") continue; 

          if (_isVipRowByI_(tIStr) || sysState === "VIP") { 
            vipRows.push(rowNum); 
            continue; 
          } 

          if (isSport) { 
            if (sysState === "WAIT_SPORT" || 
                (sportWaitEnabled && _hasWaitSportTag_(tBStr))) { 
              waitRows.push(rowNum); 
            } 
            continue; 
          } 

          if (sysState === "WAIT_2H" || 
              (cekKey && props.getProperty(cekKey) === "1") || 
              _hasWait2hTag_(tBStr)) { 
            waitRows.push(rowNum); 
            continue; 
          } 
        } 

        const getSpecialType = idx0 => { 
          if (idx0 < 0 || idx0 >= fL.length || fL[idx0][0] === "line-through") return null; 

          const rowNum   = idx0 + 2; 
          const tB       = String((vBO[idx0] && vBO[idx0][IDX_B]) || ""); 
          const tC       = String((vBO[idx0] && vBO[idx0][IDX_C]) || "").trim(); 
          const tI       = String((vBO[idx0] && vBO[idx0][IDX_I]) || ""); 
          const rowId    = String((vBO[idx0] && vBO[idx0][IDX_ID]) || "").trim(); 
          const cekKey   = rowId ? _cekFlagKey2h_(rowId) : ""; 
          const isSport  = (_normUpperNoDiacritics_(tC) === "SPORTSKI"); 

          let sysState = String((vBO[idx0] && vBO[idx0][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          if (_isVipRowByI_(tI) || sysState === "VIP") return "VIP_RED"; 

          if (isSport) { 
            if (sysState === "WAIT_SPORT" || (sportWaitEnabled && _hasWaitSportTag_(tB))) { 
              return "WAIT_SPORT_TEXT_ONLY"; 
            } 
            return null; 
          } 

          if (sysState === "WAIT_2H" || 
              (cekKey && props.getProperty(cekKey) === "1") || 
              _hasWait2hTag_(tB)) { 
            return "WAIT_BLACK"; 
          } 

          return null; 
        }; 

        const emptyStruckRows = []; 
        const workStruckRows  = []; 

        for (let si = 0; si < struckIdx.length; si++) { 
          if (si % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) { 
            _bgYieldNow_(props, pendingKey); 
          } 

          const idx = struckIdx[si]; 

          vBO[idx].some(v => String(v || "").trim() !== "") 
            ? workStruckRows.push(idx + 2) 
            : emptyStruckRows.push(idx + 2); 
        } 

        if (!workStruckRows.length) { 
          _groupConsecutiveRows_(emptyStruckRows).forEach(g => { 
            sheet.getRange(g.start, STUPAC_B, g.len, 1).setFontLine("none"); 
          }); 

          try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
          return; 
        } 

        const groupsWork = _groupConsecutiveRows_(workStruckRows); 

        // 1) Clean wait tags and leading warning emoji from column B.
        for (let g = 0; g < groupsWork.length; g++) { 
          if (g % 5 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const { start: startRow, len } = groupsWork[g]; 
          const blockValues = []; 

          for (let r = 0; r < len; r++) { 
            const idx0 = startRow + r - 2; 
            let s = String(vBO[idx0][IDX_B] || ""); 

            if (s.startsWith("⚠️") || s.includes(TEKST_CEKANJE) || s.includes(TEKST_CEKANJE_SPORT) || s.includes(EMOJI_ALARM)) { 
              s = s 
                .replace(/^⚠️\s*/, "") 
                .replace(TEKST_CEKANJE, "") 
                .replace(TEKST_CEKANJE_SPORT, "") 
                .split(EMOJI_ALARM).join("") 
                .replace(/\s{2,}/g, " ") 
                .trim(); 
            } 

            blockValues.push([s]); 
          } 

          sheet.getRange(startRow, STUPAC_B, len, 1).setValues(blockValues); 
        } 

        const idsToDelete = []; 

        // 2) Clean format/content for completed work rows.
        for (let g = 0; g < groupsWork.length; g++) { 
          if (g % 8 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const { start: startRow, len } = groupsWork[g]; 

          const aboveState = getPrereadState(startRow - 1); 
          const belowState = getPrereadState(startRow + len); 

          const preserveTop    = _isStrongEdgeOwnerState_(aboveState); 
          const preserveBottom = _isStrongEdgeOwnerState_(belowState); 

          sheet.getRange(startRow, STUPAC_B, len, 2) 
            .setBackground("white") 
            .setFontColor("black") 
            .setFontWeight("normal") 
            .setFontStyle("normal") 
            .setFontSize(12) 
            .setBorder( 
              preserveTop    ? null : true, 
              true, 
              preserveBottom ? null : true, 
              true, 
              true, 
              true, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID 
            ); 

          sheet.getRange(startRow, STUPAC_D, len, 4) 
            .setBackgrounds(Array.from({ length: len }, () => headerDG.slice())); 

          const iVals = Array.from({ length: len }, (_, r) => { 
            const idx0 = startRow + r - 2; 
            return [String((vBO[idx0] && vBO[idx0][IDX_I]) || "").replace(TAG_RE, "").trim()]; 
          }); 

          sheet.getRange(startRow, STUPAC_I, len, 1) 
            .setValues(iVals) 
            .setFontWeight("normal") 
            .setFontSize(12) 
            .setFontStyle("normal") 
            .clearNote() 
            .setBackground("white"); 

          sheet.getRange(startRow, STUPAC_J, len, 1).setBackground("white"); 

          try { 
            sheet.getRange(startRow, STUPAC_SYS_STATE, len, 1).clearContent(); 
            sheet.getRange(startRow, STUPAC_SYS_SIG,   len, 1).clearContent(); 
          } catch (e) {} 

          const idVals = sheet.getRange(startRow, STUPAC_ID, len, 1).getValues(); 

          idVals.forEach(row => { 
            const id = String(row[0] || "").trim(); 
            if (id) idsToDelete.push(id); 
          }); 

          sheet.getRange(startRow, STUPAC_ID, len, 1).clearContent().setFontColor("black"); 
          sheet.getRange(startRow, STUPAC_B, len, 1).setFontLine("line-through"); 
          sheet.getRange(startRow, STUPAC_C, len, STUPAC_J - STUPAC_C + 1).setFontLine("none"); 
        } 

        // 3) Remove strike-through from empty struck rows.
        _groupConsecutiveRows_(emptyStruckRows).forEach(g => { 
          sheet.getRange(g.start, STUPAC_B, g.len, 1).setFontLine("none"); 
        }); 

        // 4) Delete stored time memory and 2h wait flag for completed rows.
        for (let di = 0; di < idsToDelete.length; di++) { 
          if (di % 80 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const idd = idsToDelete[di]; 

          try { memorijaSkripte.deleteProperty("vrijeme_id_" + idd); } catch (e) {} 
          try { CacheService.getScriptCache().remove("t_vrijeme_id_" + idd); } catch (e) {} 

          try { 
            const cekKey = _cekFlagKey2h_(idd); 
            if (cekKey) props.deleteProperty(cekKey); 
          } catch (e) {} 
        } 

        // 5) Restore default border to active rows only:
        // non-VIP, non-wait and non-struck rows.
        const vipSet  = new Set(vipRows); 
        const waitSet = new Set(waitRows); 

        const defaultActiveRows = []; 

        for (let ii2 = 0; ii2 < n; ii2++) { 
          const rowNum = ii2 + 2; 

          if (fL[ii2][0] === "line-through") continue; 
          if (vipSet.has(rowNum))  continue; 
          if (waitSet.has(rowNum)) continue; 

          defaultActiveRows.push(rowNum); 
        } 

        for (let a = 0; a < defaultActiveRows.length; a++) { 
          if (a % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 

          const rowNum = defaultActiveRows[a]; 

          _setRowBorderRespectVip_( 
            sheet, 
            rowNum, 
            "black", 
            SpreadsheetApp.BorderStyle.SOLID, 
            "normal", 
            12 
          ); 
        } 

        const applySpecialVisual = (rowNum, type) => { 
          if (type === "VIP_RED") { 
            sheet.getRange(rowNum, STUPAC_B, 1, 2) 
              .setFontWeight("bold") 
              .setFontSize(13) 
              .setBorder(true, true, true, true, true, true, "red", SpreadsheetApp.BorderStyle.SOLID_THICK); 
            return; 
          } 

          if (type === "WAIT_BLACK") { 
            _setRowBorderRespectVip_( 
              sheet, 
              rowNum, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID_THICK, 
              "bold", 
              13 
            ); 
            return; 
          } 

          if (type === "WAIT_SPORT_TEXT_ONLY") { 
            _setRowBorderOnlyRespectVip_( 
              sheet, 
              rowNum, 
              "black", 
              SpreadsheetApp.BorderStyle.SOLID 
            ); 
            return; 
          } 
        }; 

        // 6) Reapply WAIT/VIP visuals only to active rows.
        waitRows.forEach((rowNum, w) => { 
          if (w % 20 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(rowNum, STUPAC_B).getFontLine() === "line-through") return; 

          const idx = rowNum - 2; 
          if (idx < 0 || idx >= vBO.length) return; 

          let sysState = String((vBO[idx] && vBO[idx][IDX_SYS_STATE]) || "").trim(); 
          if (!sysState) sysState = _getRowVisualStateForBorder_(sheet, rowNum); 

          const rowB    = String((vBO[idx] && vBO[idx][IDX_B]) || ""); 
          const rowC    = String((vBO[idx] && vBO[idx][IDX_C]) || "").trim(); 
          const isSport = (_normUpperNoDiacritics_(rowC) === "SPORTSKI"); 

          if (isSport || sysState === "WAIT_SPORT" || (sportWaitEnabled && _hasWaitSportTag_(rowB))) { 
            applySpecialVisual(rowNum, "WAIT_SPORT_TEXT_ONLY"); 
            return; 
          } 

          applySpecialVisual(rowNum, "WAIT_BLACK"); 
        }); 

        vipRows.forEach((rowNum, v) => { 
          if (v % 20 === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(rowNum, STUPAC_B).getFontLine() === "line-through") return; 

          applySpecialVisual(rowNum, "VIP_RED"); 
        }); 

        // Final pass: safety net for all non-struck rows with special visual state.
        for (let ii2 = 0; ii2 < fL.length; ii2++) { 
          if (ii2 % BG_YIELD_CHECK_EVERY === 0 && _shouldBackgroundYieldNow_()) _bgYieldNow_(props, pendingKey); 
          if (sheet.getRange(ii2 + 2, STUPAC_B).getFontLine() === "line-through") continue; 

          const type = getSpecialType(ii2); 
          if (type) applySpecialVisual(ii2 + 2, type); 
        } 

        try { _fixNextEmptyBRowIfStruck_(); } catch (e) {} 
      } 
    ); 

    if (ran) return; 

    if (attempt < CLEANER_RETRY_MAX - 1) { 
      Utilities.sleep(CLEANER_RETRY_DELAY_MS); 
    } 
  } 
}

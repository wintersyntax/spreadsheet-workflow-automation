/* ═══════════════════════════════════════════════════════════════════════ 
 * 16 · HANDLER C/H — Business-rule processing across columns C–H
 * ═══════════════════════════════════════════════════════════════════════ */ 

function _isZvuH_(txt) { 
  const s = _normTxt_(String(txt || "")); 
  if (/\bzvu\b/.test(s)) return true; 
  if (_textHasFlexiblePhrase_(s, "zdravstveno veleuciliste")) return true; 
  return false; 
} 

function _handleCHRulesLite_(sheet, ctx, patch) { 
  const row = ctx.row; 

  let finalC = String(_ctxVal_(ctx, STUPAC_C) || ""); 
  let finalD = String(_ctxVal_(ctx, STUPAC_D) || ""); 
  let finalE = String(_ctxVal_(ctx, STUPAC_E) || ""); 
  let finalF = String(_ctxVal_(ctx, STUPAC_F) || ""); 
  let finalG = String(_ctxVal_(ctx, STUPAC_G) || ""); 
  let finalH = String(_ctxVal_(ctx, STUPAC_H) || "").toUpperCase(); 
  let finalI = String(_ctxVal_(ctx, STUPAC_I) || ""); 
  let finalJ = String(_ctxVal_(ctx, STUPAC_J) || ""); 

  if (ctx.fontLineB === "line-through") return; 

  const SPORTSKI_PLACEHOLDER_TEXT       = "EKG+SPIRO"; 
  const SPORTSKI_PLACEHOLDER_FONT_COLOR = "#a6a6a6"; 

  const _isSlashOnly_ = v => String(v || "").trim() === "/"; 
  const _isEmptyLike_ = v => String(v || "").trim() === ""; 
  const _isSportskiPlaceholderExact_ = v => String(v || "").trim().toUpperCase() === SPORTSKI_PLACEHOLDER_TEXT; 

  // Special boxing cases.
  const cPhraseNorm        = _normPhrase_(finalC); 
  const isBoksGodisnji     = (cPhraseNorm === "boks godisnji"); 
  const isBoksPolugodisnji = (cPhraseNorm === "boks polugodisnji"); 
 
  if (isBoksGodisnji || isBoksPolugodisnji) finalC = "SPORTSKI"; 

  if (isBoksGodisnji) { 
    const label = "BOKS GODIŠNJI"; 
    if (!_textHasFlexiblePhrase_(finalI, label)) { 
      finalI = finalI.trim() ? (finalI.trim() + " " + label) : label; 
    } 
  } 

  // Standardize and normalize column C.
  const stdC = _standardizirajTipC_(finalC); 
  if (stdC && String(finalC).trim() !== stdC) finalC = stdC; 

  const invalidRegisterSanitized = _sanitizeInvalidRegisterType_(finalC); 
  if (invalidRegisterSanitized) finalC = invalidRegisterSanitized; 

  try { 
    const normRes = _normalizeC_forKATandSPORT_(finalC); 
    if (normRes && normRes.text) { 
      _patchClearNote_(patch, STUPAC_C); 
      if (String(finalC).trim() !== normRes.text) finalC = normRes.text; 
    } 
  } catch (e) {} 

  const invalidKatSanitized = _sanitizeInvalidKatType_(finalC); 
  if (invalidKatSanitized) finalC = invalidKatSanitized; 

  const cCurrent = String(_ctxVal_(ctx, STUPAC_C) || ""); 
  const cNext    = String(finalC || ""); 

  if (cCurrent !== cNext) { 
    _ctxSetVal_(ctx, STUPAC_C, cNext); 

    const invalidMatch = cNext.match(/\[[^\]]+\]/); 
    if (invalidMatch) { 
      const start = Number(invalidMatch.index) || 0; 
      const end   = start + invalidMatch[0].length; 

      _patchSetRichOrPlain_(patch, STUPAC_C, cNext, [{ 
        text: invalidMatch[0], 
        start, 
        end, 
        style: SpreadsheetApp.newTextStyle() 
          .setBold(true) 
          .build() 
      }]); 
    } else { 
      _patchSetRichOrPlain_(patch, STUPAC_C, cNext, []); 
    } 
  } 

  const vCLower      = String(finalC || "").toLowerCase().trim(); 
  const vCnorm       = _normTxt_(finalC); 
  const cUpperNoDia  = _normUpperNoDiacritics_(finalC); 
  const cTokens      = _tokenizeUpper_(cUpperNoDia); 

  const jeORS               = /\bors\b/i.test(vCnorm); 
  const jeEKG               = /\bekg\b/i.test(vCnorm); 
  const jeKardiolog         = /\bkardiolog\w*\b/i.test(vCnorm); 
  const jeLabos             = /\b(lab|labos|krv|vađ?enj[e]?\s*krvi)\b/i.test(vCLower); 
  const jeNocniRad          = /nocni[\s\W_]*rad/.test(vCnorm); 
  const isPeriodic          = _jePeriodic_Standard_(finalC); 

  // Demo/local compatibility:
  // The public-cleaned version uses REGISTER, but the original sheet/demo may still use PUR.
  // Treat PUR as equivalent to REGISTER for coloring and workflow pairing.
  const isRegister = 
    cTokens.includes("REGISTER") || 
    cTokens.includes("PUR") || 
    vCnorm.includes("register") || 
    vCnorm.includes("pur"); 

  const isOpcaRadna         = /opca[\s\W_]*radna/.test(vCnorm); 
  const isHealthPairingType = isRegister || isOpcaRadna || jeNocniRad; 
  const isRegisterOrGeneral = isRegister || isOpcaRadna; 
  const isSportski          = (vCLower === "sportski"); 
  const isRocnik            = (vCnorm === "rocnik"); 

  const isKatLike = 
    cTokens.includes("KAT") || 
    cTokens.some(_isFuzzyKategorija_) || 
    cTokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)); 

  const HAS_PAID_PL_TAG_REGEX = /\b\d+(?:[.,]\d+)?\s*€\s+PL\b/i; 

  // UI alerts.
  if (isSportski && ctx.allowUi) { 
    finalH = _handleUgovorKlubAlert_(sheet, row, String(finalH)); 
  } 

  // Training / invoice / contract corrections in column H.
  const imaEduTvrtku   = _hasEdukacijaTvrtka_(String(finalH)) || _hasEdukacijaTvrtka_(String(finalF)); 
  const trebaEdukacija = Boolean(isRegister && isPeriodic && imaEduTvrtku); 

  const _removeEdukacijaTag_ = txt => 
    String(txt || "").replace(/\s*;\s*EDUKACIJA\b/gi, "").replace(/\s{2,}/g, " ").trim(); 

  const _removeFakturaTag_ = txt => 
    String(txt || "").replace(/\s*\bFAKTURA\b/gi, "").replace(/\s{2,}/g, " ").trim(); 

  const fakturaCorrection = _getFakturaCorrection_(finalH); 
  if (fakturaCorrection && fakturaCorrection.correctedText) { 
    finalH = String(fakturaCorrection.correctedText || "").trim().toUpperCase(); 
  } 

  const ugovorCorrection = _getUgovorCorrection_(_stripPlTag_(finalH)); 
  if (ugovorCorrection && ugovorCorrection.correctedText) { 
    const existingPl = _extractPlTag_(finalH); 
    finalH = existingPl 
      ? _normalizeSinglePlTag_( 
          String(ugovorCorrection.correctedText || "").trim().toUpperCase() + " " + existingPl, 
          ugovorCorrection.entry && ugovorCorrection.entry.price 
        ) 
      : String(ugovorCorrection.correctedText || "").trim().toUpperCase(); 
  } 

  // Organization-name standardization only for relevant workflow types.
  if (isHealthPairingType) { 
    const zdravstvenaCorrection = _getZdravstvenaCorrection_(finalH); 
    if (zdravstvenaCorrection && zdravstvenaCorrection.correctedText) { 
      const existingPl = _extractPlTag_(finalH); 
      finalH = existingPl 
        ? _normalizeSinglePlTag_( 
            String(zdravstvenaCorrection.correctedText || "").trim().toUpperCase() + " " + existingPl, 
            null 
          ) 
        : String(zdravstvenaCorrection.correctedText || "").trim().toUpperCase(); 
    } 
  } 

  let hWork = String(finalH || ""); 

  if (trebaEdukacija) { 
    if (!/\bEDUKACIJA\b/i.test(hWork)) { 
      hWork = (_removeEdukacijaTag_(hWork) || "") + TEKST_EDUKACIJA; 
    } 
  } else if (/\bEDUKACIJA\b/i.test(hWork)) { 
    hWork = _removeEdukacijaTag_(hWork); 
  } 

  const isFakturaKlubAfterCorrection = _isFakturaKlub_(hWork); 

  if (isFakturaKlubAfterCorrection) { 
    if (!/\bFAKTURA\b/i.test(hWork)) { 
      hWork = (_removeFakturaTag_(hWork) ? _removeFakturaTag_(hWork) + " " : "") + "FAKTURA"; 
    } 
  } 

  // Billing-state transformation in column H.
  const billingRes = _transformBillingStateInH_(hWork); 
  if (billingRes && billingRes.text) { 
    hWork = billingRes.text; 
  } 

  finalH = hWork; 

  const cWordsNorm = _normTxt_(finalC).split(/\s+/).filter(Boolean); 
  const isNastavak = cWordsNorm.some(w => _levenshteinDistanceCapped_(w, "nastavak", 2) <= 2); 

  // Final row color.
  let konacnaBoja = "white"; 

  if      (isNastavak)            konacnaBoja = "#ead1dc"; 
  else if (jeORS)                 konacnaBoja = BOJA_ORS; 
  else if (jeEKG || jeKardiolog)  konacnaBoja = "#ea9999"; 
  else if (jeLabos)               konacnaBoja = BOJA_VADJENJE_KRVI; 
  else if (jeNocniRad && _isZdravstvenaUstanova_(finalH)) konacnaBoja = "#ea9999"; 
  else if (_isZdravstvenaUstanova_(finalH) && isRegisterOrGeneral) konacnaBoja = "#ea9999"; 
  else if (jeNocniRad)            konacnaBoja = "#fff2cc"; 
  else if (isRegisterOrGeneral)   konacnaBoja = "#fff2cc"; 
  else if (isRocnik)              konacnaBoja = "#fce5cd"; 
  else if (vCLower !== "") { 
    for (const p of BOJE_PRIORITETI_NORM) { 
      if (vCnorm.includes(p.normRijec)) { konacnaBoja = p.boja; break; } 
    } 
  } 

  _patchSetBackground_(patch, STUPAC_B, 2, konacnaBoja); 

  const hHasFakturaTag = /\bFAKTURA\b/i.test(finalH); 
  _patchSetBackground_(patch, STUPAC_H, 1, hHasFakturaTag ? "#fff2cc" : "white"); 

  // Slash-fill logic.
  const fillSlashLocal = v => String(v || "").trim() ? String(v) : "/"; 

  if (jeORS) { 
    finalD = fillSlashLocal(finalD); 
    finalE = fillSlashLocal(finalE); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    if (!String(finalJ).trim()) finalJ = "p"; 
  } 

  if (jeEKG) { 
    finalD = fillSlashLocal(finalD); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  if (jeKardiolog) { 
    finalD = fillSlashLocal(finalD); 
    finalE = ""; 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalI = ""; 
    finalJ = "k"; 
  } 

  if (jeLabos) { 
    finalE = fillSlashLocal(finalE); 
    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  if (isBoksGodisnji) { 
    if (_isSlashOnly_(finalD)) finalD = ""; 
    if (_isEmptyLike_(finalE) || _isSlashOnly_(finalE)) finalE = SPORTSKI_PLACEHOLDER_TEXT; 
    if (_isSlashOnly_(finalF)) finalF = ""; 
    finalG = fillSlashLocal(finalG); 
  } else if (isSportski) { 
    if (_isSlashOnly_(finalD)) finalD = ""; 

    finalF = fillSlashLocal(finalF); 
    finalG = fillSlashLocal(finalG); 

    if (_isEmptyLike_(finalE) || _isSlashOnly_(finalE)) { 
      finalE = SPORTSKI_PLACEHOLDER_TEXT; 
    } 
  } 

  if (vCLower === "rnr") { 
    finalD = fillSlashLocal(finalD); 
    finalE = fillSlashLocal(finalE); 
    finalG = fillSlashLocal(finalG); 
    finalJ = fillSlashLocal(finalJ); 
  } 

  // Additional-review logic.
  let trebaOFT = vCLower.includes("dno"); 

  if (!trebaOFT && _isZastitarskaTvrtka_(finalH) 
      && !vCLower.includes("sportski") && !vCLower.includes("rnr")) { 
    const fHasOft = String(finalF || "").includes(TEKST_ZA_DODATI_OFT); 

    if (!fHasOft && ctx.allowUi && _shouldAskOftNow_(sheet, row)) { 
      try { 
        const ui = SpreadsheetApp.getUi(); 
        if (ui.alert("Workflow check", "Does this row require additional review?", ui.ButtonSet.YES_NO) === ui.Button.YES) { 
          trebaOFT = true; 
        } 
      } catch (e) {} 
    } else if (fHasOft) { 
      trebaOFT = true; 
    } 
  } 

  // Additional-review logic for education-related entries.
  // The dialog appears only when column H is directly edited, not during B/C edits,
  // which prevents duplicate prompts.
  if (!trebaOFT && _isZvuH_(finalH)) { 
    const fHasOft = String(finalF || "").includes(TEKST_ZA_DODATI_OFT); 

    if (!fHasOft && ctx.allowUi && ctx.editedCol === STUPAC_H) { 
      try { 
        const ui = SpreadsheetApp.getUi(); 
        if (ui.alert("Workflow check", "Does this row require additional review?", ui.ButtonSet.YES_NO) === ui.Button.YES) { 
          trebaOFT = true; 
        } 
      } catch (e) {} 
    } else if (fHasOft) { 
      trebaOFT = true; 
    } 
  } 

  if (trebaOFT && !String(finalF || "").includes(TEKST_ZA_DODATI_OFT)) { 
    finalF = (String(finalF || "") + " " + TEKST_ZA_DODATI_OFT).trim(); 
  } 

  // KAT X / ROČNIK X.
  if ((isKatLike || isRocnik) && !String(finalG || "").trim()) { 
    finalG = TEKST_ZA_DODATI_KAT_X; 
  } 

  // Plain value writes.
  const maybeSetPlain = (col, finalVal) => { 
    const currentVal = String(_ctxVal_(ctx, col) || ""); 
    const nextVal    = String(finalVal || ""); 

    if (currentVal !== nextVal) { 
      _ctxSetVal_(ctx, col, nextVal); 
      _patchSetValue_(patch, col, nextVal); 
    } 
  }; 

  maybeSetPlain(STUPAC_D, finalD); 
  maybeSetPlain(STUPAC_G, finalG); 
  maybeSetPlain(STUPAC_I, finalI); 
  maybeSetPlain(STUPAC_J, finalJ); 

  // Column E rich/plain write with placeholder styling.
  if ((isSportski || isBoksGodisnji) && _isSportskiPlaceholderExact_(finalE)) { 
    const currentValE = String(_ctxVal_(ctx, STUPAC_E) || ""); 

    if (currentValE !== finalE) { 
      _ctxSetVal_(ctx, STUPAC_E, finalE); 
      _patchSetRichOrPlain_(patch, STUPAC_E, finalE, [{ 
        text: finalE, 
        start: 0, 
        end: finalE.length, 
        style: SpreadsheetApp.newTextStyle() 
          .setForegroundColor(SPORTSKI_PLACEHOLDER_FONT_COLOR) 
          .build() 
      }]); 
    } 
  } else { 
    maybeSetPlain(STUPAC_E, finalE); 

    if (String(finalE || "").trim() && !_isSportskiPlaceholderExact_(finalE)) { 
      _patchSetFontColor_(patch, STUPAC_E, "black"); 
    } 
  } 

  // Column F rich/plain write.
  if (String(finalF || "").includes(TEKST_ZA_DODATI_OFT)) { 
    const txt   = String(finalF || ""); 
    const start = txt.indexOf(TEKST_ZA_DODATI_OFT); 

    _ctxSetVal_(ctx, STUPAC_F, txt); 
    _patchSetRichOrPlain_(patch, STUPAC_F, txt, [{ 
      text: TEKST_ZA_DODATI_OFT, 
      start, 
      end: start + TEKST_ZA_DODATI_OFT.length, 
      style: SpreadsheetApp.newTextStyle() 
        .setBold()
        .setFontSize(14)
        .setForegroundColor("red")
        .build() 
    }]); 
  } else { 
    maybeSetPlain(STUPAC_F, finalF); 
  } 

  // Column H rich/plain write.
  if ( 
    /\bEDUKACIJA\b/i.test(finalH) || 
    /\bFAKTURA\b/i.test(finalH) || 
    /\bNAPLATITI\b/i.test(finalH) || 
    HAS_PAID_PL_TAG_REGEX.test(finalH) 
  ) { 
    const txt         = String(finalH || ""); 
    const taggedParts = _buildHRichTextTaggedParts_(txt); 

    _ctxSetVal_(ctx, STUPAC_H, txt); 
    _patchSetRichOrPlain_(patch, STUPAC_H, txt, taggedParts); 
  } else { 
    maybeSetPlain(STUPAC_H, finalH); 
  } 
} 

// Legacy wrapper.
function _handleCHRules_(sheet, row, allowUi, knownFontLine) { 
  const ctx = _buildRowContextLite_(sheet, row, STUPAC_C, allowUi, ""); 

  if (knownFontLine !== undefined && knownFontLine !== null) ctx.fontLineB = knownFontLine; 

  const patch = _newRowPatch_(); 

  _handleCHRulesLite_(sheet, ctx, patch); 
  _applyRowPatchLite_(sheet, row, patch); 
} 

function _oftPromptKey_(sheet, row) { 
  return "oftPrompt_" + sheet.getSheetId() + "_" + _todayZg_() + "_" + row; 
} 

function _fakturaPromptKey_(sheet, row) { 
  return "fakturaPrompt_" + sheet.getSheetId() + "_" + _todayZg_() + "_" + row; 
} 

function _shouldAskCachedPromptNow_(cacheKey, ttlSec) { 
  const cache = CacheService.getScriptCache(); 
  const key   = String(cacheKey || ""); 
  const ttl   = Math.max(1, Number(ttlSec) || 30); 
  const sk    = LockService.getScriptLock(); 
  let got     = false; 

  try { 
    got = sk.tryLock(50); 
  } catch (e) {} 

  if (!got) return false; 

  try { 
    if (cache.get(key)) return false; 

    cache.put(key, "1", ttl); 
    return true; 
  } finally { 
    try { 
      sk.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _shouldAskOftNow_(sheet, row) { 
  return _shouldAskCachedPromptNow_(_oftPromptKey_(sheet, row), OFT_PROMPT_TTL_SEC); 
} 

function _shouldAskFakturaNow_(sheet, row) { 
  return _shouldAskCachedPromptNow_(_fakturaPromptKey_(sheet, row), FAKTURA_PROMPT_TTL_SEC); 
}

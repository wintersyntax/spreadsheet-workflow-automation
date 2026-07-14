/* ═══════════════════════════════════════════════════════════════════════ 
 * 03 · HELPERS — Generic helpers, normalization and patch infrastructure
 * ═══════════════════════════════════════════════════════════════════════ */ 

/* ── Date / text basic helpers ────────────────────────────────────────── */ 

function _todayZg_()  { return Utilities.formatDate(new Date(), "Europe/Zagreb", "yyyy-MM-dd"); } 
function _stamp_()    { return Utilities.formatDate(new Date(), "Europe/Zagreb", "dd.MM.yyyy HH:mm"); } 
function _trim_(v)    { return String(v || "").trim(); } 
function _zgHour_()   { return Number(Utilities.formatDate(new Date(), "Europe/Zagreb", "H")); } 
function _zgMinute_() { return Number(Utilities.formatDate(new Date(), "Europe/Zagreb", "m")); } 
 
function _normTxt_(s) { 
  return String(s || "") 
    .toLowerCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, ""); 
} 

function _normUpperNoDiacritics_(s) { 
  return String(s || "") 
    .toUpperCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, ""); 
} 

function _reEscape_(s) { 
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); 
} 

function _normPhrase_(s) { 
  return String(s || "") 
    .toLowerCase() 
    .normalize("NFD") 
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/[^a-z0-9]+/g, " ") 
    .replace(/\s+/g, " ") 
    .trim(); 
} 

function _normPhraseTokens_(s) { 
  const norm = _normPhrase_(s); 
  return norm ? norm.split(" ").filter(Boolean) : []; 
} 

function _buildFlexiblePhraseRegex_(phrase) { 
  const norm = _normPhrase_(phrase); 
  if (!norm) return null; 

  const parts = norm.split(" ").filter(Boolean).map(_reEscape_); 
  if (!parts.length) return null; 

  return new RegExp("\\b" + parts.join("\\W*") + "\\b", "i"); 
} 

function _textHasFlexiblePhrase_(text, phrase) { 
  const rx = _buildFlexiblePhraseRegex_(phrase); 
  if (!rx) return false; 
  return rx.test(_normPhrase_(text)); 
} 

function sadrziJednuOdRijeci(text, rijeci) { 
  if (!text || !rijeci || !rijeci.length) return false; 

  const low = String(text).toLowerCase(); 
  return rijeci.some(r => low.includes(String(r).toLowerCase())); 
} 

/* ── UI-driven matcher helpers: exact phrase + segment fuzzy matching ─── */ 

function _isShortAcronymToken_(tok) { 
  const t = _normPhrase_(tok); 
  return /^[a-z]{2,3}$/.test(t); 
} 

function _maxFuzzyDistanceForToken_(tok) { 
  const len = String(tok || "").length; 
  if (len < 3)  return -1; 
  if (len <= 6) return 1; 
  return 2; 
} 

function _compareMatcherTokens_(candidateToken, termToken) { 
  const cand = _normPhrase_(candidateToken); 
  const term = _normPhrase_(termToken); 

  if (!cand || !term) return null; 
  if (cand === term) return { ok: true, dist: 0 }; 

  const candLen = cand.length; 
  const termLen = term.length; 

  if (candLen < 3 || termLen < 3) return null; 
  if (_isShortAcronymToken_(cand) || _isShortAcronymToken_(term)) return null; 

  const cap = Math.min( 
    _maxFuzzyDistanceForToken_(cand), 
    _maxFuzzyDistanceForToken_(term) 
  ); 

  if (cap < 0) return null; 

  const d = _levenshteinDistanceCapped_(cand, term, cap); 
  if (d > cap) return null; 

  return { ok: true, dist: d }; 
} 

function _scoreSegmentAgainstTerm_(segmentTokens, termTokens) { 
  if (!segmentTokens || !termTokens) return null; 
  if (segmentTokens.length !== termTokens.length) return null; 

  let totalDist = 0; 
  let exactCount = 0; 

  for (let i = 0; i < termTokens.length; i++) { 
    const cmp = _compareMatcherTokens_(segmentTokens[i], termTokens[i]); 
    if (!cmp || !cmp.ok) return null; 

    totalDist += cmp.dist; 
    if (cmp.dist === 0) exactCount++; 
  } 

  return { totalDist, exactCount, tokenCount: termTokens.length }; 
} 

function _findBestSegmentFuzzyMatch_(text, phrase) { 
  const textTokens = _normPhraseTokens_(text); 
  const termTokens = _normPhraseTokens_(phrase); 

  if (!textTokens.length || !termTokens.length) return null; 
  if (textTokens.length < termTokens.length) return null; 

  let best = null; 

  for (let start = 0; start <= textTokens.length - termTokens.length; start++) { 
    const seg   = textTokens.slice(start, start + termTokens.length); 
    const score = _scoreSegmentAgainstTerm_(seg, termTokens); 

    if (!score) continue; 

    const candidate = { 
      start, 
      end: start + termTokens.length - 1, 
      totalDist: score.totalDist, 
      exactCount: score.exactCount, 
      tokenCount: score.tokenCount, 
      segment: seg.join(" "), 
      term: _normPhrase_(phrase) 
    }; 

    if (!best) { best = candidate; continue; } 
    if (candidate.totalDist < best.totalDist) { best = candidate; continue; } 
    if (candidate.totalDist === best.totalDist && candidate.exactCount > best.exactCount) { best = candidate; continue; } 

    if (candidate.totalDist === best.totalDist && 
        candidate.exactCount === best.exactCount && 
        candidate.term.length > best.term.length) { 
      best = candidate; 
    } 
  } 

  return best; 
} 

function _collectGroupedEntryTerms_(entry) { 
  if (!entry) return []; 

  const out = []; 
  const pushTerm = t => { 
    const s = String(t || "").trim(); 
    if (s) out.push(s); 
  }; 

  pushTerm(entry.name); 
  (entry.aliases || []).forEach(pushTerm); 

  const seen = {}; 

  return out.filter(term => { 
    const k = _normPhrase_(term); 
    if (!k || seen[k]) return false; 

    seen[k] = true; 
    return true; 
  }); 
} 

function _matchGroupedEntryByText_(text, groupedEntries) { 
  const detailed = _matchGroupedEntryDetailedByText_(String(text || ""), groupedEntries); 
  return detailed ? detailed.entry : null; 
} 

function _matchGroupedEntryDetailedByText_(text, groupedEntries) { 
  const sourceText = String(text || ""); 
  if (!_normPhrase_(sourceText)) return null; 

  const entries = Array.isArray(groupedEntries) ? groupedEntries : []; 
  if (!entries.length) return null; 

  // 1) Exact flexible phrase match. Prefer the longest match.
  let bestExact = null; 

  entries.forEach(entry => { 
    _collectGroupedEntryTerms_(entry).forEach(term => { 
      if (!_textHasFlexiblePhrase_(sourceText, term)) return; 

      const score = _normPhrase_(term).length; 

      if (!bestExact || score > bestExact.score) { 
        bestExact = { entry, score, term, matchedSegment: term, mode: "exact" }; 
      } 
    }); 
  }); 

  if (bestExact) return bestExact; 

  // 2) Segment fuzzy matching.
  let best = null; 
  let second = null; 

  entries.forEach(entry => { 
    _collectGroupedEntryTerms_(entry).forEach(term => { 
      const fuzzy = _findBestSegmentFuzzyMatch_(sourceText, term); 
      if (!fuzzy || fuzzy.totalDist <= 0) return; 

      const candidate = { 
        entry, 
        term, 
        totalDist: fuzzy.totalDist, 
        exactCount: fuzzy.exactCount, 
        termLen: _normPhrase_(term).length, 
        tokenCount: fuzzy.tokenCount, 
        matchedSegment: fuzzy.segment, 
        mode: "fuzzy" 
      }; 

      const isBetter = 
        !best || 
        candidate.totalDist < best.totalDist || 
        (candidate.totalDist === best.totalDist && candidate.exactCount > best.exactCount) || 
        (candidate.totalDist === best.totalDist && 
         candidate.exactCount === best.exactCount && 
         candidate.termLen > best.termLen); 

      if (isBetter) { 
        second = best; 
        best = candidate; 
      } else { 
        const isBetterThanSecond = 
          !second || 
          candidate.totalDist < second.totalDist || 
          (candidate.totalDist === second.totalDist && candidate.exactCount > second.exactCount) || 
          (candidate.totalDist === second.totalDist && 
           candidate.exactCount === second.exactCount && 
           candidate.termLen > second.termLen); 

        if (isBetterThanSecond) second = candidate; 
      } 
    }); 
  }); 

  if (!best) return null; 

  // Ambiguity guard.
  if (second && 
      second.entry !== best.entry && 
      second.totalDist === best.totalDist && 
      second.exactCount === best.exactCount && 
      Math.abs(second.termLen - best.termLen) <= 1) { 
    return null; 
  } 

  return best; 
} 

function _replaceMatchedSegmentOnly_(originalText, matchedSegment, correctedTerm) { 
  const raw       = String(originalText || ""); 
  const matched   = String(matchedSegment || "").trim(); 
  const corrected = String(correctedTerm || "").trim(); 

  if (!raw.trim() || !matched || !corrected) return raw.toUpperCase(); 

  const rawTokens       = _normPhraseTokens_(raw); 
  const segTokens       = _normPhraseTokens_(matched); 
  const correctedTokens = _normPhraseTokens_(corrected); 

  if (!rawTokens.length || !segTokens.length || rawTokens.length < segTokens.length) { 
    return raw.toUpperCase(); 
  } 

  for (let start = 0; start <= rawTokens.length - segTokens.length; start++) { 
    let ok = true; 

    for (let i = 0; i < segTokens.length; i++) { 
      const cmp = _compareMatcherTokens_(rawTokens[start + i], segTokens[i]); 
      if (!cmp || !cmp.ok) { 
        ok = false; 
        break; 
      } 
    } 

    if (!ok) continue; 

    return [] 
      .concat(rawTokens.slice(0, start)) 
      .concat(correctedTokens) 
      .concat(rawTokens.slice(start + segTokens.length)) 
      .join(" ") 
      .toUpperCase(); 
  } 

  return raw.toUpperCase(); 
} 

function _canonicalizeGroupedEntryText_(text, groupedEntries) { 
  const raw = String(text || "").trim(); 
  if (!raw) return null; 

  const detailed = _matchGroupedEntryDetailedByText_(raw, groupedEntries); 
  if (!detailed || !detailed.entry || !detailed.term) return null; 

  const correctedTerm = String(detailed.term || "").trim(); 
  if (!correctedTerm) return null; 

  const correctedText = _replaceMatchedSegmentOnly_( 
    raw, 
    String(detailed.matchedSegment || correctedTerm), 
    correctedTerm 
  ); 

  return { 
    entry: detailed.entry, 
    correctedText, 
    correctedTerm, 
    matchedSegment: String(detailed.matchedSegment || ""), 
    mode: detailed.mode 
  }; 
} 

function _cekFlagKey2h_(rowId) { 
  const id = String(rowId || "").trim(); 
  if (!id) return ""; 

  return "cek_" + _todayZg_() + "_2h_" + id; 
} 

function _getRowId_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_ID).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _ensureRowId_(sheet, row) { 
  let rowId = _getRowId_(sheet, row); 
  if (rowId) return rowId; 

  rowId = Utilities.getUuid(); 

  try { 
    sheet.getRange(row, STUPAC_ID).setValue(rowId).setFontColor("black"); 
  } catch (e) {} 

  return rowId; 
} 
 
function _isVipRowByI_(iText) { 
  return _isPrioritetnoText_(String(iText || "")); 
} 

function _hasAlarmEmoji_(bText) { 
  return String(bText || "").includes("⚠️"); 
} 

function _stripAlarmEmoji_(bText) { 
  return String(bText || "") 
    .replace(/^⚠️\s*/, "") 
    .split(EMOJI_ALARM).join("") 
    .replace(/\s{2,}/g, " ") 
    .trim(); 
} 

function _ensureAlarmEmojiInB_(bText) { 
  const clean = _stripAlarmEmoji_(bText); 
  if (!clean) return ""; 

  return clean + EMOJI_ALARM; 
} 

function _hasWait2hTag_(bText) { 
  return String(bText || "").includes(TEKST_CEKANJE); 
} 

function _hasWaitSportTag_(bText) { 
  return String(bText || "").includes(TEKST_CEKANJE_SPORT); 
} 

function _cleanWaitDecorButPreserveVip_(bText, isVip) { 
  let cleaned = String(bText || "") 
    .replace(/^⚠️\s*/i, "") 
    .replace(new RegExp(_reEscape_(TEKST_CEKANJE), "gi"), "") 
    .replace(new RegExp(_reEscape_(TEKST_CEKANJE_SPORT), "gi"), "") 
    .split(EMOJI_ALARM).join("") 
    .replace(/\s{2,}/g, " ") 
    .trim(); 

  if (isVip && cleaned) cleaned += EMOJI_ALARM; 

  return cleaned; 
} 

/* ── Sheet scan helpers ───────────────────────────────────────────────── */ 

function _findNextEmptyRowInColumn_(sheet, col, startRow, maxRow) { 
  startRow = Math.max(1, Number(startRow) || 1); 
  maxRow   = Math.min(Number(maxRow) || sheet.getMaxRows(), sheet.getMaxRows()); 

  if (maxRow < startRow) return startRow; 

  const vals = sheet.getRange(startRow, col, maxRow - startRow + 1, 1).getDisplayValues(); 
  let lastNonEmpty = startRow - 1; 

  for (let i = vals.length - 1; i >= 0; i--) { 
    if (_trim_(vals[i][0]) !== "") { 
      lastNonEmpty = startRow + i; 
      break; 
    } 
  } 

  return Math.min(lastNonEmpty + 1, maxRow); 
} 

function _setReportStatusInColumnB_(sheet, text, bg) { 
  try { 
    const row  = _findNextEmptyRowInColumn_(sheet, STUPAC_B, 2, Math.min(sheet.getMaxRows(), MAX_TEMPLATE_ROW)); 
    const cell = sheet.getRange(row, STUPAC_B); 

    cell.setValue(text); 
    if (bg) cell.setBackground(bg); 
  } catch (e) {} 
} 

function _groupConsecutiveRows_(rows) { 
  if (!rows || !rows.length) return []; 

  const sorted = rows.slice().sort((a, b) => a - b); 
  const out = []; 

  let start = sorted[0]; 
  let prev = sorted[0]; 

  for (let i = 1; i < sorted.length; i++) { 
    const cur = sorted[i]; 

    if (cur === prev + 1) { 
      prev = cur; 
      continue; 
    } 

    out.push({ start, len: prev - start + 1 }); 
    start = cur; 
    prev = cur; 
  } 

  out.push({ start, len: prev - start + 1 }); 
  return out; 
} 

function _scanEndRowByColumnB_(sheet, maxRow, bufferRows) { 
  const hardMax = Math.min(Number(maxRow) || MAX_TEMPLATE_ROW, sheet.getMaxRows(), MAX_TEMPLATE_ROW); 
  if (hardMax < 2) return 2; 

  const vB = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getDisplayValues(); 
  let lastNonEmpty = 1; 

  for (let i = vB.length - 1; i >= 0; i--) { 
    if (_trim_(vB[i][0]) !== "") { 
      lastNonEmpty = i + 2; 
      break; 
    } 
  } 

  return Math.max(2, Math.min(hardMax, lastNonEmpty + Math.max(0, Number(bufferRows) || 0))); 
} 

function _scanEndRowByLastStruckInB_(sheet, maxRow, bufferRows) { 
  const hardMax = Math.min(Number(maxRow) || MAX_TEMPLATE_ROW, sheet.getMaxRows(), MAX_TEMPLATE_ROW); 
  if (hardMax < 2) return 2; 

  const fL = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getFontLines(); 
  let lastStruck = 0; 

  for (let i = fL.length - 1; i >= 0; i--) { 
    if (fL[i][0] === "line-through") { 
      lastStruck = i + 2; 
      break; 
    } 
  } 

  if (!lastStruck) return 2; 

  return Math.max(2, Math.min(hardMax, lastStruck + Math.max(0, Number(bufferRows) || 0))); 
} 

function _isReportOrKpiRowInB_(bText) { 
  const t = _trim_(bText); 
  if (!t) return false; 

  const low = t.toLowerCase(); 

  if (t.startsWith("✅") || t.startsWith("⛔")) return true; 
  if (low.startsWith("saved") || low.startsWith("error")) return true; 
  if (low.startsWith("spremjeno") || low.startsWith("greška") || low.startsWith("greska")) return true; 
  if (low.startsWith("category-a (") || low.startsWith("category-b (")) return true; 
  if (low.startsWith("kat (") || low.startsWith("sportski (")) return true; 

  return false; 
} 

function _lastDataRowByColumnB_(sheet) { 
  const hardMax = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (hardMax < 2) return 1; 

  const vB = sheet.getRange(2, STUPAC_B, hardMax - 1, 1).getDisplayValues(); 

  for (let i = vB.length - 1; i >= 0; i--) { 
    const b = _trim_(vB[i][0]); 

    if (!b || _isReportOrKpiRowInB_(b)) continue; 
    return i + 2; 
  } 

  return 1; 
} 

/**
 * Backwards-compatible alias from the original implementation.
 */
function _lastPatientRowByColumnB_(sheet) { 
  return _lastDataRowByColumnB_(sheet); 
} 

function _fixNextEmptyBRowIfStruck_() { 
  const sheet = _getTargetSheet_(); 
  if (!sheet) return null; 

  const endRow = Math.min(MAX_TEMPLATE_ROW, sheet.getMaxRows()); 
  if (endRow < 2) return null; 

  const numRows = endRow - 1; 
  const rangeB  = sheet.getRange(2, STUPAC_B, numRows, 1); 
  const vB      = rangeB.getDisplayValues(); 
  const fL      = rangeB.getFontLines(); 

  let firstEmpty = -1; 

  for (let i = 0; i < numRows; i++) { 
    if (_trim_(vB[i][0]) === "") { 
      firstEmpty = i; 
      break; 
    } 
  } 

  if (firstEmpty < 0) return null; 

  let changed = 0; 

  for (let i = firstEmpty; i < numRows; i++) { 
    if (_trim_(vB[i][0]) !== "") break; 

    if (fL[i][0] === "line-through") { 
      sheet.getRange(i + 2, STUPAC_B).setFontLine("none"); 
      changed++; 
    } 
  } 

  return { row: firstEmpty + 2, changed }; 
}

/* ── Row signature / row state helpers ───────────────────────────────── */ 

function _hashString32_(input) { 
  const s = String(input == null ? "" : input); 
  let h = 2166136261; 

  for (let i = 0; i < s.length; i++) { 
    h ^= s.charCodeAt(i); 
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); 
  } 

  return (h >>> 0).toString(16).padStart(8, "0"); 
} 

function _sigPart_(v) { 
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); 
} 

function _buildRowSignatureLite_(ctx) { 
  const parts = [ 
    "B="   + _sigPart_(_ctxVal_(ctx, STUPAC_B)), 
    "C="   + _sigPart_(_ctxVal_(ctx, STUPAC_C)), 
    "D="   + _sigPart_(_ctxVal_(ctx, STUPAC_D)), 
    "E="   + _sigPart_(_ctxVal_(ctx, STUPAC_E)), 
    "F="   + _sigPart_(_ctxVal_(ctx, STUPAC_F)), 
    "G="   + _sigPart_(_ctxVal_(ctx, STUPAC_G)), 
    "H="   + _sigPart_(_ctxVal_(ctx, STUPAC_H)), 
    "I="   + _sigPart_(_ctxVal_(ctx, STUPAC_I)), 
    "J="   + _sigPart_(_ctxVal_(ctx, STUPAC_J)), 
    "FLB=" + _sigPart_(ctx.fontLineB || "none") 
  ]; 

  return _hashString32_(parts.join("¦")); 
} 

function _deriveRowStateLite_(ctx) { 
  const b = String(_ctxVal_(ctx, STUPAC_B) || ""); 
  const i = String(_ctxVal_(ctx, STUPAC_I) || ""); 
  const bTrim = _trim_(b); 

  if (!bTrim) return "EMPTY"; 
  if (_isReportOrKpiRowInB_(bTrim)) return "SYS"; 
  if (ctx.fontLineB === "line-through") return "DONE_PENDING_CLEAN"; 
  if (_isVipRowByI_(i)) return "VIP"; 
  if (_hasWaitSportTag_(b)) return "WAIT_SPORT"; 
  if (_hasWait2hTag_(b)) return "WAIT_2H"; 

  return "ACTIVE"; 
} 

function _getRowSysState_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_SYS_STATE).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _getRowSysSignature_(sheet, row) { 
  try { 
    return _trim_(sheet.getRange(row, STUPAC_SYS_SIG).getDisplayValue()); 
  } catch (e) { 
    return ""; 
  } 
} 

function _patchSetRowSysState_(patch, state) { 
  if (typeof STUPAC_SYS_STATE !== "number") return; 
  _patchSetValue_(patch, STUPAC_SYS_STATE, String(state || "")); 
} 

function _patchSetRowSysSignature_(patch, signature) { 
  if (typeof STUPAC_SYS_SIG !== "number") return; 
  _patchSetValue_(patch, STUPAC_SYS_SIG, String(signature || "")); 
} 

function _isSameRowSignatureAlreadyStored_(sheet, row, signature) { 
  try { 
    const oldSig = _getRowSysSignature_(sheet, row); 
    return !!oldSig && oldSig === String(signature || ""); 
  } catch (e) { 
    return false; 
  } 
} 

function _patchFinalizeRowMeta_(ctx, patch) { 
  const state = _deriveRowStateLite_(ctx); 
  const sig   = _buildRowSignatureLite_(ctx); 

  _patchSetRowSysState_(patch, state); 
  _patchSetRowSysSignature_(patch, sig); 

  return { state, sig }; 
} 

/* ── Lite row context / patch helpers ────────────────────────────────── */ 

const LITE_DEBUG_ENABLED = false; 

function _liteDebug_() { 
  if (!LITE_DEBUG_ENABLED) return; 

  try { 
    console.log.apply(console, arguments); 
  } catch (e) {} 
} 

function _ctxColOffset_(col) { 
  return Number(col) - STUPAC_B; 
} 

function _buildRowContextLite_(sheet, row, editedCol, allowUi, unesenaVrijednost) { 
  const rowDisp   = sheet.getRange(row, STUPAC_B, 1, STUPAC_J - STUPAC_B + 1).getDisplayValues()[0]; 
  const fontLineB = sheet.getRange(row, STUPAC_B).getFontLine(); 

  return { 
    sheet, 
    row, 
    editedCol: Number(editedCol), 
    allowUi: !!allowUi, 
    rowDisp: rowDisp.slice(), 
    fontLineB: fontLineB || "none", 
    editedValue: String(unesenaVrijednost == null ? "" : unesenaVrijednost) 
  }; 
} 

/* ── Patch helpers ───────────────────────────────────────────────────── */ 

function _ctxVal_(ctx, col) { 
  const idx = _ctxColOffset_(col); 
  return (idx < 0 || idx >= ctx.rowDisp.length) ? "" : ctx.rowDisp[idx]; 
} 

function _ctxSetVal_(ctx, col, value) { 
  const idx = _ctxColOffset_(col); 

  if (idx < 0 || idx >= ctx.rowDisp.length) return; 

  ctx.rowDisp[idx] = String(value == null ? "" : value); 
} 

function _newRowPatch_() { 
  return { values: {}, backgrounds: [], richText: {}, clearNotes: {}, fontColors: {} }; 
} 

function _patchSetValue_(patch, col, value) { 
  patch.values[String(col)] = String(value == null ? "" : value); 
} 

function _patchSetBackground_(patch, colStart, numCols, color) { 
  patch.backgrounds.push({ colStart: Number(colStart), numCols: Number(numCols), color }); 
} 

function _patchSetRichText_(patch, col, richTextValue) { 
  patch.richText[String(col)] = richTextValue; 
} 

function _patchClearNote_(patch, col) { 
  patch.clearNotes[String(col)] = true; 
} 

function _patchSetFontColor_(patch, col, color) { 
  patch.fontColors[String(col)] = color; 
} 

function _buildTaggedRichTextValue_(text, taggedParts) { 
  const txt     = String(text || ""); 
  const builder = SpreadsheetApp.newRichTextValue().setText(txt); 

  (taggedParts || []).forEach(part => { 
    if (!part || !part.text) return; 

    const start = Number(part.start); 
    const end   = Number(part.end); 

    if (!(end > start)) return; 

    builder.setTextStyle(start, end, part.style); 
  }); 

  return builder.build(); 
} 

function _patchSetRichOrPlain_(patch, col, text, taggedParts) { 
  const txt = String(text || ""); 

  if (!taggedParts || !taggedParts.length) { 
    _patchSetValue_(patch, col, txt); 
    return; 
  } 

  _patchSetRichText_(patch, col, _buildTaggedRichTextValue_(txt, taggedParts)); 
} 

function _applyRowPatchLite_(sheet, row, patch) { 
  if (!patch) return; 

  Object.keys(patch.clearNotes || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).clearNote(); 
    } catch (e) { 
      console.error("_applyRowPatchLite clearNote error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  (patch.backgrounds || []).forEach(bg => { 
    try { 
      sheet.getRange(row, bg.colStart, 1, bg.numCols).setBackground(bg.color); 
    } catch (e) { 
      console.error("_applyRowPatchLite background error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  const valueCols = Object.keys(patch.values || {}) 
    .map(Number) 
    .filter(col => !(patch.richText && patch.richText[String(col)])) 
    .sort((a, b) => a - b); 

  if (valueCols.length) { 
    const groups = []; 

    let start = valueCols[0]; 
    let prev  = valueCols[0]; 

    for (let i = 1; i < valueCols.length; i++) { 
      const col = valueCols[i]; 

      if (col === prev + 1) { 
        prev = col; 
        continue; 
      } 

      groups.push({ start, end: prev }); 
      start = col; 
      prev = col; 
    } 

    groups.push({ start, end: prev }); 

    groups.forEach(g => { 
      try { 
        const rowVals = []; 

        for (let col = g.start; col <= g.end; col++) { 
          rowVals.push(patch.values[String(col)] == null ? "" : patch.values[String(col)]); 
        } 

        sheet.getRange(row, g.start, 1, g.end - g.start + 1).setValues([rowVals]); 
      } catch (e) { 
        console.error("_applyRowPatchLite setValues error:", e && e.stack ? e.stack : e); 
      } 
    }); 
  } 

  Object.keys(patch.richText || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).setRichTextValue(patch.richText[colStr]); 
    } catch (e) { 
      console.error("_applyRowPatchLite richText error:", e && e.stack ? e.stack : e); 
    } 
  }); 

  Object.keys(patch.fontColors || {}).forEach(colStr => { 
    try { 
      sheet.getRange(row, Number(colStr)).setFontColor(patch.fontColors[colStr]); 
    } catch (e) { 
      console.error("_applyRowPatchLite fontColor error:", e && e.stack ? e.stack : e); 
    } 
  }); 
}

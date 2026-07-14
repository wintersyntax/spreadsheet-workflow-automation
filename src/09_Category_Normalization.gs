/* ═══════════════════════════════════════════════════════════════════════ 
 * 09 · CATEGORY NORMALIZATION — Domain normalization for category/type combinations
 * ═══════════════════════════════════════════════════════════════════════ */ 

const KAT_CATEGORY_TOKENS_ORDER = [ 
  "A", "B", "AM", "A1", "A2", 
  "BE", "DE", 
  "PROF", 
  "C1E", "C1", "CE", "C", 
  "D1E", "D1", "D", 
  "E", "H" 
]; 

function _tokenizeUpper_(sUpper) { 
  const re  = /[A-Z]{1,2}\d+[A-Z]+|[A-Z]{1,2}\d+|[A-Z]+/g; 
  const out = []; 
  let m; 

  while ((m = re.exec(String(sUpper || ""))) !== null) out.push(m[0]); 

  return out; 
} 

function _isWorkflowMarkerToken_(tok) {
  const t = String(tok || "").toUpperCase();
  return t === "PUR" || t === "REGISTER";
}

function _workflowMarkerFromTokens_(tokens) {
  const toks = Array.isArray(tokens) ? tokens : [];
  const found = toks.find(_isWorkflowMarkerToken_);
  return found === "PUR" ? "PUR" : "REGISTER";
}

function _isFuzzyKategorija_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "KATEGORIJA" || t === "KATEGORIJE") return true; 

  return _levenshteinDistanceCapped_(t, "KATEGORIJA", 2) <= 2; 
} 

function _isExactProduljenje_(tok) { 
  return tok === "PRODULJENJE" || tok === "PRODULJENJA"; 
} 

function _isFuzzyProduljenje_(tok) { 
  const t = String(tok || ""); 
  if (!t || _isExactProduljenje_(t)) return false; 
  if (t === "PRODUZENJE" || t === "PRODUZENJA") return true; 

  return _levenshteinDistanceCapped_(t, "PRODULJENJE", 2) <= 2 
      || _levenshteinDistanceCapped_(t, "PRODUZENJE",  2) <= 2; 
} 

function _isExactIzvanredni_(tok) { 
  return String(tok || "") === "IZVANREDNI"; 
} 

function _isFuzzyIzvanredni_(tok) { 
  const t = String(tok || ""); 
  return t && !_isExactIzvanredni_(t) && _levenshteinDistanceCapped_(t, "IZVANREDNI", 2) <= 2; 
} 

function _isCategoryToken_(tok) { 
  return KAT_CATEGORY_TOKENS_ORDER.indexOf(String(tok || "")) !== -1; 
} 

function _isFuzzyZamjena_(tok) { 
  const t = String(tok || ""); 
  if (t.length < 5) return false; 
  if (["ZAMJENA", "ZAMJENE", "ZAMJENOM", "ZAMJENU"].includes(t)) return true; 

  return _levenshteinDistanceCapped_(t, "ZAMJENA", 2) <= 2; 
} 

function _isZamjenaPratecniToken_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 

  for (const group of [ 
    ["ZAMJENA", "ZAMJENE", "ZAMJENOM", "ZAMJENU"], 
    ["INOZEMNE", "INOZEMNA", "INOZEMNU", "INOZEMNOM"], 
    ["VOZACKE", "VOZACKA", "VOZACKU", "VOZACKOM"], 
    ["DOZVOLE", "DOZVOLA", "DOZVOLU", "DOZVOLOM"] 
  ]) { 
    if (group.includes(t)) return true; 
    if (_levenshteinDistanceCapped_(t, group[0], 2) <= 2) return true; 
  } 

  return false; 
} 

function _isFuzzySportski_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "SPORTSKI") return true; 

  return _levenshteinDistanceCapped_(t, "SPORTSKI", 2) <= 2; 
} 

function _looksLikeSportskiText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0 = _normUpperNoDiacritics_(s); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

  if (compact === "SPORTSKI") return true; 

  const tokens = _tokenizeUpper_(up0); 
  return tokens.some(_isFuzzySportski_); 
} 

function _normalizeSportskiStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  const up0 = _normUpperNoDiacritics_(original); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

  if (compact === "SPORTSKI") { 
    return original === "SPORTSKI" ? null : { text: "SPORTSKI" }; 
  } 

  const tokens = _tokenizeUpper_(up0); 
  if (!tokens.length) return null; 

  if (tokens.length === 1 && _isFuzzySportski_(tokens[0])) { 
    return { text: "SPORTSKI" }; 
  } 

  return null; 
} 

/* ── ROČNIK helpers ──────────────────────────────────────────────────── */ 

function _looksLikeRocnikText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0    = _normUpperNoDiacritics_(s); 
  const tokens = _tokenizeUpper_(up0); 

  return tokens.some(t => 
    t === "MORH"    || 
    t === "HV"      || 
    t === "VOJSKA"  || 
    t === "ROCNIK"  || 
    t === "ROCNICI" || 
    t === "NOVAK"   || 
    t === "NOVACI" 
  ); 
} 

function _normalizeRocnikStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 
  if (!_looksLikeRocnikText_(original)) return null; 
  if (original === "ROČNIK") return null; 

  return { text: "ROČNIK" }; 
} 

function _isFuzzyPromjena_(tok) { 
  const t = String(tok || ""); 
  if (!t) return false; 
  if (t === "PROMJENA") return true; 

  return _levenshteinDistanceCapped_(t, "PROMJENA", 2) <= 2; 
} 

function _fuzzyMatchPZS_tokens_(tokens) { 
  for (let i = 0; i + 2 < tokens.length; i++) { 
    if (_levenshteinDistanceCapped_(tokens[i],     "PROMJENA",     2) <= 2 && 
        _levenshteinDistanceCapped_(tokens[i + 1], "ZDRAVSTVENOG", 3) <= 3 && 
        _levenshteinDistanceCapped_(tokens[i + 2], "STANJA",       2) <= 2) { 
      return true; 
    } 
  } 

  return false; 
} 

function _extractIzvanredniReason_(rawUpperNoDia) { 
  const s = String(rawUpperNoDia || ""); 
  const tokens = _tokenizeUpper_(s); 

  if (/\bPROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*\b/.test(s)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (_fuzzyMatchPZS_tokens_(tokens)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (/\bPROMJEN\w*\b/.test(s) || tokens.some(_isFuzzyPromjena_)) { 
    return "PROMJENA ZDRAVSTVENOG STANJA"; 
  } 

  if (/\bALKOHOL\w*\b/.test(s)) return "ALKOHOL"; 
  if (/\bDROG\w*\b/.test(s)) return "DROGA"; 

  return null; 
} 

function _extractIzvanredniTag_(rawUpperNoDia) { 
  const s = String(rawUpperNoDia || ""); 
  const m = s.match(/\bIZVANREDNI\b\s*[-\u2013\u2014]\s*(ALKOHOL\w*|DROG\w*|PROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*|PROMJEN\w*)\b/); 

  if (m) { 
    const det = String(m[1] || "").replace(/\s+/g, " ").trim(); 

    if (/^ALKOHOL/.test(det)) return "IZVANREDNI - ALKOHOL"; 
    if (/^DROG/.test(det))    return "IZVANREDNI - DROGA"; 
    if (/^PROMJEN/.test(det)) return "IZVANREDNI - PROMJENA ZDRAVSTVENOG STANJA"; 

    return "IZVANREDNI"; 
  } 

  if (/\bIZVANREDNI\b/.test(s)) { 
    const reason = _extractIzvanredniReason_(s); 
    return reason ? "IZVANREDNI - " + reason : "IZVANREDNI"; 
  } 

  return null; 
} 
 
function _looksLikeKatLikeText_(raw) { 
  const s = String(raw || "").trim(); 
  if (!s) return false; 

  const up0    = _normUpperNoDiacritics_(s); 
  const tokens = _tokenizeUpper_(up0); 

  return tokens.includes("KAT") || 
         tokens.some(_isFuzzyKategorija_) || 
         tokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)) || 
         tokens.some(_isCategoryToken_) || 
         tokens.some(_isExactIzvanredni_) || 
         tokens.some(_isFuzzyIzvanredni_) || 
         tokens.some(_isFuzzyZamjena_); 
} 

function _normalizeKatLikeStandalone_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  const up0     = _normUpperNoDiacritics_(original); 
  const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 
  const tokens  = _tokenizeUpper_(up0); 

  if (compact === "SPORTSKI") return { text: "SPORTSKI" }; 

  let hasKatWord = (tokens.indexOf("KAT") !== -1); 
  let hasKategF  = false; 
  let hasProd    = false; 
  let hasIzExact = false; 
  let hasIzFuzzy = false; 
  let hasZamjena = false; 

  for (const t of tokens) { 
    if (_isFuzzyKategorija_(t)) hasKategF = true; 
    if (_isExactProduljenje_(t) || _isFuzzyProduljenje_(t)) hasProd = true; 
    if (_isExactIzvanredni_(t)) hasIzExact = true; 
    else if (_isFuzzyIzvanredni_(t)) hasIzFuzzy = true; 
    if (_isFuzzyZamjena_(t)) hasZamjena = true; 
  } 

  if (!hasKatWord && !hasKategF && !hasProd && !hasIzExact && !hasIzFuzzy && !hasZamjena && 
      !tokens.some(_isCategoryToken_)) { 
    return null; 
  } 

  const seenCat = {}; 
  const chosenTokens = []; 

  for (const t of tokens) { 
    if (_isCategoryToken_(t) && !seenCat[t]) { 
      chosenTokens.push(t); 
      seenCat[t] = true; 
    } 
  } 

  let izvanTag = _extractIzvanredniTag_(up0); 

  if (!izvanTag && (hasIzExact || hasIzFuzzy)) { 
    const ir = _extractIzvanredniReason_(up0); 
    izvanTag = ir ? "IZVANREDNI - " + ir : "IZVANREDNI"; 
  } 

  if (!izvanTag && (hasKatWord || hasKategF || hasProd)) { 
    const ir = _extractIzvanredniReason_(up0); 
    if (ir) izvanTag = "IZVANREDNI - " + ir; 
  } 

  const zamjenaTag = (hasZamjena && (hasKatWord || hasKategF || hasProd || chosenTokens.length > 0)) 
    ? "ZAMJENA INOZEMNE VOZAČKE DOZVOLE" 
    : null; 

  if (chosenTokens.length > 0) { 
    let canon = chosenTokens.join(" ") + " KAT"; 

    if (hasProd) canon += " PRODULJENJE"; 
    if (izvanTag) canon += " " + izvanTag; 
    if (zamjenaTag) canon += " " + zamjenaTag; 

    return { text: canon }; 
  } 

  let fallback = tokens.slice(); 

  for (let i = 0; i < fallback.length; i++) { 
    if (_isFuzzyKategorija_(fallback[i])) { 
      fallback[i] = "KAT"; 
      hasKatWord = true; 
    } else if (_isExactProduljenje_(fallback[i]) || _isFuzzyProduljenje_(fallback[i])) { 
      fallback[i] = "PRODULJENJE"; 
    } else if (_isExactIzvanredni_(fallback[i]) || _isFuzzyIzvanredni_(fallback[i])) { 
      fallback[i] = "IZVANREDNI"; 
    } 
  } 

  if (hasProd && fallback.indexOf("KAT") === -1) { 
    fallback.push("KAT"); 
  } 

  fallback = fallback.filter(t => !(zamjenaTag && _isZamjenaPratecniToken_(t))); 

  let out = fallback.join(" ").replace(/\s+/g, " ").trim(); 

  if (izvanTag) { 
    out = out 
      .replace(/\bIZVANREDNI\b(\s*[-\u2013\u2014]?\s*(ALKOHOL\w*|DROG\w*|PROMJEN\w*\s+ZDRAVSTVEN\w*\s+STANJ\w*|PROMJEN\w*))?/g, "") 
      .replace(/\s+/g, " ") 
      .trim(); 

    out = (out ? out + " " : "") + izvanTag; 
  } 

  if (zamjenaTag) out = (out ? out + " " : "") + zamjenaTag; 

  return { text: out }; 
} 

function _sanitizeInvalidKatTypeSegment_(segmentRaw) { 
  const raw = String(segmentRaw || "").trim(); 
  if (!raw) return null; 

  const up0    = _normUpperNoDiacritics_(raw); 
  const tokens = _tokenizeUpper_(up0); 

  if (!tokens.length) return null; 

  const seenCat = {}; 
  const cats = []; 

  for (const t of tokens) { 
    if (_isCategoryToken_(t) && !seenCat[t]) { 
      cats.push(t); 
      seenCat[t] = true; 
    } 
  } 

  const hasKatWord = 
    tokens.includes("KAT") || 
    tokens.some(_isFuzzyKategorija_) || 
    cats.length > 0; 

  if (!hasKatWord) return null; 

  const hasProd = tokens.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t)); 
  const hasIzv = tokens.some(t => _isExactIzvanredni_(t) || _isFuzzyIzvanredni_(t)); 

  const hasZamjena = 
    tokens.some(_isFuzzyZamjena_) || 
    /\bZAMJEN\w*\s+INOZEMN\w*\s+VOZAC\w*\s+DOZVOL\w*\b/.test(up0); 

  const mutuallyExclusiveCount = [hasProd, hasIzv, hasZamjena].filter(Boolean).length; 

  if (mutuallyExclusiveCount <= 1) return null; 

  const leftBase = cats.length ? (cats.join(" ") + " KAT") : "KAT"; 
  return leftBase + " [invalid workflow type]"; 
} 

function _sanitizeInvalidKatType_(vCraw) { 
  const s0 = String(vCraw || "").trim(); 
  if (!s0) return null; 

  const plusIdx = s0.indexOf("+"); 

  if (plusIdx < 0) { 
    return _sanitizeInvalidKatTypeSegment_(s0); 
  } 

  const leftPart  = s0.slice(0, plusIdx).trim(); 
  const rightPart = s0.slice(plusIdx + 1).trim(); 

  const leftSan  = _sanitizeInvalidKatTypeSegment_(leftPart); 
  const rightSan = _sanitizeInvalidKatTypeSegment_(rightPart); 

  if (leftSan && rightSan) return leftSan + " + " + rightSan; 
  if (leftSan)             return rightPart ? (leftSan + " + " + rightPart) : leftSan; 
  if (rightSan)            return leftPart ? (leftPart + " + " + rightSan) : rightSan; 

  return null; 
} 

/* ── POMORAC / VODITELJ BRODICE helpers ──────────────────────────────── */ 

function _containsVoditeljBrodice_(raw) { 
  return _textHasFlexiblePhrase_(String(raw || ""), "voditelj brodice"); 
} 

function _extractRegisterTypeCanonFromLeft_(leftRaw) { 
  const left = String(leftRaw || "").trim(); 
  if (!left) return null; 

  const up   = _normUpperNoDiacritics_(left); 
  const toks = _tokenizeUpper_(up); 
  const pIdx = toks.findIndex(_isWorkflowMarkerToken_); 

  if (pIdx < 0) return null; 

  const REGISTER_TYPE_CANONS = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
  ]; 

  for (const offset of [1, -1]) { 
    const idx = pIdx + offset; 
    if (idx < 0 || idx >= toks.length) continue; 

    for (const c of REGISTER_TYPE_CANONS) { 
      if (_levenshteinDistanceCapped_(toks[idx], c.key, c.cap) <= c.cap) { 
        return c.canon; 
      } 
    } 
  } 

  return null; 
} 

function _extractWorkflowMarkerFromLeft_(leftRaw) {
  const up = _normUpperNoDiacritics_(String(leftRaw || ""));
  const toks = _tokenizeUpper_(up);
  return _workflowMarkerFromTokens_(toks);
}

function _normalizePomoracSpecialCase_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  if (!_containsVoditeljBrodice_(original)) return null; 

  const plusIdx  = original.indexOf("+"); 
  const leftRaw  = plusIdx >= 0 ? original.slice(0, plusIdx).trim() : original; 
  const rightRaw = plusIdx >= 0 ? original.slice(plusIdx + 1).trim() : ""; 

  const leftHasVoditelj  = _containsVoditeljBrodice_(leftRaw); 
  const rightHasVoditelj = _containsVoditeljBrodice_(rightRaw); 

  // Case: PUR/REGISTER TYPE + VODITELJ BRODICE ...
  if (plusIdx >= 0 && rightHasVoditelj) { 
    const registerType = _extractRegisterTypeCanonFromLeft_(leftRaw); 

    if (registerType) { 
      const marker = _extractWorkflowMarkerFromLeft_(leftRaw);
      const canon = marker + " " + registerType + " + POMORAC"; 
      return original === canon ? null : { text: canon }; 
    } 
  } 

  // Case: VODITELJ BRODICE + PUR/REGISTER TYPE
  if (plusIdx >= 0 && leftHasVoditelj) {
    const registerType = _extractRegisterTypeCanonFromLeft_(rightRaw);

    if (registerType) {
      const marker = _extractWorkflowMarkerFromLeft_(rightRaw);
      const canon = "POMORAC + " + marker + " " + registerType;
      return original === canon ? null : { text: canon };
    }
  }

  // Fallback: if the phrase appears anywhere without a recognized workflow type,
  // normalize it to POMORAC.
  if (leftHasVoditelj || rightHasVoditelj || _containsVoditeljBrodice_(original)) { 
    return original === "POMORAC" ? null : { text: "POMORAC" }; 
  } 

  return null; 
} 

function _normalizeC_forKATandSPORT_(raw) { 
  const original = String(raw || "").trim(); 
  if (!original) return null; 

  // Priority: ROČNIK aliases → ROČNIK.
  const rocnikSpecial = _normalizeRocnikStandalone_(original); 
  if (rocnikSpecial) return rocnikSpecial; 

  // Priority: VODITELJ BRODICE → POMORAC / PUR|REGISTER + POMORAC.
  const pomoracSpecial = _normalizePomoracSpecialCase_(original); 
  if (pomoracSpecial) return pomoracSpecial; 

  const plusIdx  = original.indexOf("+"); 
  const leftRaw  = plusIdx >= 0 ? original.slice(0, plusIdx).trim() : original; 
  const rightRaw = plusIdx >= 0 ? original.slice(plusIdx + 1).trim() : ""; 

  const upLeft      = _normUpperNoDiacritics_(leftRaw); 
  const compactLeft = upLeft.replace(/[\s\W_]+/g, " ").trim(); 
  const leftTokens  = _tokenizeUpper_(upLeft); 

  // PUR/REGISTER logic before the plus sign.
  const workflowIdx = leftTokens.findIndex(_isWorkflowMarkerToken_);
  const hasWorkflowToken = workflowIdx >= 0;
  const workflowMarker = hasWorkflowToken ? _workflowMarkerFromTokens_(leftTokens) : "REGISTER";

  if (hasWorkflowToken) { 
    const REGISTER_TYPE_CANONS = [ 
      { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
      { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
      { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
      { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
      { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
      { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
      { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
    ]; 

    let typeCanon = null; 

    for (const offset of [1, -1]) { 
      const idx = workflowIdx + offset; 
      if (idx < 0 || idx >= leftTokens.length) continue; 
 
      for (const c of REGISTER_TYPE_CANONS) { 
        if (_levenshteinDistanceCapped_(leftTokens[idx], c.key, c.cap) <= c.cap) { 
          typeCanon = c.canon; 
          break; 
        } 
      } 

      if (typeCanon) break; 
    } 

    if (typeCanon) { 
      const leftNormalized = workflowMarker + " " + typeCanon; 

      if (!rightRaw) { 
        return original === leftNormalized ? null : { text: leftNormalized }; 
      } 

      if (_looksLikeSportskiText_(rightRaw)) { 
        const sportRes = _normalizeSportskiStandalone_(rightRaw); 
        const rightNormalized = sportRes && sportRes.text ? sportRes.text : "SPORTSKI"; 
        const combined = leftNormalized + " + " + rightNormalized; 

        return original === combined ? null : { text: combined }; 
      } 

      if (_looksLikeKatLikeText_(rightRaw)) { 
        const katRes = _normalizeKatLikeStandalone_(rightRaw); 
        const rightNormalized = katRes && katRes.text 
          ? katRes.text 
          : _normUpperNoDiacritics_(rightRaw).replace(/\s+/g, " ").trim(); 

        const combined = leftNormalized + " + " + rightNormalized; 
        return original === combined ? null : { text: combined }; 
      } 

      const combinedUntouchedRight = leftNormalized + " + " + rightRaw; 
      return original === combinedUntouchedRight ? null : { text: combinedUntouchedRight }; 
    } 
  } 

  // SPORTSKI standalone.
  if (compactLeft === "SPORTSKI" && !rightRaw) { 
    return original === "SPORTSKI" ? null : { text: "SPORTSKI" }; 
  } 

  const sportStandalone = _normalizeSportskiStandalone_(original); 
  if (sportStandalone) return sportStandalone; 

  // Without a plus sign, run standalone KAT normalization.
  if (plusIdx < 0) { 
    return _normalizeKatLikeStandalone_(original); 
  } 
 
  // With a plus sign and no PUR/REGISTER on the left:
  // only normalize the right side if it looks like KAT-like or SPORTSKI-like text.
  if (!rightRaw) return null; 

  if (_looksLikeSportskiText_(rightRaw)) { 
    const sportRes = _normalizeSportskiStandalone_(rightRaw); 
    const rightNormalized = sportRes && sportRes.text ? sportRes.text : "SPORTSKI"; 
    const combined = leftRaw + " + " + rightNormalized; 

    return original === combined ? null : { text: combined }; 
  } 

  if (_looksLikeKatLikeText_(rightRaw)) { 
    const rightRes = _normalizeKatLikeStandalone_(rightRaw); 
    const rightNormalized = rightRes && rightRes.text ? rightRes.text : rightRaw; 
    const combined = leftRaw + " + " + rightNormalized; 

    return original === combined ? null : { text: combined }; 
  } 

  return null; 
} 

// ── KPI: KAT and SPORTSKI counting ───────────────────────────────────── 

function _countKATandSPORT_fromSheet_(sheet) { 
  const lastRow = _lastPatientRowByColumnB_(sheet); 
  if (lastRow < 2) return { katTotal: 0, sportTotal: 0 }; 

  const n  = lastRow - 1; 
  const vB = sheet.getRange(2, STUPAC_B, n, 1).getDisplayValues(); 
  const vC = sheet.getRange(2, STUPAC_C, n, 1).getDisplayValues(); 

  let katTotal = 0; 
  let sportTotal = 0; 

  for (let i = 0; i < n; i++) { 
    if (!String(vB[i][0] || "").trim() || _isReportOrKpiRowInB_(vB[i][0])) continue; 

    const cRaw = String(vC[i][0] || "").trim(); 
    if (!cRaw) continue; 

    const up0 = _normUpperNoDiacritics_(cRaw); 
    const compact = up0.replace(/[\s\W_]+/g, " ").trim(); 

    if (compact.startsWith("SPORTSKI")) { 
      sportTotal++; 
      continue; 
    } 

    const toks = _tokenizeUpper_(up0); 

    if (toks.includes("KAT") || 
        toks.some(_isFuzzyKategorija_) || 
        toks.some(t => _isExactProduljenje_(t) || _isFuzzyProduljenje_(t))) { 
      katTotal++; 
    } 
  } 

  return { katTotal, sportTotal }; 
} 

function _setReportMetricLabelCell_(cell, icon, label, bg) { 
  try { 
    const text  = (icon ? icon + " " : "") + String(label || ""); 
    const style = SpreadsheetApp.newTextStyle() 
      .setFontSize(11) 
      .setForegroundColor("#666666") 
      .setBold(true) 
      .build(); 

    cell.setRichTextValue( 
      SpreadsheetApp.newRichTextValue() 
        .setText(text) 
        .setTextStyle(0, text.length, style) 
        .build() 
    ); 

    cell.setBackground(bg || "#f1f3f4") 
      .setFontFamily("Arial") 
      .setVerticalAlignment("middle") 
      .setHorizontalAlignment("left") 
      .setWrap(true); 
  } catch (e) {} 
} 

function _setReportMetricValueCell_(cell, value, bg) { 
  try { 
    const text  = String(value); 
    const style = SpreadsheetApp.newTextStyle() 
      .setFontSize(16) 
      .setForegroundColor("#111111") 
      .setBold(true) 
      .build(); 

    cell.setRichTextValue( 
      SpreadsheetApp.newRichTextValue() 
        .setText(text) 
        .setTextStyle(0, text.length, style) 
        .build() 
    ); 

    cell.setBackground(bg || "#ffffff") 
      .setFontFamily("Arial") 
      .setVerticalAlignment("middle") 
      .setHorizontalAlignment("center") 
      .setWrap(false); 
  } catch (e) {} 
} 

function _writeCountsBelowReportStatus_(sheet, statusCell) { 
  if (!sheet || !statusCell) return; 

  const counts = _countKATandSPORT_fromSheet_(sheet); 

  const r0 = statusCell.getRow(); 
  const c0 = statusCell.getColumn(); 
  const c1 = c0 + 1; 

  const rKat = r0 + 1; 
  const rSport = r0 + 2; 

  const cKV = sheet.getRange(rKat, c1); 
  const cSV = sheet.getRange(rSport, c1); 

  const rightHasStuff = !!String(cKV.getDisplayValue() || "").trim() 
                     || !!String(cSV.getDisplayValue() || "").trim(); 

  if (rightHasStuff) { 
    sheet.getRange(rKat, c0)
      .setValue("KAT (all categories): " + counts.katTotal)
      .setBackground("#f3f7ff"); 

    sheet.getRange(rSport, c0)
      .setValue("SPORTSKI (all variants): " + counts.sportTotal)
      .setBackground("#f6fff3"); 

    return; 
  } 

  const box = sheet.getRange(rKat, c0, 2, 2); 

  box.clearNote() 
    .setFontLine("none") 
    .setFontStyle("normal") 
    .setFontWeight("normal") 
    .setFontColor("black"); 

  _setReportMetricLabelCell_(sheet.getRange(rKat,  c0), "🚗", "KAT (all categories)", "#eefbf0"); 
  _setReportMetricValueCell_(sheet.getRange(rKat,  c1), counts.katTotal, "#ffffff"); 

  _setReportMetricLabelCell_(sheet.getRange(rSport, c0), "🏃", "SPORTSKI (all variants)", "#eef3ff"); 
  _setReportMetricValueCell_(sheet.getRange(rSport, c1), counts.sportTotal, "#ffffff"); 

  box.setBorder(true, true, true, true, true, true, "#b7b7b7", SpreadsheetApp.BorderStyle.SOLID_MEDIUM); 

  try { 
    sheet.setRowHeights(rKat, 2, sheet.getRowHeight(2)); 
  } catch (e) {} 
}

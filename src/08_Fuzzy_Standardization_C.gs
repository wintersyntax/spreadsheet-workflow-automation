/* ═══════════════════════════════════════════════════════════════════════ 
 * 08 · FUZZY STANDARDIZATION C — Fuzzy standardization of column C values
 * ═══════════════════════════════════════════════════════════════════════ */ 

const C_ALIASI = { 
  "boks":                  "SPORTSKI", 
  "boxing":                "SPORTSKI", 
  "boks godišnji":         "SPORTSKI", 
  "boks godisnji":         "SPORTSKI", 
  "boks polugodisnji":     "SPORTSKI", 
  "opća radna":            "OPĆA RADNA SPOSOBNOST", 
  "opca radna":            "OPĆA RADNA SPOSOBNOST", 
  "voditelj brodice":      "POMORAC", 
  "ls za pomorca":         "POMORAC" 
}; 

function _levenshteinDistanceCapped_(a, b, cap) { 
  a = String(a || ""); 
  b = String(b || ""); 

  if (a === b) return 0; 

  const la = a.length; 
  const lb = b.length; 

  if (Math.abs(la - lb) > cap) return cap + 1; 
  if (la === 0) return lb <= cap ? lb : cap + 1; 
  if (lb === 0) return la <= cap ? la : cap + 1; 

  const INF  = 1e9; 
  let   prev = new Array(lb + 1).fill(INF); 
  let   curr = new Array(lb + 1).fill(INF); 

  for (let j = 0; j <= Math.min(lb, cap); j++) prev[j] = j; 

  for (let i = 1; i <= la; i++) { 
    const from = Math.max(1, i - cap); 
    const to   = Math.min(lb, i + cap); 

    curr[0] = i <= cap ? i : INF; 

    let rowMin = INF; 

    for (let j = from; j <= to; j++) { 
      const cost = (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) ? 0 : 1; 
      const v    = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost); 

      curr[j] = v; 
      if (v < rowMin) rowMin = v; 
    } 

    if (rowMin > cap) return cap + 1; 

    for (let j = 0; j <= lb; j++) { 
      prev[j] = curr[j]; 
      curr[j] = INF; 
    } 
  } 

  return prev[lb] <= cap ? prev[lb] : cap + 1; 
} 

function _isRegisterMarkerToken_(word) {
  const w = String(word || "").toUpperCase();
  return w === "REGISTER" || w === "PUR";
}

function _markerFromToken_(word) {
  const w = String(word || "").toUpperCase();
  return w === "PUR" ? "PUR" : "REGISTER";
}

function _standardizirajTipC_(vCraw) { 
  const s0 = String(vCraw || ""); 
  if (!s0.trim()) return null; 

  // Direct alias match against the full cell value, case-insensitive.
  const alias = C_ALIASI[s0.trim().toLowerCase()]; 
  if (alias) return alias; 

  const CAND = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 }, 
    { canon: "POMORAC",    key: "POMORAC",    cap: 3 }, 
    { canon: "NASTAVAK",   key: "NASTAVAK",   cap: 2 }, 
    { canon: "ROČNIK",     key: "ROCNIK",     cap: 2 } 
  ]; 

  const tokenRe = /[A-Za-z0-9ČĆĐŠŽčćđšž]+/g; 
  const matches = []; 
  let m; 

  while ((m = tokenRe.exec(s0)) !== null) { 
    matches.push({ text: m[0], start: m.index, end: m.index + m[0].length }); 
  } 

  if (!matches.length) return null; 

  const normWord = w => _normTxt_(w).toUpperCase(); 

  let registerIdx = matches.findIndex(t => _isRegisterMarkerToken_(normWord(t.text))); 
  let typeIdx     = registerIdx >= 0 ? (registerIdx + 1 < matches.length ? registerIdx + 1 : -1) : 0; 

  if (registerIdx >= 0 && typeIdx < 0) {
    return _markerFromToken_(normWord(matches[registerIdx].text));
  }

  const hasREGISTER = (registerIdx >= 0); 
  const marker = hasREGISTER ? _markerFromToken_(normWord(matches[registerIdx].text)) : "REGISTER";

  if (typeIdx + 2 < matches.length) { 
    const d1 = _levenshteinDistanceCapped_(normWord(matches[typeIdx].text),     "OPCA",  3); 
    const d2 = _levenshteinDistanceCapped_(normWord(matches[typeIdx + 1].text), "RADNA", 3); 

    if (d1 <= 3 && d2 <= 3) { 
      let before  = s0.slice(0, matches[typeIdx].start); 
      const after = s0.slice(matches[typeIdx + 2].end); 

      if (hasREGISTER && normWord(matches[registerIdx].text) !== marker) { 
        const pt = matches[registerIdx]; 
        before = before.slice(0, pt.start) + marker + before.slice(pt.end); 
      } 

      return before + "OPĆA RADNA SPOSOBNOST" + after; 
    } 
  } 
 
  if (typeIdx + 1 < matches.length) { 
    const d1 = _levenshteinDistanceCapped_(normWord(matches[typeIdx].text),     "NOCNI", 2); 
    const d2 = _levenshteinDistanceCapped_(normWord(matches[typeIdx + 1].text), "RAD",   1); 

    if (d1 <= 2 && d2 <= 1) { 
      let before  = s0.slice(0, matches[typeIdx].start); 
      const after = s0.slice(matches[typeIdx + 1].end); 

      if (hasREGISTER && normWord(matches[registerIdx].text) !== marker) { 
        const pt = matches[registerIdx]; 
        before = before.slice(0, pt.start) + marker + before.slice(pt.end); 
      } 

      return before + "NOĆNI RAD" + after; 
    } 
  } 

  let t0        = matches[typeIdx].text; 
  let tNorm     = normWord(t0); 
  let candidate = tNorm; 

  if (!hasREGISTER && tNorm.startsWith("REGISTER") && tNorm.length > "REGISTER".length) { 
    candidate = tNorm.slice("REGISTER".length); 
  } 

  if (!hasREGISTER && tNorm.startsWith("PUR") && tNorm.length > "PUR".length) { 
    candidate = tNorm.slice("PUR".length); 
  } 

  if (!candidate.trim() || candidate.length < 4) return null; 

  let best = null; 

  for (const c of CAND) { 
    if (!candidate[0] || candidate[0] !== c.key[0]) continue; 

    const d = _levenshteinDistanceCapped_(candidate, c.key, c.cap); 

    if (d <= c.cap && (!best || d < best.d)) { 
      best = { canon: c.canon, d }; 
    } 
  } 

  if (!best) return null; 

  let out = s0; 

  if (registerIdx >= 0) { 
    const registerTok = matches[registerIdx]; 
    const markerForOutput = _markerFromToken_(normWord(registerTok.text));

    if (registerTok.text !== markerForOutput) { 
      out = out.slice(0, registerTok.start) + markerForOutput + out.slice(registerTok.end); 

      const delta = markerForOutput.length - (registerTok.end - registerTok.start); 

      if (delta !== 0) { 
        matches.slice(registerIdx + 1).forEach(mi => { 
          mi.start += delta; 
          mi.end += delta; 
        }); 
      } 
    } 

    const typTok = matches[typeIdx]; 
    return out.slice(0, typTok.start) + best.canon + out.slice(typTok.end); 
  } 

  if (!hasREGISTER && tNorm.startsWith("REGISTER") && tNorm.length > "REGISTER".length) { 
    const tok = matches[typeIdx]; 
    return out.slice(0, tok.start) + "REGISTER " + best.canon + out.slice(tok.end); 
  } 

  if (!hasREGISTER && tNorm.startsWith("PUR") && tNorm.length > "PUR".length) { 
    const tok = matches[typeIdx]; 
    return out.slice(0, tok.start) + "PUR " + best.canon + out.slice(tok.end); 
  } 

  const tok2 = matches[typeIdx]; 
  return out.slice(0, tok2.start) + best.canon + out.slice(tok2.end); 
} 

function _sanitizeInvalidRegisterType_(vCraw) { 
  const s0 = String(vCraw || "").trim(); 
  if (!s0) return null; 

  const plusIdx   = s0.indexOf("+"); 
  const leftPart  = plusIdx >= 0 ? s0.slice(0, plusIdx).trim() : s0; 
  const rightPart = plusIdx >= 0 ? s0.slice(plusIdx).trim() : ""; 

  if (!leftPart) return null; 

  const tokenRe = /[A-Za-z0-9ČĆĐŠŽčćđšž]+/g; 
  const matches = []; 
  let m; 

  while ((m = tokenRe.exec(leftPart)) !== null) { 
    matches.push({ text: m[0], start: m.index, end: m.index + m[0].length }); 
  } 

  if (!matches.length) return null; 

  const normWord = w => _normTxt_(w).toUpperCase(); 
  const registerIdx = matches.findIndex(t => _isRegisterMarkerToken_(normWord(t.text))); 

  if (registerIdx < 0) return null; 

  const marker = _markerFromToken_(normWord(matches[registerIdx].text));

  // Only marker without a type: leave unchanged.
  if (registerIdx === matches.length - 1) return null; 

  const afterRegisterTokens = matches.slice(registerIdx + 1); 
  if (!afterRegisterTokens.length) return null; 

  const REGISTER_SINGLE_TYPES = [ 
    { canon: "KONTROLNI",  key: "KONTROLNI",  cap: 2 }, 
    { canon: "PERIODIČKI", key: "PERIODICKI", cap: 4 }, 
    { canon: "PRETHODNI",  key: "PRETHODNI",  cap: 3 }, 
    { canon: "IZVANREDNI", key: "IZVANREDNI", cap: 3 }, 
    { canon: "PRIVATNO",   key: "PRIVATNO",   cap: 2 }, 
    { canon: "VJEROJATNI", key: "VJEROJATNI", cap: 3 }, 
    { canon: "SPORTSKI",   key: "SPORTSKI",   cap: 2 } 
  ]; 

  // 1) If the first token after REGISTER/PUR matches a valid single-token type,
  // keep only "<MARKER> <TYPE>" and ignore any noise before the plus suffix.
  const nextTok = normWord(afterRegisterTokens[0].text); 
  let matchedSingle = null; 

  for (const t of REGISTER_SINGLE_TYPES) { 
    if (_levenshteinDistanceCapped_(nextTok, t.key, t.cap) <= t.cap) { 
      matchedSingle = t.canon; 
      break; 
    } 
  } 

  if (matchedSingle) { 
    const cleanedLeft = marker + " " + matchedSingle; 
    return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
  } 

  // 2) Multi-token valid types.
  if (afterRegisterTokens.length >= 3) { 
    const t1 = normWord(afterRegisterTokens[0].text); 
    const t2 = normWord(afterRegisterTokens[1].text); 
    const t3 = normWord(afterRegisterTokens[2].text); 

    const isOpcaRadnaSposobnost = 
      _levenshteinDistanceCapped_(t1, "OPCA", 3) <= 3 && 
      _levenshteinDistanceCapped_(t2, "RADNA", 3) <= 3 && 
      _levenshteinDistanceCapped_(t3, "SPOSOBNOST", 4) <= 4; 

    if (isOpcaRadnaSposobnost) { 
      const cleanedLeft = marker + " OPĆA RADNA SPOSOBNOST"; 
      return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
    } 
  } 

  if (afterRegisterTokens.length >= 2) { 
    const t1 = normWord(afterRegisterTokens[0].text); 
    const t2 = normWord(afterRegisterTokens[1].text); 

    const isNocniRad = 
      _levenshteinDistanceCapped_(t1, "NOCNI", 2) <= 2 && 
      _levenshteinDistanceCapped_(t2, "RAD", 1) <= 1; 

    if (isNocniRad) { 
      const cleanedLeft = marker + " NOĆNI RAD"; 
      return rightPart ? (cleanedLeft + " " + rightPart).trim() : cleanedLeft; 
    } 
  } 

  // 3) If no valid REGISTER/PUR type is found, mark it as invalid.
  return rightPart 
    ? marker + " [invalid workflow type] " + rightPart 
    : marker + " [invalid workflow type]"; 
}

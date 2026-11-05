/* ═══════════════════════════════════════════════════════════════════════ 
 * 20 · XLSX AUTORESTORE — Revision-based XLSX auto-restore
 * ═══════════════════════════════════════════════════════════════════════ */ 

const AUTO_RESTORE_ROOT_FOLDER_ID = ""; // Set this in your private deployment.
const AUTO_RESTORE_TAG            = "AUTO-RESTORE";
const AUTO_RESTORE_BASELINE_RE    = /AUTO-RESTORE(?:\s+BASELINE_REV=([^\s]+))?/i;
const XLSX_MIME                   = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Compatibility wrapper.
 */
function autoRestoreRunOnce() { 
  autoRestoreHourly(); 
}

/**
 * Scans the configured Drive folder and restores tagged XLSX files to their pinned baseline revision.
 *
 * Safety:
 * - does nothing unless AUTO_RESTORE_ROOT_FOLDER_ID is configured
 * - only processes XLSX files
 * - only processes files tagged with AUTO-RESTORE in the file description
 */
function autoRestoreHourly() { 
  if (!AUTO_RESTORE_ROOT_FOLDER_ID) {
    console.log("XLSX auto-restore skipped: AUTO_RESTORE_ROOT_FOLDER_ID is not configured.");
    return;
  }

  const lock = LockService.getScriptLock(); 
  if (!lock.tryLock(5000)) return; 

  const start  = Date.now(); 
  const MAX_MS = 5.5 * 60000; 

  try { 
    _autoRestoreScanFolderRecursive_(AUTO_RESTORE_ROOT_FOLDER_ID, file => { 
      if (Date.now() - start > MAX_MS) throw new Error("__TIME_GUARD__"); 
      _autoRestoreProcessOneFile_(file); 
    }); 
  } catch (e) { 
    if (!String(e && e.message ? e.message : e).includes("__TIME_GUARD__")) { 
      console.error("autoRestoreHourly error:", e && e.stack ? e.stack : e); 
    } 
  } finally { 
    try { 
      lock.releaseLock(); 
    } catch (e) {} 
  } 
} 

function _autoRestoreScanFolderRecursive_(folderId, onFile) { 
  let pageToken = null; 

  do { 
    const resp = Drive.Files.list({ 
      q: "'" + folderId + "' in parents and trashed=false", 
      fields: "items(id,title,mimeType,fileExtension,description),nextPageToken", 
      maxResults: 200, 
      pageToken: pageToken || undefined 
    }); 

    for (const it of (resp.items || [])) { 
      it.mimeType === "application/vnd.google-apps.folder" 
        ? _autoRestoreScanFolderRecursive_(it.id, onFile) 
        : onFile(it); 
    } 

    pageToken = resp.nextPageToken; 
  } while (pageToken); 
} 

function _autoRestoreProcessOneFile_(file) { 
  const ext = String(file.fileExtension || "").toLowerCase(); 
  const mt  = String(file.mimeType || "").toLowerCase(); 

  if (ext !== "xlsx" && mt !== XLSX_MIME.toLowerCase()) return; 

  const desc = String(file.description || ""); 

  // Public/demo safety: only explicitly tagged files are processed.
  if (!desc.toLowerCase().includes(AUTO_RESTORE_TAG.toLowerCase())) return;

  let baselineRevId = _autoRestoreParseBaselineRevFromDesc_(desc); 

  if (!baselineRevId) { 
    baselineRevId = _autoRestoreEnsureBaselinePinnedAndStored_(file.id, desc); 
    if (!baselineRevId) return; 
  } 

  const revs = (Drive.Revisions.list(file.id, { fields: "items(id,pinned)" }).items || []); 
  if (!revs.length) return; 

  const headRevId = revs[revs.length - 1].id; 

  if (String(headRevId) !== String(baselineRevId)) { 
    _autoRestoreFileToRevision_(file.id, file.title, baselineRevId, desc); 

    const revs2   = (Drive.Revisions.list(file.id, { fields: "items(id,pinned)" }).items || []); 
    const newHead = revs2.length ? revs2[revs2.length - 1].id : headRevId; 

    _autoRestoreCleanupRevisions_(file.id, baselineRevId, newHead); 
    return; 
  } 

  _autoRestoreCleanupRevisions_(file.id, baselineRevId, headRevId); 
} 

function _autoRestoreParseBaselineRevFromDesc_(desc) { 
  const m = String(desc || "").match(AUTO_RESTORE_BASELINE_RE); 
  return (m && m[1]) ? String(m[1]).trim() : null; 
} 

function _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc) { 
  const revs = (Drive.Revisions.list(fileId, { fields: "items(id,pinned)" }).items || []); 
  if (!revs.length) return null; 

  const headId = revs[revs.length - 1].id; 

  try { 
    Drive.Revisions.patch({ pinned: true }, fileId, headId); 
  } catch (e) {} 

  const newDesc = _autoRestoreUpsertBaselineInDesc_(oldDesc, headId); 

  try { 
    Drive.Files.patch({ description: newDesc }, fileId); 
  } catch (e) {} 

  return headId; 
} 

function _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId) { 
  let d = String(desc || ""); 

  if (!d.toLowerCase().includes(AUTO_RESTORE_TAG.toLowerCase())) { 
    d = (d ? d + "\n" : "") + AUTO_RESTORE_TAG; 
  } 

  d = d.replace(/AUTO-RESTORE\s+BASELINE_REV=[^\s]+/ig, AUTO_RESTORE_TAG); 
  d = d.replace(new RegExp(AUTO_RESTORE_TAG, "i"), AUTO_RESTORE_TAG + " BASELINE_REV=" + baselineRevId); 

  return d; 
} 

function _autoRestoreFileToRevision_(fileId, title, revisionId, description) { 
  const dl = Drive.Revisions.get(fileId, revisionId).downloadUrl; 

  if (!dl) throw new Error("No downloadUrl found for baseline revision."); 

  const resp = UrlFetchApp.fetch(dl, { 
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() }, 
    muteHttpExceptions: true 
  }); 

  const code = resp.getResponseCode(); 

  if (code < 200 || code >= 300) { 
    throw new Error("Restore download failed. HTTP " + code); 
  } 

  const blob = resp.getBlob()
    .setName(String(title || ""))
    .setContentType(XLSX_MIME); 

  Drive.Files.update(
    { 
      title: String(title || ""), 
      description: String(description || "") 
    }, 
    fileId, 
    blob
  ); 
} 

function _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId) { 
  let revs; 

  try { 
    revs = (Drive.Revisions.list(fileId, { fields: "items(id,pinned)" }).items || []); 
  } catch (e) { 
    return; 
  } 

  const baseId = String(baselineRevId || ""); 
  const headId = String(headRevId || ""); 

  for (const r of revs) { 
    const id = String(r.id); 

    if (id === baseId || id === headId) continue; 

    try { 
      Drive.Revisions.remove(fileId, r.id); 
    } catch (e) {} 
  } 

  if (baseId) { 
    try { 
      Drive.Revisions.patch({ pinned: true }, fileId, baseId); 
    } catch (e) {} 
  } 

  if (headId && headId !== baseId) { 
    try { 
      Drive.Revisions.patch({ pinned: false }, fileId, headId); 
    } catch (e) {} 
  } 
}

/**
 * Backwards-compatible aliases from the original implementation.
 */
function _autoRestoreScanFolderRecursive_(folderId, onFile) {
  return _autoRestoreScanFolderRecursive_(folderId, onFile);
}

function _autoRestoreProcessOneFile_(file) {
  return _autoRestoreProcessOneFile_(file);
}

function _autoRestoreParseBaselineRevFromDesc_(desc) {
  return _autoRestoreParseBaselineRevFromDesc_(desc);
}

function _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc) {
  return _autoRestoreEnsureBaselinePinnedAndStored_(fileId, oldDesc);
}

function _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId) {
  return _autoRestoreUpsertBaselineInDesc_(desc, baselineRevId);
}

function _autoRestoreFileToRevision_(fileId, title, revisionId, description) {
  return _autoRestoreFileToRevision_(fileId, title, revisionId, description);
}

function _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId) {
  return _autoRestoreCleanupRevisions_(fileId, baselineRevId, headRevId);
}

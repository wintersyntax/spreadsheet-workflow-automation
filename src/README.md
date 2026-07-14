# Source structure

This folder contains the Apps Script source split into modules.

- `.gs` files contain Apps Script backend logic.
- `.html` files contain HtmlService dialogs and UI templates.
- `appsscript.json` is a minimal Apps Script manifest with Drive advanced service declared.

When importing manually into Apps Script, create script files without the `.gs` suffix and HTML files without the `.html` suffix. When using `clasp`, keep these filenames as-is.

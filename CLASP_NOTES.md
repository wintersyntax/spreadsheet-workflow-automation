# Clasp notes

This repository is prepared so it can later be connected to Google Apps Script through `clasp`.

The source is split into:

```text
src/
  00_Project_Overview.gs
  01_Config.gs
  ...
  27_Report_Export_Backend.gs
  AdminConfig.html
  AdminPin.html
  AnnouncementModal.html
  ReportDownloadDialog.html
  ReportSaveDialog.html
  appsscript.json
```

## Manual Apps Script import

If importing manually through the Apps Script editor:

- create script files without the `.gs` suffix
- create HTML files without the `.html` suffix
- keep the same base names, for example `AdminConfig.html` in GitHub becomes `AdminConfig` in Apps Script

The code calls templates by name:

```js
HtmlService.createTemplateFromFile("AdminConfig")
HtmlService.createTemplateFromFile("AdminPin")
HtmlService.createTemplateFromFile("AnnouncementModal")
HtmlService.createTemplateFromFile("ReportDownloadDialog")
HtmlService.createTemplateFromFile("ReportSaveDialog")
```

## Future clasp setup

A future local setup could use:

```bash
npm install -g @google/clasp
clasp login
clasp create --type sheets --rootDir src
```

or, for an existing Apps Script project:

```bash
clasp clone <SCRIPT_ID> --rootDir src
```

Do not commit `.clasp.json` if it contains a private script ID unless you intentionally want that ID public.

## Private deployment values

Do not commit:

- real Drive folder IDs
- real spreadsheet IDs
- real Admin PINs
- real patient data
- real staff or organization lists
- exported reports
- screenshots containing real data

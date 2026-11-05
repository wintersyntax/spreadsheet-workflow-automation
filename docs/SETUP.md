# Setup and Deployment

This document contains the full setup and deployment notes for the public portfolio version of Spreadsheet Workflow Automation.

## Requirements

This project requires:

- Google Sheets
- Google Apps Script
- Advanced Google Drive service enabled in Apps Script
- a Google Drive folder for exported XLSX files
- a spreadsheet matching the expected column structure
- installed Apps Script triggers

## Required preconfiguration

Before using this project in a real spreadsheet, configure the following values and run the required setup functions.

### 1. Configure the target spreadsheet

Open the script from the bound Google Spreadsheet and run:

```js
zapamtiSpreadsheetId()
```

This stores the spreadsheet ID in Script Properties so time-based triggers can reopen the spreadsheet later.

### 2. Configure the report export folder

In module 27, replace:

```js
const REPORT_ROOT_FOLDER_ID = "PASTE_REPORT_ROOT_FOLDER_ID_HERE";
```

with the Drive folder ID where XLSX reports should be saved.

The export structure will be:

```text
REPORT_ROOT_FOLDER_ID / YEAR / MONTH / dd.MM.yyyy. WORKFLOW_REGISTER.xlsx
```

Do not commit private folder IDs to a public repository.

### 3. Configure XLSX auto-restore folder

In module 20, configure:

```js
const AUTO_RESTORE_ROOT_FOLDER_ID = "";
```

Set this to the Drive folder ID that should be scanned by the auto-restore job.

If left empty, auto-restore is skipped safely.

### 4. Enable Advanced Google Drive service

In Apps Script:

1. Open **Services**.
2. Add **Drive API**.
3. Make sure the Google Cloud project also has the Drive API enabled if required.

This project uses advanced Drive methods such as:

```js
Drive.Files
Drive.Revisions
```

These are required for XLSX export metadata, revision pinning and auto-restore behavior.

### 5. Authorize Drive access

Run once:

```js
authorizeDriveOnce()
```

This forces the required Drive authorization prompt.

### 6. Configure Admin PIN

The Admin UI is protected by a PIN.

The real setup function is:

```js
adminConfig_SetPin("1234")
```

However, Apps Script's function dropdown cannot easily pass arguments when running a function manually. For local demo setup, create a temporary script file called:

```text
99_Demo_Setup
```

and add:

```js
function setupDemoPin() {
  adminConfig_SetPin("1234");
}
```

Then run this helper from the Apps Script function dropdown:

```js
setupDemoPin()
```

This sets the demo Admin PIN to:

```text
1234
```

For any real deployment, replace `1234` with a private 4–8 digit PIN.

Do not commit a demo setup file containing a real PIN to a public repository. For a public portfolio repository, either omit the demo setup file or keep it clearly marked as demo-only.

To clear the PIN:

```js
adminConfig_ClearPin()
```

Do not commit real PINs or private deployment values to the repository.

### 7. Install triggers

Run:

```js
instalirajTriggere()
```

This installs the managed triggers used by the automation.

The trigger set includes:

- installed edit handler
- edit queue worker
- waiting-time checker
- format cleaner
- daily reset
- reset watchdog
- XLSX auto-restore
- report failsafe export

### 8. Configure Admin data

Open the spreadsheet menu:

```text
Admin → Konfiguracija
```

Then configure or import:

- initials / names mapping
- training companies
- invoice clients
- contract clubs and prices
- security companies
- health institutions
- priority terms
- announcements
- announcement authors

Admin data can also be imported through the Admin UI using the JSON import feature.

## Basic setup flow

Recommended setup order:

```text
1. Copy the spreadsheet template.
2. Add the Apps Script project.
3. Configure required constants.
4. Enable Advanced Google Drive service.
5. Run zapamtiSpreadsheetId().
6. Run authorizeDriveOnce().
7. Set the Admin PIN.
8. Open Admin configuration and import/configure data.
9. Test edit handling manually.
10. Test XLSX export manually.
11. Test daily reset on a copy.
12. Run instalirajTriggere().
```

## Manual functions

Useful manual setup and maintenance functions:

```js
zapamtiSpreadsheetId()
authorizeDriveOnce()
adminConfig_SetPin("1234")
adminConfig_ClearPin()
adminConfig_OpenGuard()
adminConfig_ExportJson()
adminConfig_ImportJson(jsonStr)
instalirajTriggere()
obrisiMojeTriggere()
resetirajDnevnuMemoriju_FORCE()
reportFailSafeSend_2300()
autoRestoreRunOnce()
dijagnostikaPropertiesService()
```

## Repository structure

```text
README.md
CLASP_NOTES.md
docs/
  demo-placeholder.md
  full-source-final-monolithic.md
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

The `src/` folder is prepared for a future `clasp` workflow. The `.gs` files contain backend logic and the `.html` files contain HtmlService UI templates.

## Important deployment notes

### This repository uses placeholders

The public version intentionally does not include private IDs, private names or deployment-specific values.

You must configure these locally:

```text
REPORT_ROOT_FOLDER_ID
AUTO_RESTORE_ROOT_FOLDER_ID
Admin PIN
Admin configuration data
Spreadsheet binding
Installed triggers
```

### The script does not send email

The report export backend only saves XLSX files to Drive.

The active backend function is:

```js
_saveXlsxToDrive_(sheet, senderName, tokenRaw)
```

The `senderName` and `tokenRaw` parameters are kept for compatibility with the report dialog flow, but the backend does not send email.

### XLSX auto-restore is intentional

The auto-restore module is used for reference XLSX files. If someone accidentally edits or damages an XLSX reference file, the script can restore it to its pinned baseline revision.

This behavior requires:

- Advanced Drive service
- configured auto-restore root folder
- files with the auto-restore metadata tag

### Daily reset is destructive by design

The daily reset clears the operational working area and prepares the sheet for the next workday.

Before enabling triggers in a real spreadsheet, test reset behavior on a copy.

### Internal system columns are required

The script expects hidden/internal system columns for row ID, row state and row signature.

Do not remove these columns unless the constants in module 1 are updated accordingly.

## Safety and data notes

This project is an operational spreadsheet automation script. It is not a medical device, not a diagnostic tool, and not a replacement for professional judgment or institutional procedures.

The public repository should not contain:

- real folder IDs
- real personal names
- real patient data
- real company/client lists
- real PINs
- real spreadsheet IDs
- exported reports
- real screenshots or GIFs containing identifiable operational data

Use placeholders in the repository and configure private deployment data only inside Apps Script Script Properties, the Admin UI or local private copies. Demo screenshots and GIFs should use fake names, fake companies, fake clubs, fake contacts and fake folder names.

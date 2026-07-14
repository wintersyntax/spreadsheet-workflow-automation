# Spreadsheet Workflow Automation

Google Apps Script automation layer for a Google Sheets based daily intake/worklist system used in a private outpatient clinic workflow for occupational and sports medicine.

The original process was built around an existing Google Sheet used by clinic staff for daily patient tracking. This project adds an automation layer on top of that sheet: edit handling, data normalization, waiting-time tracking, row formatting, admin configuration, announcements, XLSX export and daily reset.

The repository contains a cleaned public version with placeholders for private deployment values. Legacy workflow markers used by the original spreadsheet logic are retained where they are required for the automation to work correctly.

No real patient data, private clinic data, real configuration lists, real Drive folder IDs, real PINs or deployment-specific identifiers are included in this repository.

## Demo

Screenshots and GIFs should be created from an anonymized demo spreadsheet with fake data only.

Suggested demo materials:

- short GIF showing a patient row being entered and automatically timestamped
- short GIF showing exam-type normalization and automatic helper-column filling
- screenshot of the Admin configuration UI
- screenshot of the announcement popup
- screenshot of the report export status
- screenshot of the generated Drive folder structure

No real patient, clinic, company, staff, folder or contact data should be visible in screenshots or GIFs.

## Project background

This project was created for a private outpatient clinic workflow in occupational and sports medicine.

The clinic already used a Google Sheet as a daily patient intake and worklist table. My contribution was to build a Google Apps Script automation layer on top of that existing spreadsheet.

The goal was not to replace the clinic’s workflow, but to make the existing sheet faster, safer and more consistent for daily use.

The script automates repetitive spreadsheet tasks such as:

- preserving patient arrival times
- standardizing visit/category entries
- highlighting priority and waiting rows
- handling configured company/client/club rules
- showing internal announcement prompts
- cleaning completed rows
- exporting the daily XLSX report
- resetting the sheet for the next workday

This is not a medical device, not a diagnostic tool, and not a clinical decision-support system. It is an operational spreadsheet automation project.

## Development context

This project was developed as a volunteer automation project for an existing clinic spreadsheet workflow.

My role was to translate day-to-day operational needs into a working automation design: mapping the clinic’s existing Google Sheet workflow, identifying repetitive staff actions, designing the rule logic, testing edge cases, refining the user flow and coordinating the overall architecture of the script.

The implementation was built with the help of AI-assisted programming. AI was used as a coding assistant, while the workflow design, requirements, testing, domain decisions and final integration were guided manually based on the real needs of the clinic.

The project took approximately 200 hours of iterative work.

This code also represents an intentional stretch of what Google Apps Script can reasonably do. Apps Script was useful because it could be added directly on top of an existing Google Sheet without introducing a new platform for staff. However, the final system includes concurrency handling, edit queues, admin configuration, background triggers, export logic, revision restore and complex row-state management, which are beyond what Apps Script is naturally best suited for.

A future version of this system would be better implemented as a dedicated web application with a proper backend, database, authentication, audit logs, role-based permissions and a cleaner UI. This repository can therefore be understood both as a working spreadsheet automation layer and as a prototype/specification for a future standalone application.

## What this project does

This script acts as a runtime automation layer for a Google Spreadsheet.

Main features:

- processes edits made in the spreadsheet through an installed `onEdit` trigger
- standardizes text input in operational columns
- normalizes visit/type values in column C, including fuzzy matching and domain-specific corrections
- handles special categories such as short waiting, category-like entries, sports entries, training-related entries, billing states, priority markers and announcement prompts
- adds timestamps to new rows and stores them safely by row ID
- tracks row state through internal system columns
- highlights rows visually based on priority, waiting time, type of visit, billing state and other business rules
- uses a queue system to defer edit processing when the sheet is busy
- uses locks to reduce conflicts between edits, background jobs, report export and daily reset
- performs daily reset of the operational sheet
- exports the full spreadsheet as an XLSX file into a configured Drive folder
- creates an auto-restore baseline for exported XLSX reference files
- provides an Admin UI protected by a PIN
- stores configurable lists such as doctors, companies, clients, clubs, institutions, priority terms and announcements
- provides announcement popups for matching patients, companies or keywords
- does not send email

## Operational workflow

This project was built for a daily intake/worklist spreadsheet.

During the working day, staff enter patients into the sheet row by row. Each row represents one active patient/case currently being handled. The script watches edits, standardizes the input, adds missing operational data, highlights important rows, tracks waiting time and prepares the sheet for reporting at the end of the day.

The workflow is roughly:

```text
1. A new patient/case is entered into the working sheet.
2. The script adds or preserves the time of arrival.
3. Staff enter the type/category of visit.
4. The script normalizes the type/category and fills helper fields where needed.
5. Staff add company/client/club/billing information when relevant.
6. The script detects configured clients, contract clubs, training companies and special institutions.
7. The script visually marks rows that need attention.
8. Background triggers check waiting time and update row status.
9. Completed rows are crossed out.
10. The format cleaner cleans completed rows while preserving active waiting/priority states.
11. At the end of the day, the report is exported as XLSX.
12. The daily reset prepares the spreadsheet for the next workday.
```

## Expected sheet structure

The original Google Sheet used a frozen header row with the following columns.

| Column | Header | Purpose in workflow |
|---|---|---|
| A | datum | Date / sequence column. Cell `A1` stores the workday date used for report naming. Rows below the header can be used for row numbering after reset. |
| B | ime i prezime | Patient name and arrival time. The script adds/preserves the timestamp here. Strikethrough in this column marks the row as completed. |
| C | pregled | Visit/exam type. This is the main normalization column. The script standardizes entries such as work exams, sports exams, category exams and other configured types. |
| D | krv | Blood/lab marker. The script can fill this automatically depending on the exam type. |
| E | EKG | ECG marker. The script can fill this automatically, including sports placeholders. |
| F | VID | Vision/ophthalmology marker. The script can add required vision-related markers based on configured rules. |
| G | psiholog | Psychologist marker. The script can fill this automatically for relevant categories. |
| H | firma/klub | Company, client, club or billing field. The script detects configured companies, invoice clients, contract clubs, training companies and billing states. |
| I | napomene | Notes, priority markers, announcement output and location tags. The script also uses this column for visual priority detection. |
| J | doktor | Doctor initials / shortcut input. Short codes can update initials or add location-like tags into column I. |
| K | sistematski doktor | Additional doctor/systematic exam doctor field. |
| L | kontakt | Contact field. If the value contains `@`, the script highlights the cell. |
| M | system ID | Internal row UUID used by the script. Should be hidden/protected. |
| N | system state | Internal row state used by the script. Should be hidden/protected. |
| O | system signature | Internal row signature used by the script. Should be hidden/protected. |

The exact column constants are configured in module 1.

Do not delete or reorder columns without updating the constants. The automation relies on these indexes for edit handling, row state tracking, formatting, report export, waiting-time checks and daily reset.

## Main spreadsheet concepts

### Active row

An active row is a row representing a patient/case that is currently still in the workflow.

Active rows are processed by edit triggers, waiting-time checks, formatting rules and announcement checks.

### Completed row

A completed row is marked by applying strikethrough formatting in column B.

The format cleaner detects completed rows and cleans their visual formatting and internal state.

### Waiting state

The script tracks waiting time from the timestamp stored in column B.

Rows can become visually escalated when they pass configured waiting thresholds. Special shorter waiting logic can apply to configured categories such as sports-related rows.

### Priority state

Priority rows are detected from configured terms in the note/priority column.

When a row is priority, the script applies stronger visual formatting and preserves that state during cleanup and waiting-time processing.

### Internal row identity

Each active row receives a UUID stored in a hidden/system column.

This allows the script to remember the original timestamp and waiting flags even if the visible row text changes.

### Row state and signature

The script stores a lightweight row state and row signature in internal columns.

This prevents unnecessary repeated writes and helps the script know whether a row is active, waiting, priority, completed or system/report-related.

## Architecture

The code is organized into 27 Apps Script modules, with HtmlService UI templates separated into `.html` files for cleaner maintenance:

1. `CONFIG` — system constants, column indexes and operational limits.
2. `BINDING` — spreadsheet context and target sheet binding.
3. `HELPERS` — generic helpers, normalization and patch infrastructure.
4. `QUIET HOURS` — quiet-hours execution mode.
5. `SHORT WAIT` — short waiting-time configuration and activation.
6. `LOCK ENGINE` — concurrency control and execution synchronization.
7. `EDIT QUEUE` — deferred edit-event processing queue.
8. `FUZZY STANDARDIZATION C` — fuzzy standardization of values in column C.
9. `KAT / SPORT NORMALIZATION` — domain normalization for category, sports, PUR/REGISTER-style workflow markers and related combinations.
10. `TRAINING` — training-scenario detection.
11. `REPORT INTERRUPT` — temporary automation suspension during report export.
12. `REPORT EXPORT UI` — report export menu, status and user dialogs.
13. `APPLY RULES` — central dispatcher for edit-triggered rule processing.
14. `HANDLER J` — initials and location-tag handling.
15. `HANDLER B` — time handling and persistence in column B.
16. `HANDLER C/H` — business-rule handling for columns C–H.
17. `WAIT CHECKER` — waiting-time evaluation and status escalation.
18. `FORMAT CLEANER` — format and content cleanup for completed rows.
19. `DAILY RESET` — daily reset, watchdog and retry mechanisms.
20. `XLSX AUTORESTORE` — revision-based auto-restore for XLSX reference files.
21. `DRIVE AUTH` — one-time Drive authorization helper.
22. `TRIGGERS` — installed trigger management.
23. `ONEDIT` — main edit-event entry point.
24. `ADMIN CONFIG` — administrative configuration and PIN protection.
25. `OPERATIVE SETTINGS` — configuration layer for clients, clubs and operational rules.
26. `ANNOUNCEMENTS` — patient, company and keyword announcement system.
27. `REPORT EXPORT BACKEND` — XLSX save, auto-restore baseline and failsafe export.

## Glossary

- `GAS` — Google Apps Script.
- `PUR` — legacy workflow marker retained from the original spreadsheet logic. It is not a private value; it is part of the automation grammar.
- `REGISTER` — public/neutral workflow marker used in the cleaned version where applicable.
- `KAT` — category-related workflow marker retained from the original spreadsheet logic.
- `category exam` — category-related exam/workflow marker used in the original spreadsheet.
- `sports exam` — sports-related exam marker.
- `PL` — paid billing marker.
- `NAPLATITI` — pending payment marker retained from the original local workflow.
- `vision marker` — vision/ophthalmology-related marker used by the workflow.
- `Admin UI` — internal configuration dialog built with Apps Script `HtmlService`.

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

## Limitations

This project is tightly coupled to a specific spreadsheet layout and workflow.

It is not a plug-and-play general clinic system. To reuse it, you must adapt the column constants, sheet names, Drive folder IDs, trigger setup and Admin configuration.

Google Apps Script was a practical choice because the clinic already used Google Sheets, but Apps Script is not ideal for larger long-term systems that need robust database design, access control, audit logs, advanced user roles or complex UI flows.

A dedicated web application would be the natural next step for a production-grade version of this workflow.

## Troubleshooting

### The menu does not appear

Possible causes:

- `onOpen` has not run yet
- the spreadsheet was opened before the script was saved
- the script has an authorization error
- the project has a syntax error

Try:

```text
1. Save the script.
2. Reload the spreadsheet.
3. Open Extensions → Apps Script and run a simple function manually.
4. Check Executions for errors.
```

### Triggers are not running

Run:

```js
instalirajTriggere()
```

Then check Apps Script → Triggers.

If needed, remove and recreate triggers:

```js
obrisiMojeTriggere()
instalirajTriggere()
```

### Drive export fails

Check these first:

```text
1. REPORT_ROOT_FOLDER_ID is configured.
2. The folder exists.
3. The account running the script has access to the folder.
4. Advanced Google Drive service is enabled.
5. Drive API is enabled in the Google Cloud project if required.
6. authorizeDriveOnce() has been run successfully.
```

If the error mentions `Drive.Files` or `Drive.Revisions`, the Advanced Drive service is probably missing.

### XLSX auto-restore does nothing

This is expected if:

```js
AUTO_RESTORE_ROOT_FOLDER_ID = "";
```

To enable it, set the folder ID and make sure Advanced Google Drive service is enabled.

Also check that the files are XLSX files and that they have the auto-restore description tag.

### Report export works but failsafe does not

The failsafe depends on:

- configured spreadsheet binding
- installed trigger
- readable target sheet
- `A1` containing the report date
- report not already marked as saved for that date

Run once from the bound spreadsheet:

```js
zapamtiSpreadsheetId()
```

Then reinstall triggers:

```js
instalirajTriggere()
```

### Admin UI does not open

Check:

```text
1. Admin PIN has been configured.
2. The script has authorization.
3. HtmlService is allowed to open dialogs.
4. There are no JavaScript errors in the generated Admin UI.
```

Set a PIN:

```js
adminConfig_SetPin("1234")
```

Open the Admin UI from the spreadsheet menu:

```text
Admin → Konfiguracija
```

### Admin PIN is locked

The Admin PIN has a temporary lock after too many failed attempts.

Wait until the lock expires, or clear the PIN from a trusted script editor session:

```js
adminConfig_ClearPin()
adminConfig_SetPin("new-pin")
```

### Edits are slow or delayed

This project intentionally queues edits when the sheet is busy.

Possible causes:

- another trigger is running
- report export is in progress
- reset is in progress
- the document lock is held
- many rows were pasted at once

The edit queue worker should process delayed edits automatically.

You can inspect Script Properties using:

```js
dijagnostikaPropertiesService()
```

### Waiting-time formatting looks wrong

Possible causes:

- system columns were manually changed
- row IDs were deleted
- wait flags are stale
- the row was manually formatted
- the cleaner has not run yet

Try running:

```js
provjeriVrijemeCekanja()
cistacFormataGotovihPacijenata()
```

If the issue persists, test on a copy before forcing reset.

### Daily reset cleared data unexpectedly

Daily reset is destructive by design. It prepares the working area for the next workday.

Before enabling the daily reset trigger in a real deployment:

```text
1. Test reset on a copy.
2. Confirm MAX_TEMPLATE_ROW.
3. Confirm column constants.
4. Confirm target sheet name.
5. Confirm A1 date behavior.
```

For manual reset:

```js
resetirajDnevnuMemoriju_FORCE()
```

Use this only when you are sure the working data can be cleared.

### “Missing spreadsheet context”

Run:

```js
zapamtiSpreadsheetId()
```

This stores the spreadsheet ID for time-based triggers and background jobs.

### “Missing _saveXlsxToDrive_ export helper”

This means module 27 is missing or was not included in the Apps Script project.

Make sure the report export backend module is present and contains:

```js
function _saveXlsxToDrive_(sheet, senderName, tokenRaw) {
  ...
}
```

### “Target sheet not found”

Check:

```js
TARGET_SHEET_NAME
```

The target sheet name must match the actual sheet tab name exactly.

### “Service invoked too many times” or quota errors

The script uses Apps Script services such as SpreadsheetApp, PropertiesService, CacheService, LockService and Drive.

If quotas are hit:

```text
1. Reduce trigger frequency.
2. Avoid very large paste operations.
3. Shorten the active working range.
4. Check stale Script Properties.
5. Run diagnostics.
```

Use:

```js
dijagnostikaPropertiesService()
```

### Best debugging functions

Useful functions when diagnosing deployment problems:

```js
dijagnostikaPropertiesService()
provjeriVrijemeCekanja()
cistacFormataGotovihPacijenata()
reportFailSafeSend_2300()
autoRestoreRunOnce()
resetWatchdog_0630()
```

### Recommended safe testing order

Before using the script on a real operational spreadsheet:

```text
1. Create a copy of the spreadsheet.
2. Configure folder IDs in the copy.
3. Run zapamtiSpreadsheetId().
4. Run authorizeDriveOnce().
5. Set Admin PIN.
6. Open Admin UI.
7. Add or import test admin data.
8. Test a few manual edits.
9. Test report export.
10. Test auto-restore if enabled.
11. Test daily reset.
12. Only then install production triggers.
```

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

## Status and future direction

This project is a cleaned public version of a real spreadsheet automation system. The public version keeps the workflow markers that are necessary for the automation logic, while removing private deployment values and real operational data.

It is not a plug-and-play general clinic product. It is tightly coupled to a specific spreadsheet layout and workflow, but the architecture shows how an existing manual Google Sheet process can be gradually automated.

The natural next step would be to rebuild the workflow as a dedicated web application instead of continuing to extend Google Apps Script further.

## License

No license has been selected yet.

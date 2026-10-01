# Troubleshooting

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

/* ═══════════════════════════════════════════════════════════════════════ 
 * 22 · TRIGGERS — Installed trigger management
 * ═══════════════════════════════════════════════════════════════════════ */ 

const _MANAGED_HANDLERS_ = [ 
  "mojInstaliraniOnEdit", 
  "obradiEditQueue", 
  "provjeriVrijemeCekanja_TRIGGER", 
  "cistacFormataGotovihPacijenata", 
  "resetirajDnevnuMemoriju", 
  "resetirajDnevnuMemoriju_FORCE", 
  "resetirajDnevnuMemoriju_RETRY", 
  "autoRestoreHourly", 
  "resetWatchdog_0630", 
  "reportFailSafeSend_2300" 
]; 

function instalirajTriggere() { 
  const ss = _getSpreadsheet_(); 
  if (!ss) throw new Error("Run zapamtiSpreadsheetId() once from the spreadsheet."); 

  ScriptApp.getProjectTriggers() 
    .filter(t => 
      _MANAGED_HANDLERS_.includes(t.getHandlerFunction()) || 
      t.getHandlerFunction() === "provjeriVrijemeCekanja"
    ) 
    .forEach(t => { 
      try { 
        ScriptApp.deleteTrigger(t); 
      } catch (e) {} 
    }); 

  ScriptApp.newTrigger("mojInstaliraniOnEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create(); 

  ScriptApp.newTrigger("obradiEditQueue")
    .timeBased()
    .everyMinutes(1)
    .create(); 

  ScriptApp.newTrigger("provjeriVrijemeCekanja_TRIGGER")
    .timeBased()
    .everyMinutes(5)
    .create(); 

  ScriptApp.newTrigger("cistacFormataGotovihPacijenata")
    .timeBased()
    .everyMinutes(5)
    .create(); 

  ScriptApp.newTrigger("resetirajDnevnuMemoriju")
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .nearMinute(5)
    .create(); 

  ScriptApp.newTrigger("resetWatchdog_0630")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
    .create(); 

  ScriptApp.newTrigger("autoRestoreHourly")
    .timeBased()
    .everyHours(1)
    .create(); 

  ScriptApp.newTrigger("reportFailSafeSend_2300")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .nearMinute(0)
    .create(); 
} 

function obrisiMojeTriggere() { 
  ScriptApp.getProjectTriggers() 
    .filter(t => 
      _MANAGED_HANDLERS_.includes(t.getHandlerFunction()) || 
      t.getHandlerFunction() === "provjeriVrijemeCekanja"
    ) 
    .forEach(t => { 
      try { 
        ScriptApp.deleteTrigger(t); 
      } catch (e) {} 
    }); 
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  CODE.GS — CENTRAL ORCHESTRATION LAYER FOR SPREADSHEET WORKFLOW LOGIC
 *  Last updated: 2026-07
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  This script is the central runtime layer for the operational spreadsheet.
 *  It covers:
 *  - user input processing and data standardization
 *  - business-rule handling by columns and rows
 *  - visual signaling, waiting states and row-status processing
 *  - daily reset of the operational worksheet
 *  - XLSX report export and administrative configuration
 *  - patient, company and keyword announcement system
 *
 *  ARCHITECTURE (27 modules):
 *
 *  01 · CONFIG                      – System constants, column indexes and operational limits
 *  02 · BINDING                     – Spreadsheet context and target sheet binding
 *  03 · HELPERS                     – Generic helpers, normalization and patch infrastructure
 *  04 · QUIET HOURS                 – Quiet-hours execution mode
 *  05 · SHORT WAIT                  – Short waiting-time configuration and activation
 *  06 · LOCK ENGINE                 – Concurrency control and execution synchronization
 *  07 · EDIT QUEUE                  – Deferred edit-event processing queue
 *  08 · FUZZY STANDARDIZATION C     – Fuzzy standardization of values in column C
 *  09 · KAT / SPORT NORMALIZATION   – Domain normalization for KAT / SPORTSKI / REGISTER / ROČNIK combinations
 *  10 · TRAINING                    – Training-scenario detection
 *  11 · REPORT INTERRUPT            – Temporary automation suspension during report export
 *  12 · REPORT EXPORT               – Export UI, status handling and user dialog
 *  13 · APPLY RULES                 – Central dispatcher for edit-triggered rule processing
 *  14 · HANDLER J                   – Doctor initials and location-tag handling
 *  15 · HANDLER B                   – Time handling and persistence in column B
 *  16 · HANDLER C/H                 – Business-rule handling for columns C–H
 *  17 · WAIT CHECKER                – Waiting-time evaluation and status escalation
 *  18 · FORMAT CLEANER              – Format and content cleanup for completed rows
 *  19 · DAILY RESET                 – Daily reset, watchdog and retry mechanisms
 *  20 · XLSX AUTORESTORE            – Revision-based auto-restore for XLSX reference files
 *  21 · DRIVE AUTH                  – One-time Drive authorization helper
 *  22 · TRIGGERS                    – Installed trigger management
 *  23 · ONEDIT                      – Main edit-event entry point
 *  24 · ADMIN CONFIG                – Administrative configuration and PIN protection
 *  25 · OPERATIVE SETTINGS          – Config layer for clients, clubs and operational rules
 *  26 · ANNOUNCEMENTS               – Patient, company and keyword announcement system
 *  27 · REPORT EXPORT BACKEND       – XLSX save, auto-restore baseline and failsafe export
 **/

# ScriptFlow Codebase Guide

A practical map of the repository for anyone maintaining or extending ScriptFlow.

> **Repository:** https://github.com/anesta-code/scriptflow  
> **Production app:** https://scriptflow-bice.vercel.app/  
> **Frontend:** client/  
> **Backend:** Vercel serverless API + Google Apps Script  
> **Data:** Google Sheets  
> **Current architecture:** React + Vite on Vercel, Vercel API routes, one Google Apps Script project deployed twice, and Google Sheets as the source of truth.

Use this guide to find the correct file before making a change. The frontend does not communicate directly with Google Sheets: data operations pass through the Vercel API and Apps Script.

---

## 1. Architecture and request flow

~~~text
Browser
  |
  v
React components (client/src)
  |
  | fetch('/api/...')
  v
Vercel serverless routes (client/api)
  |
  | HMAC-signed request
  v
Google Apps Script (google-apps-script/Code.gs)
  |
  +---- KPI Weekly spreadsheet
  +---- Notifications / Assignment History / Reporting Config
  +---- Registered forms' original spreadsheets
~~~

### Responsibilities

1. **React frontend:** pages, forms, navigation, reporting tables, filters and user interactions.
2. **Vercel API:** validates the signed-in session, checks permissions, validates request data and forwards signed operations to Apps Script.
3. **Google Apps Script:** verifies HMAC envelopes and user roles, then reads/writes Google Sheets.
4. **Google Sheets:** permanent source of truth for KPI records, reporting support worksheets and registered form records.

There is no active Supabase or separate ScriptFlow database in this architecture. Legacy folders may still exist; do not assume they are used by the live app.

---

## 2. Root repository map

| Path | Purpose |
|---|---|
| README.md | Project overview, current features, architecture, roles, security and deployment process. |
| CODEBASE_GUIDE.md | This file: code map and change lookup. |
| CHANGELOG.md | Historical change notes. Confirm current behaviour against source code. |
| .gitignore | Excludes local dependencies, build output, environment files and logs. |
| client/ | Active React frontend and Vercel serverless API. |
| google-apps-script/ | Active unified Apps Script backend and sign-in HTML. |
| docs/ | Supporting and historical documentation. |
| database/migrations/ | Legacy SQL migrations from an earlier design; not used by the current Sheets data flow. |
| supabase/ | Legacy Supabase files; not used by the current live architecture. |

---

## 3. Frontend: client/src/

### Application entry and authentication

| File | Responsibility |
|---|---|
| client/src/main.jsx | Starts React and imports the application/global styles. |
| client/src/App.jsx | Top-level application composition. |
| client/src/AuthGate.jsx | Checks the session, handles the Google sign-in callback, displays authentication/loading/error states and signs users out. |
| client/src/auth.css | Sign-in and authentication screen styling. |
| client/src/styles.css | Global styles and shared application shell/layout styles. |

### KPI application, navigation and notifications

| File | Responsibility |
|---|---|
| client/src/KPIWeekly.jsx | Main KPI Weekly workspace and application navigation. Handles KPI record loading, search, create/edit/delete, assignment UI, Excel export, My Assigned Projects, notification UI, navigation to Reporting and registered forms, and opening Forms Workspace. |
| client/src/KPIWeekly.css | KPI workspace, form, records table, navigation/sidebar and notification styling. |

When changing the KPI record form, KPI list, SW assignment selector, My Assigned Projects, notification bell/panel or main navigation, start with KPIWeekly.jsx and then inspect its CSS.

### Daily and Weekly Reporting

| File | Responsibility |
|---|---|
| client/src/Reporting.jsx | Daily Reporting, Weekly Reporting and Reporting Configuration interface. Loads reporting data, groups scripters by cluster, calculates displayed workload/weekly counts, manages filters and drill-downs, and saves Reporting Configuration. |
| client/src/Reporting.css | Reporting page layout, cluster headings, summary cards, filters, tables, drill-downs and configuration styling. |

Current Reporting behaviour:

- Daily Reporting is visible to Scripters, Team Leads and Admins.
- Weekly Reporting and Reporting Configuration are visible to Team Leads and Admins.
- Daily matrix groups scripter columns by configured cluster.
- Daily filters include Scripter, Status and Complexity; project/client search is also available to managers.
- The Date Sent to QA / From / To filters were removed.
- Status visibility controls and clickable count drill-downs are part of the Daily matrix.
- Weekly totals count new assignment events for the selected week. Reassignments and unassignments are displayed separately.
- Reporting Configuration manages cluster membership/lead, complexity ranges and status settings.

Do not move assignment calculations or configuration persistence into the browser without checking the existing Apps Script data contract.

### Forms and dynamic forms

| File | Responsibility |
|---|---|
| client/src/FormsWorkspace.jsx | Admin form-registration workspace. Adds/updates/deactivates form registrations, lists available forms, opens records, and provides create/edit/delete actions subject to role permissions. Also provides navigation to Reporting Configuration for authorised managers. |
| client/src/FormsWorkspace.css | Forms Workspace styling. |
| client/src/DynamicFormPage.jsx | Renders a registered form from worksheet field metadata; handles field values, records, create/edit/delete, KPI project search and mapped KPI fields. |
| client/src/DynamicFormPage.css | Dynamic form and KPI project-selection styling. |

Each registered form reads/writes its own original spreadsheet. Deactivating a form only removes its active ScriptFlow registration; it must not delete source spreadsheet data.

### Browser-side cache

| File | Responsibility |
|---|---|
| client/src/services/dataCache.js | Short-lived in-memory browser cache, request deduplication and cache invalidation helpers. |

The cache is local to the browser tab; it is not a shared cache between users and is not permanent storage. Check the current source before changing cache durations or cache keys. When changing create/update/delete flows, inspect the relevant cache invalidation. Explicit refresh actions should fetch fresh data.

---

## 4. Vercel serverless API: client/api/

These files execute server-side on Vercel. They are not React components.

| Path | Responsibility |
|---|---|
| client/api/_lib/security.js | Shared security and API helpers: session verification, HMAC request signing, cookies, safe comparison, Apps Script HTTP calls and method validation. |
| client/api/auth/start.js | Starts Google Workspace sign-in and creates the sign-in state. |
| client/api/auth/exchange.js | Validates the callback/state, redeems the Apps Script employee assertion and creates the ScriptFlow session cookie. |
| client/api/auth/session.js | Validates the current session and returns the signed-in user context. |
| client/api/auth/logout.js | Clears the session/sign-in cookies. |
| client/api/kpi-weekly.js | KPI endpoint. Routes KPI record list/save/delete plus reporting data and Reporting Configuration operations, with server-side session/role checks. |
| client/api/kpi-weekly/list.js | Retained KPI list route. Check current references before changing or removing it. |
| client/api/forms.js | Routes registered-form operations: list/add/update/deactivate forms, list/save/delete form records and search KPI projects. |

### Typical frontend/API/Apps Script operation map

| User action | Vercel route | Apps Script operation |
|---|---|---|
| Load KPI records | POST /api/kpi-weekly | list_kpi_records |
| Save KPI record | POST /api/kpi-weekly | sync_job |
| Delete KPI record | POST /api/kpi-weekly | delete_kpi_record |
| Load team directory | KPI endpoint | list_team_members |
| Load notifications | KPI endpoint | list_notifications |
| Mark notification read | KPI endpoint | mark_notification_read |
| Mark all notifications read | KPI endpoint | mark_all_notifications_read |
| Load Daily/Weekly Reporting data | KPI endpoint | get_reporting_data |
| Save Reporting Configuration | KPI endpoint | save_reporting_config |
| Search KPI project for form mapping | Forms endpoint | list_kpi_projects |
| List forms | Forms endpoint | list_forms |
| Add/update/deactivate a form | Forms endpoint | add_form, update_form, deactivate_form |
| List/save/delete form records | Forms endpoint | list_form_records, save_form_record, delete_form_record |

The exact request body/action names are implemented in the API route. Read the route before changing the contract between React, Vercel and Apps Script.

---

## 5. Google Apps Script: google-apps-script/

### Main backend: google-apps-script/Code.gs

This is the unified backend used by both existing Apps Script web app deployments. It is responsible for:

- Serving the sign-in page and issuing signed employee assertions.
- Validating signed API envelopes from Vercel.
- Resolving team members and multiple account roles.
- Enforcing permissions again on the backend.
- Reading/writing KPI Weekly records and permanent record IDs.
- Searching KPI projects for dynamic-form mappings.
- Creating assignment history events.
- Creating and listing in-app assignment notifications.
- Reading/saving Reporting Configuration and its history.
- Managing the registered-form registry in Script Properties.
- Reading/writing records in each registered form's original spreadsheet.
- Handling hidden record IDs, project IDs and revision tokens.
- Returning JSON responses and protecting spreadsheet cells from formula injection.

### Main Code.gs function map

| Function / section | Responsibility |
|---|---|
| doGet() | Serves the Apps Script sign-in page and prepares the approved callback URL/state. |
| doPost() | Verifies the signed API envelope, resolves the user and dispatches supported operations. |
| resolveCallbackUrl_() | Allows the configured production callback and approved ScriptFlow Preview callback pattern. |
| getSignInIdentity(), issueAuthToken() | Gets the signed-in Workspace identity and issues a short-lived signed assertion. |
| authenticatedEmployee_() | Requires a Bilendi Workspace identity and resolves roles. |
| normalizeRoles_(), primaryRole_(), rolesFor_(), hasRole_(), requireRole_() | Normalises multi-role membership and checks permissions. Primary-role precedence is Admin → Team Lead → Scripter. |
| verifyApiEnvelope_() | Checks the API HMAC, timestamp and nonce/replay protection. |
| redeemAuthToken_(), verifyUser_() | Validates employee assertions and API user context. |
| saveKpiRecord_(), fieldForHeader_() | Creates/updates KPI Weekly rows and maps application fields to worksheet headers. |
| listKpiRecords_(), recordFromSheetRow_(), sheetValueForForm_() | Reads KPI rows and converts them into application records. |
| listKpiProjects_(), findKpiProjectById_(), projectValueForKey_() | Searches KPI records and resolves mapped field values for dynamic forms. |
| listTeamMembers_(), teamMemberForEmail_(), teamMemberForSw_() | Exposes the team directory and resolves members by email/name for assignment. |
| notificationsSheet_(), appendNotification_(), createAssignmentNotifications_(), listNotifications_(), markNotificationRead_(), markAllNotificationsRead_() | Creates and manages in-app assignment notifications. |
| appendAssignmentHistory_(), readAssignmentHistory_(), assignmentHistorySheet_() | Records and reads new assignments, reassignments and unassignments. |
| defaultReportingConfig_(), reportingConfigSheet_(), readReportingConfig_(), saveReportingConfig_(), reportingConfigHistorySheet_(), getReportingData_() | Manages shared reporting settings, configuration history and reporting data responses. |
| deleteKpiRecord_() | Deletes a KPI record by its permanent ID; caller checks the user's role. |
| readFormRegistry_(), writeFormRegistry_() | Reads/writes form metadata in Apps Script Properties. |
| parseSpreadsheetId_(), getFormSheet_() | Resolves a registered form's source spreadsheet and worksheet. |
| inferFormFieldType_(), readFormHeaders_() | Reads source headers and infers dynamic field types. |
| applyProjectFieldMappings_(), formHasProjectMappings_() | Applies KPI project-field mappings to dynamic form fields. |
| listForms_(), addForm_(), updateForm_(), deactivateForm_(), activeForm_() | Lists and manages registered forms. Deactivation preserves source data. |
| ensureFormProjectColumn_(), ensureFormIdColumn_(), ensureFormRevisionColumn_() | Ensures hidden metadata columns exist. |
| listFormRecords_(), saveFormRecord_(), deleteFormRecord_() | Reads, creates, updates and deletes records in the registered form's own worksheet. |
| safeCell_(), b64url_(), b64urlBytes_(), hex_(), constantEqual_(), json_() | Cell safety, encoding, comparison and JSON helpers. |

### Sign-in HTML

google-apps-script/auth/Index.html is the HTML page served by doGet(). It calls Apps Script functions to display the signed-in employee identity, issue the short-lived assertion and redirect to the approved Vercel callback.

---

## 6. Google Sheets structure and data rules

The KPI spreadsheet is the main ScriptFlow workbook. Depending on which features have been used, it can contain:

| Worksheet | Purpose |
|---|---|
| KPI weekly | KPI project records. |
| Notifications | Per-user notification messages and read state. Created automatically when needed. |
| Assignment History | Assignment event history. Created when the first assignment change is recorded. |
| Reporting Config | Shared status, complexity, cluster and visibility settings. |
| Reporting Config History | Audit snapshots of configuration changes. |

Registered forms can point to separate spreadsheets. Their records remain in those original workbooks.

### Hidden metadata columns

| Column | Purpose |
|---|---|
| __ScriptFlow_ID | Stable ID for a KPI or dynamic form record. |
| __ScriptFlow_Project_ID | KPI project reference selected in a mapped dynamic form. |
| __ScriptFlow_Revision | Revision token for detecting conflicting ScriptFlow edits. |

Do not expose these as normal form fields or delete them without updating the related backend logic.

### Assignment history rules

- A change from no SW to an SW is a new_assignment.
- A change from one SW to another is a reassignment.
- A change from an SW to blank is an unassignment.
- Weekly totals count new_assignment events only.
- Reassignments and unassignments are displayed separately.
- Historical assignment events are not backfilled if the source sheet has no reliable old assignment timestamps.

### Reporting configuration rules

- Cluster membership is separate from ScriptFlow account roles.
- A cluster lead is a separate designation; it does not automatically grant Team Lead or Admin permissions.
- A team member belongs to at most one configured cluster.
- Cluster changes do not reassign KPI projects.
- Complexity ranges must be valid and non-overlapping.
- Configuration changes are saved centrally and logged in Reporting Config History.

---

## 7. Authentication, roles and secrets — sensitive code

Treat these files as security-critical:

- client/api/_lib/security.js
- client/api/auth/*.js
- client/api/kpi-weekly.js
- client/api/forms.js
- google-apps-script/Code.gs

### Vercel environment variable names

- GOOGLE_WORKSPACE_AUTH_URL
- SCRIPT_FLOW_API_URL
- SCRIPT_FLOW_API_SECRET
- SCRIPT_FLOW_SESSION_SECRET

### Apps Script Script Property names

- AUTH_TOKEN_SECRET
- SCRIPT_FLOW_API_SECRET
- VERCEL_CALLBACK_URL
- KPI_SPREADSHEET_ID (optional)
- SCRIPT_FLOW_USER_ROLES (optional)
- SCRIPT_FLOW_FORMS and chunk properties

Never put secret values in the repository or frontend bundle.

Important safeguards:

1. Do not remove HMAC signature, timestamp, nonce or replay validation.
2. Do not weaken signed assertion/session validation or cookie security.
3. Keep backend role checks; frontend button visibility alone is not access control.
4. Do not change deployment URLs, execution identity, access scope or Script Properties as part of routine feature work.
5. Do not connect the browser directly to Google Sheets.
6. If Code.gs changes are approved and merged, update both existing Apps Script deployments to a new version when their shared code behaviour changes. Keep the same deployment URLs and settings.

---

## 8. Quick lookup: where to make a change

| Change request | Start with |
|---|---|
| KPI form fields, validation or calculated values | client/src/KPIWeekly.jsx |
| KPI record table, search, filtering or Excel export | client/src/KPIWeekly.jsx and client/src/KPIWeekly.css |
| SW assignment selector / My Assigned Projects | client/src/KPIWeekly.jsx, then Apps Script assignment logic in Code.gs |
| Notification bell, unread count or notification panel | client/src/KPIWeekly.jsx and client/src/KPIWeekly.css; backend in Code.gs |
| Daily Reporting matrix, filters or drill-downs | client/src/Reporting.jsx and client/src/Reporting.css |
| Weekly assignment totals/history display | client/src/Reporting.jsx; backend history functions in Code.gs |
| Cluster membership, cluster lead, status or complexity configuration UI | client/src/Reporting.jsx and client/src/Reporting.css; persistence in Code.gs |
| Registered form administration | client/src/FormsWorkspace.jsx and client/src/FormsWorkspace.css |
| Dynamic form fields, record editing or KPI project mapping | client/src/DynamicFormPage.jsx and client/src/DynamicFormPage.css |
| Sign-in screen/session callback | client/src/AuthGate.jsx, client/src/auth.css, and client/api/auth/ |
| Session cookies, HMAC signing or Apps Script HTTP calls | client/api/_lib/security.js |
| KPI API validation and request routing | client/api/kpi-weekly.js |
| Form API validation and request routing | client/api/forms.js |
| Browser-side caching | client/src/services/dataCache.js and the page that calls it |
| Spreadsheet operations, roles, notifications, history, reporting config or form registry | google-apps-script/Code.gs |
| Apps Script sign-in HTML | google-apps-script/auth/Index.html |
| Vite development/build configuration | client/vite.config.js |
| Vercel routing/rewrite | client/vercel.json |

---

## 9. Local development and testing

From the repository root:

~~~powershell
cd client
npm install
npm run dev
~~~

Build:

~~~powershell
npm run build
~~~

The local Vite server can render the frontend, but authenticated data operations require the correct server-side environment and Apps Script configuration. Never put server secrets in client-side variables.

### Minimum checks before a pull request

**General**
- App loads and navigation works.
- No new browser-console errors.
- Vercel Preview build succeeds.
- Check desktop and mobile layouts.

**KPI Weekly**
- KPI records load and manual refresh retrieves fresh data.
- Search and project filters still work.
- Create/edit update the intended row rather than creating duplicates.
- SW assignment and My Assigned Projects behave correctly.
- Delete remains restricted to Team Leads/Admins.
- Excel export works.

**Reporting**
- Daily Reporting is available to all roles.
- Daily cluster headings and scripter grouping match saved configuration.
- Scripter, Status and Complexity filters work.
- Status visibility toggles and drill-downs show the correct projects.
- Weekly Reporting and Reporting Configuration are manager-only.
- Weekly new-assignment totals exclude reassignments/unassignments.
- Configuration changes persist and appear in configuration history.

**Notifications**
- Assignment/reassignment/unassignment notifies the relevant people.
- Users see only their own notifications.
- Mark one/all as read updates unread counts.

**Registered forms**
- Active forms appear in Reporting.
- Records load from the correct source spreadsheet.
- KPI project mappings populate the intended fields.
- Create/edit/delete affects only the selected form's source worksheet.
- Deactivating a form does not delete its spreadsheet or records.

**Security and concurrency**
- Test accounts with Scripter, Team Lead and Admin roles, including multi-role accounts.
- Unauthorised API operations are rejected.
- Sign-in, logout and session expiry continue working.
- A stale dynamic-form edit is rejected instead of overwriting a newer ScriptFlow edit.

---

## 10. Development and release workflow

1. Start from the latest main branch.
2. Create a dedicated feature branch; do not commit directly to main.
3. Make the smallest change in the layer that owns the behaviour.
4. Run the build and test the affected workflow.
5. Open a pull request.
6. Verify the Vercel Preview deployment.
7. Merge only after the Preview and role checks pass.
8. For an approved Apps Script change, update the existing AUTH and API deployments to a new version when required. Do not create new deployment URLs.
9. Verify production after the merge/deployment.

---

## 11. Legacy and historical files

- database/migrations/ and supabase/ are from an earlier architecture and are not part of the active Google Sheets data path.
- Some old setup notes may describe an earlier Apps Script deployment arrangement. Verify against the current README and live configuration before following them.
- Do not delete legacy files solely because they appear unused. Check references and deployment requirements first.

---

## 12. Core principle

**Make the smallest change in the layer that owns the behaviour.**

- UI and interaction → React components.
- Styling → CSS.
- Browser-side read cache → dataCache.js.
- HTTP routing and server-side session checks → client/api/.
- Spreadsheet operations, data rules, role enforcement and audit/history logic → google-apps-script/Code.gs.

When in doubt, trace the full operation from the React component through the Vercel route to the Apps Script function and the target worksheet before editing.

# ScriptFlow Codebase Guide

A practical map of the repository for making changes directly in code.

> **Repository:** [anesta-code/scriptflow](https://github.com/anesta-code/scriptflow)  
> **Production app:** [https://scriptflow-bice.vercel.app/](https://scriptflow-bice.vercel.app/)  
> **Frontend folder:** `client/`  
> **Current architecture:** React + Vite on Vercel, Vercel serverless API routes, Google Apps Script, and Google Sheets.

This guide describes the current source tree and the active Google Sheets architecture. It is intended to help you identify the correct file before changing code.

---

## 1. Understand the architecture first

ScriptFlow has three main layers:

1. **Frontend (React):** displays the application, forms, tables, navigation and user interactions.
2. **Vercel API (server-side JavaScript):** receives frontend requests, validates the signed-in session and permissions, then forwards approved operations to Apps Script.
3. **Google Apps Script + Google Sheets:** performs the actual spreadsheet reads and writes. Each registered form continues to use its own original spreadsheet.

The normal request flow is:

```text
Employee's browser
      |
      v
React pages (client/src)
      |
      | fetch('/api/...')
      v
Vercel API routes (client/api)
      |
      | signed HMAC request
      v
google-apps-script/Code.gs
      |
      +------ KPI Weekly spreadsheet
      |
      +------ Registered form spreadsheet A
      |
      +------ Registered form spreadsheet B
```

**Important:** the frontend does not connect directly to Google Sheets. Do not bypass the Vercel API or Apps Script for data operations.

---

## 2. Repository map

### Root folder

| File/folder | Purpose |
|---|---|
| `README.md` | Project overview, architecture, roles, setup and operating principles. |
| `CODEBASE_GUIDE.md` | This file: where code lives and where to make changes. |
| `CHANGELOG.md` | Historical change notes. Check it before assuming it describes the latest implementation. |
| `.gitignore` | Prevents local dependencies, build output, environment files and logs from being committed. |
| `client/` | Active React frontend and Vercel serverless API. |
| `google-apps-script/` | Active Apps Script backend and sign-in HTML. |
| `docs/` | Supporting setup and technical documentation. |
| `database/migrations/` | Legacy SQL migrations from an earlier database-based design. Not part of the current Google Sheets data flow. |
| `supabase/` | Legacy Supabase files from an earlier design. Not part of the current application data flow. |

The presence of old `database/` and `supabase/` folders does **not** mean the live app uses Supabase. The current architecture described above uses Google Sheets as the data store.

### Frontend: `client/`

| Path | Responsibility |
|---|---|
| `client/package.json` | Dependencies and commands such as `npm run dev` and `npm run build`. |
| `client/package-lock.json` | Exact npm dependency versions. Normally updated by npm, not edited manually. |
| `client/index.html` | HTML entry point and page metadata. |
| `client/vite.config.js` | Vite development/build configuration. |
| `client/vercel.json` | Vercel routing rewrite for the authentication callback. |
| `client/.env.example` | Old environment-variable example; it still contains legacy Supabase names and should not be treated as the current production configuration. |
| `client/src/` | React application source and styles. |
| `client/api/` | Vercel serverless API endpoints. |

### React entry and authentication

| File | What it does |
|---|---|
| `client/src/main.jsx` | Starts React, enables the router and imports global CSS. |
| `client/src/App.jsx` | Top-level composition: wraps the KPI application in `AuthGate`. |
| `client/src/AuthGate.jsx` | Checks the session, handles the Google sign-in callback, displays sign-in/error/loading states and signs users out. |
| `client/src/auth.css` | Styling for sign-in and authentication screens. |
| `client/src/styles.css` | Global styles and the shared application shell/layout styles. |

If a change concerns sign-in screens, session-checking UI or the Google redirect callback, start with `AuthGate.jsx`. If it concerns the initial React setup, start with `main.jsx` or `App.jsx`.

### Main reporting application

| File | What it does |
|---|---|
| `client/src/KPIWeekly.jsx` | Main reporting application. Contains KPI Weekly form and record list, search/filtering, record editing, create/delete actions, Excel export, reporting navigation, available forms and lazy loading of Forms Workspace. |
| `client/src/KPIWeekly.css` | Styling for the KPI Weekly page, navigation/sidebar, dashboard, record list and KPI form. |
| `client/src/FormsWorkspace.jsx` | Admin form-management workspace. Registers spreadsheets, edits form configuration, deactivates registrations, lists form records and supports record create/edit/delete. |
| `client/src/FormsWorkspace.css` | Forms Workspace styling. |
| `client/src/DynamicFormPage.jsx` | Renders a registered form from its configured fields; handles records, field values, edit/create/delete, project selection and mapped KPI project fields. |
| `client/src/DynamicFormPage.css` | Styling for generated/dynamic forms and KPI project selection. |

**Where to change common UI behaviour**

- KPI Weekly page, fields, search, Excel export or KPI record table: `KPIWeekly.jsx`.
- Add/edit/deactivate registered forms or admin configuration UI: `FormsWorkspace.jsx`.
- The actual fields and records inside a registered form: `DynamicFormPage.jsx`.
- Main/sidebar/global layout: `styles.css` and then the relevant page CSS.
- Responsive styling: the same CSS files; look for their media queries near the bottom.

### Frontend data cache

| File | What it does |
|---|---|
| `client/src/services/dataCache.js` | Short-lived in-memory cache for reads, deduplicates simultaneous identical requests, and exposes cache invalidation helpers. |

Current cache behaviour:
- Default cache lifetime is 20 seconds.
- KPI project search results use 30 seconds.
- Cache is held in the current browser tab's memory only.
- It is not a shared cache between users or a permanent data store.
- Successful create/update/delete operations should invalidate the affected cache.
- Explicit Refresh actions should request fresh data.

When changing data-loading behaviour, inspect both the page component and `dataCache.js`. If you change a save/delete workflow, make sure its related cache entry is invalidated before fresh data is loaded.

---

## 3. Vercel API routes

The API code is under `client/api/`. These are server-side endpoints, not React components.

| File | Responsibility |
|---|---|
| `client/api/_lib/security.js` | Shared security helpers: HMAC request signing, session signing/verification, cookie parsing, safe comparison, Apps Script HTTP calls and method validation. |
| `client/api/auth/start.js` | Starts the Google Workspace sign-in redirect and creates the OAuth state cookie. |
| `client/api/auth/exchange.js` | Validates the callback state, redeems the Apps Script-issued employee token and creates the secure ScriptFlow session cookie. |
| `client/api/auth/session.js` | Validates the existing session and returns the current user identity/role. |
| `client/api/auth/logout.js` | Clears the session and OAuth state cookies. |
| `client/api/kpi-weekly.js` | Main KPI endpoint: list, save/upsert and delete KPI records, with server-side role checks and field conversion. |
| `client/api/kpi-weekly/list.js` | Separate KPI list endpoint retained in the repository. Check current frontend usage before changing or removing it. |
| `client/api/forms.js` | Routes registered-form operations: list forms, add/update/deactivate form, list/save/delete records and search KPI projects. Enforces role permissions. |

### Frontend-to-API map

| Frontend action | Vercel route | Apps Script operation |
|---|---|---|
| Load KPI records | `POST /api/kpi-weekly` with `action: "list"` | `list_kpi_records` |
| Save KPI record | `POST /api/kpi-weekly` with record body | `sync_job` |
| Delete KPI record | `POST /api/kpi-weekly` with `action: "delete"` | `delete_kpi_record` |
| List registered forms | `POST /api/forms` with `action: "list"` | `list_forms` |
| Add/update/deactivate form | `POST /api/forms` with `action: "add"`, `"update"`, or `"remove"` | `add_form`, `update_form`, `deactivate_form` |
| Load registered form records | `POST /api/forms` with `action: "list-records"` | `list_form_records` |
| Save/delete registered form record | `POST /api/forms` with `action: "save-record"` or `"delete-record"` | `save_form_record`, `delete_form_record` |
| Search KPI projects | `POST /api/forms` with `action: "list-projects"` | `list_kpi_projects` |

The Vercel route validates the session and permissions before calling Apps Script. Apps Script also validates the signed request and user permissions. Keep both layers intact.

---

## 4. Google Apps Script backend

### Main file: `google-apps-script/Code.gs`

This is the central backend. It is responsible for:
- Authentication identity and signed employee assertions.
- HMAC validation of requests from Vercel.
- User/role validation.
- KPI Weekly spreadsheet operations.
- KPI project search and reference mapping.
- Registered form configuration/registry.
- Dynamic form worksheet reads and writes.
- Record identifiers and revision/concurrent-edit protection.
- Safe spreadsheet cell handling and JSON responses.

The file is organised into functional sections. Function names are a useful way to navigate it:

| Functions / section | Responsibility |
|---|---|
| `doGet()` | Serves the Apps Script sign-in page. |
| `doPost()` | Validates the signed API envelope and routes operations to backend functions. |
| `getSignInIdentity()`, `issueAuthToken()` | Gets the signed-in company identity and issues a short-lived sign-in assertion. |
| `authenticatedEmployee_()`, `roleFor_()` | Resolves the employee and their ScriptFlow role. |
| `verifyApiEnvelope_()`, `redeemAuthToken_()`, `verifyUser_()` | Validates signed API requests, employee assertions and user context. |
| `saveKpiRecord_()`, `fieldForHeader_()` | Writes/updates KPI Weekly records and maps app fields to spreadsheet headers. |
| `listKpiRecords_()`, `recordFromSheetRow_()` | Reads KPI records and converts spreadsheet rows into application records. |
| `listKpiProjects_()`, `findKpiProjectById_()`, `projectValueForKey_()` | Searches KPI Migration projects and resolves mapped project values. |
| `requireRole_()`, `deleteKpiRecord_()` | Enforces backend role permissions and deletes KPI records. |
| `readFormRegistry_()`, `writeFormRegistry_()` | Reads/writes the registered-form configuration stored in Apps Script Properties. |
| `parseSpreadsheetId_()`, `getFormSheet_()` | Resolves the source spreadsheet and worksheet for a registered form. |
| `inferFormFieldType_()`, `readFormHeaders_()` | Reads worksheet headers and infers dynamic field types. |
| `applyProjectFieldMappings_()`, `formHasProjectMappings_()` | Applies configured KPI project reference mappings to form fields. |
| `listForms_()`, `addForm_()`, `updateForm_()`, `deactivateForm_()`, `activeForm_()` | Manages the ScriptFlow form registry. Deactivation does not delete the source spreadsheet. |
| `ensureFormProjectColumn_()`, `ensureFormIdColumn_()`, `ensureFormRevisionColumn_()` | Ensures hidden metadata columns exist for project reference, stable ID and revision tracking. |
| `listFormRecords_()`, `saveFormRecord_()`, `deleteFormRecord_()` | Reads, creates, updates and deletes records in the selected form's original worksheet. |
| `safeCell_()`, encoding/comparison helpers, `json_()` | Protects cell values and supports secure encoding/comparison and JSON output. |

### Sign-in HTML

`google-apps-script/auth/Index.html` is the HTML page served by `doGet()`. It displays the company identity and calls Apps Script functions to issue the sign-in assertion before redirecting to Vercel.

`google-apps-script/auth/README.md` explains that this HTML belongs to the unified Apps Script project. The active backend remains the root `google-apps-script/Code.gs`.

---

## 5. Important data and concurrency rules

These are important when changing how records are saved or edited.

### Each form keeps its own spreadsheet

- KPI Weekly remains in its existing KPI spreadsheet.
- Every registered form points to its own spreadsheet and worksheet.
- ScriptFlow centralises the user interface, not the underlying data.
- Deactivating a form removes it from active ScriptFlow navigation; it does not delete its source spreadsheet or records.

### Hidden metadata columns

| Column | Purpose |
|---|---|
| `__ScriptFlow_ID` | Stable record ID used to find the correct row when editing/deleting. |
| `__ScriptFlow_Project_ID` | Stores the selected KPI Migration project ID for mapped forms. |
| `__ScriptFlow_Revision` | Revision token used to detect competing ScriptFlow edits. |

Do not display these metadata columns as ordinary user form fields.

### Concurrent editing

The dynamic form save workflow sends the record revision to Apps Script. Apps Script uses a script lock and compares the submitted revision with the current revision before saving. If another ScriptFlow user has changed the record, the save is rejected instead of silently overwriting their changes.

If changing record loading or saving, preserve:
- The record ID.
- The revision token returned when records are read.
- The revision token submitted during updates.
- The backend comparison and lock.
- The user-facing conflict message.

This protection is designed for edits made through ScriptFlow. Manual edits made directly in Google Sheets do not necessarily update the ScriptFlow revision token.

---

## 6. Authentication, roles and secrets: treat as sensitive

The following files are security-critical:
- `client/api/_lib/security.js`
- `client/api/auth/*.js`
- `client/api/forms.js`
- `client/api/kpi-weekly.js`
- `google-apps-script/Code.gs`

Important rules:
1. Never commit API secrets, session secrets, employee tokens or private environment files.
2. Do not remove HMAC signature, timestamp, nonce or replay validation.
3. Do not weaken cookie flags or session verification.
4. Do not rely only on hidden/disabled frontend buttons for permissions; enforce permissions in the backend.
5. Do not change role checks casually. Test with separate accounts for each role.
6. Do not change Apps Script deployment URLs or Script Properties as part of a frontend-only change.

Vercel server-side environment variables used by the current architecture include:
- `GOOGLE_WORKSPACE_AUTH_URL`
- `SCRIPT_FLOW_API_URL`
- `SCRIPT_FLOW_API_SECRET`
- `SCRIPT_FLOW_SESSION_SECRET`

Apps Script Script Properties include:
- `AUTH_TOKEN_SECRET`
- `SCRIPT_FLOW_API_SECRET`
- `VERCEL_CALLBACK_URL`
- `SCRIPT_FLOW_USER_ROLES`
- Optional `KPI_SPREADSHEET_ID`

The actual secret values must remain in Vercel and Apps Script configuration. They must never be written in this guide or committed to Git.

---

## 7. Where to make a change: quick lookup

| If you want to… | Start here |
|---|---|
| Change the KPI Weekly form fields or their UI behaviour | `client/src/KPIWeekly.jsx` |
| Change KPI record list/search/filter/export | `client/src/KPIWeekly.jsx` |
| Change the main navigation or reporting sidebar | `client/src/KPIWeekly.jsx` and `client/src/KPIWeekly.css` |
| Change the global app layout | `client/src/styles.css` |
| Change KPI page appearance/responsiveness | `client/src/KPIWeekly.css` |
| Change dynamic registered form fields | `client/src/DynamicFormPage.jsx` |
| Change dynamic form appearance | `client/src/DynamicFormPage.css` |
| Change admin form registration/configuration | `client/src/FormsWorkspace.jsx` |
| Change Forms Workspace appearance | `client/src/FormsWorkspace.css` |
| Change sign-in UI or callback handling | `client/src/AuthGate.jsx` and `client/src/auth.css` |
| Change session cookies or HMAC request signing | `client/api/_lib/security.js` |
| Change Google sign-in API endpoints | `client/api/auth/` |
| Change KPI server API validation/field conversion | `client/api/kpi-weekly.js` |
| Change registered-form API routing/role checks | `client/api/forms.js` |
| Change how data is cached in the browser | `client/src/services/dataCache.js` and the relevant page component |
| Change spreadsheet operations, form registry or revision checks | `google-apps-script/Code.gs` |
| Change the Apps Script sign-in page | `google-apps-script/auth/Index.html` |
| Change Vite build/development settings | `client/vite.config.js` |
| Change Vercel SPA callback rewrite | `client/vercel.json` |

---

## 8. Safe workflow for making changes directly in the repository

1. **Start from the latest `main` branch.** Do not build on an old feature branch.
2. **Identify the owning file** using the quick lookup above.
3. **Trace the full request path** if the change touches data: React component → Vercel route → Apps Script operation → spreadsheet.
4. **Create a feature branch** for the change. Avoid committing experimental work directly to `main`.
5. **Keep the scope small.** For a visual change, prefer CSS-only changes. For a frontend behaviour change, avoid changing backend/security code unless necessary.
6. **Build locally** from the frontend folder:
   ```powershell
   cd client
   npm install
   npm run build
   ```
7. **Test the relevant workflow** using the correct user roles and more than one account when permissions or concurrent editing are involved.
8. **Open a pull request** and test the Vercel Preview deployment before merging.
9. **Merge only after verification.** Vercel deploys the connected Git branch/merge according to the repository's deployment configuration.

### Local development

From the repository root:

```powershell
cd client
npm install
npm run dev
```

Vite prints the local development URL in the terminal. To create a production build:

```powershell
npm run build
```

The generated build output is in `client/dist/` and should not be committed.

---

## 9. What to test after a change

Choose the tests that apply to the files you touched.

### General
- Application loads and navigation works.
- No new browser-console errors.
- No horizontal overflow at desktop, tablet and mobile widths.
- Vercel Preview build completes successfully.

### KPI Weekly
- KPI records load and manual Refresh gets fresh data.
- Search and filtering still work.
- Create and edit save to the correct KPI worksheet.
- Delete remains restricted to team leaders/admins.
- Excel export still works.

### Registered forms
- Available forms appear in Reporting.
- Selecting a form loads the correct worksheet's records.
- Field types and project mappings remain correct.
- Create/edit/delete actions update only the selected form's source spreadsheet.
- Deactivating a form does not delete its spreadsheet or data.

### Concurrent editing
- Open the same record in two sessions.
- Save a change in the first session.
- Attempt to save the stale edit in the second session.
- Confirm the second save is rejected and the first user's data remains intact.

### Security
- Test scripter, team leader and admin permissions.
- Confirm unauthorised API calls are rejected.
- Confirm authentication, logout and session expiry still work.

---

## 10. Legacy and reference files

The following areas are retained in the repository but are not part of the active Google Sheets application flow:

- `database/migrations/`: old SQL schema and migration history.
- `supabase/`: old Supabase functions and local metadata.
- `client/.env.example`: contains legacy Supabase environment names; do not use it as the source of current production secrets.
- `docs/google-workspace-preview-setup.md`: historical preview setup notes. Some instructions describe an earlier split-project/preview setup and conflict with the current unified Apps Script project. Treat it as historical reference and verify against the current `README.md` and live deployment configuration before following it.
- `client/api/kpi-weekly/list.js`: retained separate list endpoint; check whether it is referenced before changing/removing it.

Do not delete legacy files simply because they look unused. Confirm repository references and deployment requirements first.

---

## 11. Core principle

**Make the smallest change in the layer that owns the behaviour.**

- UI and interaction → React components.
- Appearance → CSS.
- Browser-side read caching → `dataCache.js`.
- HTTP endpoint and server-side validation → `client/api/`.
- Spreadsheet operations, role enforcement and revision control → `google-apps-script/Code.gs`.

When in doubt, trace the operation from the button in the React component all the way to the Apps Script function before editing. This avoids changing the wrong layer and helps preserve the working production system.

# ScriptFlow

**A central reporting workspace for Bilendi scripting operations.**

ScriptFlow gives the team one consistent web application for accessing KPI Weekly reporting and other operational forms, while keeping each form connected to its existing Google Sheets spreadsheet. It reduces the need to move between separate spreadsheets and provides a clearer, role-controlled way to create, review, update and manage reporting records.

- **Live application:** [scriptflow-bice.vercel.app](https://scriptflow-bice.vercel.app/)
- **Source code:** [anesta-code/scriptflow](https://github.com/anesta-code/scriptflow)
- **Hosting:** Vercel
- **Application backend:** Google Apps Script
- **Data storage:** Existing Google Sheets workbooks

---

## 1. Executive summary

ScriptFlow is being developed as a single access point for the scripting team's operational reporting.

Today, reporting information can be spread across separate Google Sheets and forms. ScriptFlow brings those entry points into one application so employees can sign in once, select the relevant report from a shared navigation area, and work with the records in the spreadsheet that already owns that information.

**The key principle is centralised access, not centralised data.** Each registered form continues to use its original Google spreadsheet as its source of truth. ScriptFlow does not merge all departmental spreadsheets into a new database or replace the existing workbooks.

### Business value

| Value | What ScriptFlow provides |
|---|---|
| One reporting entry point | A shared workspace for KPI Weekly and registered operational forms. |
| Less tool switching | Employees can select available forms from the same application navigation. |
| Preserve existing workbooks | Each form continues to read and write to its designated Google spreadsheet. |
| Clear responsibility | Role-based permissions distinguish standard users, team leaders and administrators. |
| Consistent data entry | Forms are generated from the source worksheet's column headers. |
| Controlled administration | Only administrators can register, update or deactivate forms. |
| Incremental rollout | Additional spreadsheets can be connected without moving their existing data into a new system. |

### Current delivery

The application currently supports KPI Weekly reporting and a central Forms Workspace for registering additional Google Sheets worksheets. Registered forms appear in the main Reporting navigation and open within the shared workspace.

---

## 2. What employees can do

### KPI Weekly

- Sign in with an authorised Bilendi Google Workspace account.
- View KPI Weekly records from the existing spreadsheet.
- Search records by project name, project number, SPM project number, client, tester or project manager.
- Create new KPI records and edit existing records.
- Delete KPI records when the user's role allows it.
- Refresh the displayed records.
- Export the KPI records to an Excel workbook.
- Calculate total estimated hours from the relevant time fields in the entry form.

The KPI form maps to the existing KPI Weekly worksheet columns. ScriptFlow uses a hidden `__ScriptFlow_ID` column to identify records reliably when updating or deleting them.

### Additional reporting forms

Administrators can register another Google Sheets worksheet by providing:

- A form name.
- The Google Sheets spreadsheet URL.
- The worksheet tab name.
- The row containing the column headers.

ScriptFlow reads the worksheet headers and uses them to build the form fields. The registered form is then made available in the Reporting navigation. Employees can open it, view its records, create new records and edit existing ones. Deletion is restricted to team leaders and administrators.

Each registered form points to its own spreadsheet and worksheet. ScriptFlow does not copy the worksheet into a shared master workbook.

### Forms Workspace (administrators)

The Forms Workspace is restricted to administrators. It supports:

- Registering a spreadsheet worksheet as a ScriptFlow form.
- Updating a form's name or source worksheet configuration.
- Deactivating a form so it is no longer shown as an active form in ScriptFlow.

Deactivating a form removes its active registration from the application. **It does not delete the original Google spreadsheet, worksheet or its records.** The registration is retained as inactive configuration rather than deleting the source data.

---

## 3. User roles and permissions

Permissions are enforced by the application backend, not only by hiding buttons in the interface.

| Capability | Scripter | Team Leader | Admin |
|---|:---:|:---:|:---:|
| Sign in and view reporting records | ✓ | ✓ | ✓ |
| Create records | ✓ | ✓ | ✓ |
| Edit records | ✓ | ✓ | ✓ |
| Delete records | — | ✓ | ✓ |
| Add a form to ScriptFlow | — | — | ✓ |
| Update a registered form | — | — | ✓ |
| Deactivate a form in ScriptFlow | — | — | ✓ |
| Access Forms Workspace | — | — | ✓ |

New or unassigned Bilendi users receive the standard **Scripter** role by default. Elevated roles should be assigned only to approved employees through the Apps Script role configuration.

---

## 4. How the application works

### Architecture at a glance

```text
Bilendi employee
      |
      | Opens ScriptFlow and signs in
      v
React web application
Hosted on Vercel
      |
      | Same-origin requests
      v
Vercel serverless API
      |
      | HMAC-signed, time-limited requests
      v
Google Apps Script backend
      |
      +----------------------+----------------------+
      |                      |                      |
      v                      v                      v
KPI Weekly sheet      Registered form A     Registered form B
(existing workbook)   (original workbook)    (original workbook)
```

### Main components

| Component | Responsibility |
|---|---|
| React frontend | The user interface, navigation, reporting pages, forms and record lists. |
| Vercel | Hosts the frontend and runs the serverless API endpoints. |
| Google Apps Script | Handles sign-in integration, permission checks and Google Sheets operations. |
| Google Sheets | Stores KPI Weekly records and the records for each registered form. |
| Apps Script Properties | Holds application configuration, role overrides, secrets and the form registry. |

The same Google Apps Script project is deployed as two web apps because authentication and API access need different access settings:

1. **Authentication deployment:** restricted to users in the Bilendi Google Workspace domain.
2. **API deployment:** callable by the Vercel server, with every request protected by request signing and validation.

The API deployment being reachable over the web does not mean its operations are unauthenticated. Requests are checked using a shared HMAC secret, timestamp and unique nonce to reject invalid, expired or replayed requests. Employee sessions and permissions are also validated before protected operations are performed.

### Data and system of record

ScriptFlow has **no separate application database** and does not depend on Supabase.

- KPI Weekly records remain in the existing KPI Weekly spreadsheet.
- Each additional form's records remain in that form's original spreadsheet and worksheet.
- The form registry is stored in Google Apps Script Properties. It contains the configuration needed to locate and describe each registered worksheet; it is not a copy of the worksheet's reporting records.
- A hidden `__ScriptFlow_ID` column is used in each managed worksheet to keep a stable identifier for records.

The Google account that owns/runs the Apps Script deployment must have access to every spreadsheet registered in ScriptFlow. This access needs to be arranged when a new source spreadsheet is connected.

---

## 5. Security and access controls

ScriptFlow uses several layers of protection:

- **Company sign-in:** the authentication flow requires a Bilendi Google Workspace identity.
- **Signed employee assertion:** the Apps Script authentication flow issues a short-lived signed assertion which the Vercel backend validates before establishing a session.
- **Protected session:** the frontend uses a server-managed session cookie; sensitive signing secrets are kept in server-side environment variables and Apps Script Properties.
- **Signed backend requests:** Vercel signs requests sent to Apps Script. Apps Script validates the signature, timestamp and nonce.
- **Backend permission checks:** record and form operations check the current user's role before execution.
- **Same-origin API checks:** the Vercel API routes reject cross-origin requests.
- **Spreadsheet access:** Apps Script must be authorised to open each source workbook.

Authentication and request-signing checks are essential parts of the design. They should not be removed or bypassed as part of routine UI changes.

---

## 6. Typical workflows

### Employee workflow

1. Open the ScriptFlow web application.
2. Sign in with a Bilendi Google Workspace account.
3. Select **KPI Migration** or one of the available forms under **Reporting**.
4. Search or refresh the records if needed.
5. Create a new record or edit an existing one.
6. Save the record. ScriptFlow writes the change to the corresponding source Google Sheet.

### Administrator workflow: connect another reporting sheet

1. Open **Forms Workspace**.
2. Choose **Add form**.
3. Enter the form name, spreadsheet URL, worksheet tab and header row.
4. Save the configuration. ScriptFlow checks that it can access the spreadsheet and read the worksheet headers.
5. The new form becomes available under **Reporting**.
6. Employees can open the form and work with its records in the shared application.

Before registering a workbook, ensure that the Apps Script owner has the required access to it and that the worksheet has a valid, unique header row.

---

## 7. Current scope and boundaries

### Included

- Bilendi Google Workspace sign-in.
- Role-based access for scripters, team leaders and administrators.
- KPI Weekly record listing, search, create, edit, delete and Excel export.
- Registration of additional Google Sheets worksheets.
- Dynamic forms based on worksheet headers.
- Record listing, create, edit and role-controlled deletion for registered forms.
- A shared Reporting navigation and administrator-only Forms Workspace.

### Not currently part of the application

- Replacing Google Sheets with a central database.
- Consolidating all reporting workbooks into one spreadsheet.
- Automatic migration of historical data between workbooks.
- Project or ticket management modules.
- Automated survey scripting, Forsta/Decipher execution or QA workflows.
- A full business intelligence or analytics platform.
- Automated approval workflows.

These boundaries help keep the current solution focused on centralising access and simplifying reporting while preserving the team's existing spreadsheet processes.

---

## 8. Deployment and technical maintenance

### Production

- Frontend and API hosting: Vercel.
- Connected source repository: GitHub, `anesta-code/scriptflow`.
- Production application: [https://scriptflow-bice.vercel.app/](https://scriptflow-bice.vercel.app/).
- Google Sheets operations: Google Apps Script Web App deployments.

The application has two Apps Script deployment URLs configured in Vercel as server-side environment variables. Signing secrets are configured separately in Vercel and Apps Script Properties. **Do not commit deployment secrets, session secrets, API secrets or private spreadsheet credentials to the repository.**

### Local development

Requirements:
- Node.js and npm.
- Access to the GitHub repository.
- Appropriate Vercel environment variables for testing the authenticated API flow.
- Access to the Apps Script project and source spreadsheets for backend testing.

Run the frontend from the `client` directory:

```powershell
cd client
npm install
npm run dev
```

Create a production build:

```powershell
npm run build
```

A local Vite development server is useful for frontend work, but authenticated API operations require the configured Vercel serverless routes and backend environment.

### Safe change and release process

1. Create a feature branch; do not experiment directly on the production branch.
2. Keep authentication, signing, role enforcement and spreadsheet mapping unchanged unless a change is specifically required and reviewed.
3. Test the relevant workflow using a Vercel Preview deployment.
4. Verify that writes reach the correct source spreadsheet and that existing records are updated rather than duplicated.
5. Test permissions with the relevant user roles.
6. Merge only after the preview checks pass.
7. Confirm the production deployment after merging.

---

## 9. Repository structure

```text
scriptflow/
├── client/
│   ├── api/
│   │   ├── _lib/                 # Shared API security and request helpers
│   │   ├── auth/                 # Authentication endpoints
│   │   ├── forms.js              # Registered-form API operations
│   │   └── kpi-weekly.js         # KPI Weekly API operations
│   ├── src/
│   │   ├── App.jsx               # Main application entry
│   │   ├── AuthGate.jsx          # Sign-in/session gate
│   │   ├── KPIWeekly.jsx         # Main reporting workspace
│   │   ├── DynamicFormPage.jsx   # Registered form record interface
│   │   └── FormsWorkspace.jsx    # Admin form configuration
│   ├── package.json
│   └── vercel.json
├── google-apps-script/
│   ├── Code.gs                   # Unified Google Apps Script backend
│   └── auth/
│       └── Index.html            # Google sign-in page
├── README.md
└── CHANGELOG.md
```

---

## 10. Project summary for management

ScriptFlow provides Bilendi's scripting team with a single, secure reporting workspace while retaining the existing Google Sheets files as the source of truth. Employees access KPI Weekly and other registered reporting forms from one interface. Administrators can connect additional worksheets without migrating their data, and role-based controls govern who can create, edit, delete or administer forms.

The approach is deliberately incremental: it improves the employee experience and standardises access without requiring a new database, a large data migration or a replacement of the team's established Google Sheets workflows.

**In short: one application for reporting access, existing spreadsheets preserved, and permissions managed centrally.**

# ScriptFlow

**ScriptFlow** is an internal reporting workspace for the Bilendi Forsta / Decipher scripting team. It provides a single, structured place to enter weekly project KPI information and submit it to the team's existing Google Sheets **KPI weekly** workbook.

The current application is an early, focused MVP: it includes Bilendi Google Workspace sign-in, a KPI Weekly entry form, server-side request validation, a signed Google Apps Script API connection, and an Excel export of the entries submitted during the current browser session.

> **Current scope:** The active application in this branch is the **KPI Weekly reporting module**. It is not yet the full project/ticket management platform described in some older planning documents. Gmail intake, SPM integration, Forsta/Decipher automation, team task boards, historical data browsing, and two-way spreadsheet synchronisation are not currently part of this deployed UI.

---

## Contents

- [What ScriptFlow does](#what-scriptflow-does)
- [Features](#features)
- [KPI Weekly form fields](#kpi-weekly-form-fields)
- [How the application works](#how-the-application-works)
- [Authentication and access control](#authentication-and-access-control)
- [Google Sheets integration](#google-sheets-integration)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Current limitations and roadmap](#current-limitations-and-roadmap)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

---

## What ScriptFlow does

The current workflow replaces manually entering a KPI row directly into a spreadsheet with a guided web form:

1. An authorised employee opens ScriptFlow.
2. The employee signs in using their Bilendi Google Workspace account.
3. A team lead completes the KPI Weekly form with the project details, dates, assignments, time information, and reporting fields.
4. ScriptFlow validates the required information and calculates total estimated hours.
5. The Vercel server signs the API request and sends it to the separate API-only Google Apps Script deployment.
6. Apps Script verifies the request and writes the values into the existing `KPI weekly` worksheet.
7. The form confirms the result and displays the submission in the current page session.

Google Sheets remains the destination and permanent record for successful submissions. The browser's recent-submissions list is only a temporary session view.

## Features

### 1. Bilendi Google Workspace sign-in

- Employees start sign-in from the ScriptFlow interface.
- Authentication is handled by a separate Google Apps Script Web App restricted to the `bilendi.com` Workspace domain.
- The authentication script identifies the active Google account and checks it against the configured employee allowlist and role.
- A short-lived signed assertion is returned to the Vercel callback.
- The callback exchanges the assertion server-to-server with the API-only Apps Script project.
- Vercel creates an eight-hour, signed session stored in an HttpOnly, Secure, SameSite cookie.
- The application checks the session when it loads and provides a Sign out action.

Only employees explicitly included in the Apps Script role allowlist can currently sign in. Adding an employee requires updating the allowlist in both Apps Script projects and deploying the relevant script version.

### 2. KPI Weekly dashboard

The main workspace contains:

- A KPI Weekly reporting form.
- An entries-this-session counter.
- A total estimated-hours counter for entries submitted in the current page session.
- A Google Sheets connection indicator.
- A recent-submissions table.
- Search across project name, project number, SPM project number, client, tester, and PM.
- Clear form and clear session actions.

The recent-submissions table is populated from successful submissions made during the current browser session. It is not loaded from Google Sheets and is cleared when the page session is reset or the user clears it.

### 3. Structured KPI entry form

The form is divided into clear sections:

- **Project identification:** project references, project name, tester, PM, client, and commissioning country.
- **Project details:** status, question count, LOI, level, complexity, and overlay.
- **Important dates:** questionnaire received, sent to QA, sent to PM, and launch date.
- **Time and financial information:** test link, scripting time, changes time, testing time, mailing time, hours worked, price scripting, and hours commissioned.
- **BARI and other tools:** BARI OE checks, BARI moderations, BARI scripting, and BSurvey.

Project Name is required. Questions must be a non-negative whole number when supplied. Numeric time and financial fields use non-negative number inputs.

The available status values are:

- New
- QNR check
- Ready
- In progress
- QA review
- Revisions
- Blocked
- Waiting for information
- Completed
- Cancelled

### 4. Automatic total estimated hours

ScriptFlow calculates the total from:

`Scripting time + Changes time + Testing time + Mailing time`

The total is recalculated as the user changes those fields. Blank time values are treated as zero once at least one of the four time fields has been entered. If all four are blank, the total remains blank.

### 5. Google Sheets submission

- The browser sends the form to the Vercel API route `POST /api/kpi-weekly`.
- The server requires a valid ScriptFlow session and the `team_lead` role.
- The server converts the form fields to the API's expected data structure.
- A server-side HMAC signature protects the request to Apps Script.
- Apps Script checks the signature, timestamp, nonce, replay protection, employee identity, and role.
- A matching record is updated; otherwise, a new row is inserted.
- The hidden `__ScriptFlow_ID` column is used to match records reliably, even if rows are sorted or moved.
- The UI reports the saved row number or displays an error while retaining the entered form values so the user can retry.

The integration writes to the configured spreadsheet and the `KPI weekly` tab. It does not currently read spreadsheet rows back into the application.

### 6. Excel export

The **Export preview** action downloads an `.xlsx` workbook named `KPI_Weekly_preview.xlsx`.

The export:
- Uses the KPI Weekly column headings defined in the application.
- Includes the entries submitted during the current browser session.
- Adds readable column widths and an autofilter.
- Includes the combined test-link and scripting-time value in the corresponding KPI column.

This is a session export, not a complete export of all historical rows in Google Sheets. It is not yet a company-specific Excel template reproduction.

### 7. Session controls and feedback

- **Clear form** resets the current form fields.
- **Clear session** clears the temporary recent-submissions list after confirmation; it does not delete rows from Google Sheets.
- **Sign out** invalidates the browser session cookie.
- Success and error messages explain whether a submission was saved or needs to be retried.

---

## KPI Weekly form fields

| Section | Fields |
|---|---|
| Project identification | SW, Project number, SPM Project Number, Project Name, Tester, PM, Client, Commissioning country |
| Project details | Status, Questions, LOI, Level, Complexity - As SPM, Overlay |
| Important dates | QNR received on, Date sent to QA, Date sent to PM, Launch date |
| Time and financial information | Test link, Scripting time, Changes time, Testing time, Mailing time, Total estimated hours, Hours worked, Price Scripting, Hours Commissioned |
| BARI and other tools | BARI - OE CHECKS, BARI - MODERATIONS, BARI SCRIPTING, BSurvey |

The Google Sheets connector maps fields using recognised header names and aliases rather than relying only on fixed column positions. The test link and scripting time are combined when the target sheet uses the combined heading `Test link (scripting time per Hrs)`.

---

## How the application works

The current architecture separates the public-facing application, employee authentication, and spreadsheet API:

```text
Employee's browser
       |
       v
Vercel-hosted React application
       |
       |-- /api/auth/start
       |       |
       |       v
       |   Employee-auth Apps Script
       |   (Bilendi Workspace access)
       |       |
       |       v
       |   Short-lived signed employee assertion
       |       |
       |       v
       |   /api/auth/exchange
       |       |
       |       v
       |   API-only Apps Script verifies assertion
       |       |
       |       v
       |   Vercel signed session cookie
       |
       |-- /api/kpi-weekly
               |
               v
           Vercel validates session and role
               |
               v
           HMAC-signed server request
               |
               v
           API-only Apps Script
               |
               v
           Google Sheets: KPI weekly
```

### Main request endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/start` | GET | Starts the Google Workspace sign-in flow and creates a state cookie. |
| `/api/auth/exchange` | POST | Exchanges the short-lived employee assertion for a ScriptFlow session. |
| `/api/auth/session` | GET | Checks the current ScriptFlow session. |
| `/api/auth/logout` | POST | Clears the session and sign-in state cookies. |
| `/api/kpi-weekly` | POST | Validates and submits a KPI record to Google Sheets. |

---

## Authentication and access control

There are two separate Google Apps Script projects. They have different purposes and must not be confused.

### Employee authentication Apps Script

Source files:
- `google-apps-script/auth/Code.gs`
- `google-apps-script/auth/Index.html`

Deployment requirements:
- Execute as: the Apps Script owner.
- Who has access: **Anyone within bilendi.com**.
- This deployment must remain restricted to the Bilendi Workspace domain.

It identifies the employee, checks the configured role allowlist, and issues a short-lived signed assertion. It is not the spreadsheet API endpoint.

### API-only Apps Script

Source file:
- `google-apps-script/api/Code.gs`

Deployment requirements:
- Execute as: the Apps Script owner who has access to the KPI spreadsheet.
- Who has access: **Anyone**, so the Vercel server can reach the Web App without a Google browser login.
- The endpoint must only perform operations after validating a signed request.

The API-only deployment does not display the employee sign-in page. Its GET response is a small JSON health response. Do not use the employee-authentication Web App URL as the API URL.

### Current roles

The role allowlist is currently defined in both Apps Script projects.

| Role | Current capability |
|---|---|
| `team_lead` | Can sign in and submit KPI Weekly records. |
| `scripter` | Can sign in and view the current KPI Weekly interface, but the KPI submission endpoint rejects writes for this role. |

The current UI does not yet implement separate role-specific dashboards or a complete user/employee administration screen.

---

## Google Sheets integration

The API-only Apps Script is designed to update the existing KPI workbook.

Current configuration in `google-apps-script/api/Code.gs`:
- Worksheet name: `KPI weekly`.
- A configured spreadsheet ID is held in the Apps Script source.
- Identifier column: `__ScriptFlow_ID`.

On the first write, the API adds the identifier column if it does not exist and hides it. Do not delete or rename this column after synchronisation begins.

### Request protection

The Vercel server signs requests using HMAC-SHA256. The Apps Script API validates:
- The request timestamp (limited to a short time window).
- A unique nonce.
- The HMAC signature.
- Replay prevention using Apps Script cache and locking.
- The requested operation.
- The employee's allowlisted identity and role.

The browser does not receive the API signing secret. Employee identity and role are verified server-side; they must not be trusted from arbitrary browser form values.

### Synchronisation behaviour

The current API supports:
- `redeem_auth_token`: verify a short-lived employee assertion and return the approved identity and role.
- `sync_job`: validate a team-lead user and insert or update the corresponding KPI Weekly row.

This is a one-way submission flow from ScriptFlow to Google Sheets. Direct edits in Google Sheets do not update the ScriptFlow page. The current application does not expose spreadsheet row deletion.

---

## Technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React 18 | KPI Weekly interface and form state. |
| Build tooling | Vite 6 | Local development and production build. |
| UI icons | lucide-react | Interface icons. |
| Excel export | SheetJS / xlsx | Creates the downloadable workbook. |
| Hosting and server API | Vercel | Hosts the frontend and serverless API routes. |
| Employee identity | Google Apps Script + Google Workspace | Bilendi employee verification and role allowlist. |
| Spreadsheet API | Google Apps Script | Verifies signed requests and writes KPI records. |
| Reporting data destination | Google Sheets | Stores the submitted KPI Weekly rows. |

Supabase-related files and earlier database migrations remain in the repository from previous development iterations. They are not the active persistence layer used by the current KPI Weekly form flow described above.

---

## Repository structure

```text
scriptflow/
├── client/
│   ├── api/
│   │   ├── _lib/security.js       # Session, HMAC and API security helpers
│   │   ├── auth/
│   │   │   ├── start.js           # Starts Workspace sign-in
│   │   │   ├── exchange.js        # Exchanges employee assertion
│   │   │   ├── session.js         # Checks current session
│   │   │   └── logout.js          # Clears session cookies
│   │   └── kpi-weekly.js          # Validates and submits KPI records
│   ├── src/
│   │   ├── AuthGate.jsx           # Frontend sign-in/session gate
│   │   ├── KPIWeekly.jsx          # KPI Weekly form, dashboard and export
│   │   ├── KPIWeekly.css          # KPI interface styles
│   │   ├── auth.css               # Authentication styles
│   │   └── App.jsx                # Application composition
│   ├── index.html
│   ├── package.json
│   └── vercel.json
├── google-apps-script/
│   ├── auth/
│   │   ├── Code.gs                # Bilendi employee authentication
│   │   ├── Index.html             # Employee sign-in page
│   │   └── README.md
│   └── api/
│       ├── Code.gs                # Signed API and Google Sheets operations
│       └── README.md
├── docs/
│   └── google-workspace-preview-setup.md
├── database/
│   └── migrations/                # Earlier Supabase development schema
├── supabase/
│   └── functions/                 # Earlier/optional integration code
└── README.md
```

---

## Local development

### Requirements

- Node.js 18 or later.
- npm.
- Git (recommended).
- Access to the configured Vercel and Google Apps Script projects for integration testing.

### Install and run

From PowerShell:

```powershell
cd path\to\scriptflow\client
npm install
npm run dev
```

Vite normally serves the frontend at `http://localhost:5173`.

The application also depends on Vercel serverless API routes and server-side environment variables. Running only the Vite development server does not reproduce the full deployed authentication and Google Sheets API flow. Use a Vercel development environment or a configured Preview deployment to test the complete integration.

### Production build check

```powershell
npm run build
```

The build output is generated by Vite. Do not commit generated build output unless the deployment process specifically requires it.

---

## Configuration

Configure secrets in the appropriate platform. Never put server secrets in frontend environment variables or source control.

### Vercel environment variables

Set these in the Vercel project for the intended environment (Preview or Production):

| Variable | Purpose |
|---|---|
| `GOOGLE_WORKSPACE_AUTH_URL` | URL of the domain-restricted employee authentication Apps Script Web App. |
| `SCRIPT_FLOW_API_URL` | URL of the separate API-only Apps Script Web App, ending in `/exec`. |
| `SCRIPT_FLOW_API_SECRET` | HMAC secret shared between Vercel and the API-only Apps Script. |
| `SCRIPT_FLOW_SESSION_SECRET` | Separate secret used by Vercel to sign ScriptFlow session cookies. |

The API URL must be the API-only deployment, not the employee sign-in URL.

### Employee authentication Apps Script properties

| Property | Purpose |
|---|---|
| `AUTH_TOKEN_SECRET` | Signs employee assertions. Must match the value in the API-only Apps Script project. |
| `VERCEL_CALLBACK_URL` | Exact HTTPS callback URL for the corresponding Vercel environment, ending in `/auth/callback`. |

### API-only Apps Script properties

| Property | Purpose |
|---|---|
| `SCRIPT_FLOW_API_SECRET` | Must exactly match Vercel's `SCRIPT_FLOW_API_SECRET`. |
| `AUTH_TOKEN_SECRET` | Must exactly match the employee authentication project's `AUTH_TOKEN_SECRET`. |

Use separate, randomly generated secrets for API request signing and Vercel session signing. The employee assertion secret is shared only between the two Apps Script projects. Do not paste secrets into issues, screenshots, chat, README files, or commits.

For the current Preview setup sequence, see [Google Workspace Preview setup](docs/google-workspace-preview-setup.md).

---

## Deployment

### Vercel

The repository is connected to Vercel. The client application is built from the `client` directory using the Vite build. Vercel also hosts the API route files under `client/api`.

Recommended workflow:
1. Develop and test on `feature/google-workspace-auth`.
2. Configure the Preview environment variables.
3. Confirm the Preview deployment builds successfully.
4. Test employee sign-in, role checks, KPI submission, duplicate update behaviour, and sign-out.
5. Only merge to `main` and promote to Production after the full test checklist passes.

Do not copy Preview callback URLs or Preview-only configuration into Production without deliberately configuring the Production environment.

### Google Apps Script

Deploy and manage the employee authentication and API-only projects separately. When changing Apps Script code, save the project and update the relevant Web App deployment to a new version. Confirm that the Vercel environment points to the correct deployment URL.

---

## Current limitations and roadmap

The following items are **not implemented in the current active UI/API** and should not be assumed to work yet:

- Persistent project/job browsing inside ScriptFlow.
- Loading existing KPI rows from Google Sheets.
- Editing or deleting an existing KPI record through the ScriptFlow interface.
- Full Projects and Tickets workflow or Kanban/task board.
- Primary/backup team assignment management in the active KPI form.
- Gmail-based project intake or email parsing.
- SPM website integration or automatic SPM project capture.
- Forsta/Decipher scripting automation or direct survey-platform integration.
- Automated QA workflow, review queues, or approval stages.
- Two-way Google Sheets synchronisation.
- Full employee and role administration interface.
- Company-template-specific Excel exports and scheduled reporting.
- Automated audit/history screens for all changes.

These can be developed as later modules after the current authentication and KPI reporting flow is stable and the company has approved the required access and data-handling approach.

---

## Security notes

- Keep the employee authentication Web App restricted to `bilendi.com`.
- The API-only Web App is reachable without a Google browser login so Vercel can call it; every data operation must require a valid signed request.
- Never expose `SCRIPT_FLOW_API_SECRET`, `AUTH_TOKEN_SECRET`, or `SCRIPT_FLOW_SESSION_SECRET` in browser code.
- Never commit secrets or real employee/project data.
- Keep Vercel API routes server-side.
- Test role permissions with separate authorised accounts before wider rollout.
- Use Preview for testing and keep Production isolated until approval and verification.
- Public reachability of the API endpoint is not the same as public permission to read or write the spreadsheet; the signed request checks are essential and must not be removed.

---

## Troubleshooting

### ScriptFlow says Google Workspace sign-in is not configured

Check that `GOOGLE_WORKSPACE_AUTH_URL` is set for the Vercel environment used by the deployment, and redeploy after changing environment variables.

### The sign-in page opens, but the employee is rejected

Check that:
- The employee is signed into the correct Bilendi Google account.
- The employee authentication Web App is restricted to the Bilendi domain.
- The email is present in the role allowlist in both Apps Script projects.
- The authentication Apps Script has the required Script Properties.
- The Web App deployment has been updated after code changes.

### ScriptFlow API connection is not configured

Check that `SCRIPT_FLOW_API_URL` and `SCRIPT_FLOW_API_SECRET` exist in the correct Vercel environment. The API URL must be the separate API-only Web App URL ending in `/exec`.

### Apps Script returns HTML or HTTP 401 instead of JSON

This usually indicates that Google rejected the request before the API script returned its JSON response, or that the configured URL points to the wrong deployment. Verify:
- The URL belongs to the API-only project, not the employee sign-in project.
- The API-only deployment executes as the owner.
- Its access setting allows the Vercel server to reach it.
- The latest Apps Script version is deployed.
- The Vercel environment uses the exact API-only `/exec` URL.

Do not make the employee authentication deployment public to fix an API endpoint problem.

### KPI submission is rejected with an authorisation message

The current `/api/kpi-weekly` route allows only the `team_lead` role to submit records. A signed-in `scripter` account is expected to receive a forbidden response when attempting a write under the current policy.

### Google Sheets reports a missing worksheet or mapping issue

Confirm the target spreadsheet and worksheet name in `google-apps-script/api/Code.gs`. Check that the worksheet is named exactly `KPI weekly` and that its first row contains the expected KPI headers.

---

## Project status

ScriptFlow is under active development. The current milestone is to stabilise Bilendi Workspace authentication and the secure KPI Weekly submission flow in Vercel Preview before enabling Production use or expanding the feature set.

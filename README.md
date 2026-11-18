# ScriptFlow

**A central reporting and operational workspace for Bilendi scripting teams.**

ScriptFlow brings KPI Weekly, team reporting, assignment visibility and additional spreadsheet-based forms into one application. It centralises access and workflows while preserving Google Sheets as the source of truth.

- **Production application:** https://scriptflow-bice.vercel.app/
- **GitHub repository:** https://github.com/anesta-code/scriptflow
- **Frontend hosting:** Vercel
- **Frontend:** React + Vite
- **Backend:** Vercel serverless API routes + Google Apps Script
- **Data storage:** Google Sheets
- **Application database:** None. The active architecture does not use Supabase.

---

## 1. Project principles

1. **One application, existing spreadsheets preserved.** ScriptFlow is a central interface; it does not replace the team's source workbooks.
2. **Google Sheets remains the source of truth.** KPI Weekly data stays in its existing spreadsheet. Each additional registered form continues to use its own original spreadsheet and worksheet.
3. **Security is enforced server-side.** Frontend visibility is not a substitute for Vercel and Apps Script permission checks.
4. **Make changes incrementally.** Use feature branches, Vercel Preview deployments and pull requests. Do not make experimental changes directly on the main branch.
5. **Protect production configuration.** HMAC validation, session signing, Apps Script deployment URLs and Script Properties are security-critical.

## 2. Current application features

### KPI Weekly / KPI Migration

- View, search, create and edit KPI Weekly records.
- Search by project details, including project number, SPM project number, project name and client.
- Delete records when the user's role allows it.
- Export KPI records to Excel.
- Assign projects to a scripter using the SW field.
- Scripters can access their assigned-project view.
- A hidden permanent ScriptFlow ID identifies records when updating or deleting.
- Calculate estimated hours in the KPI form and calculate Hours Commissioned from Price Scripting according to the current form logic.
- Search KPI Migration projects from dynamic forms and map selected project values into the destination form. Supported mappings include Project Number, SPM Project Number, Project Name, Scripter (SW), Complexity, Client, PM and Tester.

### Daily Reporting

Daily Reporting is available to scripters, team leads and admins.

- Displays team workload by scripter.
- Groups scripter columns under their configured cluster headings.
- Displays an Unassigned Cluster group when a scripter is not assigned to a configured cluster.
- Groups projects by status and complexity.
- Default active workload is Pending and In-progress.
- Users can show all statuses and toggle individual status visibility.
- Clicking a count opens the matching project list.
- Manager filters include scripter, status and complexity, plus project/client search.
- The Date Sent to QA, From and To date filters were removed from the Daily workload view.

### Weekly Reporting

Weekly Reporting is available to team leads and admins.

- Shows new project assignments grouped by cluster and scripter for the selected week.
- Uses the assignment event timestamp, not project creation date.
- Counts new assignments in the weekly total.
- Shows reassignments and unassignments separately; these do not increase the new-assignment total.
- Displays the assignment events behind the weekly figures.

Assignment history begins when the feature is deployed. Earlier assignment events are not reconstructed automatically because previous assignment timestamps are not available in the KPI sheet. Weekly totals therefore reflect recorded events from the feature's activation onward.

### Reporting Configuration

Reporting Configuration is available to team leads and admins.

- Manage cluster names and membership.
- Designate a cluster lead independently from the person's ScriptFlow account role.
- Configure complexity labels and ranges.
- Configure status visibility and active-workload grouping.
- Save shared configuration centrally in the Reporting Config worksheet.
- Keep a history of configuration changes in Reporting Config History.

Cluster membership is separate from project SW assignment. Changing a person's cluster does not automatically reassign their projects.

### Assignment history and notifications

- Assignment History records new assignments, reassignments and unassignments.
- Events include project references, previous/new scripter, the person who made the change and the timestamp.
- In-app notifications inform the relevant scripter(s) when a project is assigned, reassigned or unassigned.
- Users can view notifications, see unread counts and mark notifications as read.
- Notification records are stored in the Notifications worksheet.

### Additional Google Sheets forms

Admins can register an existing Google Sheets worksheet as a ScriptFlow form. ScriptFlow reads the worksheet headers to create a dynamic form.

- Forms can be added, updated and deactivated by admins.
- Employees can view, create and edit records in active forms.
- Team leads and admins can delete form records.
- Optional KPI project mappings can populate destination fields from a selected KPI Migration project.
- Each form continues to read and write to its original spreadsheet.
- Deactivating a form removes its active ScriptFlow registration only. It does not delete the spreadsheet, worksheet or records.

---

## 3. Roles and permissions

A team member can have more than one ScriptFlow role. The backend supports a roles array and retains a primary role value for compatibility. Primary-role precedence is Admin → Team Lead → Scripter. Authorization checks recognise all roles assigned to the user.

| Capability | Scripter | Team Lead | Admin |
|---|:---:|:---:|:---:|
| Sign in and view KPI records | Yes | Yes | Yes |
| Create and edit KPI records | Yes | Yes | Yes |
| Delete KPI records | No | Yes | Yes |
| View Daily Reporting | Yes | Yes | Yes |
| View Weekly Reporting | No | Yes | Yes |
| Manage Reporting Configuration | No | Yes | Yes |
| View assignment history in Weekly Reporting | No | Yes | Yes |
| View and use registered forms | Yes | Yes | Yes |
| Create and edit form records | Yes | Yes | Yes |
| Delete form records | No | Yes | Yes |
| Add, update or deactivate form registrations | No | No | Yes |
| Access Forms Workspace administration | No | No | Yes |

A person who has both Admin/Team Lead and Scripter roles can use the corresponding management capabilities and can also be selected as a project assignee. Cluster lead designation is separate from ScriptFlow roles.

The team directory is maintained in the Apps Script project. The default role for an email address not found in the directory is Scripter. Do not add or change employee roles without confirming the intended access.

---

## 4. Architecture

~~~text
Employee browser
      |
      v
React + Vite frontend (client/src)
      |
      | same-origin requests
      v
Vercel serverless API (client/api)
      |
      | signed HMAC request
      v
Google Apps Script (google-apps-script/Code.gs)
      |
      +------ KPI Weekly spreadsheet
      +------ Notifications worksheet
      +------ Assignment History worksheet
      +------ Reporting Config / Config History
      +------ Each registered form's original spreadsheet
~~~

### Main responsibilities

| Layer | Responsibility |
|---|---|
| React + Vite | Application layout, navigation, KPI forms, reporting dashboards, dynamic forms and user interactions. |
| Vercel | Hosts the frontend and server-side API endpoints. Validates the session and request permissions before forwarding operations. |
| Google Apps Script | Handles Workspace sign-in assertions, HMAC verification, role checks and spreadsheet reads/writes. |
| Google Sheets | Stores KPI Weekly records, notification/history/configuration worksheets and records for registered forms. |
| Apps Script Properties | Stores secrets and configuration such as role overrides and the registered-form registry. |

There is no separate ScriptFlow database. Legacy database and Supabase folders may remain in the repository from an earlier design; they are not part of the active data flow.

### Two deployments of one Apps Script project

The same Apps Script project is deployed twice:

1. **AUTH deployment:** Execute as Me; access restricted to users within bilendi.com. Its URL is configured in Vercel as GOOGLE_WORKSPACE_AUTH_URL.
2. **API deployment:** Execute as Me; access Anyone. Its URL is configured in Vercel as SCRIPT_FLOW_API_URL. Every POST request must pass HMAC validation.

Both deployments use the same project code and Script Properties. When a backend code change requires deployment, update the existing deployments to a new version; do not create new deployment URLs.

---

## 5. Security and configuration

### Vercel environment variable names

- GOOGLE_WORKSPACE_AUTH_URL
- SCRIPT_FLOW_API_URL
- SCRIPT_FLOW_API_SECRET
- SCRIPT_FLOW_SESSION_SECRET

### Apps Script Script Property names

- AUTH_TOKEN_SECRET
- SCRIPT_FLOW_API_SECRET
- VERCEL_CALLBACK_URL
- KPI_SPREADSHEET_ID (optional override for the KPI spreadsheet)
- SCRIPT_FLOW_USER_ROLES (optional JSON role overrides)
- SCRIPT_FLOW_FORMS and its chunk properties (registered-form configuration)

**Never put the values of secrets, tokens or private credentials in GitHub.** This README intentionally documents variable names only.

Security requirements:

- Keep the HMAC signature, timestamp, nonce and replay checks.
- Keep signed employee assertions and session validation.
- Keep role checks in both the Vercel API and Apps Script backend.
- Do not expose Apps Script secrets to browser code.
- Do not change deployment access scopes, execution identity, URLs or Script Properties without an explicit operational decision.
- Do not bypass the Vercel API by connecting the browser directly to Google Sheets.

---

## 6. Google Sheets worksheets and metadata

Depending on which features have been used, the KPI spreadsheet may contain:

| Worksheet / column | Purpose |
|---|---|
| KPI weekly | Main KPI project records. |
| Notifications | In-app notifications, including recipient, message, project reference, created time and read time. Created automatically when needed. |
| Assignment History | New assignment, reassignment and unassignment events. Created automatically when needed. |
| Reporting Config | Shared Reporting configuration: statuses, complexity ranges, clusters, visibility and weekly rules. |
| Reporting Config History | Previous/new configuration snapshots, editor and timestamp. |

Managed sheets use hidden metadata columns where required:

- __ScriptFlow_ID: stable record identifier.
- __ScriptFlow_Project_ID: selected KPI project reference in mapped dynamic forms.
- __ScriptFlow_Revision: revision token used by dynamic forms to detect conflicting edits.

Do not rename or remove these metadata columns without updating and testing the corresponding Apps Script logic.

---

## 7. Local development

Requirements:

- Node.js and npm.
- Repository access.
- Appropriate local/Vercel environment configuration for authenticated API testing.
- Access to the Apps Script project and source spreadsheets for backend testing.

From the repository root:

~~~powershell
cd client
npm install
npm run dev
~~~

Create a production build:

~~~powershell
npm run build
~~~

A local Vite server can render the frontend, but authenticated API calls need the configured server-side routes and environment. Do not put server secrets in VITE_ variables or browser code.

---

## 8. Safe development and release process

1. Pull the latest main branch.
2. Create a feature branch; do not commit directly to main.
3. Identify the correct owning file using CODEBASE_GUIDE.md.
4. Trace data changes through React → Vercel API → Apps Script → Google Sheets.
5. Keep changes focused and avoid unrelated refactoring.
6. Test the affected feature and build with npm run build.
7. Open a pull request and verify the Vercel Preview deployment.
8. Test the relevant roles and confirm writes affect only the intended spreadsheet.
9. Merge only after review and Preview verification.
10. If google-apps-script/Code.gs changed, update both existing Apps Script deployments to a new version when the change affects their behaviour. Preserve their URLs and settings.
11. Verify production after merge/deployment.

Do not update Apps Script production deployments merely because a Code.gs file changed in a feature branch. Wait until the change is approved and merged, then follow the deployment instructions for that change.

---

## 9. Current scope and boundaries

ScriptFlow currently focuses on KPI Weekly, team workload reporting, assignment history/notifications and dynamic forms connected to existing Google Sheets.

It is not intended to replace Google Sheets with a database, migrate all historical data, or provide automated Forsta/Decipher scripting and QA execution. Future performance work should first measure the actual frontend/API/Apps Script bottleneck before changing the architecture.

---

## 10. Project reference

- Start with CODEBASE_GUIDE.md to locate the implementation.
- Check CHANGELOG.md for historical changes, but verify current code before relying on old notes.
- Review recent pull requests for the reason behind larger changes.
- Treat google-apps-script/Code.gs, client/api/_lib/security.js and client/api/auth/ as security-sensitive.

# ScriptFlow

ScriptFlow is a focused internal KPI Weekly entry application for the Bilendi scripting team.

## Current architecture

```text
Employee browser
    |
    v
React frontend + serverless API (Vercel)
    |                         |
    | sign-in                 | signed API request
    v                         v
Apps Script deployment 1    Apps Script deployment 2
(Bilendi domain only)       (public endpoint, HMAC protected)
            \                /
             \              /
              ONE Google Apps Script project
                         |
                         v
              Google Sheets: KPI weekly
```

There is **one Apps Script project**, deployed twice with different access settings. The application uses no Supabase and no separate ScriptFlow database. The existing KPI Weekly spreadsheet is the only application data store.

## Scope

The current milestone is KPI Weekly only:
- Bilendi Google Workspace sign-in.
- KPI Weekly entry form.
- Secure server-to-server request signing.
- Insert/update rows in the existing `KPI weekly` sheet using `__ScriptFlow_ID`.
- Excel export of entries made during the current browser session.

Project boards, ticket management, Gmail intake, Forsta automation, historical browsing and two-way spreadsheet synchronisation are not included in this milestone.

## Repository structure

```text
scriptflow/
├── client/
│   ├── api/                       # Vercel serverless routes
│   │   ├── _lib/security.js
│   │   ├── auth/
│   │   └── kpi-weekly.js
│   ├── src/                       # React UI
│   ├── package.json
│   └── vercel.json
├── google-apps-script/
│   ├── Code.gs                    # USE THIS unified backend source
│   └── auth/
│       └── Index.html             # HTML sign-in page used by Code.gs
└── README.md
```

Older Apps Script files, database migrations and Supabase artifacts may remain in the repository history/legacy folders. They are not part of the simplified deployment. Do not import the old `google-apps-script/api/Code.gs` or `auth/Database.gs` into the new project.

## Set up the ONE Apps Script project

1. Open [Google Apps Script](https://script.google.com/).
2. Create one new standalone project named **ScriptFlow** (or use a clean existing project after backing up its files).
3. Replace its `Code.gs` with `google-apps-script/Code.gs` from this branch.
4. Add an HTML file named exactly `Index` and copy the contents of `google-apps-script/auth/Index.html` into it.
5. In **Project Settings → Script Properties**, configure:

| Property | Value |
|---|---|
| `AUTH_TOKEN_SECRET` | Random secret of at least 32 characters; stored in this Apps Script project only. |
| `SCRIPT_FLOW_API_SECRET` | Random secret of at least 32 characters; same value as Vercel's API signing secret. |
| `VERCEL_CALLBACK_URL` | `https://scriptflow-bice.vercel.app/` |
| `KPI_SPREADSHEET_ID` | Optional; defaults to the existing KPI workbook ID in `Code.gs`. |
| `SCRIPT_FLOW_USER_ROLES` | Optional JSON object for role overrides. |

Example role override (do not include this example as a secret):
```json
{"a.nesta@bilendi.com":"team_lead","g.sardoo@bilendi.com":"scripter","n.latreille@bilendi.com":"scripter"}
```

The code already includes those three current role assignments. New Bilendi-domain users default to `scripter`. Keep elevated roles limited to explicitly approved employees.

**Secrets:** Generate separate random values for `AUTH_TOKEN_SECRET`, `SCRIPT_FLOW_API_SECRET`, and `SCRIPT_FLOW_SESSION_SECRET`. Never put secrets in GitHub, frontend code, or screenshots.

## Create TWO deployments from that same project

After saving the code, create the first Web App deployment:

### Deployment 1 — employee authentication

- Description: `ScriptFlow Auth`
- Execute as: **Me**
- Who has access: **Anyone within bilendi.com**
- Copy its Web App URL ending in `/exec`.

Then create a second deployment from the same Apps Script project:

### Deployment 2 — Vercel API

- Description: `ScriptFlow API`
- Execute as: **Me**
- Who has access: **Anyone**
- Copy its Web App URL ending in `/exec`.

The API URL is publicly reachable so Vercel can call it. It does not expose data through an unauthenticated operation: every POST must pass the HMAC, timestamp, nonce and replay checks in `doPost`. Do not remove these checks. Both deployments use the same saved source and Script Properties, but have independent deployment IDs and access policies.

## Configure Vercel

In the Vercel project settings, configure these server-side environment variables for the environment being tested:

| Variable | Value |
|---|---|
| `GOOGLE_WORKSPACE_AUTH_URL` | Deployment 1 URL (domain-restricted auth). |
| `SCRIPT_FLOW_API_URL` | Deployment 2 URL (API deployment). |
| `SCRIPT_FLOW_API_SECRET` | Exact same value as Apps Script `SCRIPT_FLOW_API_SECRET`. |
| `SCRIPT_FLOW_SESSION_SECRET` | Separate random secret, at least 32 characters. |

Redeploy after changing environment variables. Do not use a `VITE_` prefix for any secret. Vercel does not need `AUTH_TOKEN_SECRET`; that secret is stored only in Apps Script, which signs and verifies the short-lived employee assertion.

## Current role policy

| Role | Current access |
|---|---|
| `team_lead` | Can submit KPI Weekly entries. |
| `scripter` | Can sign in; submission is denied by the current API route. |
| `admin` | Can submit KPI Weekly entries. |

All employees must sign in using their Bilendi Google Workspace identity. Domain membership alone gives the default `scripter` role; it does not grant write access.

## KPI sheet behaviour

- Target tab: `KPI weekly`.
- Existing header row is preserved.
- `__ScriptFlow_ID` is added and hidden if missing.
- A matching ID updates the existing row; otherwise a new row is inserted.
- Unknown columns are left untouched.
- No project, user or activity records are written to another spreadsheet.

## Local development and build

From PowerShell:

```powershell
cd path\to\scriptflow\client
npm install
npm run dev
```

Production build check:

```powershell
npm run build
```

The full sign-in and API flow requires Vercel serverless routes and their environment variables; a plain Vite dev server does not reproduce the full deployed flow.

## Safe rollout checklist

1. Keep the existing production deployment and existing Apps Script deployments unchanged while preparing the new project.
2. Configure the one new Apps Script project and create both deployments.
3. Set the four Vercel server-side values in Preview first.
4. Test sign-in with a team lead and a scripter account.
5. Test one KPI submission and confirm the expected row in the real KPI Weekly sheet.
6. Test submitting the same record ID again and confirm it updates rather than duplicates.
7. Only after those tests pass, switch Production environment variables to the new two deployment URLs and redeploy.

The branch implementing this simplified architecture should be reviewed and tested before merging to `main`.

# ScriptFlow Bilendi authentication + Google Sheets API (Preview setup)

Production remains untouched. Complete this setup using the feature branch and Preview environment only.

## 1. Apps Script projects

### Existing employee authentication project

Keep its Web App access set to **Anyone within bilendi.com** and execute as the project owner. Do not make it public.

The sign-in broker source in `google-apps-script/auth/` is a reference implementation for the token handoff. If adapting the existing deployed project, merge the `issueAuthToken`, `getSignInIdentity`, and base64url helper functions into its existing source; do not replace unrelated existing functions or its current HTML features.

Set Script Properties:
- `AUTH_TOKEN_SECRET`: random secret (at least 32 characters).
- `VERCEL_CALLBACK_URL`: exact Preview callback URL, e.g. `https://scriptflow-git-feature-google-workspace-auth-scriptflow1.vercel.app/auth/callback`.

### Separate API-only Apps Script project

Create a new Apps Script project and copy `google-apps-script/api/Code.gs` into its `Code.gs`.

Set Script Properties:
- `SCRIPT_FLOW_API_SECRET`: random secret (at least 32 characters).
- `AUTH_TOKEN_SECRET`: exactly the same value as the authentication project.

Deploy as a Web App:
- Execute as: Me (spreadsheet owner).
- Who has access: Anyone.

This API is publicly reachable but accepts only signed HMAC requests. Do not remove signature, timestamp, nonce, replay checks, or the employee role allowlist.

## 2. Vercel Preview environment variables

Add these to the Vercel project for **Preview only** (do not alter Production):

| Variable | Value |
|---|---|
| `GOOGLE_WORKSPACE_AUTH_URL` | Existing domain-restricted employee authentication Web App URL |
| `SCRIPT_FLOW_API_URL` | New API-only Apps Script Web App URL ending in `/exec` |
| `SCRIPT_FLOW_API_SECRET` | Same value as API project's `SCRIPT_FLOW_API_SECRET` |
| `SCRIPT_FLOW_SESSION_SECRET` | A separate random secret, at least 32 characters; Vercel only |

The auth project's `AUTH_TOKEN_SECRET` must match the API project's `AUTH_TOKEN_SECRET`. This secret is not a Vercel variable.

Generate random secrets locally in PowerShell, then paste them directly into the relevant Script Properties and Vercel Preview environment variables. Do not commit them or send them in chat:

```powershell
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Generate separate values for API request signing, employee assertion signing, and Vercel session signing. The employee assertion secret is shared only between the two Apps Script projects.

## 3. Current KPI Weekly behavior

The Vercel KPI form now submits through the authenticated server endpoint. The server converts its existing camelCase form fields to the live connector's field names. The API preserves:
- Spreadsheet ID and `KPI weekly` worksheet.
- Hidden `__ScriptFlow_ID` identifier and upsert behavior.
- Existing header aliases and normalization.
- Combined test-link / scripting-hours column.
- Total estimated hours fallback calculation.

The existing connector only provided a write/upsert operation. This API does not invent project listing, deletion, or general spreadsheet CRUD.

The initial endpoint enforces the existing team-lead write permission. Scripters can sign in but cannot submit KPI writes unless the role policy is deliberately changed.

## 4. Preview testing checklist

1. Confirm the latest Preview build is Ready.
2. Open the Preview URL and start Bilendi sign-in.
3. Confirm an allowlisted employee reaches the KPI Weekly page.
4. Confirm an unlisted account is rejected by the domain-restricted authentication app.
5. Confirm a scripter receives a 403 when attempting a KPI write.
6. Confirm a team lead can submit a test record to the KPI Weekly sheet.
7. Submit the same record ID again and confirm it updates the same row.
8. Confirm unsigned and replayed API requests are rejected.
9. Confirm logout clears the session.

Do not promote the feature branch to Production until all tests pass.

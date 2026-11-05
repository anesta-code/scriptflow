# ScriptFlow – Unified Jobs build (Phase 2)

ScriptFlow is a React + Vite + Supabase workspace for a Forsta/Decipher scripting team. This version replaces the separate Projects and Tickets screens with one **Jobs** record. It supports manual data entry, primary/backup team assignments, activity history, and Excel export.

## Important: existing Supabase project

This update is designed for the Supabase development project where Phase 1 (`001_initial_schema.sql`) has already been run and the login/profile is working.

**Do not run `001_initial_schema.sql` again.** It is the original Phase 1 schema.

1. Before changing the database, use Supabase's backup/export options if you want an additional copy of your development data.
2. Open Supabase → SQL Editor.
3. Open `database/migrations/002_unified_jobs.sql` from this project and run the complete script.
4. It creates `public.jobs`, copies each existing project into one job, and links existing activity/work-log/QA/email-reference rows where possible.
5. It deliberately leaves the old `projects` and `tickets` tables in place. They are retained as legacy records and are no longer used by the new interface.
6. Verify with:

```sql
select id, sw, project_number, spm_project_number, project_name, status,
       main_scripter_id, main_tester_id, legacy_project_id
from public.jobs
order by created_at desc;
```

If there are no previous projects, the query will return no rows; that is normal. New jobs can then be created in the app.

## Local setup (Windows / PowerShell)

Requirements: Node.js 18+ and npm. Docker is not required.

1. Extract the project ZIP.
2. In Supabase, open Project Settings → API (or API Keys, depending on the dashboard).
3. Copy `client/.env.example` to `client/.env.local`.
4. Set the project URL and publishable key (or legacy anon key):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

5. In PowerShell:

```powershell
cd path\to\scriptflow\client
npm install
npm run dev
```

6. Open the local URL printed by Vite (usually `http://localhost:5173`).

Never put a Supabase `service_role` / secret key in the React app or `.env.local`.

## Job fields

The Jobs form includes SW, Project number, SPM Project Number, Project Name, Status, Questions, Level, QNR received date, Launch date, PM, Tester, Test link, scripting time, Changes, Testing, Mailing time, Hours worked, Commissioning country, Overlay, Price Scripting, Hours Commissioned, Client, BARI OE Checks, BARI Moderations, BARI Scripting, BSurvey and Complexity – As SPM. It also has a separate main/backup assignment for PM, scripter and tester, plus internal notes.

The Excel export creates an `.xlsx` workbook from the current filtered job list. It uses readable column headings and includes the primary and backup assignment names. It is a general export, not yet a clone of a company-specific workbook template.

## Roles and permissions

- `admin` and `team_lead`: create and edit jobs.
- Assigned primary/backup people: can edit jobs they are assigned to.
- Other active team members: can read the team jobs.
- Only `admin` can delete jobs through database policy (the current UI does not expose delete).

The role for your existing admin account remains in `public.profiles`. New Auth users should receive a profile through the Phase 1 `handle_new_user` trigger; check that trigger before inviting the wider team.

## Development and security notes

- This is a development MVP, not a production security audit.
- Use fictional/sample data until company approval is obtained for hosting and data handling.
- Gmail, SPM, Forsta and other integrations are intentionally not connected. The data model is independent of the intake source so they can be added later with company approval.
- The old `projects` and `tickets` tables are not dropped. Do not remove them until the new workflow and migrated history have been verified.
- Review RLS and test each role with separate accounts before company deployment.

## Google Sheets integration – KPI weekly

This package includes an optional one-way sync from ScriptFlow to the Google Sheet tab named `KPI weekly`. Supabase remains the source of truth. Creating or editing a job calls the `sync-job-to-google-sheet` Edge Function. The function verifies the signed-in ScriptFlow user, loads the saved job, and sends it to Google Apps Script. Apps Script updates the existing row by a hidden `__ScriptFlow_ID` column, or inserts a new row if no matching ID exists.

### 1. Apply the sync tracking migration

Run `database/migrations/003_google_sheets_sync.sql` in Supabase SQL Editor, after `002_unified_jobs.sql`. It creates a private table used by the Edge Function to record sync status and errors. Do not rerun Phase 1 or Phase 2 migrations just for this integration.

### 2. Create the Google Apps Script endpoint

1. Open the target Google Sheet and select **Extensions → Apps Script**.
2. Replace the editor contents with `google-apps-script/Code.gs` from this package.
3. In Apps Script, open **Project Settings → Script Properties** and add:
   - Property: `SCRIPT_FLOW_SYNC_SECRET`
   - Value: a long random secret (at least 32 characters). Generate it privately; do not paste it into the React app or commit it to source control.
4. Save the project.
5. Select **Deploy → New deployment → Web app**.
6. Set **Execute as** to your account (the account that has edit access to the spreadsheet).
7. Set **Who has access** to the broadest option permitted by your company policy that allows the Supabase Edge Function to call the endpoint. The endpoint is protected by the secret, but your company may prohibit public Web App deployments. If it does, stop and ask IT for an approved alternative before proceeding.
8. Deploy and copy the Web App URL ending in `/exec`.

The script targets spreadsheet ID `1Ew-1cROn4Q2XpEV4t3b5jrgjP3MRUB50MDg6ofpuDQY` and tab `KPI weekly`. It reads row 1 as the headers and maps fields by header text, not column position. It adds a helper column named `__ScriptFlow_ID` at the far right and hides it. Do not delete or rename that helper column after the first successful sync.

### 3. Configure Supabase Edge Function secrets

In Supabase Dashboard → **Edge Functions → Secrets**, add:

- `GOOGLE_APPS_SCRIPT_URL` = the deployed Apps Script `/exec` URL
- `GOOGLE_SHEETS_SYNC_SECRET` = the exact same random secret used in Apps Script Script Properties

The Supabase project URL, anon key and service-role key are supplied by Supabase to Edge Functions. Never place the service-role key in the React `.env.local` file.

### 4. Deploy the Edge Function

Deploy the folder `supabase/functions/sync-job-to-google-sheet` as a function named `sync-job-to-google-sheet`. If using the Supabase CLI from PowerShell:

```powershell
npx supabase functions deploy sync-job-to-google-sheet --project-ref YOUR_PROJECT_REF
```

If the CLI asks to log in or link the project, follow its prompts. Docker is not needed for the normal hosted deploy command. Alternatively, use the Edge Function editor/deployment method available in your Supabase Dashboard and paste `index.ts`.

### 5. Test safely before using real work data

1. Create a clearly labelled fictional test job in ScriptFlow.
2. Save it. The app saves to Supabase first, then calls the sync function.
3. Open `KPI weekly` and confirm the test job appears under the matching headings.
4. Edit that same job in ScriptFlow and save again. Confirm the existing row changes rather than a second row being added.
5. Delete the fictional test row/job only after checking your team's retention requirements. The integration does not automatically delete sheet rows when a job is deleted.

### Field mapping notes

The script recognises the 26 agreed headings, including `Project's number`, `SPM Project Number`, `Project's Name`, `QNR received on`, `BARI - OE CHECKS`, `BARI - MODERATIONS`, `BSurvey` and `Complexity - As SPM`. `PM` and `Tester` are populated from the assigned primary team members' profile names. If the sheet combines the test link and scripting time into one heading such as `Test link (scripting time per Hrs)`, both values are placed in that cell. If separate `Test link` and `Scripting time (Hrs)` headings exist, they are populated separately. Unknown headings are left blank; verify the actual 26 header labels before enabling production sync.

A sync error does not roll back a job already saved in ScriptFlow. The app displays the failure message, and saving the job again retries the sync. The last error/status is stored in `job_google_sheet_sync` for administrators to inspect in Supabase.

**Important:** This is one-way sync. Changes made directly in Google Sheets do not update ScriptFlow. The hidden ScriptFlow ID column is used for reliable row matching even if sheet rows are sorted or moved.

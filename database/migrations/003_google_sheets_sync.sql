-- ScriptFlow -> Google Sheets sync tracking.
-- Run after 002_unified_jobs.sql. No existing jobs are modified.

create table if not exists public.job_google_sheet_sync (
    id uuid primary key default gen_random_uuid(),
    job_id uuid not null references public.jobs(id) on delete cascade,
    provider text not null default 'google_sheets',
    status text not null default 'pending'
        check (status in ('pending', 'synced', 'failed')),
    attempts integer not null default 0,
    remote_row integer,
    last_synced_at timestamptz,
    last_error text,
    updated_at timestamptz not null default now(),
    unique (job_id, provider)
);

create index if not exists idx_job_google_sheet_sync_status
    on public.job_google_sheet_sync(status, updated_at desc);

alter table public.job_google_sheet_sync enable row level security;
-- Deliberately no authenticated-user policies: only the Edge Function's
-- server-side service_role key can read or write integration status.
revoke all on public.job_google_sheet_sync from anon, authenticated;
grant all on public.job_google_sheet_sync to service_role;

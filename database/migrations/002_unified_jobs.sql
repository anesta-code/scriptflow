-- ScriptFlow Phase 2: unify Projects + Tickets into one Jobs record.
-- Run this AFTER 001_initial_schema.sql in the existing development Supabase project.
-- Existing projects/tickets are preserved. One job is created per existing project.

create extension if not exists pgcrypto;

create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    sw text,
    project_number text,
    spm_project_number text,
    project_name text not null,
    status text not null default 'new',
    questions integer,
    level text,
    qnr_received_on date,
    launch_date date,

    main_pm_id uuid references public.profiles(id) on delete set null,
    backup_pm_id uuid references public.profiles(id) on delete set null,
    main_scripter_id uuid references public.profiles(id) on delete set null,
    backup_scripter_id uuid references public.profiles(id) on delete set null,
    main_tester_id uuid references public.profiles(id) on delete set null,
    backup_tester_id uuid references public.profiles(id) on delete set null,

    test_link text,
    scripting_time_hours numeric(10,2),
    changes text,
    testing text,
    mailing_time_hours numeric(10,2),
    hours_worked numeric(10,2),
    commissioning_country text,
    overlay text,
    price_scripting numeric(12,2),
    hours_commissioned numeric(10,2),
    client text,
    bari_oe_checks text,
    bari_moderations text,
    bari_scripting text,
    bsurvey text,
    complexity_as_spm text,

    notes text,
    created_by uuid references public.profiles(id) on delete set null,
    legacy_project_id uuid unique references public.projects(id) on delete set null,
    legacy_ticket_id uuid references public.tickets(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Add any missing columns if this migration is rerun against a partially updated DB.
alter table public.jobs add column if not exists sw text;
alter table public.jobs add column if not exists project_number text;
alter table public.jobs add column if not exists spm_project_number text;
alter table public.jobs add column if not exists project_name text;
alter table public.jobs add column if not exists status text not null default 'new';
alter table public.jobs add column if not exists questions integer;
alter table public.jobs add column if not exists level text;
alter table public.jobs add column if not exists qnr_received_on date;
alter table public.jobs add column if not exists launch_date date;
alter table public.jobs add column if not exists main_pm_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists backup_pm_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists main_scripter_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists backup_scripter_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists main_tester_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists backup_tester_id uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists test_link text;
alter table public.jobs add column if not exists scripting_time_hours numeric(10,2);
alter table public.jobs add column if not exists changes text;
alter table public.jobs add column if not exists testing text;
alter table public.jobs add column if not exists mailing_time_hours numeric(10,2);
alter table public.jobs add column if not exists hours_worked numeric(10,2);
alter table public.jobs add column if not exists commissioning_country text;
alter table public.jobs add column if not exists overlay text;
alter table public.jobs add column if not exists price_scripting numeric(12,2);
alter table public.jobs add column if not exists hours_commissioned numeric(10,2);
alter table public.jobs add column if not exists client text;
alter table public.jobs add column if not exists bari_oe_checks text;
alter table public.jobs add column if not exists bari_moderations text;
alter table public.jobs add column if not exists bari_scripting text;
alter table public.jobs add column if not exists bsurvey text;
alter table public.jobs add column if not exists complexity_as_spm text;
alter table public.jobs add column if not exists notes text;
alter table public.jobs add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.jobs add column if not exists legacy_project_id uuid unique references public.projects(id) on delete set null;
alter table public.jobs add column if not exists legacy_ticket_id uuid references public.tickets(id) on delete set null;
alter table public.jobs add column if not exists created_at timestamptz not null default now();
alter table public.jobs add column if not exists updated_at timestamptz not null default now();

-- Preserve current development data: one unified job per old project.
-- The first ticket (if present) supplies the initial workflow status and scripting/test assignments.
insert into public.jobs (
    legacy_project_id, legacy_ticket_id, project_number, spm_project_number,
    project_name, status, qnr_received_on, launch_date, client,
    main_scripter_id, main_tester_id, created_by, created_at, updated_at
)
select
    p.id,
    t.id,
    p.project_code,
    p.spm_reference,
    p.name,
    case
        when t.status in ('new','qnr_check','ready','in_progress','qa_review','revisions','blocked','waiting_information','completed','cancelled') then t.status
        when p.status = 'completed' then 'completed'
        when p.status = 'cancelled' then 'cancelled'
        when p.status = 'on_hold' then 'blocked'
        else 'new'
    end,
    p.received_date,
    coalesce(t.due_date, p.deadline),
    p.client_name,
    t.assignee_id,
    t.reviewer_id,
    p.created_by,
    p.created_at,
    p.updated_at
from public.projects p
left join lateral (
    select tk.id, tk.status, tk.due_date, tk.assignee_id, tk.reviewer_id
    from public.tickets tk
    where tk.project_id = p.id
    order by tk.created_at asc
    limit 1
) t on true
where not exists (
    select 1 from public.jobs j where j.legacy_project_id = p.id
);

-- Link existing history records to the corresponding unified job.
alter table public.activities add column if not exists job_id uuid references public.jobs(id) on delete cascade;
alter table public.work_logs add column if not exists job_id uuid references public.jobs(id) on delete cascade;
alter table public.qa_records add column if not exists job_id uuid references public.jobs(id) on delete cascade;
alter table public.email_references add column if not exists job_id uuid references public.jobs(id) on delete cascade;

update public.activities a
set job_id = j.id
from public.tickets t
join public.jobs j on j.legacy_project_id = t.project_id
where a.ticket_id = t.id and a.job_id is null;

update public.work_logs w
set job_id = j.id
from public.tickets t
join public.jobs j on j.legacy_project_id = t.project_id
where w.ticket_id = t.id and w.job_id is null;

update public.qa_records q
set job_id = j.id
from public.tickets t
join public.jobs j on j.legacy_project_id = t.project_id
where q.ticket_id = t.id and q.job_id is null;

update public.email_references e
set job_id = j.id
from public.jobs j
where e.project_id = j.legacy_project_id and e.job_id is null;

-- New activity/work records attach directly to jobs; legacy ticket links remain available.
alter table public.activities alter column ticket_id drop not null;
alter table public.work_logs alter column ticket_id drop not null;
alter table public.qa_records alter column ticket_id drop not null;

create index if not exists idx_jobs_status on public.jobs(status);
create index if not exists idx_jobs_project_number on public.jobs(project_number);
create index if not exists idx_jobs_qnr_received on public.jobs(qnr_received_on);
create index if not exists idx_jobs_launch_date on public.jobs(launch_date);
create index if not exists idx_jobs_main_scripter on public.jobs(main_scripter_id);
create index if not exists idx_jobs_main_pm on public.jobs(main_pm_id);
create index if not exists idx_jobs_main_tester on public.jobs(main_tester_id);
create index if not exists idx_activities_job_created on public.activities(job_id, created_at desc);
create index if not exists idx_work_logs_job on public.work_logs(job_id);
create index if not exists idx_qa_records_job on public.qa_records(job_id);

-- Reuse the existing updated_at trigger function from migration 001.
drop trigger if exists jobs_updated_at on public.jobs;
create trigger jobs_updated_at before update on public.jobs
for each row execute procedure public.set_updated_at();

alter table public.jobs enable row level security;

drop policy if exists "jobs_select_team" on public.jobs;
create policy "jobs_select_team"
on public.jobs for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "jobs_insert_leads" on public.jobs;
create policy "jobs_insert_leads"
on public.jobs for insert to authenticated
with check (
    public.current_app_role() in ('admin', 'team_lead')
    and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "jobs_update_leads_or_assignees" on public.jobs;
create policy "jobs_update_leads_or_assignees"
on public.jobs for update to authenticated
using (
    public.current_app_role() in ('admin', 'team_lead')
    or (select auth.uid()) in (main_pm_id, backup_pm_id, main_scripter_id, backup_scripter_id, main_tester_id, backup_tester_id)
)
with check (
    public.current_app_role() in ('admin', 'team_lead')
    or (select auth.uid()) in (main_pm_id, backup_pm_id, main_scripter_id, backup_scripter_id, main_tester_id, backup_tester_id)
);

drop policy if exists "jobs_delete_admin" on public.jobs;
create policy "jobs_delete_admin"
on public.jobs for delete to authenticated
using (public.current_app_role() = 'admin');

grant select, insert, update, delete on public.jobs to authenticated;
grant select, insert on public.activities to authenticated;
grant select, insert, update on public.work_logs to authenticated;
grant select, insert, update on public.qa_records to authenticated;

-- Verify migration with:
-- select count(*) from public.jobs;
-- select id, project_number, project_name, status from public.jobs order by created_at desc;

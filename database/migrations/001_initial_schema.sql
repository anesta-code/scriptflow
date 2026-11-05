-- ScriptFlow Phase 1 – initial schema
-- Run in Supabase SQL Editor using a development project and fictional data.
-- Supabase Auth owns passwords; public.profiles stores application roles.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default '',
    email text not null,
    role text not null default 'scripter'
        check (role in ('admin', 'team_lead', 'scripter', 'reviewer')),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    project_code text not null unique,
    name text not null,
    client_name text,
    spm_reference text,
    description text,
    received_date date not null default current_date,
    deadline date,
    status text not null default 'active'
        check (status in ('active', 'on_hold', 'completed', 'cancelled')),
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
    id uuid primary key default gen_random_uuid(),
    ticket_number bigint generated always as identity unique,
    project_id uuid not null references public.projects(id) on delete restrict,
    title text not null,
    description text,
    ticket_type text not null default 'scripting'
        check (ticket_type in ('qnr_check', 'scripting', 'testing', 'correction', 'qa', 'other')),
    status text not null default 'new'
        check (status in (
            'new', 'qnr_check', 'ready', 'in_progress', 'qa_review',
            'revisions', 'blocked', 'waiting_information', 'completed', 'cancelled'
        )),
    priority text not null default 'normal'
        check (priority in ('low', 'normal', 'high', 'urgent')),
    assignee_id uuid references public.profiles(id) on delete set null,
    reviewer_id uuid references public.profiles(id) on delete set null,
    due_date date,
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.activities (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.tickets(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    action text not null,
    description text,
    created_at timestamptz not null default now()
);

create table if not exists public.work_logs (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.tickets(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete restrict,
    started_at timestamptz not null,
    ended_at timestamptz,
    description text,
    created_at timestamptz not null default now(),
    constraint work_logs_valid_range check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.qa_records (
    id uuid primary key default gen_random_uuid(),
    ticket_id uuid not null references public.tickets(id) on delete cascade,
    reviewer_id uuid references public.profiles(id) on delete set null,
    issue text not null,
    resolution text,
    status text not null default 'open'
        check (status in ('open', 'in_progress', 'resolved', 'accepted')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.email_references (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.projects(id) on delete cascade,
    message_reference text,
    subject text,
    sender text,
    received_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_deadline on public.projects(deadline);
create index if not exists idx_tickets_project on public.tickets(project_id);
create index if not exists idx_tickets_assignee on public.tickets(assignee_id);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_tickets_due_date on public.tickets(due_date);
create index if not exists idx_activities_ticket_created on public.activities(ticket_id, created_at desc);
create index if not exists idx_work_logs_user on public.work_logs(user_id);

-- Automatically create a profile when an Auth user is created.
-- New users always start as scripter; an administrator promotes them separately.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, full_name, email, role)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        coalesce(new.email, ''),
        'scripter'
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects
for each row execute procedure public.set_updated_at();

drop trigger if exists tickets_updated_at on public.tickets;
create trigger tickets_updated_at before update on public.tickets
for each row execute procedure public.set_updated_at();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists qa_records_updated_at on public.qa_records;
create trigger qa_records_updated_at before update on public.qa_records
for each row execute procedure public.set_updated_at();

-- Helper: current user's application role.
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select role from public.profiles
    where id = (select auth.uid()) and is_active = true
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tickets enable row level security;
alter table public.activities enable row level security;
alter table public.work_logs enable row level security;
alter table public.qa_records enable row level security;
alter table public.email_references enable row level security;

-- Profiles: authenticated users can see team directory; only admins manage roles.
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select to authenticated
using (is_active = true or id = (select auth.uid()));

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles for update to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

-- Projects: team members can read; team leads/admins create and update.
drop policy if exists "projects_select_team" on public.projects;
create policy "projects_select_team"
on public.projects for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "projects_insert_leads" on public.projects;
create policy "projects_insert_leads"
on public.projects for insert to authenticated
with check (
    public.current_app_role() in ('admin', 'team_lead')
    and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "projects_update_leads" on public.projects;
create policy "projects_update_leads"
on public.projects for update to authenticated
using (public.current_app_role() in ('admin', 'team_lead'))
with check (public.current_app_role() in ('admin', 'team_lead'));

-- Tickets: all active team members can read/create; assignees can update their tickets.
drop policy if exists "tickets_select_team" on public.tickets;
create policy "tickets_select_team"
on public.tickets for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "tickets_insert_team" on public.tickets;
create policy "tickets_insert_team"
on public.tickets for insert to authenticated
with check (
    public.current_app_role() is not null
    and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "tickets_update_assignee_or_lead" on public.tickets;
create policy "tickets_update_assignee_or_lead"
on public.tickets for update to authenticated
using (
    assignee_id = (select auth.uid())
    or public.current_app_role() in ('admin', 'team_lead', 'reviewer')
)
with check (
    assignee_id = (select auth.uid())
    or public.current_app_role() in ('admin', 'team_lead', 'reviewer')
);

-- Activity is readable by the team and insertable only as the current user.
drop policy if exists "activities_select_team" on public.activities;
create policy "activities_select_team"
on public.activities for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "activities_insert_self" on public.activities;
create policy "activities_insert_self"
on public.activities for insert to authenticated
with check (
    public.current_app_role() is not null
    and user_id = (select auth.uid())
);

-- Work logs: users read team logs; insert their own; leads/admins can manage.
drop policy if exists "work_logs_select_team" on public.work_logs;
create policy "work_logs_select_team"
on public.work_logs for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "work_logs_insert_self" on public.work_logs;
create policy "work_logs_insert_self"
on public.work_logs for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "work_logs_update_owner_or_lead" on public.work_logs;
create policy "work_logs_update_owner_or_lead"
on public.work_logs for update to authenticated
using (
    user_id = (select auth.uid())
    or public.current_app_role() in ('admin', 'team_lead')
)
with check (
    user_id = (select auth.uid())
    or public.current_app_role() in ('admin', 'team_lead')
);

-- QA: team can read; reviewers/leads/admins create and update.
drop policy if exists "qa_select_team" on public.qa_records;
create policy "qa_select_team"
on public.qa_records for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "qa_insert_reviewers" on public.qa_records;
create policy "qa_insert_reviewers"
on public.qa_records for insert to authenticated
with check (
    public.current_app_role() in ('admin', 'team_lead', 'reviewer')
);

drop policy if exists "qa_update_reviewers" on public.qa_records;
create policy "qa_update_reviewers"
on public.qa_records for update to authenticated
using (public.current_app_role() in ('admin', 'team_lead', 'reviewer'))
with check (public.current_app_role() in ('admin', 'team_lead', 'reviewer'));

-- Email references: metadata only; no mailbox access or email body storage.
drop policy if exists "email_refs_select_team" on public.email_references;
create policy "email_refs_select_team"
on public.email_references for select to authenticated
using (public.current_app_role() is not null);

drop policy if exists "email_refs_insert_leads" on public.email_references;
create policy "email_refs_insert_leads"
on public.email_references for insert to authenticated
with check (public.current_app_role() in ('admin', 'team_lead'));

-- Keep direct table access limited to authenticated users.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.projects to authenticated;
grant select, insert, update on public.tickets to authenticated;
grant select, insert on public.activities to authenticated;
grant select, insert, update on public.work_logs to authenticated;
grant select, insert, update on public.qa_records to authenticated;
grant select, insert on public.email_references to authenticated;

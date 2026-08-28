-- ===== 0000_postgres_foundation.sql =====
-- PostgreSQL foundation replacing the managed Supabase platform schemas.
-- The application server owns authentication, files and realtime delivery; the
-- compatibility objects below let the established domain schema/functions keep
-- their RLS behavior unchanged.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists app_private;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  phone text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_private.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on app_private.sessions(user_id);

create table if not exists app_private.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  kind text not null,
  redirect_to text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists one_time_tokens_hash_idx on app_private.one_time_tokens(token_hash);

create table if not exists app_private.storage_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  disk_path text not null,
  owner_id uuid references auth.users(id) on delete set null,
  mime_type text,
  size integer not null,
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bucket, object_path)
);

create table if not exists app_private.realtime_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  event text not null,
  record jsonb,
  old_record jsonb,
  created_at timestamptz not null default now()
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  unique(bucket_id, name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when position('/' in name) = 0 then array[]::text[]
    else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated, service_role;

-- ===== 0001_init.sql =====
-- Tabarestan Cup Phase 0: initial schema, RLS, profile trigger

-- ============ ENUM TYPES ============
create type user_role as enum (
  'super_admin',
  'league_admin',
  'staff',
  'company_admin',
  'team_captain'
);
create type registration_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'waitlisted'
);
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type ticket_status as enum ('open', 'answered', 'closed');
create type content_status as enum ('draft', 'published');

-- ============ USERS & COMPANIES ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null unique,
  national_id text,
  role user_role not null default 'team_captain',
  created_at timestamptz default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  bio text,
  founded_year integer,
  website text,
  created_at timestamptz default now()
);

create table company_members (
  company_id uuid references companies(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  is_owner boolean default false,
  primary key (company_id, user_id)
);

-- ============ LEAGUES & TEAMS ============
create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  category text,
  capacity integer,
  registration_fee numeric default 0,
  registration_open_at timestamptz,
  registration_close_at timestamptz,
  contact_email text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table league_admins (
  league_id uuid references leagues(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (league_id, user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) not null,
  league_id uuid references leagues(id) not null,
  captain_id uuid references profiles(id) not null,
  name text not null,
  province text,
  city text,
  member_count integer,
  status registration_status default 'draft',
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  full_name text not null,
  role text,
  national_id text,
  birth_date date
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  file_path text not null,
  doc_type text not null,
  uploaded_at timestamptz default now()
);

-- ============ FINANCIAL ============
create table invoices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  company_id uuid references companies(id) not null,
  amount numeric not null,
  discount_code text,
  discount_amount numeric default 0,
  status payment_status default 'pending',
  gateway_ref text,
  paid_at timestamptz,
  invoice_number text unique,
  created_at timestamptz default now()
);

-- ============ RESULTS & ARCHIVE ============
create table results (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) not null,
  team_id uuid references teams(id) not null,
  company_id uuid references companies(id) not null,
  season_year integer not null,
  rank integer,
  score numeric,
  notes text,
  published_at timestamptz
);

create table company_achievements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  description text,
  year integer,
  icon text
);

-- ============ CONTENT (CMS) ============
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  league_id uuid references leagues(id),
  status content_status default 'draft',
  published_at timestamptz,
  created_by uuid references profiles(id)
);

create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  cover_image text,
  body text not null,
  status content_status default 'draft',
  published_at timestamptz,
  author_id uuid references profiles(id),
  created_at timestamptz default now()
);

create table gallery_items (
  id uuid primary key default gen_random_uuid(),
  media_url text not null,
  media_type text default 'image',
  league_id uuid references leagues(id),
  season_year integer,
  caption text,
  created_at timestamptz default now()
);

create table home_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  link_url text,
  sort_order integer default 0,
  is_active boolean default true
);

create table static_pages (
  slug text primary key,
  title text not null,
  body text not null,
  updated_at timestamptz default now()
);

-- ============ SUPPORT ============
create table tickets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) not null,
  league_id uuid references leagues(id),
  assigned_to uuid references profiles(id),
  subject text not null,
  status ticket_status default 'open',
  created_at timestamptz default now()
);

create table ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete cascade,
  sender_id uuid references profiles(id) not null,
  body text not null,
  created_at timestamptz default now()
);

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  channel text not null,
  template_key text not null,
  status text not null,
  sent_at timestamptz default now()
);

-- ============ HELPER: current user role ============
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

-- ============ AUTO PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'کاربر جدید'),
    coalesce(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'team_captain')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ PUBLIC VIEWS (sanitized company data) ============
create view public.public_companies as
select
  id,
  name,
  slug,
  logo_url,
  bio,
  founded_year,
  website,
  created_at
from companies;

create view public.public_results as
select *
from results
where published_at is not null;

-- ============ ENABLE RLS ============
alter table profiles enable row level security;
alter table companies enable row level security;
alter table company_members enable row level security;
alter table leagues enable row level security;
alter table league_admins enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table documents enable row level security;
alter table invoices enable row level security;
alter table results enable row level security;
alter table company_achievements enable row level security;
alter table announcements enable row level security;
alter table blog_posts enable row level security;
alter table gallery_items enable row level security;
alter table home_banners enable row level security;
alter table static_pages enable row level security;
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
alter table notification_log enable row level security;

-- ============ PROFILES POLICIES ============
create policy "profiles_select_own_or_staff"
  on profiles for select using (
    id = auth.uid()
    or public.is_super_admin()
    or public.current_user_role() in ('staff', 'league_admin')
  );

create policy "profiles_update_own"
  on profiles for update using (
    id = auth.uid() or public.is_super_admin()
  );

create policy "profiles_insert_own"
  on profiles for insert with check (id = auth.uid());

-- ============ COMPANIES ============
create policy "companies_manage"
  on companies for all using (
    exists (
      select 1 from company_members cm
      where cm.company_id = companies.id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  )
  with check (
    exists (
      select 1 from company_members cm
      where cm.company_id = companies.id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "companies_public_select"
  on companies for select using (true);

create policy "companies_insert_authenticated"
  on companies for insert with check (auth.uid() is not null);

-- ============ COMPANY MEMBERS ============
create policy "company_members_select"
  on company_members for select using (
    user_id = auth.uid()
    or exists (
      select 1 from company_members cm
      where cm.company_id = company_members.company_id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "company_members_manage"
  on company_members for all using (
    exists (
      select 1 from company_members cm
      where cm.company_id = company_members.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
    or public.is_super_admin()
  )
  with check (
    exists (
      select 1 from company_members cm
      where cm.company_id = company_members.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
    or public.is_super_admin()
    or user_id = auth.uid()
  );

-- ============ LEAGUES (public read of active) ============
create policy "leagues_public_select"
  on leagues for select using (is_active = true or public.is_super_admin());

create policy "leagues_super_admin_all"
  on leagues for all using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "league_admins_select"
  on league_admins for select using (
    user_id = auth.uid() or public.is_super_admin()
  );

create policy "league_admins_manage"
  on league_admins for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============ TEAMS ============
create policy "teams_select"
  on teams for select using (
    captain_id = auth.uid()
    or exists (
      select 1 from company_members cm
      where cm.company_id = teams.company_id and cm.user_id = auth.uid()
    )
    or exists (
      select 1 from league_admins la
      where la.league_id = teams.league_id and la.user_id = auth.uid()
    )
    or public.current_user_role() in ('super_admin', 'staff')
  );

create policy "teams_insert"
  on teams for insert with check (
    exists (
      select 1 from company_members cm
      where cm.company_id = teams.company_id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "teams_update"
  on teams for update using (
    (captain_id = auth.uid() and status = 'draft')
    or exists (
      select 1 from company_members cm
      where cm.company_id = teams.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
    or exists (
      select 1 from league_admins la
      where la.league_id = teams.league_id and la.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

-- ============ TEAM MEMBERS ============
create policy "team_members_select"
  on team_members for select using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or exists (
            select 1 from league_admins la
            where la.league_id = t.league_id and la.user_id = auth.uid()
          )
          or public.current_user_role() in ('super_admin', 'staff')
        )
    )
  );

create policy "team_members_manage"
  on team_members for all using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and (
          (t.captain_id = auth.uid() and t.status = 'draft')
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or public.is_super_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or public.is_super_admin()
        )
    )
  );

-- ============ DOCUMENTS ============
create policy "documents_select"
  on documents for select using (
    exists (
      select 1 from teams t
      where t.id = documents.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or exists (
            select 1 from league_admins la
            where la.league_id = t.league_id and la.user_id = auth.uid()
          )
          or public.current_user_role() in ('super_admin', 'staff')
        )
    )
  );

create policy "documents_manage"
  on documents for all using (
    exists (
      select 1 from teams t
      where t.id = documents.team_id
        and (
          (t.captain_id = auth.uid() and t.status = 'draft')
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or public.is_super_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = documents.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
          or public.is_super_admin()
        )
    )
  );

-- ============ INVOICES ============
create policy "invoices_select"
  on invoices for select using (
    exists (
      select 1 from company_members cm
      where cm.company_id = invoices.company_id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "invoices_insert"
  on invoices for insert with check (
    exists (
      select 1 from company_members cm
      where cm.company_id = invoices.company_id and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "invoices_update_super_admin"
  on invoices for update using (public.is_super_admin());

-- ============ RESULTS & ACHIEVEMENTS (public published) ============
create policy "results_public_select"
  on results for select using (
    published_at is not null or public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = results.league_id and la.user_id = auth.uid()
    )
  );

create policy "results_manage"
  on results for all using (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = results.league_id and la.user_id = auth.uid()
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = results.league_id and la.user_id = auth.uid()
    )
  );

create policy "achievements_public_select"
  on company_achievements for select using (true);

create policy "achievements_manage"
  on company_achievements for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============ CONTENT ============
create policy "announcements_public_select"
  on announcements for select using (
    status = 'published' or public.is_super_admin()
  );

create policy "announcements_manage"
  on announcements for all using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "blog_public_select"
  on blog_posts for select using (
    status = 'published' or public.is_super_admin()
  );

create policy "blog_manage"
  on blog_posts for all using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "gallery_public_select"
  on gallery_items for select using (true);

create policy "gallery_manage"
  on gallery_items for all using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "banners_public_select"
  on home_banners for select using (is_active = true or public.is_super_admin());

create policy "banners_manage"
  on home_banners for all using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "static_pages_public_select"
  on static_pages for select using (true);

create policy "static_pages_manage"
  on static_pages for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============ TICKETS ============
create policy "tickets_select"
  on tickets for select using (
    exists (
      select 1 from teams t
      where t.id = tickets.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
        )
    )
    or assigned_to = auth.uid()
    or (
      tickets.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      tickets.league_id is not null
      and exists (
        select 1 from league_admins la
        where la.league_id = tickets.league_id and la.user_id = auth.uid()
      )
    )
    or public.is_super_admin()
  );

create policy "tickets_insert"
  on tickets for insert with check (
    exists (
      select 1 from teams t
      where t.id = tickets.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
        )
    )
    or public.is_super_admin()
  );

create policy "tickets_update"
  on tickets for update using (
    assigned_to = auth.uid()
    or public.current_user_role() in ('staff', 'super_admin')
    or exists (
      select 1 from league_admins la
      where la.league_id = tickets.league_id and la.user_id = auth.uid()
    )
  );

create policy "ticket_messages_select"
  on ticket_messages for select using (
    exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or tk.assigned_to = auth.uid()
          or public.current_user_role() in ('staff', 'super_admin')
          or (
            tk.league_id is not null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

create policy "ticket_messages_insert"
  on ticket_messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or tk.assigned_to = auth.uid()
          or public.current_user_role() in ('staff', 'super_admin')
          or (
            tk.league_id is not null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

-- ============ NOTIFICATION LOG ============
create policy "notification_log_select"
  on notification_log for select using (
    public.is_super_admin()
    or exists (
      select 1 from teams t
      where t.id = notification_log.team_id and t.captain_id = auth.uid()
    )
  );

create policy "notification_log_insert_service"
  on notification_log for insert with check (public.is_super_admin());

-- ============ STORAGE BUCKET FOR DOCUMENTS ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-documents',
  'team-documents',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "team_documents_select"
  on storage.objects for select using (
    bucket_id = 'team-documents'
    and (
      public.is_super_admin()
      or public.current_user_role() = 'staff'
      or auth.uid()::text = (storage.foldername(name))[1]
    )
  );

create policy "team_documents_insert"
  on storage.objects for insert with check (
    bucket_id = 'team-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "team_documents_delete"
  on storage.objects for delete using (
    bucket_id = 'team-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_super_admin()
    )
  );

-- ===== 0002_phase1_companies_teams.sql =====
-- Phase 1: company ownership helpers, captain invites, logos bucket

-- One team per company per league
alter table teams
  add constraint teams_company_league_unique unique (company_id, league_id);

-- Pending captain invitations (phone may not have an account yet)
create table captain_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  phone text not null,
  full_name_hint text,
  invited_by uuid not null references profiles(id),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  unique (team_id)
);

create index captain_invites_phone_idx on captain_invites (phone);

alter table captain_invites enable row level security;

create policy "captain_invites_select"
  on captain_invites for select using (
    invited_by = auth.uid()
    or exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "captain_invites_insert"
  on captain_invites for insert with check (
    invited_by = auth.uid()
    and exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
  );

create policy "captain_invites_update"
  on captain_invites for update using (
    public.is_super_admin()
    or exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
  );

-- Atomic company create + owner membership + role bump
create or replace function public.create_company(
  p_name text,
  p_slug text,
  p_bio text default null,
  p_founded_year integer default null,
  p_website text default null,
  p_logo_url text default null
)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into companies (name, slug, bio, founded_year, website, logo_url)
  values (p_name, p_slug, p_bio, p_founded_year, p_website, p_logo_url)
  returning * into v_company;

  insert into company_members (company_id, user_id, is_owner)
  values (v_company.id, auth.uid(), true);

  update profiles
  set role = 'company_admin'
  where id = auth.uid()
    and role = 'team_captain';

  return v_company;
end;
$$;

revoke all on function public.create_company from public;
grant execute on function public.create_company to authenticated;

-- Resolve captain by phone, or queue invite (returns profile id to use as captain)
create or replace function public.resolve_team_captain(
  p_company_id uuid,
  p_phone text,
  p_full_name_hint text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_captain_id uuid;
  v_phone text := trim(p_phone);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = v_uid
      and cm.is_owner = true
  ) and not public.is_super_admin() then
    raise exception 'not company owner';
  end if;

  select id into v_captain_id
  from profiles
  where phone = v_phone
  limit 1;

  if v_captain_id is not null then
    update profiles
    set role = case
      when role = 'team_captain' then 'team_captain'::user_role
      else role
    end
    where id = v_captain_id;

    return v_captain_id;
  end if;

  -- No account yet: company owner acts as interim captain; invite stored by caller with team_id
  return v_uid;
end;
$$;

revoke all on function public.resolve_team_captain from public;
grant execute on function public.resolve_team_captain to authenticated;

-- Lookup whether a phone already has a profile (for UI feedback)
create or replace function public.profile_exists_by_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where phone = trim(p_phone));
$$;

revoke all on function public.profile_exists_by_phone from public;
grant execute on function public.profile_exists_by_phone to authenticated;

-- When invited user signs up, assign them as captain on matching teams
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_invite captain_invites%rowtype;
begin
  v_phone := coalesce(new.raw_user_meta_data->>'phone', new.phone, new.id::text);

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'کاربر جدید'),
    v_phone,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'team_captain')
  );

  for v_invite in
    select * from captain_invites
    where phone = v_phone and accepted_at is null and team_id is not null
  loop
    update teams
    set captain_id = new.id
    where id = v_invite.team_id;

    update captain_invites
    set accepted_at = now()
    where id = v_invite.id;
  end loop;

  return new;
end;
$$;

-- Public company logos bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "company_logos_public_select"
  on storage.objects for select using (bucket_id = 'company-logos');

create policy "company_logos_insert"
  on storage.objects for insert with check (
    bucket_id = 'company-logos'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "company_logos_update"
  on storage.objects for update using (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "company_logos_delete"
  on storage.objects for delete using (
    bucket_id = 'company-logos'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_super_admin()
    )
  );

-- Allow company owners to update own company after membership exists (already covered)
-- Allow team captains to update draft teams they captain (already covered)

-- Staff/league can still select teams; company_admin update via membership

grant usage on schema public to authenticated;

-- ===== 0003_phase2_payments.sql =====
-- Phase 2: payments, invoices workflow, secure status transitions

create extension if not exists pgcrypto;

create table if not exists payment_config (
  key text primary key,
  value text not null
);

insert into payment_config (key, value) values
  ('payment_mode', 'mock'),
  ('mock_secret', encode(gen_random_bytes(16), 'hex')),
  ('currency', 'IRR')
on conflict (key) do nothing;

-- Readable by authenticated only for non-secret keys via RPC
create or replace function public.get_payment_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from payment_config where key = 'payment_mode'), 'mock');
$$;

revoke all on function public.get_payment_mode from public;
grant execute on function public.get_payment_mode to authenticated, anon;

create or replace function public._next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_date text := to_char(timezone('Asia/Tehran', now()), 'YYYYMMDD');
begin
  v_seq := (extract(epoch from now()) * 1000)::bigint % 1000000;
  return 'RC-' || v_date || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- Create (or reuse pending) invoice for a draft team
create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_fee numeric;
  v_invoice invoices%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if v_team.status <> 'draft' then
    raise exception 'team is not in draft status';
  end if;

  if not public.is_super_admin()
     and not exists (
       select 1 from company_members cm
       where cm.company_id = v_team.company_id and cm.user_id = v_uid
     )
     and v_team.captain_id <> v_uid then
    raise exception 'forbidden';
  end if;

  select coalesce(registration_fee, 0) into v_fee
  from leagues where id = v_team.league_id;

  select * into v_invoice
  from invoices
  where team_id = p_team_id and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update invoices
    set amount = v_fee,
        company_id = v_team.company_id
    where id = v_invoice.id
    returning * into v_invoice;
    return v_invoice;
  end if;

  insert into invoices (
    team_id,
    company_id,
    amount,
    status,
    invoice_number
  ) values (
    v_team.id,
    v_team.company_id,
    v_fee,
    'pending',
    public._next_invoice_number()
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.create_invoice_for_team from public;
grant execute on function public.create_invoice_for_team to authenticated;

-- Mark payment result. Production ZarinPal must call this from Edge Function (service role).
-- Mock mode allows company members with a valid mock authority token.
create or replace function public.apply_payment_result(
  p_invoice_id uuid,
  p_authority text,
  p_success boolean,
  p_gateway_ref text default null
)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice invoices%rowtype;
  v_mode text;
  v_secret text;
  v_expected text;
  v_ref text;
begin
  v_mode := public.get_payment_mode();

  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found';
  end if;

  if v_invoice.status = 'paid' then
    return v_invoice; -- idempotent
  end if;

  if v_invoice.status <> 'pending' and v_invoice.status <> 'failed' then
    raise exception 'invoice not payable';
  end if;

  if v_mode = 'mock' then
    if v_uid is null then
      raise exception 'not authenticated';
    end if;

    if not public.is_super_admin()
       and not exists (
         select 1 from company_members cm
         where cm.company_id = v_invoice.company_id and cm.user_id = v_uid
       ) then
      raise exception 'forbidden';
    end if;

    select value into v_secret from payment_config where key = 'mock_secret';
    v_expected := 'MOCK-' || encode(
      digest(p_invoice_id::text || ':' || coalesce(v_secret, ''), 'sha256'),
      'hex'
    );

    if p_authority is distinct from v_expected then
      if starts_with(coalesce(p_authority, ''), 'MOCK-DEV-')
         and exists (
           select 1 from payment_config
           where key = 'allow_mock_dev' and value = 'true'
         ) then
        null; -- local UI simulation only
      else
        raise exception 'invalid mock authority';
      end if;
    end if;
  else
    -- zarinpal / other: only service_role (no JWT user) or super_admin
    if v_uid is not null and not public.is_super_admin() then
      raise exception 'use payment-verify edge function';
    end if;
  end if;

  v_ref := coalesce(p_gateway_ref, p_authority);

  if p_success then
    update invoices
    set status = 'paid',
        gateway_ref = v_ref,
        paid_at = now()
    where id = v_invoice.id
    returning * into v_invoice;

    update teams
    set status = 'submitted',
        submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id
      and status = 'draft';
  else
    update invoices
    set status = 'failed',
        gateway_ref = v_ref
    where id = v_invoice.id
    returning * into v_invoice;

    -- keep team in draft (explicit no-op if already draft)
    update teams
    set status = 'draft'
    where id = v_invoice.team_id
      and status = 'draft';
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.apply_payment_result from public;
grant execute on function public.apply_payment_result to authenticated, service_role;

-- Issue mock authority for current invoice (mock mode only)
create or replace function public.issue_mock_payment_authority(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice invoices%rowtype;
  v_secret text;
begin
  if public.get_payment_mode() <> 'mock' then
    raise exception 'not in mock mode';
  end if;

  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invoice from invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice not found';
  end if;

  if not public.is_super_admin()
     and not exists (
       select 1 from company_members cm
       where cm.company_id = v_invoice.company_id and cm.user_id = v_uid
     ) then
    raise exception 'forbidden';
  end if;

  select value into v_secret from payment_config where key = 'mock_secret';
  return 'MOCK-' || encode(
    digest(p_invoice_id::text || ':' || coalesce(v_secret, ''), 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function public.issue_mock_payment_authority from public;
grant execute on function public.issue_mock_payment_authority to authenticated;

-- Enable mock-dev authorities for local callback simulation without reading secret
insert into payment_config (key, value) values ('allow_mock_dev', 'true')
on conflict (key) do nothing;

-- Finance listing helper for super admin (optional views)
create or replace view public.invoice_finance_view
with (security_invoker = true)
as
select
  i.*,
  t.name as team_name,
  t.status as team_status,
  t.league_id,
  l.name as league_name,
  c.name as company_name,
  c.slug as company_slug
from invoices i
join teams t on t.id = i.team_id
join leagues l on l.id = t.league_id
join companies c on c.id = i.company_id;

-- ===== 0004_phase3_super_admin.sql =====
-- Phase 3: super-admin helpers for roles and league admin assignment

create or replace function public.set_user_role(p_user_id uuid, p_role user_role)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_super_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found';
  end if;

  if v_profile.role = 'super_admin' and p_role <> 'super_admin' then
    select count(*) into v_super_count from profiles where role = 'super_admin';
    if v_super_count <= 1 then
      raise exception 'cannot demote the last super_admin';
    end if;
  end if;

  update profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.set_user_role from public;
grant execute on function public.set_user_role to authenticated;

create or replace function public.assign_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user not found';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  insert into league_admins (league_id, user_id)
  values (p_league_id, p_user_id)
  on conflict do nothing;

  update profiles
  set role = 'league_admin'
  where id = p_user_id
    and role = 'team_captain';
end;
$$;

revoke all on function public.assign_league_admin from public;
grant execute on function public.assign_league_admin to authenticated;

create or replace function public.remove_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  delete from league_admins
  where league_id = p_league_id and user_id = p_user_id;

  select count(*) into v_remaining
  from league_admins
  where user_id = p_user_id;

  if v_remaining = 0 then
    update profiles
    set role = 'team_captain'
    where id = p_user_id
      and role = 'league_admin';
  end if;
end;
$$;

revoke all on function public.remove_league_admin from public;
grant execute on function public.remove_league_admin to authenticated;

-- Allow super_admin to select all profiles even if other policies overlap (already covered)
-- Ensure inactive leagues can be managed (already covered by leagues_super_admin_all)

-- ===== 0005_phase4_judging_tickets.sql =====
-- Phase 4: judging + staff ticketing helpers and tighter ticket visibility

-- League admins need to download team documents while reviewing
drop policy if exists "team_documents_select" on storage.objects;
create policy "team_documents_select"
  on storage.objects for select using (
    bucket_id = 'team-documents'
    and (
      public.is_super_admin()
      or public.current_user_role() = 'staff'
      or auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from documents d
        join teams t on t.id = d.team_id
        join league_admins la on la.league_id = t.league_id and la.user_id = auth.uid()
        where d.file_path = name
      )
    )
  );

-- Review team status (league admin / staff / super_admin)
create or replace function public.review_team(
  p_team_id uuid,
  p_status registration_status,
  p_rejection_reason text default null
)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('under_review', 'approved', 'rejected', 'waitlisted') then
    raise exception 'invalid review status';
  end if;

  select * into v_team from teams where id = p_team_id for update;
  if not found then
    raise exception 'team not found';
  end if;

  v_role := public.current_user_role();

  if not (
    public.is_super_admin()
    or v_role = 'staff'
    or exists (
      select 1 from league_admins la
      where la.league_id = v_team.league_id and la.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  -- Staff may only do initial triage to under_review
  if v_role = 'staff' and not public.is_super_admin() then
    if p_status <> 'under_review' then
      raise exception 'staff can only mark under_review';
    end if;
  end if;

  update teams
  set
    status = p_status,
    rejection_reason = case
      when p_status = 'rejected' then p_rejection_reason
      else null
    end,
    reviewed_at = now(),
    reviewed_by = v_uid
  where id = p_team_id
  returning * into v_team;

  return v_team;
end;
$$;

revoke all on function public.review_team from public;
grant execute on function public.review_team to authenticated;

-- Create ticket (captain/company)
create or replace function public.create_ticket(
  p_team_id uuid,
  p_subject text,
  p_body text,
  p_league_id uuid default null
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_ticket tickets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if not (
    public.is_super_admin()
    or v_team.captain_id = v_uid
    or exists (
      select 1 from company_members cm
      where cm.company_id = v_team.company_id and cm.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  insert into tickets (team_id, league_id, subject, status)
  values (
    p_team_id,
    p_league_id, -- null = general (staff queue)
    trim(p_subject),
    'open'
  )
  returning * into v_ticket;

  insert into ticket_messages (ticket_id, sender_id, body)
  values (v_ticket.id, v_uid, trim(p_body));

  return v_ticket;
end;
$$;

revoke all on function public.create_ticket from public;
grant execute on function public.create_ticket to authenticated;

-- Staff refers a general ticket to a league (and optional league admin)
create or replace function public.refer_ticket(
  p_ticket_id uuid,
  p_league_id uuid,
  p_assigned_to uuid default null
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.current_user_role();
  if not (public.is_super_admin() or v_role = 'staff') then
    raise exception 'forbidden';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found';
  end if;

  if v_ticket.league_id is not null and not public.is_super_admin() then
    raise exception 'ticket already referred';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  if p_assigned_to is not null then
    if not exists (
      select 1 from league_admins la
      where la.league_id = p_league_id and la.user_id = p_assigned_to
    ) and not public.is_super_admin() then
      raise exception 'assignee is not a league admin for this league';
    end if;
  end if;

  update tickets
  set
    league_id = p_league_id,
    assigned_to = p_assigned_to,
    status = case when status = 'closed' then status else 'open' end
  where id = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

revoke all on function public.refer_ticket from public;
grant execute on function public.refer_ticket to authenticated;

create or replace function public.reply_ticket(
  p_ticket_id uuid,
  p_body text,
  p_mark_answered boolean default true
)
returns ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
  v_msg ticket_messages%rowtype;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found';
  end if;

  -- Same visibility rules as tickets_select
  v_allowed :=
    public.is_super_admin()
    or v_ticket.assigned_to = v_uid
    or exists (
      select 1 from teams t
      where t.id = v_ticket.team_id
        and (
          t.captain_id = v_uid
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = v_uid
          )
        )
    )
    or (
      v_ticket.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      v_ticket.league_id is not null
      and v_ticket.assigned_to is null
      and exists (
        select 1 from league_admins la
        where la.league_id = v_ticket.league_id and la.user_id = v_uid
      )
    );

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  insert into ticket_messages (ticket_id, sender_id, body)
  values (p_ticket_id, v_uid, trim(p_body))
  returning * into v_msg;

  if p_mark_answered and public.current_user_role() in ('staff', 'league_admin', 'super_admin') then
    update tickets set status = 'answered' where id = p_ticket_id and status = 'open';
  end if;

  return v_msg;
end;
$$;

revoke all on function public.reply_ticket from public;
grant execute on function public.reply_ticket to authenticated;

-- Tighten tickets_select: after referral with assignee, only that admin (+ owners + super_admin)
drop policy if exists "tickets_select" on tickets;
create policy "tickets_select"
  on tickets for select using (
    public.is_super_admin()
    or assigned_to = auth.uid()
    or exists (
      select 1 from teams t
      where t.id = tickets.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
        )
    )
    or (
      tickets.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      tickets.league_id is not null
      and tickets.assigned_to is null
      and exists (
        select 1 from league_admins la
        where la.league_id = tickets.league_id and la.user_id = auth.uid()
      )
    )
  );

-- Align ticket message visibility with tickets_select
drop policy if exists "ticket_messages_select" on ticket_messages;
create policy "ticket_messages_select"
  on ticket_messages for select using (
    exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          public.is_super_admin()
          or tk.assigned_to = auth.uid()
          or exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or (
            tk.league_id is null
            and public.current_user_role() = 'staff'
          )
          or (
            tk.league_id is not null
            and tk.assigned_to is null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "ticket_messages_insert" on ticket_messages;
create policy "ticket_messages_insert"
  on ticket_messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          public.is_super_admin()
          or tk.assigned_to = auth.uid()
          or exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or (
            tk.league_id is null
            and public.current_user_role() = 'staff'
          )
          or (
            tk.league_id is not null
            and tk.assigned_to is null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

-- Upsert result for a team
create or replace function public.upsert_team_result(
  p_team_id uuid,
  p_season_year integer,
  p_rank integer default null,
  p_score numeric default null,
  p_notes text default null,
  p_publish boolean default false
)
returns results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_row results%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = v_team.league_id and la.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_row
  from results
  where team_id = p_team_id and season_year = p_season_year
  limit 1;

  if found then
    update results
    set
      rank = p_rank,
      score = p_score,
      notes = p_notes,
      published_at = case when p_publish then coalesce(published_at, now()) else published_at end
    where id = v_row.id
    returning * into v_row;
  else
    insert into results (
      league_id, team_id, company_id, season_year, rank, score, notes, published_at
    ) values (
      v_team.league_id,
      v_team.id,
      v_team.company_id,
      p_season_year,
      p_rank,
      p_score,
      p_notes,
      case when p_publish then now() else null end
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_team_result from public;
grant execute on function public.upsert_team_result to authenticated;

-- ===== 0006_phase5_notifications.sql =====
-- Phase 5: SMS notifications with idempotent notification_log

alter table notification_log
  add column if not exists idempotency_key text,
  add column if not exists phone text,
  add column if not exists error_message text,
  add column if not exists meta jsonb default '{}'::jsonb,
  add column if not exists provider_message_id text,
  add column if not exists created_at timestamptz default now();

update notification_log
set idempotency_key = coalesce(idempotency_key, id::text)
where idempotency_key is null;

alter table notification_log
  alter column idempotency_key set not null;

create unique index if not exists notification_log_idempotency_key_uidx
  on notification_log (idempotency_key);

create index if not exists notification_log_status_created_idx
  on notification_log (status, created_at asc);

create or replace function public.claim_notification(
  p_idempotency_key text,
  p_team_id uuid,
  p_template_key text,
  p_phone text,
  p_channel text default 'sms',
  p_meta jsonb default '{}'::jsonb
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  select * into v_row
  from notification_log
  where idempotency_key = p_idempotency_key;

  if found then
    return v_row;
  end if;

  begin
    insert into notification_log (
      team_id,
      channel,
      template_key,
      status,
      idempotency_key,
      phone,
      meta
    ) values (
      p_team_id,
      p_channel,
      p_template_key,
      'pending',
      p_idempotency_key,
      p_phone,
      coalesce(p_meta, '{}'::jsonb)
    )
    returning * into v_row;
  exception
    when unique_violation then
      select * into v_row
      from notification_log
      where idempotency_key = p_idempotency_key;
  end;

  return v_row;
end;
$$;

revoke all on function public.claim_notification from public;
grant execute on function public.claim_notification to service_role;

create or replace function public.finalize_notification(
  p_idempotency_key text,
  p_success boolean,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  update notification_log
  set
    status = case when p_success then 'sent' else 'failed' end,
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    error_message = case when p_success then null else coalesce(p_error_message, error_message) end,
    sent_at = now()
  where idempotency_key = p_idempotency_key
  returning * into v_row;

  if not found then
    raise exception 'notification not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.finalize_notification from public;
grant execute on function public.finalize_notification to service_role;

create or replace function public.enqueue_team_sms(
  p_team_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_team teams%rowtype;
begin
  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  select phone into v_phone from profiles where id = v_team.captain_id;

  return public.claim_notification(
    p_idempotency_key,
    p_team_id,
    p_template_key,
    coalesce(v_phone, ''),
    'sms',
    case
      when v_phone is null or length(trim(v_phone)) < 8 then
        coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('skip', 'missing_phone')
      else
        coalesce(p_meta, '{}'::jsonb)
    end
  );
end;
$$;

revoke all on function public.enqueue_team_sms from public;
grant execute on function public.enqueue_team_sms to service_role;

create or replace function public.trg_teams_status_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template text;
  v_key text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_template := case new.status
      when 'submitted' then 'registration_submitted'
      when 'approved' then 'registration_approved'
      when 'rejected' then 'registration_rejected'
      when 'waitlisted' then 'registration_waitlisted'
      else null
    end;

    if v_template is not null then
      v_key := 'team:' || new.id::text || ':status:' || new.status::text;
      perform public.enqueue_team_sms(
        new.id,
        v_template,
        v_key,
        jsonb_build_object(
          'status', new.status,
          'league_id', new.league_id,
          'rejection_reason', new.rejection_reason
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_team_status_notify on teams;
create trigger on_team_status_notify
  after update of status on teams
  for each row execute function public.trg_teams_status_notify();

create or replace function public.trg_invoice_paid_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and old.status is distinct from 'paid' then
    perform public.enqueue_team_sms(
      new.team_id,
      'payment_confirmed',
      'invoice:' || new.id::text || ':paid',
      jsonb_build_object(
        'invoice_id', new.id,
        'amount', new.amount,
        'invoice_number', new.invoice_number
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_paid_notify on invoices;
create trigger on_invoice_paid_notify
  after update of status on invoices
  for each row execute function public.trg_invoice_paid_notify();

create or replace function public.trg_result_published_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null) then
    perform public.enqueue_team_sms(
      new.team_id,
      'result_announced',
      'team:' || new.team_id::text || ':result:' || new.season_year::text || ':published',
      jsonb_build_object(
        'season_year', new.season_year,
        'rank', new.rank,
        'score', new.score,
        'league_id', new.league_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_result_published_notify on results;
create trigger on_result_published_notify
  after insert or update of published_at on results
  for each row execute function public.trg_result_published_notify();

create or replace function public.enqueue_registration_deadline_reminders(
  p_hours_before integer default 48
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
  v_key text;
  v_close_date text;
begin
  for r in
    select t.id as team_id, t.league_id, l.registration_close_at
    from teams t
    join leagues l on l.id = t.league_id
    where t.status = 'draft'
      and l.is_active = true
      and l.registration_close_at is not null
      and l.registration_close_at > now()
      and l.registration_close_at <= now() + make_interval(hours => p_hours_before)
  loop
    v_close_date := to_char(timezone('UTC', r.registration_close_at), 'YYYY-MM-DD');
    v_key := 'team:' || r.team_id::text || ':deadline:' || r.league_id::text || ':' || v_close_date;
    perform public.enqueue_team_sms(
      r.team_id,
      'registration_deadline_reminder',
      v_key,
      jsonb_build_object(
        'league_id', r.league_id,
        'registration_close_at', r.registration_close_at
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_registration_deadline_reminders from public;
grant execute on function public.enqueue_registration_deadline_reminders to service_role;

create or replace function public.list_pending_notifications(p_limit integer default 50)
returns setof notification_log
language sql
security definer
set search_path = public
as $$
  select *
  from notification_log
  where status = 'pending'
  order by created_at asc nulls first
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_pending_notifications from public;
grant execute on function public.list_pending_notifications to service_role;

-- Atomic claim for dispatch workers (prevents double SMS under concurrent invokes)
create or replace function public.claim_notification_for_send(p_idempotency_key text)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  update notification_log
  set status = 'sending'
  where idempotency_key = p_idempotency_key
    and status = 'pending'
  returning * into v_row;

  if not found then
    select * into v_row
    from notification_log
    where idempotency_key = p_idempotency_key;
  end if;

  return v_row;
end;
$$;

revoke all on function public.claim_notification_for_send from public;
grant execute on function public.claim_notification_for_send to service_role;

drop policy if exists "notification_log_insert_service" on notification_log;
create policy "notification_log_insert_service"
  on notification_log for insert with check (public.is_super_admin());

drop policy if exists "notification_log_update_super_admin" on notification_log;
create policy "notification_log_update_super_admin"
  on notification_log for update using (public.is_super_admin());

-- ===== 0007_phase6_realtime_tickets.sql =====
-- Phase 6: Realtime ticketing + unread receipts

create table if not exists ticket_reads (
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table ticket_reads enable row level security;

create policy "ticket_reads_select_own"
  on ticket_reads for select using (
    user_id = auth.uid() or public.is_super_admin()
  );

create policy "ticket_reads_upsert_own"
  on ticket_reads for all using (
    user_id = auth.uid()
  )
  with check (
    user_id = auth.uid()
  );

create or replace function public.mark_ticket_read(p_ticket_id uuid)
returns ticket_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row ticket_reads%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- must be allowed to see the ticket (reuse tickets_select logic via exists)
  if not exists (
    select 1 from tickets tk
    where tk.id = p_ticket_id
      and (
        public.is_super_admin()
        or tk.assigned_to = v_uid
        or exists (
          select 1 from teams t
          where t.id = tk.team_id
            and (
              t.captain_id = v_uid
              or exists (
                select 1 from company_members cm
                where cm.company_id = t.company_id and cm.user_id = v_uid
              )
            )
        )
        or (
          tk.league_id is null
          and public.current_user_role() = 'staff'
        )
        or (
          tk.league_id is not null
          and tk.assigned_to is null
          and exists (
            select 1 from league_admins la
            where la.league_id = tk.league_id and la.user_id = v_uid
          )
        )
      )
  ) then
    raise exception 'forbidden';
  end if;

  insert into ticket_reads (ticket_id, user_id, last_read_at)
  values (p_ticket_id, v_uid, now())
  on conflict (ticket_id, user_id)
  do update set last_read_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.mark_ticket_read from public;
grant execute on function public.mark_ticket_read to authenticated;

-- Count tickets with at least one unread message for current user
create or replace function public.count_unread_tickets()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select tk.id
    from tickets tk
    where
      public.is_super_admin()
      or tk.assigned_to = auth.uid()
      or exists (
        select 1 from teams t
        where t.id = tk.team_id
          and (
            t.captain_id = auth.uid()
            or exists (
              select 1 from company_members cm
              where cm.company_id = t.company_id and cm.user_id = auth.uid()
            )
          )
      )
      or (
        tk.league_id is null
        and public.current_user_role() = 'staff'
      )
      or (
        tk.league_id is not null
        and tk.assigned_to is null
        and exists (
          select 1 from league_admins la
          where la.league_id = tk.league_id and la.user_id = auth.uid()
        )
      )
  )
  select count(*)::integer
  from visible v
  where exists (
    select 1
    from ticket_messages tm
    left join ticket_reads tr
      on tr.ticket_id = v.id and tr.user_id = auth.uid()
    where tm.ticket_id = v.id
      and tm.sender_id is distinct from auth.uid()
      and tm.created_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
  );
$$;

revoke all on function public.count_unread_tickets from public;
grant execute on function public.count_unread_tickets to authenticated;

create or replace function public.list_unread_ticket_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select tk.id
    from tickets tk
    where
      public.is_super_admin()
      or tk.assigned_to = auth.uid()
      or exists (
        select 1 from teams t
        where t.id = tk.team_id
          and (
            t.captain_id = auth.uid()
            or exists (
              select 1 from company_members cm
              where cm.company_id = t.company_id and cm.user_id = auth.uid()
            )
          )
      )
      or (
        tk.league_id is null
        and public.current_user_role() = 'staff'
      )
      or (
        tk.league_id is not null
        and tk.assigned_to is null
        and exists (
          select 1 from league_admins la
          where la.league_id = tk.league_id and la.user_id = auth.uid()
        )
      )
  )
  select v.id
  from visible v
  where exists (
    select 1
    from ticket_messages tm
    left join ticket_reads tr
      on tr.ticket_id = v.id and tr.user_id = auth.uid()
    where tm.ticket_id = v.id
      and tm.sender_id is distinct from auth.uid()
      and tm.created_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
  );
$$;

revoke all on function public.list_unread_ticket_ids from public;
grant execute on function public.list_unread_ticket_ids to authenticated;

-- Enable Realtime for chat tables (ignore if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table ticket_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table tickets;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table ticket_reads;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- Replica identity full helps filtered realtime (optional but useful)
alter table ticket_messages replica identity full;
alter table tickets replica identity full;
alter table ticket_reads replica identity full;

-- ===== 0008_phase7_public_rankings.sql =====
-- Phase 7: public visibility for teams shown in rankings / company profiles

-- Anonymous visitors need to read team names joined from published results,
-- and approved teams on public company profiles.
create policy "teams_public_archive_select"
  on teams for select using (
    status = 'approved'
    or exists (
      select 1
      from results r
      where r.team_id = teams.id
        and r.published_at is not null
    )
  );

-- Helpful view for company championship rollup (optional consumption)
create or replace view public.company_podium_results
with (security_invoker = true)
as
select
  r.*,
  t.name as team_name,
  c.name as company_name,
  c.slug as company_slug,
  l.name as league_name
from results r
join teams t on t.id = r.team_id
join companies c on c.id = r.company_id
join leagues l on l.id = r.league_id
where r.published_at is not null
  and r.rank is not null
  and r.rank <= 3;

-- ===== 0009_phase8_content.sql =====
-- Phase 8: content media storage for blog covers & gallery

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

create policy "content_media_public_select"
  on storage.objects for select using (bucket_id = 'content-media');

create policy "content_media_super_admin_insert"
  on storage.objects for insert with check (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

create policy "content_media_super_admin_update"
  on storage.objects for update using (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

create policy "content_media_super_admin_delete"
  on storage.objects for delete using (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

-- ===== 0010_phase9_home.sql =====
-- Phase 9: home stats RPC + contact form inbox

create or replace function public.home_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'teams', (
      select count(*)::int
      from teams
      where status in ('submitted', 'under_review', 'approved', 'waitlisted')
    ),
    'cities', (
      select count(distinct city)::int
      from teams
      where city is not null and btrim(city) <> ''
    ),
    'leagues', (
      select count(*)::int from leagues where is_active = true
    ),
    'seasons', (
      select coalesce(count(distinct season_year), 0)::int
      from results
      where published_at is not null
    )
  );
$$;

revoke all on function public.home_stats() from public;
grant execute on function public.home_stats() to anon, authenticated;

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

alter table contact_messages enable row level security;

drop policy if exists "contact_messages_insert_public" on contact_messages;
create policy "contact_messages_insert_public"
  on contact_messages for insert
  with check (true);

drop policy if exists "contact_messages_select_admin" on contact_messages;
create policy "contact_messages_select_admin"
  on contact_messages for select
  using (public.is_super_admin());

-- Sample active banners (gradient placeholders work without Storage)
insert into home_banners (title, subtitle, image_url, link_url, sort_order, is_active)
select * from (values
  (
    'جام تبرستان',
    'رقابت رباتیک، یک پلتفرم',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1600&q=80',
    '/leagues',
    0,
    true
  ),
  (
    'ثبت‌نام تیم‌ها',
    'لیگ‌ها باز است — از همین‌جا شروع کنید',
    'https://images.unsplash.com/photo-1518314916381-77a37c2a49ae?auto=format&fit=crop&w=1600&q=80',
    '/signup',
    1,
    true
  )
) as v(title, subtitle, image_url, link_url, sort_order, is_active)
where not exists (select 1 from home_banners limit 1);

-- ===== 0011_phase10_analytics_otp.sql =====
-- Phase 10: SMS OTP challenges + analytics + realtime for live dashboards

-- ============ OTP ============
create table if not exists auth_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_challenges_phone_created_idx
  on auth_otp_challenges (phone, created_at desc);

alter table auth_otp_challenges enable row level security;
-- no public policies: only service_role (bypass) / edge functions

-- ============ Analytics snapshot (super_admin only) ============
create or replace function public.analytics_snapshot()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select json_build_object(
    'generated_at', now(),
    'totals', json_build_object(
      'teams', (select count(*)::int from teams),
      'companies', (select count(*)::int from companies),
      'paid_invoices', (select count(*)::int from invoices where status = 'paid'),
      'paid_amount', (select coalesce(sum(amount), 0) from invoices where status = 'paid')
    ),
    'by_status', coalesce((
      select json_agg(json_build_object('key', status, 'count', cnt) order by cnt desc)
      from (
        select status::text as status, count(*)::int as cnt
        from teams
        group by status
      ) s
    ), '[]'::json),
    'by_league', coalesce((
      select json_agg(json_build_object('key', name, 'id', id, 'count', cnt) order by cnt desc)
      from (
        select l.id, l.name, count(t.id)::int as cnt
        from leagues l
        left join teams t on t.league_id = l.id
        where l.is_active = true
        group by l.id, l.name
      ) x
    ), '[]'::json),
    'by_province', coalesce((
      select json_agg(json_build_object('key', province, 'count', cnt) order by cnt desc)
      from (
        select coalesce(nullif(btrim(province), ''), '—') as province, count(*)::int as cnt
        from teams
        group by 1
        order by cnt desc
        limit 20
      ) p
    ), '[]'::json),
    'by_company', coalesce((
      select json_agg(json_build_object('key', name, 'id', id, 'slug', slug, 'count', cnt) order by cnt desc)
      from (
        select c.id, c.name, c.slug, count(t.id)::int as cnt
        from companies c
        left join teams t on t.company_id = c.id
        group by c.id, c.name, c.slug
        order by cnt desc
        limit 15
      ) c
    ), '[]'::json),
    'finance_by_status', coalesce((
      select json_agg(json_build_object('key', status, 'count', cnt, 'amount', amount) order by cnt desc)
      from (
        select status::text as status, count(*)::int as cnt, coalesce(sum(amount), 0) as amount
        from invoices
        group by status
      ) f
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.analytics_snapshot() from public;
grant execute on function public.analytics_snapshot() to authenticated;

-- Export rows for teams (+ finance) — super_admin
create or replace function public.analytics_export_teams()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select json_agg(row_to_json(r) order by r.created_at desc)
    from (
      select
        t.id,
        t.name as team_name,
        t.status::text as status,
        t.province,
        t.city,
        t.member_count,
        t.created_at,
        t.submitted_at,
        l.name as league_name,
        l.slug as league_slug,
        c.name as company_name,
        c.slug as company_slug,
        p.full_name as captain_name,
        p.phone as captain_phone,
        i.invoice_number,
        i.amount as invoice_amount,
        i.status::text as invoice_status,
        i.paid_at
      from teams t
      join leagues l on l.id = t.league_id
      join companies c on c.id = t.company_id
      left join profiles p on p.id = t.captain_id
      left join lateral (
        select inv.*
        from invoices inv
        where inv.team_id = t.id
        order by inv.created_at desc
        limit 1
      ) i on true
    ) r
  ), '[]'::json);
end;
$$;

revoke all on function public.analytics_export_teams() from public;
grant execute on function public.analytics_export_teams() to authenticated;

-- Realtime for live analytics refresh
do $$
begin
  begin
    alter publication supabase_realtime add table teams;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table invoices;
  exception when duplicate_object then null;
  end;
end $$;

-- ===== 0012_fix_company_members_rls.sql =====
-- Fix infinite recursion on company_members RLS
-- Run in Supabase SQL Editor

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.is_owner = true
  );
$$;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_owner(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;

drop policy if exists "company_members_select" on company_members;
drop policy if exists "company_members_manage" on company_members;

create policy "company_members_select"
  on company_members for select using (
    user_id = auth.uid()
    or public.is_company_member(company_id)
    or public.is_super_admin()
  );

create policy "company_members_manage"
  on company_members for all using (
    public.is_company_owner(company_id)
    or public.is_super_admin()
  )
  with check (
    public.is_company_owner(company_id)
    or public.is_super_admin()
    or user_id = auth.uid()
  );

-- Keep companies policies consistent (non-recursive via helpers)
drop policy if exists "companies_manage" on companies;
create policy "companies_manage"
  on companies for all using (
    public.is_company_member(id)
    or public.is_super_admin()
  )
  with check (
    public.is_company_member(id)
    or public.is_super_admin()
  );

-- ===== 0013_league_detail_pages.sql =====
-- Phase: full league public page + admin-managed content

alter table leagues
  add column if not exists short_description text,
  add column if not exists full_description text,
  add column if not exists hero_image_url text,
  add column if not exists hero_video_url text,
  add column if not exists intro_video_url text,
  add column if not exists regulation_pdf_url text,
  add column if not exists rules_summary text,
  add column if not exists rules_pdf_url text,
  add column if not exists age_range text,
  add column if not exists participation_mode text default 'team',
  add column if not exists team_size_min integer,
  add column if not exists team_size_max integer,
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz,
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists venue_map_embed_url text,
  add column if not exists difficulty_level text,
  add column if not exists competition_language text,
  add column if not exists scoring_rows jsonb not null default '[]'::jsonb,
  add column if not exists timeline_steps jsonb not null default '[]'::jsonb,
  add column if not exists day_schedule jsonb not null default '[]'::jsonb,
  add column if not exists allowed_equipment jsonb not null default '[]'::jsonb,
  add column if not exists forbidden_equipment jsonb not null default '[]'::jsonb,
  add column if not exists discount_info text,
  add column if not exists refund_policy text,
  add column if not exists show_registered_count boolean not null default true,
  add column if not exists period_override text,
  add column if not exists secretary_name text,
  add column if not exists secretary_phone text,
  add column if not exists secretary_telegram text,
  add column if not exists related_league_ids jsonb not null default '[]'::jsonb;

comment on column leagues.period_override is 'upcoming | open | ongoing | ended | null=auto';
comment on column leagues.participation_mode is 'team | individual';

create table if not exists league_files (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  title text not null,
  file_url text not null,
  file_kind text not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists league_people (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  full_name text not null,
  photo_url text,
  specialty text,
  bio text,
  role_kind text not null default 'judge',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists league_sponsors (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  name text not null,
  logo_url text,
  website_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists league_faqs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  question text not null,
  answer text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists league_past_results (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  season_year integer not null,
  first_place text,
  second_place text,
  third_place text,
  created_at timestamptz not null default now(),
  unique (league_id, season_year)
);

create index if not exists league_files_league_idx on league_files (league_id, sort_order);
create index if not exists league_people_league_idx on league_people (league_id, role_kind, sort_order);
create index if not exists league_sponsors_league_idx on league_sponsors (league_id, sort_order);
create index if not exists league_faqs_league_idx on league_faqs (league_id, sort_order);
create index if not exists league_past_results_league_idx on league_past_results (league_id, season_year desc);

alter table league_files enable row level security;
alter table league_people enable row level security;
alter table league_sponsors enable row level security;
alter table league_faqs enable row level security;
alter table league_past_results enable row level security;

drop policy if exists "league_files_public_select" on league_files;
create policy "league_files_public_select" on league_files for select using (true);
drop policy if exists "league_files_admin" on league_files;
create policy "league_files_admin" on league_files for all using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "league_people_public_select" on league_people;
create policy "league_people_public_select" on league_people for select using (true);
drop policy if exists "league_people_admin" on league_people;
create policy "league_people_admin" on league_people for all using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "league_sponsors_public_select" on league_sponsors;
create policy "league_sponsors_public_select" on league_sponsors for select using (true);
drop policy if exists "league_sponsors_admin" on league_sponsors;
create policy "league_sponsors_admin" on league_sponsors for all using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "league_faqs_public_select" on league_faqs;
create policy "league_faqs_public_select" on league_faqs for select using (true);
drop policy if exists "league_faqs_admin" on league_faqs;
create policy "league_faqs_admin" on league_faqs for all using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "league_past_results_public_select" on league_past_results;
create policy "league_past_results_public_select" on league_past_results for select using (true);
drop policy if exists "league_past_results_admin" on league_past_results;
create policy "league_past_results_admin" on league_past_results for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- Public count of registered teams for a league
create or replace function public.league_registered_count(p_league_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from teams
  where league_id = p_league_id
    and status in ('submitted', 'under_review', 'approved', 'waitlisted');
$$;

revoke all on function public.league_registered_count(uuid) from public;
grant execute on function public.league_registered_count(uuid) to anon, authenticated;

-- ===== 0014_league_cover_and_demo.sql =====
-- Cover image column + rich demo content for league public pages

alter table leagues
  add column if not exists cover_image_url text;

-- Demo content for Rescue (and others if empty)
update leagues
set
  name = case slug
    when 'rescue' then 'لیگ امدادگر پیشرفته جام تبرستان 2027'
    when 'soccer' then 'لیگ فوتبال رباتیک'
    when 'humanoid' then 'لیگ ربات انسان‌نما'
    else name
  end,
  short_description = coalesce(nullif(short_description, ''), case slug
    when 'rescue' then 'رقابت طراحی و برنامه‌نویسی ربات‌های امدادگر برای دانش‌آموزان و دانشجویان.'
    when 'soccer' then 'مسابقه فوتبال ربات‌های خودران در زمین استاندارد.'
    when 'humanoid' then 'ربات‌های انسان‌نما در چالش‌های تعادل، راه رفتن و تعامل.'
    else short_description
  end),
  full_description = coalesce(nullif(full_description, ''), case slug
    when 'rescue' then
      E'هدف لیگ امدادگر آماده‌سازی تیم‌ها برای طراحی ربات‌هایی است که در محیط‌های آسیب‌دیده عملیات نجات انجام دهند.\n\nمهارت‌های مورد نیاز: الکترونیک، برنامه‌نویسی، بینایی ماشین، کار تیمی.\n\nاین لیگ برای دانش‌آموزان متوسطه و دانشجویان علاقه‌مند به رباتیک خدمتی مناسب است.'
    when 'soccer' then
      E'هدف: توسعه الگوریتم‌های تصمیم‌گیری و کنترل چندرباته در زمین فوتبال.\n\nمناسب تیم‌های دانشگاهی و مدارس پیشرفته.'
    when 'humanoid' then
      E'تمرکز روی مکانیک، حسگرها و کنترل تعادل برای ربات‌های انسان‌نما.'
    else full_description
  end),
  cover_image_url = coalesce(
    cover_image_url,
    case slug
      when 'rescue' then 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80'
      when 'soccer' then 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=80'
      when 'humanoid' then 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=1200&q=80'
      else cover_image_url
    end
  ),
  hero_image_url = coalesce(
    hero_image_url,
    case slug
      when 'rescue' then 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=1600&q=80'
      when 'soccer' then 'https://images.unsplash.com/photo-1561557944-6f2c0ec21d84?w=1600&q=80'
      when 'humanoid' then 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1600&q=80'
      else hero_image_url
    end
  ),
  age_range = coalesce(age_range, '۱۵ تا ۲۸ سال'),
  participation_mode = coalesce(participation_mode, 'team'),
  team_size_min = coalesce(team_size_min, 2),
  team_size_max = coalesce(team_size_max, 5),
  venue_name = coalesce(venue_name, 'سالن اصلی جام تبرستان'),
  venue_address = coalesce(venue_address, 'تهران، مرکز همایش‌های بین‌المللی'),
  difficulty_level = coalesce(difficulty_level, case slug when 'rescue' then 'پیشرفته' when 'soccer' then 'متوسط' else 'پیشرفته' end),
  competition_language = coalesce(competition_language, 'فارسی / English'),
  rules_summary = coalesce(nullif(rules_summary, ''), 'رعایت ایمنی ربات، زمان‌بندی مسابقه و قوانین داوری الزامی است. استفاده از تجهیزات ممنوع منجر به حذف می‌شود.'),
  discount_info = coalesce(nullif(discount_info, ''), 'تخفیف ۲۰٪ برای ثبت‌نام زودهنگام تا پایان مهلت اول.'),
  refund_policy = coalesce(nullif(refund_policy, ''), 'تا ۷ روز قبل از مسابقه امکان استرداد ۵۰٪ وجود دارد؛ پس از آن غیرقابل استرداد است.'),
  secretary_name = coalesce(secretary_name, 'دبیر لیگ'),
  secretary_phone = coalesce(secretary_phone, '02191000000'),
  contact_email = coalesce(contact_email, 'league@tabarestancup.ir'),
  secretary_telegram = coalesce(secretary_telegram, 'https://t.me/tabarestancup'),
  registration_open_at = coalesce(registration_open_at, now() - interval '7 days'),
  registration_close_at = coalesce(registration_close_at, now() + interval '45 days'),
  event_starts_at = coalesce(event_starts_at, now() + interval '60 days'),
  event_ends_at = coalesce(event_ends_at, now() + interval '62 days'),
  scoring_rows = case
    when jsonb_array_length(coalesce(scoring_rows, '[]'::jsonb)) = 0 then
      '[{"label":"عملکرد مأموریت","points":"40"},{"label":"پایداری و ایمنی","points":"25"},{"label":"نوآوری فنی","points":"20"},{"label":"مستندات","points":"15"}]'::jsonb
    else scoring_rows
  end,
  timeline_steps = case
    when jsonb_array_length(coalesce(timeline_steps, '[]'::jsonb)) = 0 then
      '[{"title":"ثبت‌نام","description":"تکمیل فرم و مدارک"},{"title":"تایید مدارک","description":"بررسی توسط کمیته"},{"title":"اعلام تیم‌ها","description":"انتشار فهرست نهایی"},{"title":"مسابقه","description":"رقابت اصلی"},{"title":"اختتامیه","description":"اعلام نتایج و جوایز"}]'::jsonb
    else timeline_steps
  end,
  day_schedule = case
    when jsonb_array_length(coalesce(day_schedule, '[]'::jsonb)) = 0 then
      '[{"time":"08:00","title":"ورود و چک‌این"},{"time":"09:30","title":"جلسه توجیهی"},{"time":"11:00","title":"دور مقدماتی"},{"time":"15:00","title":"نیمه‌نهایی"},{"time":"18:00","title":"فینال و اختتامیه"}]'::jsonb
    else day_schedule
  end,
  allowed_equipment = case
    when jsonb_array_length(coalesce(allowed_equipment, '[]'::jsonb)) = 0 then
      '["Arduino","ESP32","Lego EV3","Raspberry Pi","سنسورهای فاصله و دوربین"]'::jsonb
    else allowed_equipment
  end,
  forbidden_equipment = case
    when jsonb_array_length(coalesce(forbidden_equipment, '[]'::jsonb)) = 0 then
      '["سلاح گرم یا آتش‌زا","مواد شیمیایی خطرناک","تجهیزات رادیویی غیرمجاز"]'::jsonb
    else forbidden_equipment
  end,
  show_registered_count = coalesce(show_registered_count, true),
  is_active = true
where slug in ('rescue', 'soccer', 'humanoid');

-- Related leagues: link rescue ↔ soccer ↔ humanoid
update leagues l
set related_league_ids = coalesce((
  select jsonb_agg(o.id)
  from leagues o
  where o.slug in ('rescue', 'soccer', 'humanoid')
    and o.id <> l.id
), '[]'::jsonb)
where l.slug in ('rescue', 'soccer', 'humanoid')
  and jsonb_array_length(coalesce(l.related_league_ids, '[]'::jsonb)) = 0;

-- Files / people / sponsors / faqs / results for rescue (idempotent-ish)
insert into league_files (league_id, title, file_url, file_kind, sort_order)
select l.id, x.title, x.file_url, x.file_kind, x.sort_order
from leagues l
cross join (values
  ('آیین‌نامه', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'regulation', 1),
  ('نقشه زمین', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'field_map', 2),
  ('نمونه کد', 'https://github.com/', 'sample_code', 3),
  ('فرم رضایت', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'consent', 4),
  ('فرم معرفی تیم', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'team_form', 5)
) as x(title, file_url, file_kind, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_files f where f.league_id = l.id);

insert into league_people (league_id, full_name, photo_url, specialty, bio, role_kind, sort_order)
select l.id, x.full_name, x.photo_url, x.specialty, x.bio, x.role_kind, x.sort_order
from leagues l
cross join (values
  ('دکتر سارا احمدی', 'https://i.pravatar.cc/150?u=judge1', 'رباتیک سیار', 'داور بین‌المللی لیگ امداد', 'judge', 1),
  ('مهندس رضا کرمی', 'https://i.pravatar.cc/150?u=judge2', 'بینایی ماشین', '۱۴ سال تجربه داوری مسابقات ملی', 'judge', 2),
  ('مهندس نازنین مرادی', 'https://i.pravatar.cc/150?u=committee1', 'کمیته فنی', 'مسئول استاندارد زمین و تجهیزات', 'committee', 1),
  ('علی جعفری', 'https://i.pravatar.cc/150?u=committee2', 'هماهنگی فنی', 'پشتیبانی تیم‌ها در روز مسابقه', 'committee', 2)
) as x(full_name, photo_url, specialty, bio, role_kind, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_people p where p.league_id = l.id);

insert into league_sponsors (league_id, name, logo_url, website_url, sort_order)
select l.id, x.name, x.logo_url, x.website_url, x.sort_order
from leagues l
cross join (values
  ('TechNova', 'https://placehold.co/160x48/png?text=TechNova', 'https://example.com', 1),
  ('TechParts', 'https://placehold.co/160x48/png?text=TechParts', 'https://example.com', 2),
  ('IranAI', 'https://placehold.co/160x48/png?text=IranAI', 'https://example.com', 3)
) as x(name, logo_url, website_url, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_sponsors s where s.league_id = l.id);

insert into league_faqs (league_id, question, answer, sort_order)
select l.id, x.question, x.answer, x.sort_order
from leagues l
cross join (values
  ('آیا نیاز به تجربه قبلی هست؟', 'تجربه پایه الکترونیک و برنامه‌نویسی پیشنهاد می‌شود؛ کارگاه‌های آنلاین قبل از مسابقه برگزار می‌گردد.', 1),
  ('هزینه ثبت‌نام؟', 'طبق اعلام در صفحه لیگ؛ تخفیف زودهنگام اعمال می‌شود.', 2),
  ('چند نفر در تیم؟', 'حداقل ۲ و حداکثر ۵ نفر.', 3),
  ('اگر ربات خراب شود؟', 'تعمیر در محدوده فنی مجاز است؛ تأخیر بیش از حد طبق قوانین امتیاز منفی دارد.', 4)
) as x(question, answer, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_faqs f where f.league_id = l.id);

insert into league_past_results (league_id, season_year, first_place, second_place, third_place)
select l.id, x.season_year, x.first_place, x.second_place, x.third_place
from leagues l
cross join (values
  (2025, 'کاکتوس نجات', 'آذر رباتیک', 'پالس تیم'),
  (2024, 'آتش‌نشان هوشمند', 'کاکتوس نجات', 'ماسه ربات')
) as x(season_year, first_place, second_place, third_place)
where l.slug = 'rescue'
on conflict (league_id, season_year) do nothing;

-- Sample gallery + announcement for rescue
insert into gallery_items (media_url, media_type, league_id, season_year, caption)
select x.media_url, 'image', l.id, x.season_year, x.caption
from leagues l
cross join (values
  ('https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&q=80', 2025, 'دوره ۱۴۰۳ — فینال'),
  ('https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&q=80', 2024, 'دوره ۱۴۰۲ — تمرین'),
  ('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80', 2023, 'دوره ۱۴۰۱ — اختتامیه')
) as x(media_url, season_year, caption)
where l.slug = 'rescue'
  and not exists (
    select 1 from gallery_items g where g.league_id = l.id
  );

insert into announcements (title, body, league_id, status, published_at)
select
  'آغاز ثبت‌نام لیگ امدادگر',
  '<p>ثبت‌نام لیگ امدادگر پیشرفته از امروز باز است. آیین‌نامه را دانلود و مدارک را آماده کنید.</p>',
  l.id,
  'published',
  now()
from leagues l
where l.slug = 'rescue'
  and not exists (
    select 1 from announcements a where a.league_id = l.id and a.title = 'آغاز ثبت‌نام لیگ امدادگر'
  );

-- ===== 0015_content_seo_fields.sql =====
-- SEO + excerpt fields for blog posts and announcements

alter table blog_posts
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists og_image text,
  add column if not exists updated_at timestamptz default now();

alter table announcements
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists cover_image text,
  add column if not exists updated_at timestamptz default now();

-- ===== 0016_ticket_departments.sql =====
-- Ticket support departments (queues) + optional FK on tickets

create table if not exists ticket_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table tickets
  add column if not exists department_id uuid references ticket_departments(id) on delete set null;

create index if not exists tickets_department_id_idx on tickets(department_id);

alter table ticket_departments enable row level security;

drop policy if exists "ticket_departments_select_auth" on ticket_departments;
create policy "ticket_departments_select_auth"
  on ticket_departments for select
  to authenticated
  using (true);

drop policy if exists "ticket_departments_sa_write" on ticket_departments;
create policy "ticket_departments_sa_write"
  on ticket_departments for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into ticket_departments (name, slug, description, sort_order)
values
  ('عمومی', 'general', 'صف پشتیبانی عمومی', 1),
  ('فنی', 'technical', 'مسائل فنی و پلتفرم', 2),
  ('مالی', 'finance', 'پرداخت و فاکتور', 3)
on conflict (slug) do nothing;

create or replace function public.ticket_status_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('super_admin', 'staff', 'league_admin') then
    raise exception 'forbidden';
  end if;

  return (
    select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'answered', count(*) filter (where status = 'answered'),
      'closed', count(*) filter (where status = 'closed'),
      'total', count(*)
    )
    from tickets
  );
end;
$$;

revoke all on function public.ticket_status_counts from public;
grant execute on function public.ticket_status_counts to authenticated;

-- ===== 0017_static_pages_seo.sql =====
-- SEO + media fields for static pages

alter table static_pages
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists og_image text,
  add column if not exists cover_image text;

-- ===== 0018_site_settings.sql =====
-- Global site settings (single-row)

create table if not exists site_settings (
  id int primary key default 1 check (id = 1),
  site_name_fa text not null default 'جام تبرستان',
  site_name_en text not null default 'Tabarestan Cup',
  tagline_fa text default 'پلتفرم مسابقات رباتیک',
  tagline_en text default 'Robotics competition platform',
  logo_url text,
  favicon_url text,
  color_primary text default '#2498d8',
  color_accent text default '#25d366',
  seo_title_fa text,
  seo_title_en text,
  seo_description_fa text,
  seo_description_en text,
  og_image_default text,
  footer_fa text,
  footer_en text,
  contact_blurb_fa text,
  contact_blurb_en text,
  nav_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into site_settings (id) values (1)
on conflict (id) do nothing;

update site_settings
set nav_items = '[
  {"id":"home","href":"/","label_fa":"خانه","label_en":"Home","enabled":true,"order":1},
  {"id":"leagues","href":"/leagues","label_fa":"لیگ‌ها","label_en":"Leagues","enabled":true,"order":2},
  {"id":"rankings","href":"/rankings","label_fa":"رتبه‌بندی","label_en":"Rankings","enabled":true,"order":3},
  {"id":"companies","href":"/companies","label_fa":"شرکت‌ها","label_en":"Companies","enabled":true,"order":4},
  {"id":"blog","href":"/blog","label_fa":"بلاگ","label_en":"Blog","enabled":true,"order":5},
  {"id":"gallery","href":"/gallery","label_fa":"گالری","label_en":"Gallery","enabled":true,"order":6},
  {"id":"about","href":"/about","label_fa":"درباره","label_en":"About","enabled":true,"order":7}
]'::jsonb
where id = 1 and (nav_items is null or nav_items = '[]'::jsonb);

alter table site_settings enable row level security;

drop policy if exists "site_settings_public_select" on site_settings;
create policy "site_settings_public_select"
  on site_settings for select
  using (true);

drop policy if exists "site_settings_sa_write" on site_settings;
create policy "site_settings_sa_write"
  on site_settings for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ===== 0019_notify_signup_companies.sql =====
-- Notifications hub, signup activation, company cover, league judging path, registration docs

-- ── profiles: account type / activation ──────────────────────────────
alter table profiles
  add column if not exists account_type text not null default 'individual'
    check (account_type in ('individual', 'legal')),
  add column if not exists account_status text not null default 'active'
    check (account_status in ('pending', 'active', 'rejected', 'suspended')),
  add column if not exists national_id text,
  add column if not exists company_name text,
  add column if not exists company_national_id text,
  add column if not exists economic_code text,
  add column if not exists address text,
  add column if not exists activated_at timestamptz,
  add column if not exists rejection_reason text;

-- New signups should wait for activation (existing stay active)
-- (no bulk update)

-- ── companies cover ────────────────────────────────────────────────
alter table companies
  add column if not exists cover_image_url text,
  add column if not exists tagline text;

-- ── leagues: judging path / technical notes ────────────────────────
alter table leagues
  add column if not exists judging_path text,
  add column if not exists technical_committee_notes text;

-- ── SMS settings (single row) ──────────────────────────────────────
create table if not exists sms_settings (
  id int primary key default 1 check (id = 1),
  mock_mode boolean not null default true,
  originator text,
  api_key_hint text,
  pattern_codes jsonb not null default '{}'::jsonb,
  enable_account_approved boolean not null default true,
  enable_league_joined boolean not null default true,
  enable_results boolean not null default true,
  enable_incomplete_profile boolean not null default true,
  enable_account_issue boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into sms_settings (id) values (1) on conflict (id) do nothing;

alter table sms_settings enable row level security;
drop policy if exists "sms_settings_sa" on sms_settings;
create policy "sms_settings_sa" on sms_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "sms_settings_read_auth" on sms_settings;
create policy "sms_settings_read_auth" on sms_settings for select to authenticated using (true);

-- ── registration document requirements (signup) ────────────────────
create table if not exists registration_doc_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fa text not null,
  label_en text not null,
  account_type text not null default 'both'
    check (account_type in ('individual', 'legal', 'both')),
  is_required boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into registration_doc_types (code, label_fa, label_en, account_type, sort_order)
values
  ('national_card', 'تصویر کارت ملی', 'National ID card', 'individual', 1),
  ('selfie', 'سلفی با کارت ملی', 'Selfie with ID', 'individual', 2),
  ('company_registration', 'آگهی تأسیس / روزنامه رسمی', 'Company registration', 'legal', 1),
  ('company_national_id', 'شناسه ملی شرکت', 'Company national ID doc', 'legal', 2),
  ('authorization', 'معرفی‌نامه نماینده', 'Authorization letter', 'legal', 3)
on conflict (code) do nothing;

alter table registration_doc_types enable row level security;
drop policy if exists "reg_docs_public_select" on registration_doc_types;
create policy "reg_docs_public_select" on registration_doc_types for select using (is_active = true);
drop policy if exists "reg_docs_sa" on registration_doc_types;
create policy "reg_docs_sa" on registration_doc_types for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists profile_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  doc_type_id uuid not null references registration_doc_types(id) on delete restrict,
  file_url text not null,
  created_at timestamptz not null default now()
);

alter table profile_documents enable row level security;
drop policy if exists "profile_docs_own" on profile_documents;
create policy "profile_docs_own" on profile_documents for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- ── account issues ─────────────────────────────────────────────────
create table if not exists account_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table account_issues enable row level security;
drop policy if exists "account_issues_sa" on account_issues;
create policy "account_issues_sa" on account_issues for all to authenticated
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin());

-- ── in-app notifications ───────────────────────────────────────────
create table if not exists system_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all'
    check (audience in ('all', 'role', 'user')),
  target_role text,
  target_user_id uuid references profiles(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists system_notification_reads (
  notification_id uuid not null references system_notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table system_notifications enable row level security;
alter table system_notification_reads enable row level security;

drop policy if exists "sys_notif_select" on system_notifications;
create policy "sys_notif_select" on system_notifications for select to authenticated
  using (
    audience = 'all'
    or (audience = 'role' and target_role = (select role::text from profiles where id = auth.uid()))
    or (audience = 'user' and target_user_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "sys_notif_sa_write" on system_notifications;
create policy "sys_notif_sa_write" on system_notifications for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "sys_notif_reads" on system_notification_reads;
create policy "sys_notif_reads" on system_notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── site_settings: inactive account copy ───────────────────────────
alter table site_settings
  add column if not exists inactive_message_fa text
    default 'حساب کاربری شما هنوز فعال نشده است. تا زمان فعال‌سازی، دسترسی شما محدود است. فعال‌سازی از طریق پیامک انجام می‌شود. در صورت بروز مشکل با پشتیبانی تماس بگیرید.',
  add column if not exists inactive_message_en text
    default 'Your account is not active yet. Access stays limited until activation via SMS. Contact support if you need help.',
  add column if not exists support_phone text default '021-00000000';

-- ── enqueue broadcast SMS (manual) ─────────────────────────────────
create or replace function public.enqueue_broadcast_sms(
  p_template_key text,
  p_audience text,
  p_target_role text default null,
  p_target_user_id uuid default null,
  p_body_hint text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  for r in
    select id, phone from profiles
    where phone is not null and length(trim(phone)) > 5
      and (
        p_audience = 'all'
        or (p_audience = 'role' and role::text = p_target_role)
        or (p_audience = 'user' and id = p_target_user_id)
      )
  loop
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      p_template_key,
      r.phone,
      'pending',
      'broadcast:' || p_template_key || ':' || r.id::text || ':' || extract(epoch from now())::text,
      jsonb_build_object('hint', coalesce(p_body_hint, ''), 'user_id', r.id)
    )
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_broadcast_sms from public;
grant execute on function public.enqueue_broadcast_sms to authenticated;

-- Activate account + enqueue SMS
create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone into v_phone;

  if v_phone is not null then
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      'account_approved',
      v_phone,
      'pending',
      'account_approved:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    )
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.activate_user_account from public;
grant execute on function public.activate_user_account to authenticated;

-- ===== 0020_sms_flags_league_admin.sql =====
-- Respect sms_settings toggles, league_joined on paid registration,
-- always promote assign_league_admin role, incomplete-profile enqueue helper

-- ── assign league admin: always set role (except super_admin) ──────
create or replace function public.assign_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user not found';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  insert into league_admins (league_id, user_id)
  values (p_league_id, p_user_id)
  on conflict do nothing;

  update profiles
  set role = 'league_admin'
  where id = p_user_id
    and role is distinct from 'super_admin';
end;
$$;

-- ── gate template keys against sms_settings ─────────────────────────
create or replace function public.sms_template_enabled(p_template text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s sms_settings%rowtype;
begin
  select * into s from sms_settings where id = 1;
  if not found then
    return true;
  end if;

  return case p_template
    when 'account_approved' then s.enable_account_approved
    when 'league_joined' then s.enable_league_joined
    when 'result_announced' then s.enable_results
    when 'incomplete_profile' then s.enable_incomplete_profile
    when 'account_issue' then s.enable_account_issue
    -- legacy registration / payment templates follow related toggles
    when 'registration_submitted' then s.enable_league_joined
    when 'payment_confirmed' then s.enable_league_joined
    when 'registration_approved' then true
    when 'registration_rejected' then true
    when 'registration_waitlisted' then true
    else true
  end;
end;
$$;

revoke all on function public.sms_template_enabled from public;
grant execute on function public.sms_template_enabled to authenticated, service_role;

-- Wrap enqueue_team_sms to honor flags (preserve 0006 signature + claim_notification)
create or replace function public.enqueue_team_sms(
  p_team_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_team teams%rowtype;
begin
  if not public.sms_template_enabled(p_template_key) then
    return null;
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  select phone into v_phone from profiles where id = v_team.captain_id;

  return public.claim_notification(
    p_idempotency_key,
    p_team_id,
    p_template_key,
    coalesce(v_phone, ''),
    'sms',
    case
      when v_phone is null or length(trim(v_phone)) < 8 then
        coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('skip', 'missing_phone')
      else
        coalesce(p_meta, '{}'::jsonb)
    end
  );
end;
$$;

revoke all on function public.enqueue_team_sms from public;
grant execute on function public.enqueue_team_sms to service_role;

-- Also enqueue league_joined when payment confirms participation
create or replace function public.trg_invoice_paid_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and old.status is distinct from 'paid' then
    perform public.enqueue_team_sms(
      new.team_id,
      'payment_confirmed',
      'invoice:' || new.id::text || ':paid',
      jsonb_build_object(
        'invoice_id', new.id,
        'amount', new.amount,
        'invoice_number', new.invoice_number
      )
    );
    perform public.enqueue_team_sms(
      new.team_id,
      'league_joined',
      'invoice:' || new.id::text || ':league_joined',
      jsonb_build_object(
        'invoice_id', new.id,
        'team_id', new.team_id
      )
    );
  end if;
  return new;
end;
$$;

-- Gate activate / account_issue / broadcast inserts via helper used from activate RPC
create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone into v_phone;

  if v_phone is not null and public.sms_template_enabled('account_approved') then
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      'account_approved',
      v_phone,
      'pending',
      'account_approved:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    )
    on conflict do nothing;
  end if;
end;
$$;

-- Incomplete profile SMS for one user (callable from client when profile incomplete)
create or replace function public.enqueue_incomplete_profile_sms(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if auth.uid() is distinct from p_user_id and not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not public.sms_template_enabled('incomplete_profile') then
    return;
  end if;

  select phone into v_phone from profiles where id = p_user_id;
  if v_phone is null then
    return;
  end if;

  insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
  values (
    'sms',
    'incomplete_profile',
    v_phone,
    'pending',
    'incomplete_profile:' || p_user_id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
    jsonb_build_object('user_id', p_user_id)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.enqueue_incomplete_profile_sms from public;
grant execute on function public.enqueue_incomplete_profile_sms to authenticated;

-- ===== 0021_live_chat_sms_tickets.sql =====
-- Intentionally no-op: first attempt failed mid-file on reply_ticket revoke.
-- Full schema is applied in 0022_fix_reply_ticket_chat.sql
select 1;

-- ===== 0022_fix_reply_ticket_chat.sql =====
-- Fix reply_ticket overload ambiguity + ensure 0021 objects exist

drop function if exists public.reply_ticket(uuid, text, boolean);
drop function if exists public.reply_ticket(uuid, text, boolean, text, text, text, integer);
drop function if exists public.reply_ticket(uuid, text, boolean, text, text, text, int);

-- Re-apply core pieces from 0021 safely (IF NOT EXISTS / OR REPLACE)

alter table account_issues
  add column if not exists user_response text,
  add column if not exists user_responded_at timestamptz;

do $$
begin
  alter table account_issues drop constraint if exists account_issues_status_check;
exception when undefined_object then null;
end $$;

alter table account_issues
  drop constraint if exists account_issues_status_check;

alter table account_issues
  add constraint account_issues_status_check
  check (status in ('open', 'awaiting_review', 'resolved'));

drop policy if exists "account_issues_user_update" on account_issues;
create policy "account_issues_user_update" on account_issues
  for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create or replace function public.respond_account_issue(
  p_issue_id uuid,
  p_response text
)
returns account_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row account_issues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update account_issues
  set
    user_response = trim(p_response),
    user_responded_at = now(),
    status = 'awaiting_review'
  where id = p_issue_id
    and user_id = auth.uid()
    and status in ('open', 'awaiting_review')
  returning * into v_row;

  if not found then
    raise exception 'issue not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.respond_account_issue(uuid, text) from public;
grant execute on function public.respond_account_issue(uuid, text) to authenticated;

create or replace function public.resolve_account_issue(p_issue_id uuid)
returns account_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row account_issues%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update account_issues
  set status = 'resolved', resolved_at = now()
  where id = p_issue_id
  returning * into v_row;

  if not found then
    raise exception 'issue not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.resolve_account_issue(uuid) from public;
grant execute on function public.resolve_account_issue(uuid) to authenticated;

alter table sms_settings
  add column if not exists provider text not null default 'ippanel',
  add column if not exists kavenegar_sender text,
  add column if not exists kavenegar_api_key_hint text;

do $$
begin
  alter table sms_settings drop constraint if exists sms_settings_provider_check;
exception when undefined_object then null;
end $$;

alter table sms_settings drop constraint if exists sms_settings_provider_check;
alter table sms_settings
  add constraint sms_settings_provider_check
  check (provider in ('ippanel', 'kavenegar'));

alter table site_settings
  add column if not exists business_hours jsonb not null default '{
    "timezone":"Asia/Tehran",
    "days":{
      "sat":{"open":"09:00","close":"18:00"},
      "sun":{"open":"09:00","close":"18:00"},
      "mon":{"open":"09:00","close":"18:00"},
      "tue":{"open":"09:00","close":"18:00"},
      "wed":{"open":"09:00","close":"18:00"},
      "thu":{"open":"09:00","close":"14:00"},
      "fri":null
    }
  }'::jsonb,
  add column if not exists chat_enabled boolean not null default true,
  add column if not exists agents_online boolean not null default true,
  add column if not exists chat_welcome_fa text
    default 'سلام! خوش آمدید. نام و شماره موبایل خود را وارد کنید تا پشتیبانی پاسخ دهد.',
  add column if not exists chat_welcome_en text
    default 'Welcome! Enter your name and mobile so support can reply.',
  add column if not exists chat_away_fa text
    default 'در حال حاضر کارشناس آنلاین نیست. پیام شما ثبت شد و به‌زودی پاسخ داده می‌شود.',
  add column if not exists chat_away_en text
    default 'No agent is online right now. Your message was saved and we will reply soon.',
  add column if not exists chat_offline_fa text
    default 'خارج از ساعت کاری هستیم. پیام شما ثبت شد و در اولین فرصت پاسخ داده می‌شود.',
  add column if not exists chat_offline_en text
    default 'We are outside business hours. Your message was saved for the next shift.';

create table if not exists live_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_phone text not null,
  session_token text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_chat_sessions(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('guest', 'agent', 'system')),
  sender_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists live_chat_sessions_last_idx on live_chat_sessions (last_message_at desc);
create index if not exists live_chat_messages_session_idx on live_chat_messages (session_id, created_at);

alter table live_chat_sessions enable row level security;
alter table live_chat_messages enable row level security;

drop policy if exists "live_chat_sessions_staff" on live_chat_sessions;
create policy "live_chat_sessions_staff" on live_chat_sessions for all to authenticated
  using (public.is_super_admin() or public.current_user_role() = 'staff')
  with check (public.is_super_admin() or public.current_user_role() = 'staff');

drop policy if exists "live_chat_messages_staff" on live_chat_messages;
create policy "live_chat_messages_staff" on live_chat_messages for all to authenticated
  using (public.is_super_admin() or public.current_user_role() = 'staff')
  with check (public.is_super_admin() or public.current_user_role() = 'staff');

create or replace function public._chat_is_business_hours()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s site_settings%rowtype;
  bh jsonb;
  day_key text;
  slot jsonb;
  now_local time;
  open_t time;
  close_t time;
  dow int;
  tz text;
begin
  select * into s from site_settings where id = 1;
  if not found then
    return true;
  end if;
  bh := coalesce(s.business_hours, '{}'::jsonb);
  tz := coalesce(bh->>'timezone', 'Asia/Tehran');
  dow := extract(dow from timezone(tz, now()))::int;
  day_key := case dow
    when 0 then 'sun'
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
  end;
  slot := bh->'days'->day_key;
  if slot is null or slot = 'null'::jsonb then
    return false;
  end if;
  open_t := (slot->>'open')::time;
  close_t := (slot->>'close')::time;
  now_local := timezone(tz, now())::time;
  return now_local >= open_t and now_local <= close_t;
end;
$$;

create or replace function public.start_live_chat(
  p_name text,
  p_phone text,
  p_locale text default 'fa'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s site_settings%rowtype;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_session live_chat_sessions%rowtype;
  v_system text;
  v_mode text := 'online';
  v_welcome text;
begin
  select * into s from site_settings where id = 1;
  if not found or coalesce(s.chat_enabled, true) = false then
    raise exception 'chat_disabled';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'invalid_name';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_phone';
  end if;

  insert into live_chat_sessions (guest_name, guest_phone, session_token)
  values (trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), v_token)
  returning * into v_session;

  v_welcome := case when p_locale like 'en%' then s.chat_welcome_en else s.chat_welcome_fa end;
  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'system', coalesce(v_welcome, 'Welcome'));

  if not public._chat_is_business_hours() then
    v_mode := 'offline';
    v_system := case when p_locale like 'en%' then s.chat_offline_en else s.chat_offline_fa end;
  elsif coalesce(s.agents_online, true) = false then
    v_mode := 'away';
    v_system := case when p_locale like 'en%' then s.chat_away_en else s.chat_away_fa end;
  end if;

  if v_system is not null then
    insert into live_chat_messages (session_id, sender_kind, body)
    values (v_session.id, 'system', v_system);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_token,
    'mode', v_mode,
    'guest_name', v_session.guest_name,
    'guest_phone', v_session.guest_phone
  );
end;
$$;

revoke all on function public.start_live_chat(text, text, text) from public;
grant execute on function public.start_live_chat(text, text, text) to anon, authenticated;

create or replace function public.send_live_chat_guest_message(
  p_token text,
  p_body text
)
returns live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session live_chat_sessions%rowtype;
  v_msg live_chat_messages%rowtype;
begin
  select * into v_session from live_chat_sessions where session_token = p_token for update;
  if not found or v_session.status <> 'open' then
    raise exception 'session_not_found';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then
    raise exception 'empty_body';
  end if;

  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'guest', trim(p_body))
  returning * into v_msg;

  update live_chat_sessions set last_message_at = now() where id = v_session.id;
  return v_msg;
end;
$$;

revoke all on function public.send_live_chat_guest_message(text, text) from public;
grant execute on function public.send_live_chat_guest_message(text, text) to anon, authenticated;

create or replace function public.fetch_live_chat_guest_messages(p_token text)
returns setof live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from live_chat_sessions where session_token = p_token) then
    raise exception 'session_not_found';
  end if;
  return query
    select m.*
    from live_chat_messages m
    join live_chat_sessions s on s.id = m.session_id
    where s.session_token = p_token
    order by m.created_at asc;
end;
$$;

revoke all on function public.fetch_live_chat_guest_messages(text) from public;
grant execute on function public.fetch_live_chat_guest_messages(text) to anon, authenticated;

create or replace function public.reply_live_chat_agent(
  p_session_id uuid,
  p_body text
)
returns live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_msg live_chat_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not (public.is_super_admin() or public.current_user_role() = 'staff') then
    raise exception 'forbidden';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then
    raise exception 'empty_body';
  end if;

  insert into live_chat_messages (session_id, sender_kind, sender_id, body)
  values (p_session_id, 'agent', v_uid, trim(p_body))
  returning * into v_msg;

  update live_chat_sessions
  set last_message_at = now(),
      assigned_to = coalesce(assigned_to, v_uid)
  where id = p_session_id;

  return v_msg;
end;
$$;

revoke all on function public.reply_live_chat_agent(uuid, text) from public;
grant execute on function public.reply_live_chat_agent(uuid, text) to authenticated;

create or replace function public.close_live_chat_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_super_admin() or public.current_user_role() = 'staff') then
    raise exception 'forbidden';
  end if;
  update live_chat_sessions set status = 'closed' where id = p_session_id;
end;
$$;

revoke all on function public.close_live_chat_session(uuid) from public;
grant execute on function public.close_live_chat_session(uuid) to authenticated;

alter table ticket_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size int;

create or replace function public.reply_ticket(
  p_ticket_id uuid,
  p_body text,
  p_mark_answered boolean default true,
  p_attachment_url text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null,
  p_attachment_size int default null
)
returns ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
  v_msg ticket_messages%rowtype;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found';
  end if;

  v_allowed :=
    public.is_super_admin()
    or v_ticket.assigned_to = v_uid
    or exists (
      select 1 from teams t
      where t.id = v_ticket.team_id
        and (
          t.captain_id = v_uid
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = v_uid
          )
        )
    )
    or (
      v_ticket.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      v_ticket.league_id is not null
      and exists (
        select 1 from league_admins la
        where la.league_id = v_ticket.league_id and la.user_id = v_uid
      )
    );

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  if length(trim(coalesce(p_body, ''))) < 1 and p_attachment_url is null then
    raise exception 'empty_body';
  end if;

  insert into ticket_messages (
    ticket_id, sender_id, body,
    attachment_url, attachment_name, attachment_mime, attachment_size
  )
  values (
    p_ticket_id,
    v_uid,
    coalesce(nullif(trim(p_body), ''), '📎'),
    p_attachment_url,
    p_attachment_name,
    p_attachment_mime,
    p_attachment_size
  )
  returning * into v_msg;

  if p_mark_answered and public.current_user_role() in ('staff', 'league_admin', 'super_admin') then
    update tickets set status = 'answered' where id = p_ticket_id and status <> 'closed';
  elsif v_ticket.status = 'answered' then
    update tickets set status = 'open' where id = p_ticket_id;
  end if;

  return v_msg;
end;
$$;

revoke all on function public.reply_ticket(uuid, text, boolean, text, text, text, int) from public;
grant execute on function public.reply_ticket(uuid, text, boolean, text, text, text, int) to authenticated;

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

drop policy if exists "ticket_att_upload" on storage.objects;
create policy "ticket_att_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ticket_att_select" on storage.objects;
create policy "ticket_att_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-attachments');

drop policy if exists "ticket_att_delete" on storage.objects;
create policy "ticket_att_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

do $$
begin
  begin
    alter publication supabase_realtime add table live_chat_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table live_chat_sessions;
  exception when duplicate_object then null;
  end;
end $$;

-- ===== 0023_fix_chat_token_footer.sql =====
-- Fix gen_random_bytes (pgcrypto often lives in extensions schema)
-- Enrich public footer fields

create extension if not exists pgcrypto with schema extensions;

create or replace function public.start_live_chat(
  p_name text,
  p_phone text,
  p_locale text default 'fa'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  s site_settings%rowtype;
  v_token text;
  v_session live_chat_sessions%rowtype;
  v_system text;
  v_mode text := 'online';
  v_welcome text;
begin
  -- Prefer pgcrypto; fallback is UUID concatenation (always available)
  begin
    v_token := encode(gen_random_bytes(24), 'hex');
  exception when undefined_function then
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  end;

  select * into s from site_settings where id = 1;
  if not found or coalesce(s.chat_enabled, true) = false then
    raise exception 'chat_disabled';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'invalid_name';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_phone';
  end if;

  insert into live_chat_sessions (guest_name, guest_phone, session_token)
  values (trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), v_token)
  returning * into v_session;

  v_welcome := case when p_locale like 'en%' then s.chat_welcome_en else s.chat_welcome_fa end;
  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'system', coalesce(v_welcome, 'Welcome'));

  if not public._chat_is_business_hours() then
    v_mode := 'offline';
    v_system := case when p_locale like 'en%' then s.chat_offline_en else s.chat_offline_fa end;
  elsif coalesce(s.agents_online, true) = false then
    v_mode := 'away';
    v_system := case when p_locale like 'en%' then s.chat_away_en else s.chat_away_fa end;
  end if;

  if v_system is not null then
    insert into live_chat_messages (session_id, sender_kind, body)
    values (v_session.id, 'system', v_system);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_token,
    'mode', v_mode,
    'guest_name', v_session.guest_name,
    'guest_phone', v_session.guest_phone
  );
end;
$$;

alter table site_settings
  add column if not exists copyright_fa text
    default '© جام تبرستان — تمامی حقوق محفوظ است.',
  add column if not exists copyright_en text
    default '© Tabarestan Cup — All rights reserved.',
  add column if not exists contact_email text,
  add column if not exists contact_address_fa text,
  add column if not exists contact_address_en text,
  add column if not exists trust_seal_url text,
  add column if not exists trust_seal_href text;

-- ===== 0024_chat_token_uuid_only.sql =====
-- Hard-fix live chat token: never call gen_random_bytes

create or replace function public.start_live_chat(
  p_name text,
  p_phone text,
  p_locale text default 'fa'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s site_settings%rowtype;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_session live_chat_sessions%rowtype;
  v_system text;
  v_mode text := 'online';
  v_welcome text;
begin
  select * into s from site_settings where id = 1;
  if not found or coalesce(s.chat_enabled, true) = false then
    raise exception 'chat_disabled';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'invalid_name';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_phone';
  end if;

  insert into live_chat_sessions (guest_name, guest_phone, session_token)
  values (trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), v_token)
  returning * into v_session;

  v_welcome := case when p_locale like 'en%' then s.chat_welcome_en else s.chat_welcome_fa end;
  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'system', coalesce(v_welcome, 'Welcome'));

  if not public._chat_is_business_hours() then
    v_mode := 'offline';
    v_system := case when p_locale like 'en%' then s.chat_offline_en else s.chat_offline_fa end;
  elsif coalesce(s.agents_online, true) = false then
    v_mode := 'away';
    v_system := case when p_locale like 'en%' then s.chat_away_en else s.chat_away_fa end;
  end if;

  if v_system is not null then
    insert into live_chat_messages (session_id, sender_kind, body)
    values (v_session.id, 'system', v_system);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_token,
    'mode', v_mode,
    'guest_name', v_session.guest_name,
    'guest_phone', v_session.guest_phone
  );
end;
$$;

-- ===== 0025_home_sections.sql =====
-- Homepage sections: sponsors, events, partners, why cards, FAQs, display stats

create table if not exists home_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text not null,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_events (
  id uuid primary key default gen_random_uuid(),
  title_fa text not null,
  title_en text not null,
  description_fa text,
  description_en text,
  event_date date not null,
  end_date date,
  location_fa text,
  location_en text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_partners (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  logo_url text,
  link_url text,
  kind text not null default 'university'
    check (kind in ('university', 'scientific', 'organization')),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_why_cards (
  id uuid primary key default gen_random_uuid(),
  title_fa text not null,
  title_en text not null,
  body_fa text,
  body_en text,
  icon_key text not null default 'star',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_faqs (
  id uuid primary key default gen_random_uuid(),
  question_fa text not null,
  question_en text not null,
  answer_fa text not null,
  answer_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists home_stat_cards (
  id uuid primary key default gen_random_uuid(),
  label_fa text not null,
  label_en text not null,
  value_num int not null default 0,
  suffix text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table home_sponsors enable row level security;
alter table home_events enable row level security;
alter table home_partners enable row level security;
alter table home_why_cards enable row level security;
alter table home_faqs enable row level security;
alter table home_stat_cards enable row level security;

drop policy if exists "home_sponsors_public" on home_sponsors;
create policy "home_sponsors_public" on home_sponsors for select using (is_active = true);
drop policy if exists "home_sponsors_sa" on home_sponsors;
create policy "home_sponsors_sa" on home_sponsors for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_events_public" on home_events;
create policy "home_events_public" on home_events for select using (is_active = true);
drop policy if exists "home_events_sa" on home_events;
create policy "home_events_sa" on home_events for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_partners_public" on home_partners;
create policy "home_partners_public" on home_partners for select using (is_active = true);
drop policy if exists "home_partners_sa" on home_partners;
create policy "home_partners_sa" on home_partners for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_why_public" on home_why_cards;
create policy "home_why_public" on home_why_cards for select using (is_active = true);
drop policy if exists "home_why_sa" on home_why_cards;
create policy "home_why_sa" on home_why_cards for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_faqs_public" on home_faqs;
create policy "home_faqs_public" on home_faqs for select using (is_active = true);
drop policy if exists "home_faqs_sa" on home_faqs;
create policy "home_faqs_sa" on home_faqs for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "home_stats_public" on home_stat_cards;
create policy "home_stats_public" on home_stat_cards for select using (is_active = true);
drop policy if exists "home_stats_sa" on home_stat_cards;
create policy "home_stats_sa" on home_stat_cards for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Seed defaults (idempotent by label)
insert into home_stat_cards (label_fa, label_en, value_num, sort_order)
select * from (values
  ('لیگ', 'Leagues', 35, 1),
  ('شرکت‌کننده', 'Participants', 4500, 2),
  ('تیم', 'Teams', 600, 3),
  ('دانشگاه', 'Universities', 40, 4),
  ('استان', 'Provinces', 15, 5),
  ('داور', 'Judges', 20, 6)
) as v(label_fa, label_en, value_num, sort_order)
where not exists (select 1 from home_stat_cards limit 1);

insert into home_why_cards (title_fa, title_en, body_fa, body_en, icon_key, sort_order)
select * from (values
  ('استاندارد بین‌المللی', 'International standard', 'قوانین و داوری هم‌تراز رویدادهای جهانی رباتیک.', 'Rules and judging aligned with global robotics events.', 'globe', 1),
  ('داوری تخصصی', 'Specialized judging', 'کمیته فنی و مسیر داوری هر لیگ به‌صورت جداگانه.', 'Dedicated technical committees and judging paths per league.', 'judge', 2),
  ('گواهینامه معتبر', 'Valid certificates', 'گواهی و تقدیرنامه‌های قابل استناد برای تیم‌ها.', 'Recognized certificates for teams and participants.', 'certificate', 3),
  ('جوایز', 'Awards', 'جوایز نقدی و غیرنقدی در سطوح مختلف مسابقات.', 'Cash and non-cash awards across competition tiers.', 'trophy', 4),
  ('شبکه‌سازی', 'Networking', 'ارتباط با تیم‌ها، شرکت‌ها و متخصصان صنعت.', 'Connect with teams, companies, and industry experts.', 'network', 5),
  ('فرصت جذب سرمایه', 'Investment opportunities', 'معرفی تیم‌های برتر به سرمایه‌گذاران و شتاب‌دهنده‌ها.', 'Showcase top teams to investors and accelerators.', 'rocket', 6)
) as v(title_fa, title_en, body_fa, body_en, icon_key, sort_order)
where not exists (select 1 from home_why_cards limit 1);

insert into home_faqs (question_fa, question_en, answer_fa, answer_en, sort_order)
select * from (values
  ('چطور در لیگ ثبت‌نام کنم؟', 'How do I register for a league?', 'از پنل شرکت، تیم بسازید، مدارک را بارگذاری کنید و هزینه را پرداخت کنید.', 'From the company panel, create a team, upload documents, and pay the fee.', 1),
  ('چه کسانی می‌توانند شرکت کنند؟', 'Who can participate?', 'تیم‌های دانشگاهی، مدرسه‌ای و آزاد مطابق قوانین هر لیگ.', 'University, school, and open teams per each league’s rules.', 2),
  ('نتایج چطور اعلام می‌شود؟', 'How are results published?', 'پس از داوری، نتایج در صفحه رتبه‌بندی و اعلان‌ها منتشر می‌شود.', 'After judging, results appear on rankings and announcements.', 3)
) as v(question_fa, question_en, answer_fa, answer_en, sort_order)
where not exists (select 1 from home_faqs limit 1);

insert into home_events (title_fa, title_en, description_fa, description_en, event_date, location_fa, location_en, sort_order)
select * from (values
  ('آغاز ثبت‌نام لیگ‌ها', 'League registration opens', 'شروع دوره ثبت‌نام رسمی مسابقات.', 'Official registration period begins.', current_date + 7, 'آنلاین', 'Online', 1),
  ('کارگاه فنی رباتیک', 'Robotics tech workshop', 'جلسه آموزشی برای تیم‌ها و مربیان.', 'Training session for teams and coaches.', current_date + 21, 'تهران', 'Tehran', 2),
  ('روز مسابقه نهایی', 'Finals day', 'برگزاری فینال لیگ‌های منتخب.', 'Finals for selected leagues.', current_date + 60, 'تهران', 'Tehran', 3)
) as v(title_fa, title_en, description_fa, description_en, event_date, location_fa, location_en, sort_order)
where not exists (select 1 from home_events limit 1);

insert into home_partners (name_fa, name_en, kind, sort_order)
select * from (values
  ('دانشگاه تهران', 'University of Tehran', 'university', 1),
  ('دانشگاه صنعتی شریف', 'Sharif University of Technology', 'university', 2),
  ('انجمن رباتیک ایران', 'Iran Robotics Society', 'scientific', 3),
  ('پارک علم و فناوری', 'Science & Technology Park', 'organization', 4)
) as v(name_fa, name_en, kind, sort_order)
where not exists (select 1 from home_partners limit 1);

insert into home_sponsors (name, logo_url, sort_order)
select * from (values
  ('Sponsor A', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+A', 1),
  ('Sponsor B', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+B', 2),
  ('Sponsor C', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+C', 3),
  ('Sponsor D', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+D', 4),
  ('Sponsor E', 'https://placehold.co/160x64/0f172a/38bdf8?text=Sponsor+E', 5),
  ('Sponsor F', 'https://placehold.co/160x64/0f172a/fb923c?text=Sponsor+F', 6)
) as v(name, logo_url, sort_order)
where not exists (select 1 from home_sponsors limit 1);

-- ===== 0026_email_auth_notifications.sql =====
-- Email auth + email notifications for international users

alter table profiles
  add column if not exists email text,
  add column if not exists auth_channel text not null default 'phone',
  add column if not exists email_verified_at timestamptz;

alter table profiles drop constraint if exists profiles_auth_channel_check;
alter table profiles
  add constraint profiles_auth_channel_check
  check (auth_channel in ('phone', 'email'));

create unique index if not exists profiles_email_uidx
  on profiles (lower(email))
  where email is not null and length(trim(email)) > 0;

alter table notification_log
  add column if not exists email text;

alter table sms_settings
  add column if not exists enable_email_account_approved boolean not null default true,
  add column if not exists enable_email_notifications boolean not null default true;

-- Profile bootstrap: phone stays unique; email-only users get synthetic phone e:{uuid}
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
  v_channel text;
  v_invite captain_invites%rowtype;
begin
  v_email := nullif(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');
  v_channel := coalesce(
    nullif(new.raw_user_meta_data->>'auth_channel', ''),
    case when v_email is not null and v_phone is null then 'email' else 'phone' end
  );

  if v_phone is null then
    v_phone := 'e:' || new.id::text;
  end if;

  insert into public.profiles (id, full_name, phone, email, auth_channel, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'کاربر جدید'),
    v_phone,
    v_email,
    case when v_channel in ('phone', 'email') then v_channel else 'phone' end,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'team_captain')
  );

  for v_invite in
    select * from captain_invites
    where phone = v_phone and accepted_at is null and team_id is not null
  loop
    update teams
    set captain_id = new.id
    where id = v_invite.team_id;

    update captain_invites
    set accepted_at = now()
    where id = v_invite.id;
  end loop;

  return new;
end;
$$;

create or replace function public.is_real_phone(p_phone text)
returns boolean
language sql
immutable
as $$
  select p_phone is not null
    and length(trim(p_phone)) >= 8
    and p_phone not like 'e:%';
$$;

create or replace function public.enqueue_user_email(
  p_user_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_enabled boolean;
begin
  select coalesce(enable_email_notifications, true) into v_enabled from sms_settings where id = 1;
  if v_enabled is distinct from true then
    return;
  end if;

  if p_template_key = 'account_approved' then
    select coalesce(enable_email_account_approved, true) into v_enabled from sms_settings where id = 1;
    if v_enabled is distinct from true then
      return;
    end if;
  end if;

  select nullif(trim(email), '') into v_email from profiles where id = p_user_id;
  if v_email is null then
    return;
  end if;

  insert into notification_log (channel, template_key, email, phone, status, idempotency_key, meta)
  values (
    'email',
    p_template_key,
    v_email,
    null,
    'pending',
    p_idempotency_key,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('user_id', p_user_id, 'email', v_email)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.enqueue_user_email from public;
grant execute on function public.enqueue_user_email to authenticated;
grant execute on function public.enqueue_user_email to service_role;

create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
  v_channel text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone, email, auth_channel into v_phone, v_email, v_channel;

  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      'account_approved',
      v_phone,
      'pending',
      'account_approved:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    )
    on conflict do nothing;
  end if;

  if v_email is not null or v_channel = 'email' then
    perform public.enqueue_user_email(
      p_user_id,
      'account_approved',
      'account_approved_email:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    );
  end if;
end;
$$;

drop function if exists public.list_pending_notifications(integer);
drop function if exists public.list_pending_notifications(integer, text);

create function public.list_pending_notifications(
  p_limit integer default 50,
  p_channel text default null
)
returns setof notification_log
language sql
security definer
set search_path = public
as $$
  select *
  from notification_log
  where status = 'pending'
    and (p_channel is null or channel = p_channel)
  order by created_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_pending_notifications(integer, text) from public;
grant execute on function public.list_pending_notifications(integer, text) to service_role;

-- ===== 0027_live_results_boards.sql =====
-- Live / final results boards for public pages

alter table leagues
  add column if not exists results_status text not null default 'auto';

alter table leagues drop constraint if exists leagues_results_status_check;
alter table leagues
  add constraint leagues_results_status_check
  check (results_status in ('auto', 'hidden', 'live', 'final'));

comment on column leagues.results_status is
  'auto=derive from period; live=public live board; final=podium cups; hidden=off';

-- League admin or super admin can flip board mode
create or replace function public.set_league_results_status(
  p_league_id uuid,
  p_status text
)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row leagues%rowtype;
begin
  if p_status is null or p_status not in ('auto', 'hidden', 'live', 'final') then
    raise exception 'invalid_status';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = p_league_id and la.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden';
  end if;

  update leagues
  set results_status = p_status
  where id = p_league_id
  returning * into v_row;

  if not found then
    raise exception 'not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_league_results_status from public;
grant execute on function public.set_league_results_status to authenticated;

-- Public can read live-board draft scores when league is live/final
drop policy if exists "results_public_select" on results;
create policy "results_public_select"
  on results for select using (
    published_at is not null
    or public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = results.league_id and la.user_id = auth.uid()
    )
    or exists (
      select 1 from leagues l
      where l.id = results.league_id
        and l.results_status in ('live', 'final')
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table results;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table leagues;
  exception
    when duplicate_object then null;
  end;
end $$;

-- ===== 0028_live_results_realtime.sql =====
-- Realtime for live results boards (idempotent)

do $$
begin
  begin
    alter publication supabase_realtime add table results;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table leagues;
  exception
    when duplicate_object then null;
  end;
end $$;

-- ===== 0029_nav_live_results.sql =====
-- Ensure public nav includes Live Results (insert after Home)

update site_settings
set
  nav_items = (
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'id', 'home',
          'href', '/',
          'label_fa', coalesce(
            (select el->>'label_fa' from jsonb_array_elements(nav_items) el where el->>'href' in ('/', '') limit 1),
            'خانه'
          ),
          'label_en', coalesce(
            (select el->>'label_en' from jsonb_array_elements(nav_items) el where el->>'href' in ('/', '') limit 1),
            'Home'
          ),
          'enabled', true,
          'order', 1
        ) as item,
        1 as ord
      union all
      select
        jsonb_build_object(
          'id', 'live',
          'href', '/live',
          'label_fa', 'نتایج زنده',
          'label_en', 'Live results',
          'enabled', true,
          'order', 2
        ),
        2
      union all
      select
        jsonb_set(
          jsonb_set(el, '{order}', to_jsonb(2 + row_number() over (order by coalesce((el->>'order')::int, 99)))),
          '{id}',
          to_jsonb(coalesce(el->>'id', 'nav-' || row_number() over ()))
        ),
        2 + row_number() over (order by coalesce((el->>'order')::int, 99))
      from jsonb_array_elements(nav_items) el
      where el->>'href' not in ('/', '', '/live', '/live/')
    ) rebuilt
  ),
  updated_at = now()
where id = 1
  and not exists (
    select 1
    from jsonb_array_elements(nav_items) el
    where el->>'href' in ('/live', '/live/')
  );

-- ===== 0030_team_members_competitions.sql =====
-- Richer team members + review status + profile admin edits

alter table team_members
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists education text,
  add column if not exists national_id_doc_path text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists rejection_reason text;

alter table team_members drop constraint if exists team_members_review_status_check;
alter table team_members
  add constraint team_members_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));

update team_members
set
  first_name = coalesce(nullif(trim(first_name), ''), split_part(full_name, ' ', 1)),
  last_name = coalesce(
    nullif(trim(last_name), ''),
    nullif(trim(regexp_replace(full_name, '^\S+\s*', '')), '')
  )
where first_name is null or last_name is null;

alter table documents
  add column if not exists team_member_id uuid references team_members(id) on delete set null;

create or replace function public.review_team_member(
  p_member_id uuid,
  p_status text,
  p_reason text default null
)
returns team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row team_members%rowtype;
  v_league_id uuid;
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid_status';
  end if;

  select t.league_id into v_league_id
  from team_members tm
  join teams t on t.id = tm.team_id
  where tm.id = p_member_id;

  if v_league_id is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = v_league_id and la.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden';
  end if;

  update team_members
  set
    review_status = p_status,
    rejection_reason = case when p_status = 'rejected' then nullif(trim(p_reason), '') else null end
  where id = p_member_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.review_team_member from public;
grant execute on function public.review_team_member to authenticated;

create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_national_id text default null,
  p_address text default null,
  p_company_name text default null,
  p_company_national_id text default null,
  p_economic_code text default null,
  p_email text default null
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row profiles%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    national_id = case when p_national_id is null then national_id else nullif(trim(p_national_id), '') end,
    address = case when p_address is null then address else nullif(trim(p_address), '') end,
    company_name = case when p_company_name is null then company_name else nullif(trim(p_company_name), '') end,
    company_national_id = case when p_company_national_id is null then company_national_id else nullif(trim(p_company_national_id), '') end,
    economic_code = case when p_economic_code is null then economic_code else nullif(trim(p_economic_code), '') end,
    email = case when p_email is null then email else nullif(trim(lower(p_email)), '') end
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_profile from public;
grant execute on function public.admin_update_profile to authenticated;

-- ===== 0031_gallery_categories.sql =====
-- Standalone gallery categories (CMS + public)

create table if not exists gallery_categories (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  cover_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table gallery_items
  add column if not exists category_id uuid references gallery_categories(id) on delete set null;

create index if not exists gallery_items_category_id_idx on gallery_items (category_id);

alter table gallery_categories enable row level security;

drop policy if exists "gallery_categories_public" on gallery_categories;
create policy "gallery_categories_public"
  on gallery_categories for select
  using (is_active = true);

drop policy if exists "gallery_categories_sa" on gallery_categories;
create policy "gallery_categories_sa"
  on gallery_categories for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into gallery_categories (name_fa, name_en, sort_order)
select * from (values
  ('عمومی', 'General', 0),
  ('مراسم افتتاحیه', 'Opening ceremony', 1),
  ('لیگ‌ها', 'Leagues', 2),
  ('پشت صحنه', 'Behind the scenes', 3)
) as v(name_fa, name_en, sort_order)
where not exists (select 1 from gallery_categories limit 1);

-- ===== 0032_tabarestan_rebrand.sql =====
-- Rebrand existing installations to Tabarestan Cup.
update public.site_settings
set site_name_fa = 'جام تبرستان', site_name_en = 'Tabarestan Cup',
    tagline_fa = coalesce(nullif(tagline_fa, ''), 'از قلب مازندران، رو به آینده'),
    tagline_en = coalesce(nullif(tagline_en, ''), 'From Mazandaran to the future'),
    color_primary = '#2498d8', color_accent = '#25d366', updated_at = now()
where id = 1;

update public.static_pages
set body = replace(replace(body, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup')
where body like '%روبوکاکتوس%' or body like '%RoboCactus%';

update public.blog_posts
set title = replace(replace(title, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    excerpt = replace(replace(excerpt, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    body = replace(replace(body, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup')
where title like '%روبوکاکتوس%' or title like '%RoboCactus%'
   or excerpt like '%روبوکاکتوس%' or excerpt like '%RoboCactus%'
   or body like '%روبوکاکتوس%' or body like '%RoboCactus%';

-- ===== 0033_competition_brand_positioning.sql =====
-- Align existing CMS content with the competition organizer positioning.
update public.site_settings
set site_name_fa = 'جام تبرستان',
    site_name_en = 'Tabarestan Cup',
    tagline_fa = 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک',
    tagline_en = 'Organizer of national and international robotics competitions',
    footer_fa = replace(replace(replace(coalesce(footer_fa, ''), 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    footer_en = replace(coalesce(footer_en, ''), 'RoboCactus', 'Tabarestan Cup'),
    updated_at = now()
where id = 1;

update public.home_banners
set title = replace(replace(replace(title, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    subtitle = case when sort_order = 0 then 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک' else replace(replace(replace(subtitle, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup') end;

update public.static_pages
set title = replace(replace(replace(title, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    body = replace(replace(replace(body, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup');

-- ===== 0034_replace_competition_leagues.sql =====
-- Replace the legacy league catalog with the approved national competition list.
-- Existing teams/results/content tied to removed leagues are intentionally deleted.
do $$
declare
  sample_league_id uuid;
  league_ids uuid[];
  team_ids uuid[];
  fk record;
begin
  -- Keep exactly one legacy league as an inactive/editable panel draft sample.
  select id into sample_league_id from public.leagues order by created_at, id limit 1;
  if sample_league_id is not null then
    update public.leagues
    set is_active = false,
        period_override = 'upcoming',
        name = case when name like 'نمونه پیش‌نویس — %' then name else 'نمونه پیش‌نویس — ' || name end
    where id = sample_league_id;
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into league_ids
  from public.leagues where id is distinct from sample_league_id;
  select coalesce(array_agg(id), array[]::uuid[]) into team_ids from public.teams where league_id = any(league_ids);

  for fk in
    select ns.nspname schema_name, cl.relname table_name, att.attname column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.teams'::regclass and cardinality(con.conkey) = 1
  loop
    execute format('delete from %I.%I where %I = any($1)', fk.schema_name, fk.table_name, fk.column_name) using team_ids;
  end loop;

  delete from public.teams where id = any(team_ids);

  for fk in
    select ns.nspname schema_name, cl.relname table_name, att.attname column_name
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and con.confrelid = 'public.leagues'::regclass
      and cardinality(con.conkey) = 1 and cl.relname <> 'teams'
  loop
    execute format('delete from %I.%I where %I = any($1)', fk.schema_name, fk.table_name, fk.column_name) using league_ids;
  end loop;

  delete from public.leagues where id = any(league_ids);
end $$;

insert into public.leagues (
  name, slug, description, short_description, full_description, category, age_range,
  capacity, registration_fee, registration_open_at, registration_close_at,
  event_starts_at, event_ends_at, participation_mode, team_size_min, team_size_max,
  cover_image_url, hero_image_url, venue_name, difficulty_level, competition_language,
  rules_summary, scoring_rows, timeline_steps, is_active, period_override
)
values
('لیگ ناجی داخل سالن زیر ۱۴ سال','indoor-rescue-u14','رقابت ربات‌های امدادگر خودران در زمین ماز و سناریوهای جست‌وجو و نجات داخل سالن.','مسیریابی، تشخیص مصدوم و اجرای عملیات نجات برای تیم‌های زیر ۱۴ سال.','تیم‌ها باید رباتی خودران طراحی کنند که در یک زمین استاندارد داخل سالن، مسیر را پیمایش کرده، علائم مصدوم را تشخیص دهد و مأموریت نجات را با بیشترین دقت انجام دهد.','امداد و نجات','زیر ۱۴ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',1,3,'/images/leagues/indoor-rescue-cover.png','/images/leagues/indoor-rescue-hero.png','سالن مسابقات جام تبرستان','مقدماتی تا متوسط','فارسی', 'ابعاد زمین ۴×۴ متر و کنترل داوری مطابق آیین‌نامه رسمی لیگ است.','[{"label":"تکمیل مأموریت","points":60},{"label":"دقت تشخیص","points":25},{"label":"زمان اجرا","points":15}]','[{"title":"پذیرش فنی"},{"title":"مرحله مقدماتی"},{"title":"مرحله نهایی"}]',true,'open'),
('لیگ ناجی فضای باز آزاد','outdoor-rescue-open','رقابت ربات‌های امدادگر مقاوم برای عبور از موانع و سناریوهای عملیات در فضای باز.','عملیات امداد و نجات رباتیک در زمین ۵۰ متری فضای باز.','این لیگ توان حرکتی، پایداری، کنترل و سامانه دید ربات‌های امدادگر را در محیط‌های ناهموار و مأموریت‌های نزدیک به شرایط واقعی ارزیابی می‌کند.','امداد و نجات','آزاد',100,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,4,'/images/leagues/outdoor-rescue-cover.png','/images/leagues/outdoor-rescue-hero.png','محوطه مسابقات جام تبرستان','پیشرفته','فارسی / انگلیسی','زمین مسابقه فضای باز با مسیر ناهموار و طول تقریبی ۵۰ متر است.','[{"label":"عبور از موانع","points":40},{"label":"تکمیل مأموریت","points":40},{"label":"زمان اجرا","points":20}]','[{"title":"بازرسی ایمنی"},{"title":"تست مسیر"},{"title":"فینال عملیات"}]',true,'open'),
('لیگ Space Race آزاد','space-race-open','مسابقه سرعت و هدایت ربات‌های خودران در پیست فضایی و مسیرهای فنی.','رقابت سرعت رباتیک در پیست استاندارد ۲۰۰ متری.','ربات‌های خودران در پیستی با الهام از مأموریت‌های فضایی، بر اساس سرعت، دقت مسیریابی و پایداری فنی رقابت می‌کنند.','Space Race','آزاد',250,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,4,'/images/leagues/space-race-cover.png','/images/leagues/space-race-hero.png','پیست مسابقات جام تبرستان','پیشرفته','فارسی / انگلیسی','پیست مسابقه حدود ۲۰۰ متر و کنترل ربات در بخش اصلی خودران است.','[{"label":"بهترین زمان","points":60},{"label":"دقت مسیر","points":25},{"label":"پایداری فنی","points":15}]','[{"title":"تأیید فنی"},{"title":"تایم‌تریال"},{"title":"مسابقه نهایی"}]',true,'open'),
('لیگ آتش‌نشان آزاد','firefighter-open','رقابت شناسایی و مهار حریق توسط ربات‌های آتش‌نشان در زمین چندطبقه.','شناسایی منبع حریق و اجرای عملیات اطفا در زمین استاندارد.','ربات‌ها باید در زمینی چندبخشی حرکت کنند، منبع حریق را تشخیص دهند و با رعایت کامل الزامات ایمنی عملیات اطفا را انجام دهند.','آتش‌نشان','آزاد',50,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,5,'/images/leagues/firefighter-cover.png','/images/leagues/firefighter-hero.png','سالن مسابقات جام تبرستان','پیشرفته','فارسی','زمین سه‌طبقه با سازه MDF و ورق، مطابق آیین‌نامه ایمنی مسابقه آماده می‌شود.','[{"label":"تشخیص حریق","points":30},{"label":"اطفای موفق","points":50},{"label":"زمان اجرا","points":20}]','[{"title":"کنترل ایمنی"},{"title":"مقدماتی"},{"title":"فینال اطفا"}]',true,'open'),
('لیگ ربات‌های صنعتی دانش‌آموزی زیر ۱۹ سال','industrial-student-u19','چالش طراحی و برنامه‌ریزی ربات صنعتی برای اجرای مأموریت‌های تولید هوشمند.','رقابت صنعتی ویژه دانش‌آموزان زیر ۱۹ سال.','تیم‌ها در یک سلول تولید کوچک، مأموریت‌هایی مانند جابه‌جایی، دسته‌بندی و مونتاژ قطعات را با ربات صنعتی اجرا می‌کنند.','ربات صنعتی','زیر ۱۹ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',1,3,'/images/leagues/industrial-student-cover.png','/images/leagues/industrial-student-hero.png','سالن فناوری جام تبرستان','متوسط','فارسی','کنسول داوری، میز ربات صنعتی و فضای استاندارد ۱۶ مترمربع برای هر تیم در نظر گرفته می‌شود.','[{"label":"دقت عملیات","points":45},{"label":"زمان چرخه","points":30},{"label":"ایمنی و طراحی","points":25}]','[{"title":"ارائه طراحی"},{"title":"آزمون عملکرد"},{"title":"مرحله نهایی"}]',true,'open'),
('لیگ ربات‌های صنعتی دانشگاهی آزاد','industrial-university-open','رقابت پیشرفته اتوماسیون، بازوی رباتیک و ربات‌های متحرک صنعتی.','چالش صنعتی آزاد برای تیم‌های دانشگاهی.','تیم‌های دانشگاهی راهکار کامل اتوماسیون شامل ادراک، برنامه‌ریزی حرکت و اجرای دقیق مأموریت‌های صنعتی را ارائه می‌کنند.','ربات صنعتی','آزاد',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/industrial-university-cover.png','/images/leagues/industrial-university-hero.png','سالن فناوری جام تبرستان','حرفه‌ای','فارسی / انگلیسی','فضای ۱۶ مترمربع، میز ربات صنعتی و کنسول داوری مستقل برای هر تیم فراهم می‌شود.','[{"label":"کیفیت اتوماسیون","points":45},{"label":"دقت و تکرارپذیری","points":35},{"label":"نوآوری","points":20}]','[{"title":"ارزیابی طرح"},{"title":"دموی صنعتی"},{"title":"فینال تخصصی"}]',true,'open'),
('لیگ ربات‌های ورزشی زیر ۱۴ سال','sports-robots-u14','رقابت تیمی ربات‌های ورزشی در زمین استاندارد ویژه رده زیر ۱۴ سال.','فوتبال رباتیک و رقابت تیمی برای استعدادهای زیر ۱۴ سال.','سه ربات هر تیم در زمین مسابقه با تمرکز بر همکاری تیمی، کنترل دقیق و استراتژی بازی با یکدیگر رقابت می‌کنند.','ربات ورزشی','زیر ۱۴ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/sports-u14-cover.png','/images/leagues/sports-u14-hero.png','سالن ورزشی جام تبرستان','مقدماتی تا متوسط','فارسی','زمین MDF به ابعاد تقریبی ۱۶ مترمربع و کنسول داوری استاندارد استفاده می‌شود.','[{"label":"نتیجه مسابقه","points":60},{"label":"بازی تیمی","points":25},{"label":"کیفیت فنی","points":15}]','[{"title":"تست ربات‌ها"},{"title":"مرحله گروهی"},{"title":"حذفی و فینال"}]',true,'open'),
('لیگ ربات‌های ورزشی زیر ۱۹ سال','sports-robots-u19','رقابت حرفه‌ای ربات‌های ورزشی برای تیم‌های زیر ۱۹ سال.','فوتبال رباتیک سریع و تاکتیکی در رده زیر ۱۹ سال.','تیم‌ها با سه ربات و راهبردهای کنترلی پیشرفته در زمین استاندارد برای کسب عنوان قهرمانی رقابت می‌کنند.','ربات ورزشی','زیر ۱۹ سال',25,0,now(),now()+interval '120 days',now()+interval '150 days',now()+interval '151 days','team',2,3,'/images/leagues/sports-u19-cover.png','/images/leagues/sports-u19-hero.png','سالن ورزشی جام تبرستان','پیشرفته','فارسی','زمین MDF به ابعاد تقریبی ۱۶ مترمربع و کنسول داوری استاندارد استفاده می‌شود.','[{"label":"نتیجه مسابقه","points":60},{"label":"استراتژی تیمی","points":25},{"label":"کیفیت فنی","points":15}]','[{"title":"بازرسی فنی"},{"title":"مرحله گروهی"},{"title":"حذفی و فینال"}]',true,'open');

-- ===== 0035_league_fees_people_event.sql =====
-- Complete the active competition catalog with fees, event date, officials and contact details.
update public.leagues
set registration_fee = case slug
      when 'indoor-rescue-u14' then 5000000
      when 'outdoor-rescue-open' then 7500000
      when 'space-race-open' then 10000000
      when 'firefighter-open' then 8500000
      when 'industrial-student-u19' then 6000000
      when 'industrial-university-open' then 9500000
      when 'sports-robots-u14' then 5500000
      when 'sports-robots-u19' then 7000000
      else registration_fee
    end,
    event_starts_at = timestamptz '2026-10-23 08:00:00+03:30', -- ۱ آبان ۱۴۰۵
    event_ends_at = timestamptz '2026-10-23 18:00:00+03:30',
    registration_close_at = timestamptz '2026-10-16 23:59:00+03:30',
    secretary_name = 'کمیته برگزاری جام تبرستان',
    secretary_phone = coalesce((select support_phone from public.site_settings where id = 1), secretary_phone),
    contact_email = 'competitions@tabarestancup.ir',
    secretary_telegram = 'https://t.me/tabarestancup',
    technical_committee_notes = 'کمیته فنی مسئول نظارت بر اجرای آیین‌نامه، تأیید فنی ربات‌ها و پاسخ‌گویی تخصصی به تیم‌ها است.',
    day_schedule = '[{"time":"08:00","title":"پذیرش و کنترل فنی"},{"time":"10:00","title":"آغاز مسابقات"},{"time":"14:00","title":"مرحله نهایی"},{"time":"17:30","title":"اعلام نتایج و اختتامیه"}]'::jsonb
where slug in (
  'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
  'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
);

delete from public.league_people
where league_id in (
  select id from public.leagues where slug in (
    'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
    'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
  )
) and role_kind in ('judge', 'committee');

-- Two Iranian judges tailored to each league.
insert into public.league_people (league_id, full_name, specialty, bio, role_kind, sort_order)
select l.id, v.full_name, v.specialty, v.bio, 'judge', v.sort_order
from (values
  ('indoor-rescue-u14','دکتر مهدی رضایی','رباتیک امداد و ناوبری','داور تخصصی سامانه‌های خودران و مسیریابی ربات‌های امدادگر.',1),
  ('indoor-rescue-u14','مهندس الهام کریمی','بینایی ماشین','داور فنی تشخیص علائم و ارزیابی دقت مأموریت.',2),
  ('outdoor-rescue-open','دکتر امیرحسین کاظمی','ربات‌های میدانی','متخصص ربات‌های مقاوم و عملیات در محیط‌های ناهموار.',1),
  ('outdoor-rescue-open','مهندس سجاد موسوی','مکانیک و کنترل','داور سامانه حرکتی، ایمنی و کنترل ربات.',2),
  ('space-race-open','دکتر پویا احمدی','سامانه‌های خودران','داور ناوبری، برنامه‌ریزی مسیر و کنترل هوشمند.',1),
  ('space-race-open','مهندس نگار زمانی','مکاترونیک','داور طراحی فنی، پایداری و عملکرد مسابقه‌ای.',2),
  ('firefighter-open','دکتر محمدحسین اکبری','رباتیک آتش‌نشان','داور تخصصی تشخیص حریق و عملیات اطفای رباتیک.',1),
  ('firefighter-open','مهندس علی مرادی','ایمنی و کنترل','ناظر فنی الزامات ایمنی و کنترل سامانه اطفا.',2),
  ('industrial-student-u19','دکتر فرهاد جعفری','اتوماسیون صنعتی','داور مأموریت‌های تولید هوشمند و اتوماسیون.',1),
  ('industrial-student-u19','مهندس شیما صادقی','کنترل ربات صنعتی','داور برنامه‌ریزی حرکت و دقت اجرای عملیات.',2),
  ('industrial-university-open','دکتر آرمان توکلی','رباتیک صنعتی پیشرفته','داور ارشد اتوماسیون، ادراک و همکاری ربات‌ها.',1),
  ('industrial-university-open','مهندس نازنین رستمی','ساخت هوشمند','داور کیفیت اجرا، نوآوری و یکپارچگی سامانه.',2),
  ('sports-robots-u14','مهندس حسین محمدی','ربات‌های ورزشی','داور فنی ربات‌ها و اجرای قوانین زمین مسابقه.',1),
  ('sports-robots-u14','مهندس مریم قاسمی','کنترل و استراتژی بازی','داور بازی تیمی و عملکرد کنترلی ربات‌ها.',2),
  ('sports-robots-u19','دکتر سعید حیدری','هوش مصنوعی رباتیک','داور راهبرد بازی و تصمیم‌گیری چندرباته.',1),
  ('sports-robots-u19','مهندس کیان نوروزی','مکاترونیک ورزشی','داور طراحی مکانیکی و عملکرد مسابقه‌ای.',2)
) as v(slug, full_name, specialty, bio, sort_order)
join public.leagues l on l.slug = v.slug;

-- Exactly two technical committee members for every active competition league.
insert into public.league_people (league_id, full_name, specialty, bio, role_kind, sort_order)
select l.id, c.full_name, c.specialty, c.bio, 'committee', c.sort_order
from public.leagues l
cross join (values
  ('دکتر رضا ابراهیمی','رئیس کمیته فنی','مسئول نظارت عالی بر اجرای فنی، آیین‌نامه‌ها و استانداردهای مسابقات.',1),
  ('مهندس سارا نادری','هماهنگ‌کننده فنی','مسئول کنترل فنی، هماهنگی داوران و پاسخ‌گویی تخصصی به تیم‌ها.',2)
) as c(full_name, specialty, bio, sort_order)
where l.slug in (
  'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
  'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
);

-- ===== 0036_cup_identity_auth_payments.sql =====
-- Tabarestan Cup: configurable access, complete identities, reusable league cycles,
-- bilingual teams and card-to-card payment review.

alter table auth.users add column if not exists username text;
create unique index if not exists auth_users_username_uidx
  on auth.users (lower(username)) where username is not null and length(trim(username)) > 0;

alter table public.profiles
  add column if not exists username text,
  add column if not exists first_name_fa text,
  add column if not exists last_name_fa text,
  add column if not exists first_name_en text,
  add column if not exists last_name_en text,
  add column if not exists birth_date date,
  add column if not exists postal_code text,
  add column if not exists legal_representative_national_id text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists identity_completed_at timestamptz;

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username)) where username is not null and length(trim(username)) > 0;

update auth.users set email = replace(email, '@robocactus.demo', '@tabarestancup.demo')
where email like '%@robocactus.demo'
  and not exists (select 1 from auth.users newer where newer.email = replace(auth.users.email, '@robocactus.demo', '@tabarestancup.demo'));
with demo_usernames(email, username) as (values
  ('admin@tabarestancup.demo', 'admin'),
  ('league@tabarestancup.demo', 'league-admin'),
  ('staff@tabarestancup.demo', 'staff'),
  ('company@tabarestancup.demo', 'company-admin'),
  ('captain@tabarestancup.demo', 'captain')
)
update auth.users target set username = demo.username
from demo_usernames demo
where target.email = demo.email
  and (target.username is null or length(trim(target.username)) = 0)
  and not exists (
    select 1 from auth.users occupied
    where occupied.id <> target.id and lower(occupied.username) = lower(demo.username)
  );
update public.profiles p set username = u.username from auth.users u where u.id = p.id and u.username is not null;

create or replace function public.sync_profile_username()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.username is distinct from old.username then
    update auth.users set username = nullif(lower(trim(new.username)), ''), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_profile_username on public.profiles;
create trigger sync_profile_username after update of username on public.profiles
for each row execute function public.sync_profile_username();

alter table public.leagues
  add column if not exists captain_fee numeric not null default 0,
  add column if not exists member_fee numeric not null default 0,
  add column if not exists team_edit_deadline timestamptz,
  add column if not exists min_age integer,
  add column if not exists max_age integer,
  add column if not exists current_season_year integer not null default extract(year from current_date)::integer,
  add column if not exists registration_cycle_status text not null default 'open';

alter table public.leagues drop constraint if exists leagues_registration_cycle_status_check;
alter table public.leagues add constraint leagues_registration_cycle_status_check
  check (registration_cycle_status in ('draft', 'open', 'closed', 'archived'));

alter table public.teams
  add column if not exists name_en text,
  add column if not exists motto_fa text,
  add column if not exists motto_en text,
  add column if not exists season_year integer;

update public.teams t set season_year = l.current_season_year
from public.leagues l where l.id = t.league_id and t.season_year is null;

alter table public.team_members
  add column if not exists first_name_fa text,
  add column if not exists last_name_fa text,
  add column if not exists first_name_en text,
  add column if not exists last_name_en text;

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated with check (
  public.is_super_admin() or (
    exists (select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid())
    and exists (select 1 from public.leagues l where l.id = teams.league_id and l.is_active
      and l.registration_cycle_status = 'open'
      and (l.registration_open_at is null or l.registration_open_at <= now())
      and (l.registration_close_at is null or l.registration_close_at >= now()))
  )
);

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update to authenticated using (
  public.is_super_admin() or (
    (captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid()))
    and exists (select 1 from public.leagues l where l.id = teams.league_id and (l.team_edit_deadline is null or l.team_edit_deadline >= now()))
  )
) with check (public.is_super_admin() or captain_id = auth.uid() or exists (
  select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid()
));

drop policy if exists team_members_manage on public.team_members;
create policy team_members_manage on public.team_members for all to authenticated using (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = team_members.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
) with check (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = team_members.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
);

drop policy if exists documents_manage on public.documents;
create policy documents_manage on public.documents for all to authenticated using (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = documents.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
) with check (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = documents.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
);

-- The legacy finance view was defined with `i.*`. PostgreSQL freezes the
-- expanded column order when a view is created, so adding invoice columns and
-- then using CREATE OR REPLACE VIEW would try to rename `team_name` to the
-- first newly-added column. Rebuild the view around the table change instead.
drop view if exists public.invoice_finance_view;

alter table public.invoices
  add column if not exists payment_method text not null default 'online',
  add column if not exists receipt_path text,
  add column if not exists receipt_status text,
  add column if not exists receipt_rejection_reason text,
  add column if not exists receipt_submitted_at timestamptz,
  add column if not exists receipt_reviewed_at timestamptz,
  add column if not exists receipt_reviewed_by uuid references public.profiles(id);

alter table public.invoices drop constraint if exists invoices_payment_method_check;
alter table public.invoices add constraint invoices_payment_method_check
  check (payment_method in ('online', 'card_to_card'));
alter table public.invoices drop constraint if exists invoices_receipt_status_check;
alter table public.invoices add constraint invoices_receipt_status_check
  check (receipt_status is null or receipt_status in ('pending_review', 'approved', 'rejected'));

create table if not exists public.auth_settings (
  id integer primary key default 1 check (id = 1),
  otp_login_enabled boolean not null default true,
  password_login_enabled boolean not null default true,
  email_magic_login_enabled boolean not null default true,
  email_signup_enabled boolean not null default true,
  phone_signup_enabled boolean not null default true,
  online_payment_enabled boolean not null default true,
  card_to_card_enabled boolean not null default false,
  bank_card_number text,
  bank_iban text,
  bank_account_owner text,
  email_provider text not null default 'resend',
  email_from text,
  email_api_key text,
  updated_at timestamptz not null default now()
);

insert into public.auth_settings (id, email_from)
values (1, 'Tabarestan Cup <onboarding@resend.dev>') on conflict (id) do nothing;

insert into public.registration_doc_types (code, label_fa, label_en, account_type, is_required, is_active, sort_order)
values ('legal_representative_national_card', 'کارت ملی نماینده قانونی', 'Legal representative national ID', 'legal', true, true, 2)
on conflict (code) do update set is_required = true, is_active = true;

alter table public.auth_settings enable row level security;
drop policy if exists auth_settings_super_admin on public.auth_settings;
create policy auth_settings_super_admin on public.auth_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace view public.public_auth_options
with (security_invoker = false)
as select
  otp_login_enabled, password_login_enabled, email_magic_login_enabled,
  email_signup_enabled, phone_signup_enabled, online_payment_enabled,
  card_to_card_enabled, bank_card_number, bank_iban, bank_account_owner
from public.auth_settings where id = 1;

grant select on public.public_auth_options to anon, authenticated;
grant select, insert, update, delete on public.auth_settings to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists payment_receipts_insert on storage.objects;
create policy payment_receipts_insert on storage.objects for insert to authenticated
with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists payment_receipts_select on storage.objects;
create policy payment_receipts_select on storage.objects for select to authenticated
using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
drop policy if exists payment_receipts_delete on storage.objects;
create policy payment_receipts_delete on storage.objects for delete to authenticated
using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_fee numeric;
  v_member_count integer;
  v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if v_team.status <> 'draft' then raise exception 'team is not in draft status'; end if;
  if not public.is_super_admin()
     and not exists (select 1 from company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid)
     and v_team.captain_id <> v_uid then raise exception 'forbidden'; end if;

  select count(*)::integer into v_member_count from team_members
  where team_id = p_team_id and coalesce(role, 'member') <> 'captain';
  select coalesce(registration_fee, 0) + coalesce(captain_fee, 0)
       + coalesce(member_fee, 0) * greatest(v_member_count, 0)
  into v_fee from leagues where id = v_team.league_id;

  select * into v_invoice from invoices
  where team_id = p_team_id and status in ('pending', 'failed')
  order by created_at desc limit 1;
  if found then
    update invoices set amount = v_fee, company_id = v_team.company_id,
      status = case when receipt_status = 'pending_review' then status else 'pending'::payment_status end
    where id = v_invoice.id returning * into v_invoice;
    return v_invoice;
  end if;
  insert into invoices (team_id, company_id, amount, status, invoice_number)
  values (v_team.id, v_team.company_id, v_fee, 'pending', public._next_invoice_number())
  returning * into v_invoice;
  return v_invoice;
end;
$$;

create or replace function public.submit_card_receipt(p_invoice_id uuid, p_receipt_path text)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select card_to_card_enabled from auth_settings where id = 1), false)
    then raise exception 'card_to_card_disabled'; end if;
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if not public.is_super_admin()
     and not exists (select 1 from company_members cm where cm.company_id = v_invoice.company_id and cm.user_id = v_uid)
     and not exists (select 1 from teams t where t.id = v_invoice.team_id and t.captain_id = v_uid)
    then raise exception 'forbidden'; end if;
  update invoices set payment_method = 'card_to_card', receipt_path = p_receipt_path,
    receipt_status = 'pending_review', receipt_rejection_reason = null,
    receipt_submitted_at = now(), receipt_reviewed_at = null, receipt_reviewed_by = null,
    status = 'pending'
  where id = p_invoice_id returning * into v_invoice;
  return v_invoice;
end;
$$;

create or replace function public.review_card_receipt(p_invoice_id uuid, p_approved boolean, p_reason text default null)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare v_invoice invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if not p_approved and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'rejection_reason_required'; end if;
  update invoices set receipt_status = case when p_approved then 'approved' else 'rejected' end,
    receipt_rejection_reason = case when p_approved then null else trim(p_reason) end,
    receipt_reviewed_at = now(), receipt_reviewed_by = auth.uid(),
    status = case when p_approved then 'paid'::payment_status else 'failed'::payment_status end,
    paid_at = case when p_approved then now() else null end
  where id = p_invoice_id and payment_method = 'card_to_card'
  returning * into v_invoice;
  if not found then raise exception 'receipt not found'; end if;
  if p_approved then
    update teams set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id and status = 'draft';
  end if;
  return v_invoice;
end;
$$;

revoke all on function public.submit_card_receipt(uuid, text) from public;
grant execute on function public.submit_card_receipt(uuid, text) to authenticated;
revoke all on function public.review_card_receipt(uuid, boolean, text) from public;
grant execute on function public.review_card_receipt(uuid, boolean, text) to authenticated;

create or replace view public.invoice_finance_view with (security_invoker = true) as
select i.*, t.name as team_name, t.status as team_status, t.league_id,
  l.name as league_name, c.name as company_name, c.slug as company_slug
from invoices i join teams t on t.id = i.team_id
join leagues l on l.id = t.league_id join companies c on c.id = i.company_id;

-- Replace the visible legacy brand in persisted content.
create or replace function public._tabarestan_brand_text(p_value text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_value, ''),
    'روبوکاپ تبرستان', 'جام تبرستان'), 'روبو کاپ تبرستان', 'جام تبرستان'),
    'روبوکاکتوس', 'جام تبرستان'), 'روبو کاکتوس', 'جام تبرستان'),
    'روبوککتوس', 'جام تبرستان'), 'RoboCup Tabarestan', 'Tabarestan Cup'),
    'RoboCactus', 'Tabarestan Cup'), 'RoboCup', 'Tabarestan Cup'), 'RoboParts', 'TechParts')
$$;

update public.site_settings set
  site_name_fa = 'جام تبرستان', site_name_en = 'Tabarestan Cup',
  tagline_fa = public._tabarestan_brand_text(tagline_fa),
  tagline_en = public._tabarestan_brand_text(tagline_en),
  footer_fa = public._tabarestan_brand_text(footer_fa),
  footer_en = public._tabarestan_brand_text(footer_en),
  copyright_fa = public._tabarestan_brand_text(copyright_fa),
  copyright_en = public._tabarestan_brand_text(copyright_en), updated_at = now()
where id = 1;

update public.static_pages set title = public._tabarestan_brand_text(title), body = public._tabarestan_brand_text(body);
update public.blog_posts set title = public._tabarestan_brand_text(title), excerpt = public._tabarestan_brand_text(excerpt), body = public._tabarestan_brand_text(body);
update public.announcements set title = public._tabarestan_brand_text(title), body = public._tabarestan_brand_text(body);
update public.home_banners set title = public._tabarestan_brand_text(title), subtitle = public._tabarestan_brand_text(subtitle);
update public.leagues set name = public._tabarestan_brand_text(name), description = public._tabarestan_brand_text(description), venue_name = public._tabarestan_brand_text(venue_name);
update public.league_people set full_name = public._tabarestan_brand_text(full_name), specialty = public._tabarestan_brand_text(specialty), bio = public._tabarestan_brand_text(bio);
update public.league_sponsors set name = public._tabarestan_brand_text(name);

drop function public._tabarestan_brand_text(text);

-- ===== 0037_bilingual_leagues_people_profiles.sql =====
-- Bilingual league content and public CV pages for judges / technical committee.

alter table public.leagues
  add column if not exists name_en text,
  add column if not exists description_en text,
  add column if not exists category_en text,
  add column if not exists short_description_en text,
  add column if not exists full_description_en text,
  add column if not exists rules_summary_en text,
  add column if not exists age_range_en text,
  add column if not exists venue_name_en text,
  add column if not exists venue_address_en text,
  add column if not exists difficulty_level_en text,
  add column if not exists competition_language_en text,
  add column if not exists discount_info_en text,
  add column if not exists refund_policy_en text,
  add column if not exists secretary_name_en text,
  add column if not exists judging_path_en text,
  add column if not exists technical_committee_notes_en text,
  add column if not exists scoring_rows_en jsonb not null default '[]'::jsonb,
  add column if not exists timeline_steps_en jsonb not null default '[]'::jsonb,
  add column if not exists day_schedule_en jsonb not null default '[]'::jsonb,
  add column if not exists allowed_equipment_en jsonb not null default '[]'::jsonb,
  add column if not exists forbidden_equipment_en jsonb not null default '[]'::jsonb;

alter table public.league_files add column if not exists title_en text;
alter table public.league_faqs
  add column if not exists question_en text,
  add column if not exists answer_en text;
alter table public.league_sponsors add column if not exists name_en text;

alter table public.league_people
  add column if not exists slug text,
  add column if not exists full_name_en text,
  add column if not exists specialty_en text,
  add column if not exists bio_en text,
  add column if not exists identity_summary_fa text,
  add column if not exists identity_summary_en text,
  add column if not exists education_fa text,
  add column if not exists education_en text,
  add column if not exists honors_fa text,
  add column if not exists honors_en text,
  add column if not exists awards_fa text,
  add column if not exists awards_en text,
  add column if not exists courses_fa text,
  add column if not exists courses_en text,
  add column if not exists company_info_fa text,
  add column if not exists company_info_en text,
  add column if not exists birth_date date,
  add column if not exists nationality_fa text,
  add column if not exists nationality_en text,
  add column if not exists city_fa text,
  add column if not exists city_en text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists website_url text,
  add column if not exists linkedin_url text,
  add column if not exists is_profile_published boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.league_people
set slug = 'person-' || substr(replace(id::text, '-', ''), 1, 12)
where slug is null or length(trim(slug)) = 0;

alter table public.league_people alter column slug set not null;
create unique index if not exists league_people_slug_uidx on public.league_people (lower(slug));
create index if not exists league_people_published_idx
  on public.league_people (is_profile_published, role_kind, sort_order);

-- Public lists and profiles only expose published people; admins retain their existing policy.
drop policy if exists "league_people_public_select" on public.league_people;
create policy "league_people_public_select" on public.league_people for select
  using (is_profile_published = true or public.is_super_admin());

-- ===== 0038_chat_wait_experience.sql =====
-- Operational live-chat copy and configurable unanswered-message reminder.
alter table public.site_settings
  add column if not exists chat_wait_timeout_seconds integer not null default 180,
  add column if not exists chat_wait_message_fa text not null default 'کارشناسان ما در اولین فرصت پاسخ‌گو هستند. می‌توانید منتظر بمانید یا برای پیگیری سریع‌تر با دبیرخانه تماس بگیرید.',
  add column if not exists chat_wait_message_en text not null default 'Our specialists will respond as soon as possible. You can wait here or contact the secretariat for faster assistance.';

update public.site_settings
set chat_welcome_fa = 'سؤال خود را مطرح کنید؛ کارشناسان ما پاسخ‌گوی شما هستند.',
    chat_welcome_en = 'Ask your question; our specialists are here to help.'
where id = 1 and (
  chat_welcome_fa is null or chat_welcome_fa ilike '%نام%' or chat_welcome_fa ilike '%مکالمه%'
  or chat_welcome_en is null or chat_welcome_en ilike '%name%' or chat_welcome_en ilike '%conversation%'
);

-- ===== 0039_password_recovery_integrations.sql =====
-- Password recovery and database-managed integration credentials.
-- Access remains restricted to super admins by the existing auth_settings RLS policy.

alter table public.auth_settings
  add column if not exists sms_provider text not null default 'ippanel',
  add column if not exists ippanel_api_key text,
  add column if not exists ippanel_originator text,
  add column if not exists kavenegar_api_key text,
  add column if not exists sms_patterns jsonb not null default '{}'::jsonb,
  add column if not exists zarinpal_merchant_id text,
  add column if not exists zarinpal_sandbox boolean not null default false;

alter table public.auth_settings drop constraint if exists auth_settings_sms_provider_check;
alter table public.auth_settings add constraint auth_settings_sms_provider_check
  check (sms_provider in ('ippanel', 'kavenegar'));

-- ===== 0040_kavenegar_operations_center.sql =====
-- Kavenegar operations center: provider defaults, audit trail and webhook events.

alter table public.auth_settings
  add column if not exists kavenegar_sender text,
  add column if not exists kavenegar_default_type smallint not null default 1,
  add column if not exists kavenegar_default_tag text,
  add column if not exists kavenegar_default_policy text,
  add column if not exists kavenegar_webhook_secret text;

alter table public.auth_settings drop constraint if exists auth_settings_kavenegar_type_check;
alter table public.auth_settings add constraint auth_settings_kavenegar_type_check
  check (kavenegar_default_type in (0, 1, 2, 3));

create table if not exists public.kavenegar_operations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  operation text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  provider_status integer,
  provider_message text,
  message_ids text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'webhook')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists kavenegar_operations_created_idx
  on public.kavenegar_operations (created_at desc);
create index if not exists kavenegar_operations_operation_idx
  on public.kavenegar_operations (operation, created_at desc);
create index if not exists kavenegar_operations_status_idx
  on public.kavenegar_operations (status, created_at desc);

alter table public.kavenegar_operations enable row level security;
drop policy if exists "kavenegar_operations_sa" on public.kavenegar_operations;
create policy "kavenegar_operations_sa" on public.kavenegar_operations
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.kavenegar_operations from anon;
grant select, insert, update, delete on public.kavenegar_operations to authenticated;

comment on table public.kavenegar_operations is
  'Audit log for Kavenegar API calls and delivery/inbound callbacks. API keys are never stored here.';

-- ===== 0041_captcha_and_actionable_inboxes.sql =====
-- ArCaptcha controls and actionable contact/SMS inboxes.

alter table public.auth_settings
  add column if not exists captcha_provider text not null default 'arcaptcha',
  add column if not exists captcha_enabled boolean not null default false,
  add column if not exists arcaptcha_site_key text,
  add column if not exists arcaptcha_secret_key text,
  add column if not exists captcha_on_login boolean not null default true,
  add column if not exists captcha_on_signup boolean not null default true,
  add column if not exists captcha_on_password_reset boolean not null default true,
  add column if not exists captcha_on_contact boolean not null default true,
  add column if not exists captcha_on_live_chat boolean not null default true;

alter table public.auth_settings drop constraint if exists auth_settings_captcha_provider_check;
alter table public.auth_settings add constraint auth_settings_captcha_provider_check
  check (captcha_provider in ('arcaptcha'));

alter table public.contact_messages
  add column if not exists status text not null default 'new',
  add column if not exists admin_note text,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.contact_messages drop constraint if exists contact_messages_status_check;
alter table public.contact_messages add constraint contact_messages_status_check
  check (status in ('new', 'in_review', 'resolved', 'spam'));

create index if not exists contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc);

drop policy if exists "contact_messages_insert_public" on public.contact_messages;
revoke insert on public.contact_messages from anon, authenticated;
drop policy if exists "contact_messages_update_admin" on public.contact_messages;
create policy "contact_messages_update_admin" on public.contact_messages for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.captcha_verification_log (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  success boolean not null,
  ip_hash text,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists captcha_verification_created_idx
  on public.captcha_verification_log (created_at desc);
alter table public.captcha_verification_log enable row level security;
drop policy if exists "captcha_verification_sa" on public.captcha_verification_log;
create policy "captcha_verification_sa" on public.captcha_verification_log for select to authenticated
  using (public.is_super_admin());
revoke all on public.captcha_verification_log from anon, authenticated;
grant select on public.captcha_verification_log to authenticated;

-- Guests must use the captcha-protected application endpoint to open a chat.
revoke execute on function public.start_live_chat(text, text, text) from anon, authenticated;

create table if not exists public.kavenegar_inbox (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  sender text not null,
  receptor text,
  message text not null,
  received_at timestamptz not null,
  status text not null default 'new'
    check (status in ('new', 'in_review', 'resolved', 'spam')),
  admin_note text,
  assigned_to uuid references public.profiles(id) on delete set null,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kavenegar_inbox_status_received_idx
  on public.kavenegar_inbox (status, received_at desc);
create index if not exists kavenegar_inbox_sender_idx
  on public.kavenegar_inbox (sender);
alter table public.kavenegar_inbox enable row level security;
drop policy if exists "kavenegar_inbox_sa" on public.kavenegar_inbox;
create policy "kavenegar_inbox_sa" on public.kavenegar_inbox for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.kavenegar_inbox from anon;
grant select, insert, update, delete on public.kavenegar_inbox to authenticated;

-- ===== 0042_operational_accounting.sql =====
-- Operational accounting: invoice lifecycle and a real deposit ledger.

drop view if exists public.invoice_finance_view;

alter table public.invoices
  add column if not exists admin_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  transaction_type text not null default 'deposit' check (transaction_type in ('deposit', 'refund', 'adjustment')),
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  amount numeric not null check (amount >= 0),
  payment_method text not null check (payment_method in ('online', 'card_to_card', 'manual')),
  reference text,
  occurred_at timestamptz not null default now(),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, transaction_type)
);

create index if not exists finance_transactions_occurred_idx on public.finance_transactions (occurred_at desc);
create index if not exists finance_transactions_method_idx on public.finance_transactions (payment_method, status);
alter table public.finance_transactions enable row level security;
drop policy if exists finance_transactions_super_admin on public.finance_transactions;
create policy finance_transactions_super_admin on public.finance_transactions for select to authenticated
  using (public.is_super_admin());
revoke all on public.finance_transactions from anon;
grant select on public.finance_transactions to authenticated;

create or replace function public.sync_invoice_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' then
    insert into public.finance_transactions (
      invoice_id, transaction_type, status, amount, payment_method, reference, occurred_at, reversed_at
    ) values (
      new.id, 'deposit', 'posted', new.amount,
      case when new.payment_method = 'card_to_card' then 'card_to_card' else 'online' end,
      new.gateway_ref, coalesce(new.paid_at, now()), null
    )
    on conflict (invoice_id, transaction_type) do update set
      status = 'posted', amount = excluded.amount, payment_method = excluded.payment_method,
      reference = excluded.reference, occurred_at = excluded.occurred_at,
      reversed_at = null, updated_at = now();
  elsif old.status = 'paid' and new.status <> 'paid' then
    update public.finance_transactions set status = 'reversed', reversed_at = now(), updated_at = now()
    where invoice_id = new.id and transaction_type = 'deposit';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_sync_deposit on public.invoices;
create trigger invoices_sync_deposit after insert or update of status, amount, payment_method, gateway_ref, paid_at
on public.invoices for each row execute function public.sync_invoice_deposit();

insert into public.finance_transactions (invoice_id, transaction_type, status, amount, payment_method, reference, occurred_at)
select i.id, 'deposit', 'posted', i.amount,
  case when i.payment_method = 'card_to_card' then 'card_to_card' else 'online' end,
  i.gateway_ref, coalesce(i.paid_at, i.created_at, now())
from public.invoices i where i.status = 'paid'
on conflict (invoice_id, transaction_type) do update set
  status = 'posted', amount = excluded.amount, payment_method = excluded.payment_method,
  reference = excluded.reference, occurred_at = excluded.occurred_at, reversed_at = null, updated_at = now();

create or replace view public.invoice_finance_view with (security_invoker = true) as
select i.*, t.name as team_name, t.status as team_status, t.league_id,
  l.name as league_name, c.name as company_name, c.slug as company_slug
from public.invoices i
join public.teams t on t.id = i.team_id
join public.leagues l on l.id = t.league_id
join public.companies c on c.id = i.company_id;
grant select on public.invoice_finance_view to authenticated;

create or replace view public.finance_deposit_view with (security_invoker = true) as
select ft.*, i.invoice_number, i.status as invoice_status,
  t.name as team_name, t.league_id, l.name as league_name,
  c.id as company_id, c.name as company_name
from public.finance_transactions ft
join public.invoices i on i.id = ft.invoice_id
join public.teams t on t.id = i.team_id
join public.leagues l on l.id = t.league_id
join public.companies c on c.id = i.company_id;

grant select on public.finance_deposit_view to authenticated;

create or replace function public.admin_update_invoice(
  p_invoice_id uuid, p_amount numeric, p_status text, p_payment_method text, p_admin_note text default null
) returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_amount < 0 then raise exception 'invalid_amount'; end if;
  if p_status not in ('pending', 'paid', 'failed', 'refunded') then raise exception 'invalid_status'; end if;
  if p_payment_method not in ('online', 'card_to_card') then raise exception 'invalid_payment_method'; end if;
  update public.invoices set amount = p_amount, status = p_status::public.payment_status,
    payment_method = p_payment_method, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    updated_at = now()
  where id = p_invoice_id returning * into v_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if p_status = 'paid' then
    update public.teams set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id and status = 'draft';
  end if;
  return v_invoice;
end;
$$;

create or replace function public.admin_archive_invoice(p_invoice_id uuid, p_archived boolean default true)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  update public.invoices set archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then auth.uid() else null end, updated_at = now()
  where id = p_invoice_id returning * into v_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  return v_invoice;
end;
$$;

create or replace function public.admin_delete_invoice(p_invoice_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'paid' or v_invoice.receipt_status = 'approved' then
    raise exception 'paid_invoice_must_be_archived';
  end if;
  if v_invoice.receipt_path is not null then raise exception 'invoice_with_receipt_must_be_archived'; end if;
  delete from public.invoices where id = p_invoice_id;
  return true;
end;
$$;

revoke all on function public.admin_update_invoice(uuid, numeric, text, text, text) from public;
revoke all on function public.admin_archive_invoice(uuid, boolean) from public;
revoke all on function public.admin_delete_invoice(uuid) from public;
grant execute on function public.admin_update_invoice(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.admin_archive_invoice(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_invoice(uuid) to authenticated;

-- ===== 0043_login_experience.sql =====
-- Configurable public login experience.
alter table public.site_settings
  add column if not exists login_logo_url text,
  add column if not exists login_cover_url text,
  add column if not exists login_welcome_title_fa text default 'به جام تبرستان خوش آمدید',
  add column if not exists login_welcome_title_en text default 'Welcome to Tabarestan Cup',
  add column if not exists login_welcome_text_fa text default 'برای ادامه وارد حساب کاربری خود شوید.',
  add column if not exists login_welcome_text_en text default 'Sign in to continue to your account.';

update public.site_settings
set login_welcome_title_fa = coalesce(nullif(login_welcome_title_fa, ''), 'به جام تبرستان خوش آمدید'),
    login_welcome_title_en = coalesce(nullif(login_welcome_title_en, ''), 'Welcome to Tabarestan Cup'),
    login_welcome_text_fa = coalesce(nullif(login_welcome_text_fa, ''), 'برای ادامه وارد حساب کاربری خود شوید.'),
    login_welcome_text_en = coalesce(nullif(login_welcome_text_en, ''), 'Sign in to continue to your account.')
where id = 1;

-- ===== 0044_registration_lifecycle.sql =====
-- League registration lifecycle, cross-device drafts, invoice ownership and reminder foundation.
alter table public.teams
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists registration_stage text not null default 'team_info',
  add column if not exists registration_progress integer not null default 10,
  add column if not exists registration_draft jsonb not null default '{}'::jsonb,
  add column if not exists last_completed_step integer not null default -1,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists registration_started_at timestamptz not null default now(),
  add column if not exists registration_completed_at timestamptz;

alter table public.teams drop constraint if exists teams_lifecycle_status_check;
alter table public.teams add constraint teams_lifecycle_status_check check (lifecycle_status in (
  'draft','incomplete','awaiting_documents','awaiting_review','awaiting_payment','completed','cancelled'
));
alter table public.teams drop constraint if exists teams_registration_stage_check;
alter table public.teams add constraint teams_registration_stage_check check (registration_stage in (
  'team_info','members','documents','review','invoice','payment','completed'
));
alter table public.teams drop constraint if exists teams_registration_progress_check;
alter table public.teams add constraint teams_registration_progress_check check (registration_progress between 0 and 100);

-- Preserve the real state of registrations created before this lifecycle existed.
-- A paid invoice is definitive; pending invoices and submitted records retain
-- their operational state instead of becoming fresh drafts.
update public.teams t
set lifecycle_status = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 'completed'
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 'awaiting_payment'
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 'awaiting_review'
      else 'incomplete'
    end,
    registration_stage = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 'completed'
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 'payment'
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 'review'
      else 'team_info'
    end,
    registration_progress = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 100
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 85
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 75
      else 10
    end,
    registration_completed_at = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid')
        then coalesce(t.registration_completed_at, (select max(i.paid_at) from public.invoices i where i.team_id = t.id and i.status = 'paid'), now())
      else t.registration_completed_at
    end
where t.registration_draft = '{}'::jsonb
  and t.last_completed_step = -1;

create index if not exists teams_registration_lifecycle_idx
  on public.teams (lifecycle_status, last_activity_at desc);
create index if not exists teams_registration_resume_idx
  on public.teams (captain_id, league_id, season_year, lifecycle_status);

create or replace function public.guard_duplicate_league_registration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lifecycle_status <> 'cancelled' and exists (
    select 1 from teams t where t.id <> new.id and t.captain_id = new.captain_id
      and t.league_id = new.league_id and coalesce(t.season_year, 0) = coalesce(new.season_year, 0)
      and t.lifecycle_status <> 'cancelled'
  ) then raise exception 'duplicate_league_registration'; end if;
  return new;
end $$;
drop trigger if exists guard_duplicate_league_registration on public.teams;
create trigger guard_duplicate_league_registration before insert or update of captain_id, league_id, season_year
on public.teams for each row execute function public.guard_duplicate_league_registration();

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lifecycle_status = old.lifecycle_status then return new; end if;
  if (old.lifecycle_status = 'draft' and new.lifecycle_status in ('incomplete','cancelled'))
    or (old.lifecycle_status = 'incomplete' and new.lifecycle_status in ('awaiting_documents','awaiting_review','awaiting_payment','cancelled'))
    or (old.lifecycle_status = 'awaiting_documents' and new.lifecycle_status in ('incomplete','awaiting_review','cancelled'))
    or (old.lifecycle_status = 'awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_payment','cancelled'))
    or (old.lifecycle_status = 'awaiting_payment' and new.lifecycle_status in ('awaiting_review','completed','cancelled'))
  then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%', old.lifecycle_status, new.lifecycle_status;
end $$;
drop trigger if exists guard_registration_lifecycle_transition on public.teams;
create trigger guard_registration_lifecycle_transition before update of lifecycle_status on public.teams
for each row execute function public.guard_registration_lifecycle_transition();

alter table public.invoices
  add column if not exists registration_id uuid references public.teams(id) on delete restrict;
update public.invoices set registration_id = team_id where registration_id is null;
alter table public.invoices alter column registration_id set not null;
create index if not exists invoices_registration_id_idx on public.invoices(registration_id);

-- Captains may view invoices for their own registration even when they are not
-- yet a formal company member. Existing company-member and super-admin policy
-- remains in force; PostgreSQL combines permissive SELECT policies with OR.
drop policy if exists invoices_select_team_captain on public.invoices;
create policy invoices_select_team_captain on public.invoices for select to authenticated using (
  exists (select 1 from public.teams t where t.id = invoices.team_id and t.captain_id = auth.uid())
);

create or replace function public.sync_registration_payment_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration_id := coalesce(new.registration_id, new.team_id);
  if new.registration_id is distinct from new.team_id then raise exception 'invoice_registration_mismatch'; end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update teams set lifecycle_status = 'completed', registration_stage = 'completed', registration_progress = 100,
      registration_completed_at = now(), last_activity_at = now() where id = new.team_id;
  elsif new.status = 'pending' then
    update teams set lifecycle_status = 'awaiting_payment', registration_stage = 'payment',
      registration_progress = greatest(registration_progress, 85), last_activity_at = now() where id = new.team_id;
  end if;
  return new;
end $$;
drop trigger if exists sync_registration_payment_lifecycle on public.invoices;
create trigger sync_registration_payment_lifecycle before insert or update of status on public.invoices
for each row execute function public.sync_registration_payment_lifecycle();

create table if not exists public.registration_reminder_settings (
  reminder_type text primary key,
  template_key text not null,
  is_active boolean not null default true,
  delay_hours integer not null default 24 check (delay_hours >= 1),
  max_sends integer not null default 3 check (max_sends between 1 and 20),
  interval_hours integer not null default 48 check (interval_hours >= 1),
  variables text[] not null default '{}',
  default_message_fa text,
  updated_at timestamptz not null default now()
);
insert into public.registration_reminder_settings(reminder_type, template_key, variables, default_message_fa) values
 ('incomplete_registration','incomplete_registration_reminder',array['name','league_name'],'ثبت‌نام شما در {league_name} هنوز تکمیل نشده است.'),
 ('team_approval','team_approval_reminder',array['team_name','league_name'],'مراحل تأیید تیم {team_name} هنوز کامل نشده است.'),
 ('account_verification','account_verification_reminder',array['name','league_name'],'برای ادامه ثبت‌نام، اطلاعات حساب خود را تکمیل و تأیید کنید.'),
 ('payment','payment_reminder',array['team_name','league_name','invoice_number'],'صورت‌حساب ثبت‌نام {team_name} هنوز پرداخت نشده است.')
on conflict (reminder_type) do nothing;

create table if not exists public.registration_reminder_log (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null references public.registration_reminder_settings(reminder_type),
  registration_id uuid not null references public.teams(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  recipient text not null,
  notification_id uuid references public.notification_log(id) on delete set null,
  status text not null default 'queued',
  provider_response jsonb,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists registration_reminder_log_lookup_idx
  on public.registration_reminder_log(registration_id, reminder_type, queued_at desc);

alter table public.registration_reminder_settings enable row level security;
alter table public.registration_reminder_log enable row level security;
drop policy if exists reminder_settings_sa on public.registration_reminder_settings;
create policy reminder_settings_sa on public.registration_reminder_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists reminder_log_sa on public.registration_reminder_log;
create policy reminder_log_sa on public.registration_reminder_log for select to authenticated using (public.is_super_admin());

create or replace function public.enqueue_registration_reminder(p_team_id uuid, p_reminder_type text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype; v_setting registration_reminder_settings%rowtype; v_invoice invoices%rowtype;
  v_phone text; v_name text; v_league text; v_count integer; v_last timestamptz; v_notification uuid;
begin
  if auth.uid() is not null and not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into v_setting from registration_reminder_settings where reminder_type = p_reminder_type and is_active;
  if not found then return false; end if;
  select * into v_team from teams where id = p_team_id and lifecycle_status not in ('completed','cancelled');
  if not found or v_team.last_activity_at > now() - make_interval(hours => v_setting.delay_hours) then return false; end if;
  select phone, full_name into v_phone, v_name from profiles where id = v_team.captain_id;
  select name into v_league from leagues where id = v_team.league_id;
  select count(*), max(coalesce(sent_at, queued_at)) into v_count, v_last from registration_reminder_log where registration_id = p_team_id and reminder_type = p_reminder_type;
  if v_count >= v_setting.max_sends or (v_last is not null and v_last > now() - make_interval(hours => v_setting.interval_hours)) then return false; end if;
  if p_reminder_type = 'payment' then
    select * into v_invoice from invoices where team_id = p_team_id and status = 'pending' and archived_at is null order by created_at desc limit 1;
    if not found then return false; end if;
  elsif p_reminder_type = 'account_verification' and not exists (select 1 from profiles where id = v_team.captain_id and account_status = 'pending') then return false;
  elsif p_reminder_type = 'team_approval' and v_team.lifecycle_status not in ('awaiting_documents','awaiting_review') then return false;
  elsif p_reminder_type = 'incomplete_registration' and v_team.lifecycle_status not in ('draft','incomplete','awaiting_documents') then return false;
  end if;
  if nullif(trim(v_phone), '') is null then return false; end if;
  insert into notification_log(channel, template_key, phone, status, idempotency_key, meta)
  values ('sms', case p_reminder_type
      when 'incomplete_registration' then 'incomplete_registration_reminder'
      when 'team_approval' then 'team_approval_reminder'
      when 'account_verification' then 'account_verification_reminder'
      when 'payment' then 'payment_reminder'
    end, v_phone, 'pending', 'registration-reminder:'||p_reminder_type||':'||p_team_id||':'||(v_count+1),
    jsonb_build_object('provider_template',v_setting.template_key,'token_order',to_jsonb(v_setting.variables),'name',v_name,'team_name',v_team.name,'league_name',v_league,'invoice_number',v_invoice.invoice_number,'amount',v_invoice.amount,'registration_id',p_team_id))
  returning id into v_notification;
  insert into registration_reminder_log(reminder_type,registration_id,invoice_id,recipient,notification_id)
  values(p_reminder_type,p_team_id,v_invoice.id,v_phone,v_notification);
  return true;
end $$;
revoke all on function public.enqueue_registration_reminder(uuid,text) from public;
grant execute on function public.enqueue_registration_reminder(uuid,text) to authenticated;

-- ===== 0045_participants_team_people_multi_judge.sql =====
-- Participant identity, dependent team people and official multi-judge result engine.

create or replace function public.normalize_iran_mobile(p_value text)
returns text language sql immutable returns null on null input as $$
  select case
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^00989[0-9]{9}$' then '0' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 5)
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^989[0-9]{9}$' then '0' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 3)
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^9[0-9]{9}$' then '0' || regexp_replace(p_value, '[^0-9]', '', 'g')
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^09[0-9]{9}$' then regexp_replace(p_value, '[^0-9]', '', 'g')
    when trim(p_value) like '+%' and regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$' then '+' || regexp_replace(p_value, '[^0-9]', '', 'g')
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 3)
    else null
  end
$$;

create or replace function public.normalize_and_guard_profile_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text;
begin
  v_phone := public.normalize_iran_mobile(new.phone);
  if v_phone is null then raise exception 'invalid_mobile'; end if;
  if exists(select 1 from public.profiles p where p.id <> new.id and public.normalize_iran_mobile(p.phone) = v_phone)
    or exists(select 1 from auth.users u where u.id <> new.id and public.normalize_iran_mobile(u.phone) = v_phone)
  then raise exception 'duplicate_normalized_phone'; end if;
  new.phone := v_phone;
  return new;
end $$;
drop trigger if exists normalize_and_guard_profile_phone on public.profiles;
create trigger normalize_and_guard_profile_phone before insert or update of phone on public.profiles
for each row execute function public.normalize_and_guard_profile_phone();

create or replace function public.normalize_and_guard_auth_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text;
begin
  if nullif(trim(new.phone), '') is null then return new; end if;
  v_phone := public.normalize_iran_mobile(new.phone);
  if v_phone is null then raise exception 'invalid_mobile'; end if;
  if exists(select 1 from auth.users u where u.id <> new.id and public.normalize_iran_mobile(u.phone) = v_phone)
    or exists(select 1 from public.profiles p where p.id <> new.id and public.normalize_iran_mobile(p.phone) = v_phone)
  then raise exception 'duplicate_normalized_phone'; end if;
  new.phone := v_phone;
  return new;
end $$;
drop trigger if exists normalize_and_guard_auth_phone on auth.users;
create trigger normalize_and_guard_auth_phone before insert or update of phone on auth.users
for each row execute function public.normalize_and_guard_auth_phone();
create index if not exists profiles_normalized_phone_idx on public.profiles(public.normalize_iran_mobile(phone));
create index if not exists auth_users_normalized_phone_idx on auth.users(public.normalize_iran_mobile(phone));

alter table public.profiles
  add column if not exists gender text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists landline text,
  add column if not exists country_code text not null default 'IR',
  add column if not exists nationality text,
  add column if not exists residence text,
  add column if not exists is_foreign boolean not null default false,
  add column if not exists passport_number text,
  add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check(gender is null or gender in ('male','female','other'));
create unique index if not exists profiles_passport_uidx on public.profiles(lower(passport_number)) where passport_number is not null and trim(passport_number) <> '';

create table if not exists public.participant_field_rules (
  field_key text primary key,
  label_fa text not null,
  label_en text not null,
  is_required boolean not null default false,
  is_locked boolean not null default false,
  applies_to text not null default 'both' check(applies_to in ('individual','legal','both')),
  updated_at timestamptz not null default now()
);
insert into public.participant_field_rules(field_key,label_fa,label_en,is_required,is_locked,applies_to) values
 ('first_name_fa','نام فارسی','Persian first name',true,true,'both'),
 ('last_name_fa','نام خانوادگی فارسی','Persian last name',true,true,'both'),
 ('first_name_en','نام انگلیسی','English first name',true,true,'both'),
 ('last_name_en','نام خانوادگی انگلیسی','English last name',true,true,'both'),
 ('birth_date','تاریخ تولد','Date of birth',true,true,'individual'),
 ('gender','جنسیت','Gender',true,false,'individual'),
 ('email','ایمیل','Email',true,false,'both'),
 ('province','استان','Province',true,false,'both'),
 ('city','شهر','City',true,false,'both'),
 ('landline','تلفن ثابت','Landline',false,false,'both'),
 ('country_code','کشور','Country',true,true,'both'),
 ('nationality','تابعیت','Nationality',true,false,'both'),
 ('residence','محل سکونت','Residence',true,false,'both'),
 ('postal_code','کد پستی','Postal code',true,false,'both'),
 ('address','نشانی','Address',true,false,'both'),
 ('avatar_url','تصویر پروفایل','Profile image',false,false,'both')
on conflict(field_key) do nothing;
alter table public.participant_field_rules enable row level security;
drop policy if exists participant_field_rules_read on public.participant_field_rules;
drop policy if exists participant_field_rules_admin on public.participant_field_rules;
create policy participant_field_rules_read on public.participant_field_rules for select to authenticated using(true);
create policy participant_field_rules_admin on public.participant_field_rules for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());

create or replace function public.validate_completed_participant_identity()
returns trigger language plpgsql set search_path = public as $$
declare v_rule record; v_value text;
begin
  if new.identity_completed_at is null then return new; end if;
  if new.is_foreign and nullif(trim(new.passport_number), '') is null then raise exception 'passport_required_for_foreign_participant'; end if;
  if not new.is_foreign and new.account_type = 'individual' and nullif(trim(new.national_id), '') is null then raise exception 'national_id_required_for_iranian_participant'; end if;
  for v_rule in select * from participant_field_rules where is_required and (applies_to = 'both' or applies_to = new.account_type) loop
    v_value := case v_rule.field_key
      when 'first_name_fa' then new.first_name_fa when 'last_name_fa' then new.last_name_fa
      when 'first_name_en' then new.first_name_en when 'last_name_en' then new.last_name_en
      when 'birth_date' then new.birth_date::text when 'gender' then new.gender when 'email' then new.email
      when 'province' then new.province when 'city' then new.city when 'landline' then new.landline
      when 'country_code' then new.country_code when 'nationality' then new.nationality
      when 'residence' then new.residence when 'postal_code' then new.postal_code when 'address' then new.address
      when 'avatar_url' then new.avatar_url else 'unsupported'
    end;
    if nullif(trim(v_value), '') is null then raise exception 'required_participant_field:%', v_rule.field_key; end if;
  end loop;
  return new;
end $$;
drop trigger if exists validate_completed_participant_identity on public.profiles;
create trigger validate_completed_participant_identity before insert or update on public.profiles
for each row execute function public.validate_completed_participant_identity();

alter table public.team_members
  add column if not exists father_name_fa text,
  add column if not exists father_name_en text,
  add column if not exists photo_url text,
  add column if not exists phone text,
  add column if not exists residence text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists country_code text not null default 'IR',
  add column if not exists nationality text,
  add column if not exists is_foreign boolean not null default false,
  add column if not exists passport_number text,
  add column if not exists education_level text,
  add column if not exists field_of_study text;
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check(role in ('captain','coach','member'));
alter table public.team_members drop constraint if exists team_members_education_level_check;
alter table public.team_members add constraint team_members_education_level_check check(education_level is null or education_level in ('primary','middle_school','high_school','associate','bachelor','master','doctorate'));

alter table public.leagues add column if not exists coach_fee numeric not null default 0;
alter table public.leagues add column if not exists result_formula text not null default 'average';
alter table public.leagues add column if not exists required_judge_count integer;
alter table public.leagues add constraint leagues_result_formula_check check(result_formula in ('average','sum'));

create or replace function public.validate_team_people_before_payment()
returns trigger language plpgsql set search_path = public as $$
declare v_person record;
begin
  if new.lifecycle_status <> 'awaiting_payment' or old.lifecycle_status = 'awaiting_payment' then return new; end if;
  if not exists(select 1 from team_members where team_id = new.id and role = 'captain') then raise exception 'team_captain_required'; end if;
  for v_person in select * from team_members where team_id = new.id loop
    if nullif(trim(v_person.first_name_fa), '') is null or nullif(trim(v_person.last_name_fa), '') is null
      or nullif(trim(v_person.first_name_en), '') is null or nullif(trim(v_person.last_name_en), '') is null
      or v_person.birth_date is null or nullif(trim(v_person.photo_url), '') is null
      or nullif(trim(v_person.father_name_fa), '') is null or nullif(trim(v_person.father_name_en), '') is null
      or nullif(trim(v_person.residence), '') is null or nullif(trim(v_person.country_code), '') is null
      or nullif(trim(v_person.education_level), '') is null
    then raise exception 'incomplete_team_person:%', v_person.id; end if;
    if v_person.is_foreign and nullif(trim(v_person.passport_number), '') is null then raise exception 'team_person_passport_required:%', v_person.id; end if;
    if not v_person.is_foreign and nullif(trim(v_person.national_id), '') is null then raise exception 'team_person_national_id_required:%', v_person.id; end if;
    if v_person.role in ('captain','coach') and nullif(trim(v_person.phone), '') is null then raise exception 'team_person_phone_required:%', v_person.id; end if;
  end loop;
  return new;
end $$;
drop trigger if exists validate_team_people_before_payment on public.teams;
create trigger validate_team_people_before_payment before update of lifecycle_status on public.teams
for each row execute function public.validate_team_people_before_payment();

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_team teams%rowtype; v_fee numeric; v_member_count integer; v_coach_count integer; v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if v_team.status <> 'draft' then raise exception 'team is not in draft status'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_team.company_id and cm.user_id=v_uid) and v_team.captain_id<>v_uid then raise exception 'forbidden'; end if;
  select count(*) filter(where role='member'), count(*) filter(where role='coach') into v_member_count,v_coach_count from team_members where team_id=p_team_id;
  select coalesce(registration_fee,0)+coalesce(captain_fee,0)+coalesce(member_fee,0)*v_member_count+coalesce(coach_fee,0)*v_coach_count into v_fee from leagues where id=v_team.league_id;
  select * into v_invoice from invoices where team_id=p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then update invoices set amount=v_fee,company_id=v_team.company_id,status=case when receipt_status='pending_review' then status else 'pending'::payment_status end where id=v_invoice.id returning * into v_invoice; return v_invoice; end if;
  insert into invoices(team_id,company_id,amount,status,invoice_number) values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number()) returning * into v_invoice;
  return v_invoice;
end $$;

alter table public.league_admins add column if not exists assignment_role text not null default 'judge';
alter table public.league_admins drop constraint if exists league_admins_assignment_role_check;
alter table public.league_admins add constraint league_admins_assignment_role_check check(assignment_role in ('judge','head_judge','operator'));

create table if not exists public.judge_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  judge_id uuid not null references public.profiles(id) on delete restrict,
  season_year integer not null,
  score_payload jsonb not null default '{}'::jsonb,
  total_score numeric not null default 0,
  notes text,
  status text not null default 'draft' check(status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,judge_id,season_year)
);
delete from public.results a using public.results b
where a.team_id=b.team_id and a.season_year=b.season_year and a.id>b.id;
create unique index if not exists results_team_season_uidx on public.results(team_id,season_year);
alter table public.judge_scores enable row level security;
drop policy if exists judge_scores_read on public.judge_scores;
drop policy if exists judge_scores_write on public.judge_scores;
create policy judge_scores_read on public.judge_scores for select to authenticated using(public.is_super_admin() or judge_id=auth.uid() or exists(select 1 from league_admins la where la.league_id=judge_scores.league_id and la.user_id=auth.uid()));
create policy judge_scores_write on public.judge_scores for all to authenticated using(public.is_super_admin() or judge_id=auth.uid()) with check(public.is_super_admin() or (judge_id=auth.uid() and exists(select 1 from league_admins la where la.league_id=judge_scores.league_id and la.user_id=auth.uid() and la.assignment_role in ('judge','head_judge'))));

create or replace function public.aggregate_official_league_results(p_league_id uuid,p_season_year integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_required integer; v_formula text;
begin
  select coalesce(required_judge_count,(select count(*) from league_admins where league_id=p_league_id and assignment_role in ('judge','head_judge'))),result_formula into v_required,v_formula from leagues where id=p_league_id;
  if v_required < 1 then return; end if;
  insert into results(league_id,team_id,company_id,season_year,score,rank,notes,published_at)
  select p_league_id,t.id,t.company_id,p_season_year,
    case when v_formula='sum' then sum(js.total_score) else avg(js.total_score) end,null,
    'official_multi_judge_engine',null
  from teams t
  join judge_scores js on js.team_id=t.id and js.season_year=p_season_year and js.status='submitted'
  join league_admins assigned on assigned.league_id=p_league_id and assigned.user_id=js.judge_id and assigned.assignment_role in ('judge','head_judge')
  where t.league_id=p_league_id group by t.id,t.company_id
  having count(distinct js.judge_id)>=v_required
  on conflict(team_id,season_year) do update set score=excluded.score,notes=excluded.notes;
  with ranked as(select id,dense_rank() over(order by score desc nulls last)::integer as calculated_rank from results where league_id=p_league_id and season_year=p_season_year and notes='official_multi_judge_engine')
  update results r set rank=ranked.calculated_rank from ranked where r.id=ranked.id;
end $$;

create or replace function public.save_judge_score(p_team_id uuid,p_season_year integer,p_scores jsonb,p_notes text default null,p_submit boolean default false)
returns public.judge_scores language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_row judge_scores%rowtype; v_total numeric;
begin
  select * into v_team from teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not exists(select 1 from league_admins where league_id=v_team.league_id and user_id=auth.uid() and assignment_role in ('judge','head_judge')) and not public.is_super_admin() then raise exception 'forbidden'; end if;
  if exists(select 1 from judge_scores where team_id=p_team_id and judge_id=auth.uid() and season_year=p_season_year and status='submitted') then raise exception 'judge_score_already_submitted'; end if;
  select coalesce(sum(value::numeric),0) into v_total from jsonb_each_text(coalesce(p_scores,'{}'::jsonb)) where value ~ '^-?[0-9]+(\.[0-9]+)?$';
  insert into judge_scores(league_id,team_id,judge_id,season_year,score_payload,total_score,notes,status,submitted_at)
  values(v_team.league_id,p_team_id,auth.uid(),p_season_year,coalesce(p_scores,'{}'::jsonb),v_total,nullif(trim(p_notes),''),case when p_submit then 'submitted' else 'draft' end,case when p_submit then now() else null end)
  on conflict(team_id,judge_id,season_year) do update set score_payload=excluded.score_payload,total_score=excluded.total_score,notes=excluded.notes,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now()
  returning * into v_row;
  perform aggregate_official_league_results(v_team.league_id,p_season_year);
  return v_row;
end $$;
revoke all on function public.save_judge_score(uuid,integer,jsonb,text,boolean) from public;
grant execute on function public.save_judge_score(uuid,integer,jsonb,text,boolean) to authenticated;

create or replace function public.publish_official_team_result(p_team_id uuid,p_season_year integer)
returns public.results language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_result results%rowtype; v_required integer; v_submitted integer;
begin
  select * into v_team from teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not public.is_super_admin() and not exists(select 1 from league_admins where league_id=v_team.league_id and user_id=auth.uid() and assignment_role='head_judge') then raise exception 'head_judge_required'; end if;
  select coalesce(l.required_judge_count,count(distinct la.user_id) filter(where la.assignment_role in ('judge','head_judge'))),
    count(distinct js.judge_id) filter(where js.status='submitted') into v_required,v_submitted
  from leagues l left join league_admins la on la.league_id=l.id
  left join judge_scores js on js.team_id=p_team_id and js.season_year=p_season_year and js.judge_id=la.user_id
  where l.id=v_team.league_id group by l.required_judge_count;
  if v_required<1 or v_submitted<v_required then raise exception 'judge_scores_incomplete:%/%',v_submitted,v_required; end if;
  perform aggregate_official_league_results(v_team.league_id,p_season_year);
  update results set published_at=coalesce(published_at,now()) where team_id=p_team_id and season_year=p_season_year and notes='official_multi_judge_engine' returning * into v_result;
  if not found then raise exception 'official_result_not_ready'; end if;
  return v_result;
end $$;
revoke all on function public.publish_official_team_result(uuid,integer) from public;
grant execute on function public.publish_official_team_result(uuid,integer) to authenticated;
-- The legacy last-write-wins RPC must not bypass the official multi-judge engine.
revoke execute on function public.upsert_team_result(uuid,integer,integer,numeric,text,boolean) from authenticated;

create or replace view public.judge_submission_progress with(security_invoker=true) as
select t.id team_id,t.league_id,t.season_year,
  coalesce(l.required_judge_count,count(distinct la.user_id) filter(where la.assignment_role in ('judge','head_judge'))) required_count,
  count(distinct js.judge_id) filter(where js.status='submitted') submitted_count,
  array_agg(distinct p.full_name) filter(where la.assignment_role in ('judge','head_judge') and not exists(select 1 from judge_scores missing where missing.team_id=t.id and missing.judge_id=la.user_id and missing.season_year=t.season_year and missing.status='submitted')) missing_judges
from teams t join leagues l on l.id=t.league_id left join league_admins la on la.league_id=t.league_id left join profiles p on p.id=la.user_id left join judge_scores js on js.team_id=t.id and js.season_year=t.season_year and js.status='submitted' and js.judge_id=la.user_id
group by t.id,t.league_id,t.season_year,l.required_judge_count;
grant select on public.judge_submission_progress to authenticated;

create or replace view public.public_team_people with(security_invoker=false) as
select tm.id,tm.team_id,tm.full_name,tm.first_name_fa,tm.last_name_fa,tm.first_name_en,tm.last_name_en,tm.photo_url,tm.role
from public.team_members tm join public.teams t on t.id=tm.team_id
where t.status in ('submitted','under_review','approved','waitlisted');
grant select on public.public_team_people to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('profile-avatars','profile-avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('team-member-photos','team-member-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists profile_avatars_manage on storage.objects;
drop policy if exists team_member_photos_manage on storage.objects;
create policy profile_avatars_manage on storage.objects for all to authenticated using(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_super_admin())) with check(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_super_admin()));
create policy team_member_photos_manage on storage.objects for all to authenticated
using(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[1] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))))
with check(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[1] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))));

-- ===== 0046_otp_challenge_state.sql =====
-- Explicit OTP challenge identity and lifecycle state.
-- Server-side timestamptz/now() remains the sole expiration authority.
alter table public.auth_otp_challenges
  add column if not exists purpose text not null default 'login',
  add column if not exists invalidated_at timestamptz;

alter table public.auth_otp_challenges drop constraint if exists auth_otp_challenges_purpose_check;
alter table public.auth_otp_challenges add constraint auth_otp_challenges_purpose_check
  check (purpose in ('login','signup','profile'));

create index if not exists auth_otp_challenges_lookup_idx
  on public.auth_otp_challenges(phone,purpose,created_at desc);
create index if not exists auth_otp_challenges_cleanup_idx
  on public.auth_otp_challenges(expires_at) where consumed_at is null and invalidated_at is null;

-- ===== 0047_auth_registration_entry.sql =====
-- Public registration-link visibility is independent from signup availability.
alter table public.auth_settings
  add column if not exists show_registration_link boolean not null default true;

drop view if exists public.public_auth_options;
create view public.public_auth_options
with (security_invoker = false)
as select
  otp_login_enabled, password_login_enabled, email_magic_login_enabled,
  email_signup_enabled, phone_signup_enabled, show_registration_link,
  online_payment_enabled, card_to_card_enabled,
  bank_card_number, bank_iban, bank_account_owner
from public.auth_settings where id = 1;

grant select on public.public_auth_options to anon, authenticated;

-- ===== 0048_terms_checkout_content.sql =====
-- Bilingual operational pages and server-enforced invoice terms acceptance.
alter table public.static_pages
  add column if not exists title_en text,
  add column if not exists body_en text,
  add column if not exists excerpt_en text;

alter table public.invoices
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.reset_invoice_terms_on_amount_change()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.amount is distinct from old.amount or new.team_id is distinct from old.team_id or new.company_id is distinct from old.company_id then
    new.terms_accepted_at:=null; new.terms_version:=null;
  end if;
  return new;
end $$;
drop trigger if exists reset_invoice_terms_on_amount_change on public.invoices;
create trigger reset_invoice_terms_on_amount_change before update of amount,team_id,company_id on public.invoices
for each row execute function public.reset_invoice_terms_on_amount_change();

insert into public.static_pages(slug,title,title_en,excerpt,excerpt_en,body,body_en)
values
('terms','قوانین و مقررات','Terms and Conditions','چارچوب استفاده از سامانه، ثبت‌نام و پرداخت در جام تبرستان','Rules governing platform use, registration and payments at Tabarestan Cup',
'<h2>حساب و اطلاعات هویتی</h2><p>مسئولیت صحت اطلاعات حساب شرکت‌کننده، تیم‌ها و افراد هر تیم بر عهده صاحب حساب است.</p><h2>ثبت‌نام مسابقه</h2><p>ثبت‌نام پس از تکمیل اطلاعات، مدارک، پرداخت و تأیید نهایی معتبر است.</p><h2>پرداخت و بازپرداخت</h2><p>مبلغ، روش پرداخت و شرایط بازپرداخت هر لیگ پیش از پرداخت نمایش داده می‌شود.</p><h2>رفتار حرفه‌ای</h2><p>شرکت‌کنندگان موظف به رعایت آیین‌نامه مسابقه، حقوق دیگران و تصمیم‌های رسمی کمیته داوری هستند.</p>',
'<h2>Account and identity</h2><p>The participant account owner is responsible for the accuracy of account, team and team-person information.</p><h2>Competition registration</h2><p>Registration becomes valid after required information, documents, payment and final review are completed.</p><h2>Payment and refunds</h2><p>Fees, payment methods and league-specific refund conditions are shown before checkout.</p><h2>Professional conduct</h2><p>Participants must follow competition rules, respect others and comply with official judging decisions.</p>'),
('registration-guide','مراحل و راهنمای ثبت‌نام','Registration Guide','راهنمای قدم‌به‌قدم ساخت حساب، تکمیل هویت، ثبت تیم و پرداخت','A step-by-step guide to account setup, identity, team registration and payment','','')
on conflict(slug) do update set title_en=excluded.title_en, excerpt_en=excluded.excerpt_en,
  body_en=case when nullif(public.static_pages.body_en,'') is null then excluded.body_en else public.static_pages.body_en end;

create or replace function public.accept_invoice_terms(p_invoice_id uuid,p_version text default '2026-08')
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_invoice from invoices where id=p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if not public.is_super_admin()
    and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid)
    and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid)
  then raise exception 'forbidden'; end if;
  update invoices set terms_accepted_at=now(),terms_version=nullif(trim(p_version),'') where id=p_invoice_id returning * into v_invoice;
  return v_invoice;
end $$;
revoke all on function public.accept_invoice_terms(uuid,text) from public;
grant execute on function public.accept_invoice_terms(uuid,text) to authenticated;

create or replace function public.issue_mock_payment_authority(p_invoice_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype; v_secret text;
begin
  if public.get_payment_mode()<>'mock' then raise exception 'not in mock mode'; end if;
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_invoice from invoices where id=p_invoice_id;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid) and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid) then raise exception 'forbidden'; end if;
  select value into v_secret from payment_config where key='mock_secret';
  return 'MOCK-'||encode(digest(p_invoice_id::text||':'||coalesce(v_secret,''),'sha256'),'hex');
end $$;
revoke all on function public.issue_mock_payment_authority(uuid) from public;
grant execute on function public.issue_mock_payment_authority(uuid) to authenticated;

create or replace function public.submit_card_receipt(p_invoice_id uuid,p_receipt_path text)
returns invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select card_to_card_enabled from auth_settings where id=1),false) then raise exception 'card_to_card_disabled'; end if;
  select * into v_invoice from invoices where id=p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.terms_accepted_at is null then raise exception 'terms_not_accepted'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_invoice.company_id and cm.user_id=v_uid) and not exists(select 1 from teams t where t.id=v_invoice.team_id and t.captain_id=v_uid) then raise exception 'forbidden'; end if;
  update invoices set payment_method='card_to_card',receipt_path=p_receipt_path,receipt_status='pending_review',receipt_rejection_reason=null,receipt_submitted_at=now(),receipt_reviewed_at=null,receipt_reviewed_by=null,status='pending' where id=p_invoice_id returning * into v_invoice;
  return v_invoice;
end $$;
revoke all on function public.submit_card_receipt(uuid,text) from public;
grant execute on function public.submit_card_receipt(uuid,text) to authenticated;

-- Legacy compatibility: teams are owned by the participant Account. A person's
-- phone must never resolve to a second CRM Account merely because they captain a team.
create or replace function public.resolve_team_captain(p_company_id uuid,p_phone text,p_full_name_hint text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=p_company_id and cm.user_id=v_uid and cm.is_owner=true) then raise exception 'not company owner'; end if;
  return v_uid;
end $$;
revoke all on function public.resolve_team_captain(uuid,text,text) from public;
grant execute on function public.resolve_team_captain(uuid,text,text) to authenticated;

-- ===== 0049_footer_developer_experience.sql =====
alter table public.site_settings
  add column if not exists developer_credit_fa text default 'طراحی و توسعه',
  add column if not exists developer_credit_en text default 'Designed and developed by',
  add column if not exists developer_name text default 'فارینو',
  add column if not exists developer_url text default 'https://farino.ir';

update public.site_settings
set developer_credit_fa = coalesce(nullif(developer_credit_fa, ''), 'طراحی و توسعه'),
    developer_credit_en = coalesce(nullif(developer_credit_en, ''), 'Designed and developed by'),
    developer_name = coalesce(nullif(developer_name, ''), 'فارینو'),
    developer_url = coalesce(nullif(developer_url, ''), 'https://farino.ir');

-- ===== 0050_editorial_content_seo.sql =====
create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.blog_posts
  add column if not exists category_id uuid references public.content_categories(id) on delete set null,
  add column if not exists author_name text,
  add column if not exists cover_alt text;

alter table public.announcements
  add column if not exists slug text,
  add column if not exists category_id uuid references public.content_categories(id) on delete set null,
  add column if not exists author_name text,
  add column if not exists cover_alt text,
  add column if not exists og_image text;

update public.announcements
set slug = coalesce(nullif(slug, ''), 'announcement-' || id::text)
where slug is null or slug = '';

create unique index if not exists announcements_slug_unique on public.announcements(slug);

alter table public.content_categories enable row level security;
drop policy if exists content_categories_public_select on public.content_categories;
create policy content_categories_public_select on public.content_categories for select using (true);
drop policy if exists content_categories_admin_manage on public.content_categories;
create policy content_categories_admin_manage on public.content_categories for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ===== 0051_contact_social_trust.sql =====
alter table public.site_settings
  add column if not exists contact_map_embed_url text,
  add column if not exists instagram_url text,
  add column if not exists telegram_url text,
  add column if not exists linkedin_url text,
  add column if not exists whatsapp_url text,
  add column if not exists trust_seal_html text;

-- ===== 0052_gallery_albums.sql =====
alter table public.gallery_categories
  add column if not exists description_fa text,
  add column if not exists description_en text;

-- ===== 0053_password_reset_otp_purpose.sql =====
alter table public.auth_otp_challenges drop constraint if exists auth_otp_challenges_purpose_check;
alter table public.auth_otp_challenges add constraint auth_otp_challenges_purpose_check
  check (purpose in ('login','signup','profile','password_reset'));

-- ===== 0054_collaborator_departments.sql =====
alter table public.profiles
  add column if not exists staff_department text;

comment on column public.profiles.staff_department is
  'Internal organizational unit for collaborators, e.g. support, finance, operations or content.';

-- ===== 9999_application_runtime.sql =====
-- Runtime privileges and database-backed realtime event capture.

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-documents', 'profile-documents', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "profile_documents_storage_select" on storage.objects for select to authenticated
using (
  bucket_id = 'profile-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin())
);
create policy "profile_documents_storage_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "profile_documents_storage_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin())
);

create or replace function app_private.capture_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
begin
  insert into app_private.realtime_events(table_name, event, record, old_record)
  values (
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'teams', 'invoices', 'tickets', 'ticket_messages', 'ticket_reads',
    'results', 'leagues', 'live_chat_sessions', 'live_chat_messages',
    'system_notifications', 'account_issues'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists app_realtime_capture on public.%I', table_name);
      execute format(
        'create trigger app_realtime_capture after insert or update or delete on public.%I for each row execute function app_private.capture_realtime_event()',
        table_name
      );
    end if;
  end loop;
end
$$;


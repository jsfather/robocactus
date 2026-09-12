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
using(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[0] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))))
with check(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[0] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))));

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

-- ===== 0055_participant_organizations.sql =====
-- Participant account owns an organization ("majmooe") and organizations own teams.
-- Keep the existing companies table name for backward compatibility with APIs and reports.
alter table public.companies
  add column if not exists entity_type text not null default 'company';

alter table public.companies drop constraint if exists companies_entity_type_check;
alter table public.companies add constraint companies_entity_type_check check (
  entity_type in ('individual','company','institute','school','university','academy','club','other')
);

comment on table public.companies is 'Participant organizations/accounts. May represent an individual or an organization; teams are children through teams.company_id.';
comment on column public.companies.entity_type is 'individual, company, institute, school, university, academy, club, or other';

update public.companies c set entity_type = 'individual'
where exists (
  select 1 from public.company_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.company_id = c.id and cm.is_owner = true and p.account_type = 'individual'
);

create or replace view public.participant_organizations as
select c.*, cm.user_id as owner_user_id
from public.companies c
left join public.company_members cm on cm.company_id = c.id and cm.is_owner = true;

-- ===== 0056_ticket_departments_team_name_guard.sql =====
-- Participant-selected ticket department and race-safe team-name validation.
-- An organization may register multiple teams in one league; only their names
-- must be distinct for the same league season.
alter table public.teams drop constraint if exists teams_company_league_unique;

create or replace function public.create_ticket_with_department(
  p_team_id uuid,
  p_subject text,
  p_body text,
  p_league_id uuid default null,
  p_department_id uuid default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.teams%rowtype;
  v_ticket public.tickets%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if not (public.is_super_admin() or v_team.captain_id = v_uid or exists (
    select 1 from public.company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid
  )) then raise exception 'forbidden'; end if;
  if p_department_id is null or not exists (
    select 1 from public.ticket_departments d where d.id = p_department_id and d.is_active = true
  ) then raise exception 'invalid_department'; end if;

  insert into public.tickets (team_id, league_id, department_id, subject, status)
  values (p_team_id, p_league_id, p_department_id, trim(p_subject), 'open')
  returning * into v_ticket;
  insert into public.ticket_messages (ticket_id, sender_id, body)
  values (v_ticket.id, v_uid, trim(p_body));
  return v_ticket;
end;
$$;

revoke all on function public.create_ticket_with_department(uuid,text,text,uuid,uuid) from public;
grant execute on function public.create_ticket_with_department(uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.team_name_available(
  p_league_id uuid,
  p_season_year integer,
  p_name text,
  p_exclude_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.teams t
    where t.league_id = p_league_id
      and coalesce(t.season_year, 0) = coalesce(p_season_year, 0)
      and lower(btrim(t.name)) = lower(btrim(p_name))
      and (p_exclude_team_id is null or t.id <> p_exclude_team_id)
  );
$$;

revoke all on function public.team_name_available(uuid,integer,text,uuid) from public;
grant execute on function public.team_name_available(uuid,integer,text,uuid) to authenticated;

create or replace function public.guard_unique_team_name_in_league()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is null or btrim(new.name) = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.league_id::text || ':' || coalesce(new.season_year, 0)::text || ':' || lower(btrim(new.name)), 0));
  if exists (
    select 1 from public.teams t
    where t.league_id = new.league_id
      and coalesce(t.season_year, 0) = coalesce(new.season_year, 0)
      and lower(btrim(t.name)) = lower(btrim(new.name))
      and t.id <> new.id
  ) then raise exception 'team_name_already_exists' using errcode = '23505'; end if;
  return new;
end;
$$;

drop trigger if exists teams_unique_name_per_league_guard on public.teams;
create trigger teams_unique_name_per_league_guard
before insert or update of name, league_id, season_year on public.teams
for each row execute function public.guard_unique_team_name_in_league();

-- ===== 0057_invoice_registration_guard.sql =====
-- Invoice numbers must never collide, and invoices may only be generated after
-- team people and their required identity documents are complete.
create sequence if not exists public.invoice_number_seq;

create or replace function public._next_invoice_number()
returns text language sql security definer set search_path = public as $$
  select 'TC-' || to_char(timezone('Asia/Tehran', now()), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text, 8, '0');
$$;

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team public.teams%rowtype;
  v_league public.leagues%rowtype;
  v_fee numeric;
  v_member_count integer;
  v_coach_count integer;
  v_total_count integer;
  v_captain_count integer;
  v_incomplete_count integer;
  v_invoice public.invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if v_team.status <> 'draft' then raise exception 'team_not_payable'; end if;
  if not public.is_super_admin()
    and not exists (select 1 from public.company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid)
    and v_team.captain_id <> v_uid then raise exception 'forbidden'; end if;

  select * into v_league from public.leagues where id = v_team.league_id;
  if not found then raise exception 'league_not_found'; end if;
  select count(*), count(*) filter (where role = 'captain'), count(*) filter (where role = 'member'),
    count(*) filter (where role = 'coach'),
    count(*) filter (where coalesce(first_name_fa,'') = '' or coalesce(last_name_fa,'') = '' or birth_date is null or coalesce(photo_url,'') = '' or coalesce(national_id_doc_path,'') = '')
  into v_total_count, v_captain_count, v_member_count, v_coach_count, v_incomplete_count
  from public.team_members where team_id = p_team_id;

  if v_captain_count < 1 then raise exception 'registration_incomplete:captain'; end if;
  if v_incomplete_count > 0 then raise exception 'registration_incomplete:people'; end if;
  if v_league.team_size_min is not null and v_total_count < v_league.team_size_min then raise exception 'registration_incomplete:min_members'; end if;
  if v_league.team_size_max is not null and v_total_count > v_league.team_size_max then raise exception 'registration_incomplete:max_members'; end if;
  if coalesce(v_team.registration_stage, '') not in ('invoice','payment','completed') and coalesce(v_team.lifecycle_status, '') <> 'awaiting_payment' then
    raise exception 'registration_incomplete:stage';
  end if;

  v_fee := coalesce(v_league.registration_fee,0) + coalesce(v_league.captain_fee,0)
    + coalesce(v_league.member_fee,0) * v_member_count + coalesce(v_league.coach_fee,0) * v_coach_count;
  select * into v_invoice from public.invoices where team_id = p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then
    update public.invoices set amount = v_fee, company_id = v_team.company_id,
      status = case when receipt_status = 'pending_review' then status else 'pending'::public.payment_status end,
      archived_at = null, updated_at = now()
    where id = v_invoice.id returning * into v_invoice;
    return v_invoice;
  end if;
  insert into public.invoices(team_id,company_id,amount,status,invoice_number)
  values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number()) returning * into v_invoice;
  return v_invoice;
end;
$$;

revoke all on function public.create_invoice_for_team(uuid) from public;
grant execute on function public.create_invoice_for_team(uuid) to authenticated;

-- ===== 0058_account_deletion_relations.sql =====
-- Account deletion follows the participant domain: the account owns its teams.
-- Financial/result/ticket rows belonging to those teams are removed only when a
-- super administrator explicitly deletes the owning account.
alter table public.teams drop constraint if exists teams_captain_id_fkey;
alter table public.teams add constraint teams_captain_id_fkey foreign key (captain_id) references public.profiles(id) on delete cascade;

alter table public.teams drop constraint if exists teams_reviewed_by_fkey;
alter table public.teams add constraint teams_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_team_id_fkey;
alter table public.invoices add constraint invoices_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.invoices drop constraint if exists invoices_company_id_fkey;
alter table public.invoices add constraint invoices_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.results drop constraint if exists results_team_id_fkey;
alter table public.results add constraint results_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.results drop constraint if exists results_company_id_fkey;
alter table public.results add constraint results_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.tickets drop constraint if exists tickets_team_id_fkey;
alter table public.tickets add constraint tickets_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.tickets drop constraint if exists tickets_assigned_to_fkey;
alter table public.tickets add constraint tickets_assigned_to_fkey foreign key (assigned_to) references public.profiles(id) on delete set null;

alter table public.notification_log drop constraint if exists notification_log_team_id_fkey;
alter table public.notification_log add constraint notification_log_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null;

alter table public.announcements drop constraint if exists announcements_created_by_fkey;
alter table public.announcements add constraint announcements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.blog_posts drop constraint if exists blog_posts_author_id_fkey;
alter table public.blog_posts add constraint blog_posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_receipt_reviewed_by_fkey;
alter table public.invoices add constraint invoices_receipt_reviewed_by_fkey foreign key (receipt_reviewed_by) references public.profiles(id) on delete set null;

alter table public.account_issues drop constraint if exists account_issues_created_by_fkey;
alter table public.account_issues add constraint account_issues_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.system_notifications drop constraint if exists system_notifications_created_by_fkey;
alter table public.system_notifications add constraint system_notifications_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.captain_invites drop constraint if exists captain_invites_invited_by_fkey;
alter table public.captain_invites add constraint captain_invites_invited_by_fkey foreign key (invited_by) references public.profiles(id) on delete cascade;

alter table public.ticket_messages alter column sender_id drop not null;
alter table public.ticket_messages drop constraint if exists ticket_messages_sender_id_fkey;
alter table public.ticket_messages add constraint ticket_messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_registration_id_fkey;
alter table public.invoices add constraint invoices_registration_id_fkey foreign key (registration_id) references public.teams(id) on delete cascade;

-- ===== 0059_persistent_storage_content.sql =====
-- Dokploy containers are replaceable. Keep the canonical file bytes in
-- PostgreSQL so uploads survive deployments; disk_path remains a read cache.
alter table app_private.storage_objects
  add column if not exists content bytea;

comment on column app_private.storage_objects.content is
  'Canonical persisted file bytes. disk_path is only a local cache/fallback.';

-- ===== 0060_fix_team_member_photos_storage_policy.sql =====
drop policy if exists team_member_photos_manage
on storage.objects;

create policy team_member_photos_manage
on storage.objects
for all
to authenticated
using (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
)
with check (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
);

-- ===== 0061_team_member_photos_storage_policy_v2.sql =====
-- Re-apply the team-member-photos storage policy fix (0060 may not have run on some deployments).
drop policy if exists team_member_photos_manage on storage.objects;

create policy team_member_photos_manage
on storage.objects
for all
to authenticated
using (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
)
with check (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
);

-- ===== 0062_admin_team_deletion.sql =====
create or replace function public.admin_delete_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team public.teams%rowtype;
  v_fk record;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'team_not_found';
  end if;

  if exists (select 1 from public.invoices where team_id = p_team_id and status = 'paid') then
    raise exception 'team_has_paid_invoice';
  end if;

  -- Remove direct dependants that were created by a registration.  This also
  -- covers extensions added by later migrations without hard-coding table names.
  for v_fk in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality as key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.teams'::regclass
      and array_length(con.conkey, 1) = 1
      and not (ns.nspname = 'public' and cls.relname = 'teams')
  loop
    execute format('delete from %I.%I where %I = $1', v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      using p_team_id;
  end loop;

  delete from public.teams where id = p_team_id;
  return jsonb_build_object('id', p_team_id, 'deleted', true, 'name', v_team.name);
end;
$$;

revoke all on function public.admin_delete_team(uuid) from public;
grant execute on function public.admin_delete_team(uuid) to authenticated;

-- ===== 0063_team_registration_document_types.sql =====
alter table public.registration_doc_types
  add column if not exists scope text not null default 'profile'
  check (scope in ('profile', 'team'));

insert into public.registration_doc_types
  (code, label_fa, label_en, account_type, is_required, is_active, sort_order, scope)
values ('team_logo', 'لوگوی تیم', 'Team logo', 'both', false, true, 10, 'team')
on conflict (code) do update set
  label_fa = excluded.label_fa,
  label_en = excluded.label_en,
  is_required = excluded.is_required,
  scope = excluded.scope;

-- ===== 0064_role_section_permissions_account_review.sql =====
create table if not exists public.role_section_permissions (
  role_key text not null,
  section_key text not null,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_key, section_key),
  check (role_key in ('support', 'finance', 'operations', 'judge')),
  check (section_key in ('tickets', 'chat', 'triage', 'account_activation', 'finance', 'team_review'))
);

insert into public.role_section_permissions(role_key, section_key, is_enabled) values
  ('support','tickets',true), ('support','chat',true),
  ('finance','finance',true),
  ('operations','triage',true), ('operations','account_activation',true),
  ('judge','team_review',true)
on conflict do nothing;

alter table public.role_section_permissions enable row level security;
drop policy if exists role_section_permissions_read on public.role_section_permissions;
create policy role_section_permissions_read on public.role_section_permissions for select to authenticated using (true);
drop policy if exists role_section_permissions_manage on public.role_section_permissions;
create policy role_section_permissions_manage on public.role_section_permissions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.has_panel_permission(p_section text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles p
    join public.role_section_permissions rp
      on rp.role_key = case when p.role='league_admin' then 'judge' else coalesce(p.staff_department,'operations') end
     and rp.section_key=p_section and rp.is_enabled
    where p.id=auth.uid() and p.role in ('staff','league_admin')
  )
$$;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (account_status='pending' and public.has_panel_permission('account_activation')));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  update profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel into v_phone,v_email,v_channel;
  if not found then raise exception 'user_not_found'; end if;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,jsonb_build_object('user_id',p_user_id)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,jsonb_build_object('user_id',p_user_id)); end if;
end $$;

grant select on public.role_section_permissions to authenticated;
grant execute on function public.has_panel_permission(text) to authenticated;
grant execute on function public.activate_user_account(uuid) to authenticated;

create or replace function public.review_user_account(p_user_id uuid, p_approved boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected', rejection_reason=trim(p_reason), activated_at=null where id=p_user_id;
    if not found then raise exception 'user_not_found'; end if;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;
grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

-- ===== 0065_signup_resume.sql =====
-- Resume account signup after abandonment; guard duplicate national IDs for individuals.
alter table public.profiles
  add column if not exists signup_step text,
  add column if not exists signup_completed_at timestamptz;

create unique index if not exists profiles_national_id_individual_uidx
  on public.profiles (national_id)
  where account_type = 'individual' and national_id is not null and length(trim(national_id)) > 0;

create or replace function public.guard_duplicate_profile_national_id()
returns trigger
language plpgsql
as $$
begin
  if new.account_type = 'individual'
    and new.national_id is not null
    and length(trim(new.national_id)) > 0
    and exists (
      select 1
      from public.profiles p
      where p.id <> new.id
        and p.account_type = 'individual'
        and p.national_id = new.national_id
      limit 1
    )
  then
    raise exception 'duplicate_national_id';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_duplicate_profile_national_id on public.profiles;
create trigger guard_duplicate_profile_national_id
  before insert or update of national_id, account_type on public.profiles
  for each row execute function public.guard_duplicate_profile_national_id();

-- ===== 0066_enforce_panel_permissions_finance.sql =====
-- Enforce finance permissions at database level without broadening super-admin.
drop policy if exists finance_transactions_role_read on public.finance_transactions;
create policy finance_transactions_role_read on public.finance_transactions for select to authenticated
  using (public.has_panel_permission('finance'));

drop policy if exists invoices_finance_read on public.invoices;
create policy invoices_finance_read on public.invoices for select to authenticated
  using (public.has_panel_permission('finance'));
drop policy if exists invoices_finance_update on public.invoices;
create policy invoices_finance_update on public.invoices for update to authenticated
  using (public.has_panel_permission('finance')) with check (public.has_panel_permission('finance'));

drop policy if exists teams_finance_read on public.teams;
create policy teams_finance_read on public.teams for select to authenticated using (public.has_panel_permission('finance'));
drop policy if exists companies_finance_read on public.companies;
create policy companies_finance_read on public.companies for select to authenticated using (public.has_panel_permission('finance'));

do $$
declare v_name text; v_definition text;
begin
  foreach v_name in array array['admin_update_invoice','admin_archive_invoice','admin_delete_invoice','review_card_receipt'] loop
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name order by p.oid desc limit 1;
    if v_definition is not null then
      v_definition := replace(v_definition, 'public.is_super_admin()', 'public.has_panel_permission(''finance'')');
      execute v_definition;
    end if;
  end loop;
end $$;

do $$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='review_team' order by p.oid desc limit 1;
  if v_definition is not null and position('v_role = ''staff''' in v_definition) > 0 then
    v_definition := replace(v_definition, 'or v_role = ''staff''', 'or (v_role = ''staff'' and public.has_panel_permission(''triage''))');
    execute v_definition;
  end if;
end $$;

-- ===== 0067_zarinpal_payment_attempts.sql =====
-- Durable ZarinPal attempts: an invoice can have multiple authorities and every
-- provider return remains recoverable even when the browser callback is lost.
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  provider text not null default 'zarinpal',
  authority text not null unique,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'requested' check (status in (
    'requested','verifying','paid','cancelled','failed','error','manual_review'
  )),
  provider_code integer,
  ref_id text,
  provider_message text,
  requested_at timestamptz not null default now(),
  returned_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists payment_attempts_invoice_requested_idx
  on public.payment_attempts(invoice_id, requested_at desc);
create index if not exists payment_attempts_open_idx
  on public.payment_attempts(status, requested_at desc)
  where status in ('requested','verifying','error','manual_review');

-- Preserve authorities issued by the previous single-column implementation so
-- an in-flight payment can still return safely during deployment.
insert into public.payment_attempts(invoice_id,user_id,authority,amount,status,requested_at)
select i.id,t.captain_id,i.gateway_ref,i.amount,'requested',i.created_at
from public.invoices i join public.teams t on t.id=i.team_id
where i.payment_method='online' and i.status in ('pending','failed')
  and nullif(trim(i.gateway_ref),'') is not null
on conflict(authority) do nothing;

alter table public.payment_attempts enable row level security;
drop policy if exists payment_attempts_owner_read on public.payment_attempts;
create policy payment_attempts_owner_read on public.payment_attempts for select to authenticated using (
  public.is_super_admin()
  or public.has_panel_permission('finance')
  or user_id = auth.uid()
  or exists (
    select 1 from public.invoices i
    join public.teams t on t.id=i.team_id
    where i.id=payment_attempts.invoice_id and t.captain_id=auth.uid()
  )
);

grant select on public.payment_attempts to authenticated;
comment on table public.payment_attempts is
  'Immutable-per-authority payment trail used for callback recovery and reconciliation.';

-- ===== 0068_payment_provider_setting.sql =====
-- Payment provider selection is managed from the admin panel. NULL preserves
-- the deployment environment as a backwards-compatible fallback.
alter table public.auth_settings
  add column if not exists payment_provider text;

alter table public.auth_settings drop constraint if exists auth_settings_payment_provider_check;
alter table public.auth_settings add constraint auth_settings_payment_provider_check
  check (payment_provider is null or payment_provider in ('mock','zarinpal'));

comment on column public.auth_settings.payment_provider is
  'mock or zarinpal; NULL falls back to PAYMENT_PROVIDER/VITE_PAYMENT_PROVIDER.';

-- ===== 0069_security_hardening.sql =====
-- Consolidate payment mode, enforce server-side triage completeness and scope staff access.

create table if not exists app_private.security_rate_limits(
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
create index if not exists security_rate_limits_reset_idx on app_private.security_rate_limits(reset_at);

create or replace function public.get_payment_mode()
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select payment_provider from public.auth_settings where id=1),
    (select value from public.payment_config where key='payment_mode'),
    'mock'
  );
$$;
revoke all on function public.get_payment_mode() from public;
grant execute on function public.get_payment_mode() to authenticated, anon;

-- Replace the legacy role-wide profile visibility with purpose-bound access.
drop policy if exists profiles_select_own_or_staff on public.profiles;
drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_scoped_select on public.profiles for select to authenticated using (
  id=auth.uid()
  or public.is_super_admin()
  or (account_status='pending' and public.has_panel_permission('account_activation'))
);

drop policy if exists teams_select on public.teams;
create policy teams_scoped_select on public.teams for select to authenticated using (
  captain_id=auth.uid()
  or exists (select 1 from public.company_members cm where cm.company_id=teams.company_id and cm.user_id=auth.uid())
  or public.is_super_admin()
  or (public.has_panel_permission('triage') and status='submitted')
  or (public.has_panel_permission('team_review') and exists (
    select 1 from public.league_admins la where la.league_id=teams.league_id and la.user_id=auth.uid()
  ))
);

drop policy if exists team_members_select on public.team_members;
create policy team_members_scoped_select on public.team_members for select to authenticated using (exists (
  select 1 from public.teams t where t.id=team_members.team_id and (
    t.captain_id=auth.uid()
    or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
    or public.is_super_admin()
    or (public.has_panel_permission('triage') and t.status='submitted')
    or (public.has_panel_permission('team_review') and exists (
      select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
    ))
  )
));

drop policy if exists documents_select on public.documents;
create policy documents_scoped_select on public.documents for select to authenticated using (exists (
  select 1 from public.teams t where t.id=documents.team_id and (
    t.captain_id=auth.uid()
    or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
    or public.is_super_admin()
    or (public.has_panel_permission('triage') and t.status='submitted')
    or (public.has_panel_permission('team_review') and exists (
      select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
    ))
  )
));

drop policy if exists team_documents_select on storage.objects;
create policy team_documents_select on storage.objects for select to authenticated using (
  bucket_id='team-documents' and (
    public.is_super_admin()
    or auth.uid()::text=(storage.foldername(name))[1]
    or exists (
      select 1 from public.documents d join public.teams t on t.id=d.team_id
      where d.file_path=storage.objects.name and (
        t.captain_id=auth.uid()
        or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
        or (public.has_panel_permission('triage') and t.status='submitted')
        or (public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
    )
    or exists (
      select 1 from public.team_members m join public.teams t on t.id=m.team_id
      where m.national_id_doc_path=storage.objects.name and (
        t.captain_id=auth.uid()
        or (public.has_panel_permission('triage') and t.status='submitted')
        or (public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
    )
  )
);

drop policy if exists team_member_photos_review_select on storage.objects;
create policy team_member_photos_review_select on storage.objects for select to authenticated using (
  bucket_id='team-member-photos' and exists (
    select 1 from public.teams t where t.id::text=(storage.foldername(name))[1] and (
      (public.has_panel_permission('triage') and t.status='submitted')
      or (public.has_panel_permission('team_review') and exists (
        select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
      ))
    )
  )
);

-- Triage may read only payment summaries belonging to registrations in its queue.
drop policy if exists invoices_triage_read on public.invoices;
create policy invoices_triage_read on public.invoices for select to authenticated using (
  public.has_panel_permission('triage') and exists (
    select 1 from public.teams t where t.id=invoices.team_id
      and t.status='submitted'
      and t.lifecycle_status in ('awaiting_review','awaiting_payment','completed')
  )
);

drop policy if exists payment_receipts_select on storage.objects;
create policy payment_receipts_select on storage.objects for select to authenticated using (
  bucket_id='payment-receipts' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_super_admin()
    or (public.has_panel_permission('finance') and exists (
      select 1 from public.invoices i where i.receipt_path=storage.objects.name
    ))
    or (public.has_panel_permission('triage') and exists (
      select 1 from public.invoices i join public.teams t on t.id=i.team_id
      where i.receipt_path=storage.objects.name and t.status='submitted'
    ))
  )
);

create or replace function public.review_team(
  p_team_id uuid,
  p_status registration_status,
  p_rejection_reason text default null
)
returns teams language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_role user_role;
  v_missing text[] := array[]::text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  v_role := public.current_user_role();
  if not (
    public.is_super_admin()
    or (v_role='staff' and public.has_panel_permission('triage'))
    or (v_role='league_admin' and public.has_panel_permission('team_review') and exists (
      select 1 from league_admins la where la.league_id=v_team.league_id and la.user_id=v_uid
    ))
  ) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then
    raise exception 'triage_can_only_mark_under_review';
  end if;

  if p_status='under_review' then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if not exists (select 1 from team_members m where m.team_id=p_team_id and m.role='captain') then
      v_missing:=array_append(v_missing,'captain');
    end if;
    if exists (
      select 1 from team_members m where m.team_id=p_team_id and (
        nullif(trim(coalesce(m.first_name_fa,'')),'') is null
        or nullif(trim(coalesce(m.last_name_fa,'')),'') is null
        or m.birth_date is null
        or nullif(trim(coalesce(m.national_id,'')),'') is null
        or nullif(trim(coalesce(m.national_id_doc_path,'')),'') is null
      )
    ) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if exists (
      select 1 from registration_doc_types r
      where r.scope='team' and r.is_active and r.is_required
        and not exists (select 1 from documents d where d.team_id=p_team_id and d.doc_type=r.code)
    ) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if v_team.registration_stage not in ('review','invoice','payment','completed')
      or v_team.registration_progress < 75 then
      v_missing:=array_append(v_missing,'registration_flow');
    end if;
    if not exists (
      select 1 from invoices i where i.team_id=p_team_id
        and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)
    ) then v_missing:=array_append(v_missing,'payment'); end if;
    if cardinality(v_missing)>0 then
      raise exception 'team_dossier_incomplete:%', array_to_string(v_missing,',');
    end if;
  end if;

  update teams set status=p_status,
    rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,
    reviewed_at=now(),reviewed_by=v_uid
  where id=p_team_id returning * into v_team;
  return v_team;
end;
$$;
revoke all on function public.review_team(uuid,registration_status,text) from public;
grant execute on function public.review_team(uuid,registration_status,text) to authenticated;

-- Protect guest chat storage from unbounded messages even if a client bypasses the UI.
create or replace function public.send_live_chat_guest_message(p_token text,p_body text)
returns live_chat_messages language plpgsql security definer set search_path=public as $$
declare v_session live_chat_sessions%rowtype; v_msg live_chat_messages%rowtype;
begin
  select * into v_session from live_chat_sessions where guest_token=p_token for update;
  if not found or v_session.status='closed' then raise exception 'session_not_found'; end if;
  if length(trim(coalesce(p_body,'')))<1 then raise exception 'empty_body'; end if;
  if length(p_body)>5000 then raise exception 'message_too_long'; end if;
  if (select count(*) from live_chat_messages where session_id=v_session.id and sender_kind='guest' and created_at>now()-interval '1 minute')>=12 then
    raise exception 'too_many_attempts';
  end if;
  insert into live_chat_messages(session_id,sender_kind,body) values(v_session.id,'guest',trim(p_body)) returning * into v_msg;
  update live_chat_sessions set last_message_at=now() where id=v_session.id;
  return v_msg;
end;
$$;
revoke all on function public.send_live_chat_guest_message(text,text) from public;
grant execute on function public.send_live_chat_guest_message(text,text) to anon,authenticated;

-- ===== 0070_competition_attendance_clearance.sql =====
-- Post-payment attendance clearance: member review -> technical files -> rules -> confirmed.

create table if not exists public.league_attendance_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  enabled boolean not null default true,
  member_review_title_fa text not null default 'بررسی فنی اعضای تیم',
  member_review_title_en text not null default 'Team member technical review',
  member_review_help_fa text not null default 'تیم و اعضای شما در حال بررسی هستند. لطفاً منتظر بمانید؛ در صورت نیاز از طریق تیکت یا شماره پشتیبانی با ما در ارتباط باشید.',
  member_review_help_en text not null default 'Your team and its members are being reviewed. Please wait, or contact support through a ticket or phone if needed.',
  article_required boolean not null default true,
  video_required boolean not null default true,
  article_max_bytes bigint not null default 94371840 check (article_max_bytes between 1048576 and 94371840),
  video_max_bytes bigint not null default 94371840 check (video_max_bytes between 1048576 and 94371840),
  technical_help_fa text not null default 'مقاله و ویدیوی ربات را بارگذاری و برای بررسی کمیته فنی ارسال کنید.',
  technical_help_en text not null default 'Upload the robot paper and video, then submit them for technical review.',
  rules_title_fa text not null default 'تعهدنامه حضور در مسابقات',
  rules_title_en text not null default 'Competition attendance agreement',
  rules_body_fa text not null default 'با تأیید این بخش، رعایت قوانین اجرایی، ایمنی و انضباطی مسابقات را می‌پذیرم و صحت اطلاعات تیم را تأیید می‌کنم.',
  rules_body_en text not null default 'By confirming, I accept the competition operational, safety and conduct rules and confirm that the team information is accurate.',
  participant_note_enabled boolean not null default true,
  participant_note_label_fa text not null default 'یادداشت برای دبیرخانه (اختیاری)',
  participant_note_label_en text not null default 'Note to the secretariat (optional)',
  confirmation_title_fa text not null default 'مجوز حضور در مسابقات صادر شد',
  confirmation_title_en text not null default 'Competition attendance confirmed',
  confirmation_message_fa text not null default 'فرآیند تأیید تیم کامل شده است. اطلاعات زمان و محل برگزاری را در همین صفحه مشاهده کنید.',
  confirmation_message_en text not null default 'Your team clearance is complete. Competition date and venue are shown on this page.',
  venue_fa text,
  venue_en text,
  venue_address_fa text,
  venue_address_en text,
  event_starts_at timestamptz,
  support_phone text,
  updated_at timestamptz not null default now()
);

insert into public.league_attendance_settings(league_id)
select id from public.leagues on conflict (league_id) do nothing;

create table if not exists public.team_attendance_clearances (
  team_id uuid primary key references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  stage text not null default 'members' check (stage in ('members','technical','rules','confirmed')),
  technical_status text not null default 'locked' check (technical_status in ('locked','draft','pending','approved','rejected')),
  technical_rejection_reason text,
  technical_submitted_at timestamptz,
  technical_reviewed_at timestamptz,
  technical_reviewed_by uuid references public.profiles(id) on delete set null,
  rules_accepted_at timestamptz,
  rules_accepted_by uuid references public.profiles(id) on delete set null,
  participant_note text check (participant_note is null or length(participant_note) <= 3000),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_technical_files (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('article','robot_video')),
  file_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 94371840),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, kind)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('technical-submissions','technical-submissions',false,94371840,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4','video/webm','video/quicktime'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.league_attendance_settings enable row level security;
alter table public.team_attendance_clearances enable row level security;
alter table public.team_technical_files enable row level security;

create policy attendance_settings_read on public.league_attendance_settings for select to authenticated using (true);
create policy attendance_settings_admin on public.league_attendance_settings for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy attendance_clearance_read on public.team_attendance_clearances for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t where t.id=team_id and (t.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=team_attendance_clearances.league_id and la.user_id=auth.uid()))
);
create policy technical_files_read on public.team_technical_files for select to authenticated using (
  public.is_super_admin()
  or uploaded_by=auth.uid()
  or exists(select 1 from public.teams t where t.id=team_id and (t.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid()))
);

create or replace function public.can_access_technical_submission(p_path text, p_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists (
    select 1
    from public.teams t
    left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id::text=(storage.foldername(p_path))[1]
      and (
        t.captain_id=auth.uid()
        or cm.user_id is not null
        or (not p_write and public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
  );
$$;
drop policy if exists technical_submission_storage_read on storage.objects;
drop policy if exists technical_submission_storage_write on storage.objects;
drop policy if exists technical_submission_storage_delete on storage.objects;
create policy technical_submission_storage_read on storage.objects for select to authenticated
using (bucket_id='technical-submissions' and (owner=auth.uid() or public.can_access_technical_submission(name, false)));
create policy technical_submission_storage_write on storage.objects for insert to authenticated
with check (bucket_id='technical-submissions' and owner=auth.uid() and public.can_access_technical_submission(name, true));
create policy technical_submission_storage_delete on storage.objects for delete to authenticated
using (bucket_id='technical-submissions' and owner=auth.uid() and public.can_access_technical_submission(name, true));

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_row team_attendance_clearances%rowtype; v_paid boolean; v_members_ok boolean; v_enabled boolean;
begin
  select * into v_team from teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  select exists(select 1 from invoices i where i.team_id=p_team_id and (i.status='paid' or i.amount<=0)) into v_paid;
  if not v_paid then raise exception 'payment_required'; end if;
  insert into team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();
  select coalesce(enabled,true) into v_enabled from league_attendance_settings where league_id=v_team.league_id;
  if not coalesce(v_enabled,true) then
    update team_attendance_clearances set stage='confirmed',confirmed_at=coalesce(confirmed_at,now()),updated_at=now() where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;
  select exists(select 1 from team_members where team_id=p_team_id)
    and not exists(select 1 from team_members where team_id=p_team_id and review_status<>'approved') into v_members_ok;
  update team_attendance_clearances set
    stage=case when stage='confirmed' then stage when v_team.status='approved' and v_members_ok then case when technical_status in ('approved') then 'rules' else 'technical' end else 'members' end,
    technical_status=case when v_team.status='approved' and v_members_ok and technical_status='locked' then 'draft' when not (v_team.status='approved' and v_members_ok) then 'locked' else technical_status end,
    updated_at=now() where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.get_or_create_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null or public.is_super_admin()
      or (public.has_panel_permission('team_review') and exists(select 1 from league_admins la where la.league_id=t.league_id and la.user_id=auth.uid())))) then raise exception 'forbidden'; end if;
  insert into league_attendance_settings(league_id) select league_id from teams where id=p_team_id on conflict(league_id) do nothing;
  return public.sync_team_attendance(p_team_id);
end $$;

create or replace function public._create_league_attendance_settings() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into league_attendance_settings(league_id) values(new.id) on conflict(league_id) do nothing; return new;
end $$;
drop trigger if exists create_league_attendance_settings on public.leagues;
create trigger create_league_attendance_settings after insert on public.leagues for each row execute function public._create_league_attendance_settings();

create or replace function public.upsert_team_technical_file(p_team_id uuid,p_kind text,p_file_path text,p_original_name text,p_mime_type text,p_size_bytes bigint)
returns public.team_technical_files language plpgsql security definer set search_path=public as $$
declare
  v_row public.team_technical_files%rowtype;
  v_setting public.league_attendance_settings%rowtype;
  v_allowed boolean := false;
  v_file_owned boolean := false;
  v_max_bytes bigint;
  v_technical_status text;
begin
  if p_kind not in ('article', 'robot_video') then
    raise exception 'invalid_file_kind';
  end if;

  select exists (
    select 1
    from public.teams t
    left join public.company_members cm
      on cm.company_id = t.company_id
     and cm.user_id = auth.uid()
    where t.id = p_team_id
      and (t.captain_id = auth.uid() or cm.user_id is not null)
  ) into v_allowed;
  if not v_allowed then
    raise exception 'forbidden';
  end if;

  select s.*
    into v_setting
  from public.league_attendance_settings s
  join public.teams t on t.league_id = s.league_id
  where t.id = p_team_id;
  if not found then
    raise exception 'attendance_settings_not_found';
  end if;

  v_max_bytes := case
    when p_kind = 'article' then coalesce(v_setting.article_max_bytes, 94371840)
    else coalesce(v_setting.video_max_bytes, 94371840)
  end;
  if p_size_bytes <= 0 or p_size_bytes > v_max_bytes then
    raise exception 'file_too_large';
  end if;
  if p_kind = 'article' and p_mime_type not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'invalid_file_type';
  end if;
  if p_kind = 'robot_video' and p_mime_type not in ('video/mp4', 'video/webm', 'video/quicktime') then
    raise exception 'invalid_file_type';
  end if;
  if split_part(p_file_path, '/', 1) <> p_team_id::text then
    raise exception 'invalid_file_reference';
  end if;

  select exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'technical-submissions'
      and o.name = p_file_path
      and o.owner = auth.uid()
  ) into v_file_owned;
  if not v_file_owned then
    raise exception 'invalid_file_reference';
  end if;

  select a.technical_status
    into v_technical_status
  from public.sync_team_attendance(p_team_id) a;
  if v_technical_status not in ('draft', 'rejected') then
    raise exception 'technical_submission_locked';
  end if;

  insert into public.team_technical_files(team_id,kind,file_path,original_name,mime_type,size_bytes,uploaded_by)
  values(p_team_id,p_kind,p_file_path,left(p_original_name,255),p_mime_type,p_size_bytes,auth.uid())
  on conflict(team_id,kind) do update set file_path=excluded.file_path,original_name=excluded.original_name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,uploaded_by=auth.uid(),updated_at=now()
  returning * into v_row;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,updated_at=now() where team_id=p_team_id;
  return v_row;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype; v_setting league_attendance_settings%rowtype;
begin
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from league_attendance_settings s join teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'technical' or v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),updated_at=now() where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from teams t join league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),stage=case when p_approved then 'rules' else 'technical' end,updated_at=now()
  where team_id=p_team_id returning * into v_row; return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype; v_notes boolean;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select participant_note_enabled into v_notes from league_attendance_settings s join teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,stage='confirmed',confirmed_at=now(),updated_at=now()
  where team_id=p_team_id returning * into v_row; return v_row;
end $$;

create or replace function public._attendance_after_member_review() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.review_status<>'approved' then update teams set status='under_review',reviewed_at=now() where id=new.team_id and status='approved'; end if;
  if exists(select 1 from invoices where team_id=new.team_id and (status='paid' or amount<=0)) then perform public.sync_team_attendance(new.team_id); end if; return new;
end $$;
drop trigger if exists attendance_after_member_review on public.team_members;
create trigger attendance_after_member_review after update of review_status on public.team_members for each row execute function public._attendance_after_member_review();

create or replace function public._protect_reviewed_member_edits() returns trigger language plpgsql security definer set search_path=public as $$
declare v_reviewer boolean;
begin
  v_reviewer := public.is_super_admin() or (public.has_panel_permission('team_review') and exists(
    select 1 from teams t join league_admins la on la.league_id=t.league_id where t.id=old.team_id and la.user_id=auth.uid()
  ));
  if not v_reviewer and exists(select 1 from team_attendance_clearances where team_id=old.team_id) and (
    old.first_name_fa is distinct from new.first_name_fa or old.last_name_fa is distinct from new.last_name_fa
    or old.first_name_en is distinct from new.first_name_en or old.last_name_en is distinct from new.last_name_en
    or old.national_id is distinct from new.national_id or old.birth_date is distinct from new.birth_date
    or old.role is distinct from new.role or old.phone is distinct from new.phone
    or old.national_id_doc_path is distinct from new.national_id_doc_path or old.photo_url is distinct from new.photo_url
  ) then
    if old.review_status<>'rejected' then raise exception 'member_edit_not_allowed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_reviewed_member_edits on public.team_members;
create trigger protect_reviewed_member_edits before update on public.team_members for each row execute function public._protect_reviewed_member_edits();

create or replace function public.submit_team_member_correction(p_member_id uuid)
returns team_members language plpgsql security definer set search_path=public as $$
declare v_row team_members%rowtype;
begin
  if not exists(select 1 from team_members m join teams t on t.id=m.team_id left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where m.id=p_member_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  update team_members set review_status='pending',rejection_reason=null where id=p_member_id and review_status='rejected' returning * into v_row;
  if not found then raise exception 'member_edit_not_allowed'; end if;
  return v_row;
end $$;

create or replace function public._guard_team_approval() returns trigger language plpgsql set search_path=public as $$ begin
  if new.status='approved' and old.status is distinct from new.status and (
    not exists(select 1 from team_members where team_id=new.id)
    or exists(select 1 from team_members where team_id=new.id and review_status<>'approved')
  ) then raise exception 'team_members_not_approved'; end if;
  return new;
end $$;
drop trigger if exists guard_team_approval on public.teams;
create trigger guard_team_approval before update of status on public.teams for each row execute function public._guard_team_approval();

create or replace function public._attendance_after_team_review() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if exists(select 1 from invoices where team_id=new.id and (status='paid' or amount<=0)) then perform public.sync_team_attendance(new.id); end if; return new;
end $$;
drop trigger if exists attendance_after_team_review on public.teams;
create trigger attendance_after_team_review after update of status on public.teams for each row execute function public._attendance_after_team_review();

create or replace function public._attendance_after_payment() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.status='paid' and old.status is distinct from new.status then perform public.sync_team_attendance(new.team_id); end if; return new;
end $$;
drop trigger if exists attendance_after_payment on public.invoices;
create trigger attendance_after_payment after update of status on public.invoices for each row execute function public._attendance_after_payment();

revoke all on function public.sync_team_attendance(uuid) from public;
revoke all on function public.get_or_create_team_attendance(uuid) from public;
revoke all on function public.upsert_team_technical_file(uuid,text,text,text,text,bigint) from public;
revoke all on function public.submit_team_technical_files(uuid) from public;
revoke all on function public.review_team_technical_files(uuid,boolean,text) from public;
revoke all on function public.accept_team_attendance_rules(uuid,boolean,text) from public;
revoke all on function public.submit_team_member_correction(uuid) from public;
grant execute on function public.get_or_create_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.submit_team_member_correction(uuid) to authenticated;

-- ===== 0071_attendance_scoring_guard.sql =====
-- Follow-up to 0070. Keep applied migrations immutable so checksum validation remains reliable.

-- Existing paid registrations must enter the same clearance flow as new payments.
do $$
declare
  v_team_id uuid;
begin
  for v_team_id in
    select distinct i.team_id
    from public.invoices i
    where i.team_id is not null
      and (i.status = 'paid' or i.amount <= 0)
  loop
    perform public.sync_team_attendance(v_team_id);
  end loop;
end $$;

-- A judge may only score a team after its attendance clearance is complete.
create or replace function public._guard_judge_score_clearance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.team_attendance_clearances c
    where c.team_id = new.team_id
      and c.stage = 'confirmed'
      and c.confirmed_at is not null
  ) then
    raise exception 'team_attendance_not_confirmed';
  end if;
  return new;
end
$$;

drop trigger if exists guard_judge_score_clearance on public.judge_scores;
create trigger guard_judge_score_clearance
before insert or update on public.judge_scores
for each row execute function public._guard_judge_score_clearance();

revoke all on function public._guard_judge_score_clearance() from public;

-- ===== 0072_unified_team_enrollment_flow.sql =====
-- Unified enrollment: team data -> review -> technical approval -> rules -> payment -> clearance.

alter table public.league_attendance_settings
  add column if not exists team_documents_enabled boolean not null default true,
  add column if not exists team_documents_notice_fa text not null default 'برای شرکت در این دوره ارائه مدارک و مستندات تیم الزامی است.',
  add column if not exists team_documents_notice_en text not null default 'Team documents are required to participate in this competition.';

drop policy if exists attendance_settings_public_read on public.league_attendance_settings;
create policy attendance_settings_public_read on public.league_attendance_settings
  for select to anon using (true);

alter table public.team_attendance_clearances drop constraint if exists team_attendance_clearances_stage_check;
alter table public.team_attendance_clearances add constraint team_attendance_clearances_stage_check
  check (stage in ('members','technical','rules','payment','confirmed'));

alter table public.teams drop constraint if exists teams_lifecycle_status_check;
alter table public.teams add constraint teams_lifecycle_status_check check (lifecycle_status in (
  'draft','incomplete','awaiting_documents','awaiting_review','awaiting_technical_review',
  'awaiting_rules','awaiting_payment','completed','cancelled'
));
alter table public.teams drop constraint if exists teams_registration_stage_check;
alter table public.teams add constraint teams_registration_stage_check check (registration_stage in (
  'team_info','members','documents','review','technical','technical_review','rules','invoice','payment','completed'
));

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status = old.lifecycle_status then return new; end if;
  if new.lifecycle_status = 'cancelled' then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents')
     and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status = 'awaiting_review'
     and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status = 'awaiting_technical_review'
     and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status = 'awaiting_rules'
     and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status = 'awaiting_payment'
     and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%', old.lifecycle_status, new.lifecycle_status;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances
language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype;
  v_row public.team_attendance_clearances%rowtype;
  v_paid boolean := false;
  v_members_ok boolean := false;
  v_enabled boolean := true;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;

  insert into public.league_attendance_settings(league_id)
  values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id)
  values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();

  select coalesce(s.enabled,true) into v_enabled
  from public.league_attendance_settings s where s.league_id=v_team.league_id;
  select exists(
    select 1 from public.invoices i where i.team_id=p_team_id
      and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)
  ) into v_paid;
  select exists(select 1 from public.team_members m where m.team_id=p_team_id)
    and not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.review_status<>'approved')
    into v_members_ok;

  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not coalesce(v_enabled,true) then
    update public.team_attendance_clearances set
      stage=case when v_paid then 'confirmed' else 'payment' end,
      rules_accepted_at=coalesce(rules_accepted_at,now()),
      confirmed_at=case when v_paid then coalesce(confirmed_at,now()) else null end,
      updated_at=now()
    where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;

  update public.team_attendance_clearances set
    stage=case
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then 'confirmed'
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null then 'payment'
      when v_team.status='approved' and v_members_ok and technical_status='approved' then 'rules'
      when not (v_team.status='approved' and v_members_ok) then 'members'
      when technical_status in ('draft','pending','rejected') then 'technical'
      else 'members'
    end,
    confirmed_at=case
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid
        then coalesce(confirmed_at,now())
      else null
    end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.upsert_team_technical_file(p_team_id uuid,p_kind text,p_file_path text,p_original_name text,p_mime_type text,p_size_bytes bigint)
returns public.team_technical_files language plpgsql security definer set search_path=public as $$
declare
  v_row public.team_technical_files%rowtype;
  v_setting public.league_attendance_settings%rowtype;
  v_allowed boolean;
  v_owned boolean;
  v_status text;
  v_max bigint;
begin
  if p_kind not in ('article','robot_video') then raise exception 'invalid_file_kind'; end if;
  select exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) into v_allowed;
  if not v_allowed then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  if not found then raise exception 'attendance_settings_not_found'; end if;
  v_max:=case when p_kind='article' then coalesce(v_setting.article_max_bytes,94371840) else coalesce(v_setting.video_max_bytes,94371840) end;
  if p_size_bytes<=0 or p_size_bytes>v_max then raise exception 'file_too_large'; end if;
  if p_kind='article' and p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'invalid_file_type'; end if;
  if p_kind='robot_video' and p_mime_type not in ('video/mp4','video/webm','video/quicktime') then raise exception 'invalid_file_type'; end if;
  if split_part(p_file_path,'/',1)<>p_team_id::text then raise exception 'invalid_file_reference'; end if;
  select exists(select 1 from storage.objects o where o.bucket_id='technical-submissions' and o.name=p_file_path and o.owner=auth.uid()) into v_owned;
  if not v_owned then raise exception 'invalid_file_reference'; end if;
  perform public.sync_team_attendance(p_team_id);
  select technical_status into v_status from public.team_attendance_clearances where team_id=p_team_id;
  if v_status not in ('locked','draft','rejected') then raise exception 'technical_submission_locked'; end if;
  insert into public.team_technical_files(team_id,kind,file_path,original_name,mime_type,size_bytes,uploaded_by)
  values(p_team_id,p_kind,p_file_path,left(p_original_name,255),p_mime_type,p_size_bytes,auth.uid())
  on conflict(team_id,kind) do update set file_path=excluded.file_path,original_name=excluded.original_name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,uploaded_by=auth.uid(),updated_at=now()
  returning * into v_row;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,updated_at=now() where team_id=p_team_id;
  return v_row;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  perform public.sync_team_attendance(p_team_id);
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),updated_at=now() where team_id=p_team_id returning * into v_row;
  update public.teams set status=case when status='draft' then 'submitted' else status end,
    lifecycle_status='awaiting_review',registration_stage='technical_review',registration_progress=60,last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(
    select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()
  ))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,
    technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),updated_at=now()
  where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  update public.teams set
    lifecycle_status=case when p_approved and v_row.stage='rules' then 'awaiting_rules' else 'awaiting_review' end,
    registration_stage=case when p_approved and v_row.stage='rules' then 'rules' else 'technical_review' end,
    registration_progress=case when p_approved and v_row.stage='rules' then 72 else 60 end,
    last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_notes boolean;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select participant_note_enabled into v_notes from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update public.team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),
    participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,updated_at=now()
  where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  update public.teams set lifecycle_status=case when v_row.stage='confirmed' then 'completed' else 'awaiting_payment' end,
    registration_stage=case when v_row.stage='confirmed' then 'completed' else 'invoice' end,
    registration_progress=case when v_row.stage='confirmed' then 100 else 82 end,last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.review_team(p_team_id uuid,p_status registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_role user_role; v_missing text[]:=array[]::text[]; v_docs_enabled boolean:=true;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  v_role:=public.current_user_role();
  if not (public.is_super_admin() or (v_role='staff' and public.has_panel_permission('triage')) or
    (v_role='league_admin' and public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=v_team.league_id and la.user_id=v_uid))) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then raise exception 'triage_can_only_mark_under_review'; end if;
  select coalesce(team_documents_enabled,true) into v_docs_enabled from public.league_attendance_settings where league_id=v_team.league_id;
  if p_status in ('under_review','approved') then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.role='captain') then v_missing:=array_append(v_missing,'captain'); end if;
    if exists(select 1 from public.team_members m where m.team_id=p_team_id and (nullif(trim(coalesce(m.first_name_fa,'')),'') is null or nullif(trim(coalesce(m.last_name_fa,'')),'') is null or m.birth_date is null or nullif(trim(coalesce(m.national_id_doc_path,'')),'') is null or nullif(trim(coalesce(m.photo_url,'')),'') is null)) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if v_docs_enabled and exists(select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.doc_type=r.code)) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if not exists(select 1 from public.team_attendance_clearances c where c.team_id=p_team_id and c.technical_status in ('pending','approved')) then v_missing:=array_append(v_missing,'technical_submission'); end if;
    if cardinality(v_missing)>0 then raise exception 'team_dossier_incomplete:%',array_to_string(v_missing,','); end if;
  end if;
  update public.teams set status=p_status,rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,reviewed_at=now(),reviewed_by=v_uid where id=p_team_id returning * into v_team;
  perform public.sync_team_attendance(p_team_id);
  return v_team;
end $$;

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_league public.leagues%rowtype; v_flow public.team_attendance_clearances%rowtype; v_fee numeric; v_member_count integer; v_coach_count integer; v_invoice public.invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_team from public.teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not public.is_super_admin() and not exists(select 1 from public.company_members cm where cm.company_id=v_team.company_id and cm.user_id=v_uid) and v_team.captain_id<>v_uid then raise exception 'forbidden'; end if;
  select * into v_flow from public.sync_team_attendance(p_team_id);
  if v_flow.stage not in ('payment','confirmed') or v_flow.rules_accepted_at is null then raise exception 'registration_incomplete:approval'; end if;
  select * into v_league from public.leagues where id=v_team.league_id;
  select count(*) filter(where role='member'),count(*) filter(where role='coach') into v_member_count,v_coach_count from public.team_members where team_id=p_team_id;
  v_fee:=coalesce(v_league.registration_fee,0)+coalesce(v_league.captain_fee,0)+coalesce(v_league.member_fee,0)*v_member_count+coalesce(v_league.coach_fee,0)*v_coach_count;
  select * into v_invoice from public.invoices where team_id=p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then update public.invoices set amount=v_fee,company_id=v_team.company_id,status=case when receipt_status='pending_review' then status else 'pending'::public.payment_status end,archived_at=null,updated_at=now() where id=v_invoice.id returning * into v_invoice; return v_invoice; end if;
  insert into public.invoices(team_id,company_id,amount,status,invoice_number,registration_id) values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number(),v_team.id) returning * into v_invoice;
  return v_invoice;
end $$;

revoke all on function public.sync_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.review_team(uuid,registration_status,text),public.create_invoice_for_team(uuid) from public;
grant execute on function public.get_or_create_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.create_invoice_for_team(uuid) to authenticated;

-- ===== 0073_team_clearance_status_and_reopen.sql =====
-- Clearance is derived from the full dossier. Reopening is deadline-bound and audited.

alter table public.team_attendance_clearances
  add column if not exists edit_reopened_at timestamptz,
  add column if not exists edit_reopened_by uuid references public.profiles(id) on delete set null;

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status=old.lifecycle_status then return new; end if;
  if new.lifecycle_status='cancelled' then return new; end if;
  if old.lifecycle_status='completed' and new.lifecycle_status='incomplete' and not exists(select 1 from public.team_members where team_id=new.id) then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents') and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status='awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_technical_review' and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_rules' and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status='awaiting_payment' and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%',old.lifecycle_status,new.lifecycle_status;
end $$;

create table if not exists public.team_registration_change_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  entity_type text not null check (entity_type in ('team','member','document','flow')),
  entity_id uuid,
  change_kind text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists team_registration_change_log_team_idx
  on public.team_registration_change_log(team_id,changed_at desc);
alter table public.team_registration_change_log enable row level security;
drop policy if exists team_registration_change_log_read on public.team_registration_change_log;
create policy team_registration_change_log_read on public.team_registration_change_log for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid()))
);

create or replace function public._log_team_registration_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_team_id uuid; v_entity text;
begin
  v_entity:=case tg_table_name when 'team_members' then 'member' when 'documents' then 'document' else 'team' end;
  v_team_id:=case when tg_op='DELETE' then old.team_id else new.team_id end;
  if tg_table_name='teams' then v_team_id:=case when tg_op='DELETE' then old.id else new.id end; end if;
  if v_team_id is null or not exists(select 1 from public.team_attendance_clearances c where c.team_id=v_team_id) then return coalesce(new,old); end if;
  insert into public.team_registration_change_log(team_id,entity_type,entity_id,change_kind,before_data,after_data,changed_by)
  values(v_team_id,v_entity,case when tg_op='DELETE' then old.id else new.id end,lower(tg_op),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
  return coalesce(new,old);
end $$;
drop trigger if exists log_team_member_registration_change on public.team_members;
create trigger log_team_member_registration_change after insert or update or delete on public.team_members for each row execute function public._log_team_registration_change();
drop trigger if exists log_team_document_registration_change on public.documents;
create trigger log_team_document_registration_change after insert or update or delete on public.documents for each row execute function public._log_team_registration_change();

create or replace function public.reopen_team_registration_for_edit(p_team_id uuid)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_deadline timestamptz;
begin
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  select team_edit_deadline into v_deadline from public.leagues where id=v_team.league_id;
  if not (v_team.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=v_team.company_id and cm.user_id=auth.uid())) then raise exception 'forbidden'; end if;
  if v_deadline is not null and v_deadline<now() then raise exception 'team_edit_deadline_passed'; end if;
  if exists(select 1 from public.team_attendance_clearances c where c.team_id=p_team_id and c.stage='confirmed') then raise exception 'clearance_already_issued'; end if;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,edit_reopened_at=now(),edit_reopened_by=auth.uid(),updated_at=now() where team_id=p_team_id;
  update public.team_members set review_status='pending',rejection_reason=null where team_id=p_team_id;
  update public.teams set status='draft',rejection_reason=null,reviewed_at=null,reviewed_by=null,lifecycle_status='incomplete',registration_stage='members',registration_progress=22,last_activity_at=now() where id=p_team_id returning * into v_team;
  insert into public.team_registration_change_log(team_id,entity_type,entity_id,change_kind,after_data,changed_by)
    values(p_team_id,'flow',p_team_id,'reopened_for_edit',jsonb_build_object('deadline',v_deadline),auth.uid());
  return v_team;
end $$;

create or replace function public._protect_reviewed_member_edits()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_reviewer boolean; v_reopened boolean;
begin
  v_reviewer:=public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=old.team_id and la.user_id=auth.uid()));
  select exists(select 1 from public.team_attendance_clearances c join public.teams t on t.id=c.team_id join public.leagues l on l.id=t.league_id where c.team_id=old.team_id and c.edit_reopened_at is not null and (l.team_edit_deadline is null or l.team_edit_deadline>=now())) into v_reopened;
  if not v_reviewer and exists(select 1 from public.team_attendance_clearances where team_id=old.team_id) and (
    old.first_name_fa is distinct from new.first_name_fa or old.last_name_fa is distinct from new.last_name_fa or old.first_name_en is distinct from new.first_name_en or old.last_name_en is distinct from new.last_name_en or old.national_id is distinct from new.national_id or old.birth_date is distinct from new.birth_date or old.role is distinct from new.role or old.phone is distinct from new.phone or old.national_id_doc_path is distinct from new.national_id_doc_path or old.photo_url is distinct from new.photo_url
  ) and old.review_status<>'rejected' and not v_reopened then raise exception 'member_edit_not_allowed'; end if;
  return new;
end $$;

-- Close the edit window as soon as the dossier is submitted again.
create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  perform public.sync_team_attendance(p_team_id);
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),edit_reopened_at=null,edit_reopened_by=null,updated_at=now() where team_id=p_team_id returning * into v_row;
  update public.teams set status='under_review',rejection_reason=null,lifecycle_status='awaiting_review',registration_stage='technical_review',registration_progress=60,last_activity_at=now() where id=p_team_id;
  return v_row;
end $$;

create or replace function public._sync_team_status_from_clearance(p_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_flow public.team_attendance_clearances%rowtype; v_rejected boolean; v_pending boolean; v_has_members boolean;
begin
  select * into v_flow from public.team_attendance_clearances where team_id=p_team_id;
  if not found then return; end if;
  select exists(select 1 from public.team_members where team_id=p_team_id),exists(select 1 from public.team_members where team_id=p_team_id and review_status='rejected'),exists(select 1 from public.team_members where team_id=p_team_id and review_status='pending') into v_has_members,v_rejected,v_pending;
  update public.teams set
    status=case when not v_has_members then 'draft'::public.registration_status when v_flow.stage='confirmed' then 'approved'::public.registration_status when v_rejected or v_flow.technical_status='rejected' then 'rejected'::public.registration_status when v_pending or v_flow.technical_status='pending' then 'under_review'::public.registration_status else status end,
    lifecycle_status=case when not v_has_members then 'incomplete' when v_flow.stage='confirmed' then 'completed' else lifecycle_status end,
    registration_stage=case when not v_has_members then 'members' when v_flow.stage='confirmed' then 'completed' else registration_stage end,
    registration_progress=case when not v_has_members then 22 when v_flow.stage='confirmed' then 100 else registration_progress end,
    rejection_reason=case when v_flow.technical_status='rejected' then v_flow.technical_rejection_reason when v_flow.stage='confirmed' then null else rejection_reason end,
    reviewed_at=case when v_flow.stage='confirmed' then now() else reviewed_at end
  where id=p_team_id;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_row public.team_attendance_clearances%rowtype; v_paid boolean:=false; v_members_ok boolean:=false; v_enabled boolean:=true;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  insert into public.league_attendance_settings(league_id) values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id) on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();
  select coalesce(enabled,true) into v_enabled from public.league_attendance_settings where league_id=v_team.league_id;
  select exists(select 1 from public.invoices i where i.team_id=p_team_id and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)) into v_paid;
  select exists(select 1 from public.team_members where team_id=p_team_id) and not exists(select 1 from public.team_members where team_id=p_team_id and review_status<>'approved') into v_members_ok;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not coalesce(v_enabled,true) then
    update public.team_attendance_clearances set stage=case when v_paid then 'confirmed' else 'payment' end,rules_accepted_at=coalesce(rules_accepted_at,now()),confirmed_at=case when v_paid then coalesce(confirmed_at,now()) else null end,updated_at=now() where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;
  update public.team_attendance_clearances set
    stage=case
      when v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then 'confirmed'
      when v_members_ok and technical_status='approved' and rules_accepted_at is not null then 'payment'
      when v_members_ok and technical_status='approved' then 'rules'
      when not v_members_ok then 'members'
      else 'technical'
    end,
    confirmed_at=case when v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then coalesce(confirmed_at,now()) else null end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public._attendance_after_member_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_team_attendance(new.team_id);
  perform public._sync_team_status_from_clearance(new.team_id);
  return new;
end $$;

create or replace function public._attendance_sync_derived_team_status()
returns trigger language plpgsql security definer set search_path=public as $$ begin perform public._sync_team_status_from_clearance(new.team_id); return new; end $$;
drop trigger if exists attendance_sync_derived_team_status on public.team_attendance_clearances;
create trigger attendance_sync_derived_team_status after insert or update of stage,technical_status on public.team_attendance_clearances for each row execute function public._attendance_sync_derived_team_status();

create or replace function public.review_team(p_team_id uuid,p_status public.registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype;
begin
  if p_status<>'under_review' then raise exception 'team_status_is_automatic'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if not (public.is_super_admin() or (public.has_panel_permission('triage')) or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_team.league_id and user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.team_members where team_id=p_team_id) then raise exception 'team_members_required'; end if;
  update public.teams set status='under_review',rejection_reason=null,reviewed_at=null,reviewed_by=null,last_activity_at=now() where id=p_team_id returning * into v_team;
  return v_team;
end $$;

revoke all on function public.reopen_team_registration_for_edit(uuid) from public;
grant execute on function public.reopen_team_registration_for_edit(uuid) to authenticated;

-- ===== 0074_fix_attendance_status_recursion.sql =====
-- Break the clearance <-> team status trigger loop introduced by 0073.

drop trigger if exists attendance_sync_derived_team_status on public.team_attendance_clearances;

create or replace function public._sync_team_status_from_clearance(p_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_flow public.team_attendance_clearances%rowtype; v_rejected boolean; v_pending boolean; v_has_members boolean;
begin
  select * into v_flow from public.team_attendance_clearances where team_id=p_team_id;
  if not found then return; end if;
  select exists(select 1 from public.team_members where team_id=p_team_id),exists(select 1 from public.team_members where team_id=p_team_id and review_status='rejected'),exists(select 1 from public.team_members where team_id=p_team_id and review_status='pending') into v_has_members,v_rejected,v_pending;
  update public.teams set
    status=case when not v_has_members then 'draft'::public.registration_status when v_flow.stage='confirmed' then 'approved'::public.registration_status when v_rejected or v_flow.technical_status='rejected' then 'rejected'::public.registration_status when v_pending or v_flow.technical_status='pending' then 'under_review'::public.registration_status else status end,
    lifecycle_status=case when not v_has_members then 'incomplete' when v_flow.stage='confirmed' then 'completed' else lifecycle_status end,
    registration_stage=case when not v_has_members then 'members' when v_flow.stage='confirmed' then 'completed' else registration_stage end,
    registration_progress=case when not v_has_members then 22 when v_flow.stage='confirmed' then 100 else registration_progress end,
    rejection_reason=case when v_flow.technical_status='rejected' then v_flow.technical_rejection_reason when v_flow.stage='confirmed' then null else rejection_reason end,
    reviewed_at=case when v_flow.stage='confirmed' then coalesce(reviewed_at,now()) else reviewed_at end
  where id=p_team_id and (
    status is distinct from (case when not v_has_members then 'draft'::public.registration_status when v_flow.stage='confirmed' then 'approved'::public.registration_status when v_rejected or v_flow.technical_status='rejected' then 'rejected'::public.registration_status when v_pending or v_flow.technical_status='pending' then 'under_review'::public.registration_status else status end)
    or lifecycle_status is distinct from (case when not v_has_members then 'incomplete' when v_flow.stage='confirmed' then 'completed' else lifecycle_status end)
    or registration_stage is distinct from (case when not v_has_members then 'members' when v_flow.stage='confirmed' then 'completed' else registration_stage end)
    or registration_progress is distinct from (case when not v_has_members then 22 when v_flow.stage='confirmed' then 100 else registration_progress end)
  );
end $$;

create or replace function public._attendance_after_team_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status is distinct from new.status and exists(select 1 from public.invoices where team_id=new.id and (status='paid' or amount<=0)) then
    perform public.sync_team_attendance(new.id);
  end if;
  return new;
end $$;

create or replace function public._attendance_after_payment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='paid' and old.status is distinct from new.status then
    perform public.sync_team_attendance(new.team_id);
    perform public._sync_team_status_from_clearance(new.team_id);
  end if;
  return new;
end $$;

create or replace function public.get_or_create_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null or public.is_super_admin()
      or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid())))) then raise exception 'forbidden'; end if;
  insert into public.league_attendance_settings(league_id) select league_id from public.teams where id=p_team_id on conflict(league_id) do nothing;
  select * into v_row from public.sync_team_attendance(p_team_id);
  perform public._sync_team_status_from_clearance(p_team_id);
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  perform public._sync_team_status_from_clearance(p_team_id);
  update public.teams set lifecycle_status=case when p_approved and v_row.stage='rules' then 'awaiting_rules' else 'awaiting_review' end,registration_stage=case when p_approved and v_row.stage='rules' then 'rules' else 'technical_review' end,registration_progress=case when p_approved and v_row.stage='rules' then 72 else 60 end,last_activity_at=now() where id=p_team_id;
  return v_row;
end $$;

-- ===== 0075_account_approval_and_team_sms.sql =====
-- Account approval gate for new registrations and lifecycle SMS events.

alter table public.profiles
  add column if not exists requires_account_approval boolean not null default false;

alter table public.sms_settings
  add column if not exists enable_attendance_permit_issued boolean not null default true,
  add column if not exists enable_team_correction_required boolean not null default true,
  add column if not exists enable_team_review_approved boolean not null default true;

create or replace function public.sms_template_enabled(p_template text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare s public.sms_settings%rowtype;
begin
  select * into s from public.sms_settings where id=1;
  if not found then return true; end if;
  return case p_template
    when 'account_approved' then s.enable_account_approved
    when 'league_joined' then s.enable_league_joined
    when 'result_announced' then s.enable_results
    when 'incomplete_profile' then s.enable_incomplete_profile
    when 'account_issue' then s.enable_account_issue
    when 'attendance_permit_issued' then s.enable_attendance_permit_issued
    when 'team_correction_required' then s.enable_team_correction_required
    when 'team_review_approved' then s.enable_team_review_approved
    when 'registration_submitted' then s.enable_league_joined
    when 'payment_confirmed' then s.enable_league_joined
    else true
  end;
end $$;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (requires_account_approval and account_status in ('pending','rejected') and public.has_panel_permission('account_activation')));

drop policy if exists profile_docs_account_reviewer on public.profile_documents;
create policy profile_docs_account_reviewer on public.profile_documents for select to authenticated
  using (public.has_panel_permission('account_activation'));

drop policy if exists profile_documents_storage_account_reviewer on storage.objects;
create policy profile_documents_storage_account_reviewer on storage.objects for select to authenticated
  using (bucket_id='profile-documents' and public.has_panel_permission('account_activation'));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text; v_name text; v_organization text;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  update public.profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel,full_name,coalesce(nullif(company_name,''),full_name) into v_phone,v_email,v_channel,v_name,v_organization;
  if not found then raise exception 'user_not_found'; end if;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into public.notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,
      jsonb_build_object('full_name',v_name,'organization_name',v_organization)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then
    perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,
      jsonb_build_object('full_name',v_name,'organization_name',v_organization));
  end if;
end $$;

create or replace function public.review_user_account(p_user_id uuid,p_approved boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and requires_account_approval and signup_completed_at is not null) then
    raise exception 'registration_not_ready_for_review';
  end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected',rejection_reason=trim(p_reason),activated_at=null where id=p_user_id;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;

create or replace function public._enqueue_team_lifecycle_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_phone text; v_team text; v_league text; v_reason text; v_template text; v_key text;
begin
  select p.phone,t.name,l.name into v_phone,v_team,v_league
  from public.teams t join public.profiles p on p.id=t.captain_id join public.leagues l on l.id=t.league_id
  where t.id=new.team_id;
  if not public.is_real_phone(v_phone) then return new; end if;

  if new.stage='confirmed' and old.stage is distinct from new.stage then
    v_template:='attendance_permit_issued'; v_key:='attendance_permit_issued:'||new.team_id::text;
  elsif new.technical_status='rejected' and old.technical_status is distinct from new.technical_status then
    v_template:='team_correction_required'; v_reason:=coalesce(new.technical_rejection_reason,'نیاز به اصلاح مدارک فنی');
    v_key:='team_correction_required:technical:'||new.team_id::text||':'||extract(epoch from new.updated_at)::bigint::text;
  elsif new.stage='rules' and old.stage is distinct from new.stage then
    v_template:='team_review_approved'; v_key:='team_review_approved:'||new.team_id::text;
  else return new;
  end if;
  if public.sms_template_enabled(v_template) then
    insert into public.notification_log(team_id,channel,template_key,phone,status,idempotency_key,meta)
    values(new.team_id,'sms',v_template,v_phone,'pending',v_key,
      jsonb_build_object('team_name',v_team,'league_name',v_league,'reason',v_reason,'next_step','تأیید قوانین و پرداخت','permit_code',new.id::text))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists enqueue_team_lifecycle_sms on public.team_attendance_clearances;
create trigger enqueue_team_lifecycle_sms after update of stage,technical_status on public.team_attendance_clearances
for each row execute function public._enqueue_team_lifecycle_sms();

create or replace function public._enqueue_member_rejection_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_phone text; v_team text; v_league text;
begin
  if new.review_status='rejected' and old.review_status is distinct from new.review_status then
    select p.phone,t.name,l.name into v_phone,v_team,v_league from public.teams t
      join public.profiles p on p.id=t.captain_id join public.leagues l on l.id=t.league_id where t.id=new.team_id;
    if public.is_real_phone(v_phone) and public.sms_template_enabled('team_correction_required') then
      insert into public.notification_log(team_id,channel,template_key,phone,status,idempotency_key,meta)
      values(new.team_id,'sms','team_correction_required',v_phone,'pending',
        'team_correction_required:member:'||new.id::text||':'||extract(epoch from clock_timestamp())::bigint::text,
        jsonb_build_object('team_name',v_team,'league_name',v_league,'reason',coalesce(new.rejection_reason,'نقص اطلاعات یکی از اعضای تیم')))
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enqueue_member_rejection_sms on public.team_members;
create trigger enqueue_member_rejection_sms after update of review_status on public.team_members
for each row execute function public._enqueue_member_rejection_sms();

grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

create or replace function public._require_approved_participant_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_blocked boolean;
begin
  if auth.uid() is null or public.is_super_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select coalesce(requires_account_approval,false) and account_status<>'active' into v_blocked
    from public.profiles where id=auth.uid();
  if coalesce(v_blocked,false) then raise exception 'account_approval_required'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists require_approved_account_teams on public.teams;
create trigger require_approved_account_teams before insert or update or delete on public.teams
for each row execute function public._require_approved_participant_account();
drop trigger if exists require_approved_account_team_members on public.team_members;
create trigger require_approved_account_team_members before insert or update or delete on public.team_members
for each row execute function public._require_approved_participant_account();
drop trigger if exists require_approved_account_companies on public.companies;
create trigger require_approved_account_companies before insert or update or delete on public.companies
for each row execute function public._require_approved_participant_account();

create or replace function public._protect_account_approval_state()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is distinct from old.id or public.is_super_admin() then return new; end if;
  if old.requires_account_approval then
    if not new.requires_account_approval then raise exception 'protected_profile_fields'; end if;
    if old.account_status='active' and new.account_status is distinct from old.account_status then raise exception 'protected_profile_fields'; end if;
    if old.account_status='pending' and old.signup_completed_at is not null then raise exception 'account_awaiting_approval'; end if;
    if old.account_status='rejected' and not (new.account_status='pending' and new.signup_completed_at is null) then raise exception 'correction_resubmission_required'; end if;
  elsif new.requires_account_approval and new.account_status<>'pending' then
    raise exception 'invalid_account_approval_state';
  elsif not new.requires_account_approval and new.account_status is distinct from old.account_status then
    raise exception 'protected_profile_fields';
  end if;
  return new;
end $$;

drop trigger if exists protect_account_approval_state on public.profiles;
create trigger protect_account_approval_state before update on public.profiles
for each row execute function public._protect_account_approval_state();

drop policy if exists profile_docs_approval_gate on public.profile_documents;
create policy profile_docs_approval_gate on public.profile_documents as restrictive for all to authenticated
  using (user_id<>auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and (not p.requires_account_approval or p.signup_completed_at is null or p.account_status='rejected')))
  with check (user_id<>auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and (not p.requires_account_approval or p.signup_completed_at is null or p.account_status='rejected')));

-- ===== 0076_realtime_profiles.sql =====
-- Realtime account approval events. The API still applies row visibility before delivery.
drop trigger if exists app_realtime_capture on public.profiles;
create trigger app_realtime_capture after insert or update or delete on public.profiles
for each row execute function app_private.capture_realtime_event();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'site_settings','home_banners','home_events','home_faqs','home_partners','home_sponsors',
    'home_stat_cards','home_why_cards','blog_posts','companies','team_attendance_clearances'
  ] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists app_realtime_capture on public.%I',table_name);
      execute format('create trigger app_realtime_capture after insert or update or delete on public.%I for each row execute function app_private.capture_realtime_event()',table_name);
    end if;
  end loop;
end $$;

-- ===== 0077_align_account_review_queue.sql =====
-- Account reviewers must see legacy pending accounts as well as new gated registrations.
drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (account_status in ('pending','rejected') and public.has_panel_permission('account_activation')));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text; v_name text; v_organization text; v_requires boolean; v_completed timestamptz;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  select requires_account_approval,signup_completed_at into v_requires,v_completed from public.profiles where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_requires and v_completed is null then raise exception 'registration_not_ready_for_review'; end if;
  update public.profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel,full_name,coalesce(nullif(company_name,''),full_name) into v_phone,v_email,v_channel,v_name,v_organization;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into public.notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,jsonb_build_object('full_name',v_name,'organization_name',v_organization)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,jsonb_build_object('full_name',v_name,'organization_name',v_organization)); end if;
end $$;

create or replace function public.review_user_account(p_user_id uuid,p_approved boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_profile.account_status not in ('pending','rejected') then raise exception 'account_not_pending_review'; end if;
  if v_profile.requires_account_approval and v_profile.signup_completed_at is null then raise exception 'registration_not_ready_for_review'; end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected',rejection_reason=trim(p_reason),activated_at=null where id=p_user_id;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;

grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

-- ===== 0078_review_audit_and_withdrawals.sql =====
-- Auditable account/team reviews and participant withdrawal workflow.
alter table public.profiles
  add column if not exists account_reviewed_at timestamptz,
  add column if not exists account_reviewed_by uuid references public.profiles(id) on delete set null;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated using (
  id=auth.uid() or public.is_super_admin()
  or (public.has_panel_permission('account_activation') and signup_completed_at is not null)
);

create table if not exists public.review_audit_log (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('account','team_member','technical_files','withdrawal')),
  subject_id uuid not null,
  team_id uuid references public.teams(id) on delete cascade,
  action text not null,
  reason text,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);
create index if not exists review_audit_subject_idx on public.review_audit_log(subject_type,subject_id,reviewed_at desc);
create index if not exists review_audit_team_idx on public.review_audit_log(team_id,reviewed_at desc);

alter table public.league_attendance_settings
  add column if not exists withdrawal_enabled boolean not null default false,
  add column if not exists withdrawal_deadline timestamptz,
  add column if not exists withdrawal_terms_fa text not null default '',
  add column if not exists withdrawal_terms_en text not null default '';

create table if not exists public.team_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists team_withdrawal_open_uidx on public.team_withdrawal_requests(team_id) where status='pending';

alter table public.review_audit_log enable row level security;
alter table public.team_withdrawal_requests enable row level security;
create policy review_audit_read on public.review_audit_log for select to authenticated using (
  public.is_super_admin() or public.has_panel_permission('account_activation') or public.has_panel_permission('team_review')
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=review_audit_log.team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (subject_type='account' and subject_id=auth.uid())
);
create policy withdrawal_read on public.team_withdrawal_requests for select to authenticated using (
  public.is_super_admin() or public.has_panel_permission('team_review')
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
);

create or replace function public._audit_account_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.account_status is distinct from old.account_status and new.account_status in ('active','rejected') then
    new.account_reviewed_at:=now(); new.account_reviewed_by:=auth.uid();
    insert into public.review_audit_log(subject_type,subject_id,action,reason,reviewer_id)
    values('account',new.id,new.account_status,new.rejection_reason,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists audit_account_review on public.profiles;
create trigger audit_account_review before update of account_status on public.profiles for each row execute function public._audit_account_review();

create or replace function public._audit_member_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.review_status is distinct from old.review_status and new.review_status in ('approved','rejected') then
    insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id,reviewed_at)
    values('team_member',new.id,new.team_id,new.review_status,new.rejection_reason,new.reviewed_by,coalesce(new.reviewed_at,now()));
  end if; return new;
end $$;
drop trigger if exists audit_member_review on public.team_members;
create trigger audit_member_review after update of review_status on public.team_members for each row execute function public._audit_member_review();

create or replace function public._audit_technical_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.technical_status is distinct from old.technical_status and new.technical_status in ('approved','rejected') then
    insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id,reviewed_at)
    values('technical_files',new.team_id,new.team_id,new.technical_status,new.technical_rejection_reason,new.technical_reviewed_by,coalesce(new.technical_reviewed_at,now()));
  end if; return new;
end $$;
drop trigger if exists audit_technical_review on public.team_attendance_clearances;
create trigger audit_technical_review after update of technical_status on public.team_attendance_clearances for each row execute function public._audit_technical_review();

create or replace function public.request_team_withdrawal(p_team_id uuid,p_reason text)
returns public.team_withdrawal_requests language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_setting public.league_attendance_settings%rowtype; v_row public.team_withdrawal_requests%rowtype;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if not (v_team.captain_id=auth.uid() or exists(select 1 from public.company_members where company_id=v_team.company_id and user_id=auth.uid())) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.team_attendance_clearances where team_id=p_team_id and stage='confirmed') then raise exception 'clearance_required'; end if;
  select * into v_setting from public.league_attendance_settings where league_id=v_team.league_id;
  if not coalesce(v_setting.withdrawal_enabled,false) then raise exception 'withdrawal_disabled'; end if;
  if v_setting.withdrawal_deadline is not null and now()>v_setting.withdrawal_deadline then raise exception 'withdrawal_deadline_passed'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'withdrawal_reason_too_short'; end if;
  insert into public.team_withdrawal_requests(team_id,league_id,requested_by,reason) values(p_team_id,v_team.league_id,auth.uid(),trim(p_reason)) returning * into v_row;
  return v_row;
end $$;

create or replace function public.review_team_withdrawal(p_request_id uuid,p_approved boolean,p_reason text default null)
returns public.team_withdrawal_requests language plpgsql security definer set search_path=public as $$
declare v_row public.team_withdrawal_requests%rowtype;
begin
  select * into v_row from public.team_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_row.league_id and user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if v_row.status<>'pending' then raise exception 'withdrawal_already_reviewed'; end if;
  if not p_approved and length(trim(coalesce(p_reason,'')))<3 then raise exception 'rejection_reason_required'; end if;
  update public.team_withdrawal_requests set status=case when p_approved then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=nullif(trim(p_reason),''),updated_at=now() where id=p_request_id returning * into v_row;
  if p_approved then update public.teams set lifecycle_status='cancelled',last_activity_at=now() where id=v_row.team_id; end if;
  insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id) values('withdrawal',v_row.id,v_row.team_id,v_row.status,v_row.review_reason,auth.uid());
  return v_row;
end $$;

revoke all on function public.request_team_withdrawal(uuid,text),public.review_team_withdrawal(uuid,boolean,text) from public;
grant execute on function public.request_team_withdrawal(uuid,text),public.review_team_withdrawal(uuid,boolean,text) to authenticated;

-- ===== 0079_registration_controls_and_league_access.sql =====
alter table public.auth_settings
  add column if not exists registration_documents_enabled boolean not null default true,
  add column if not exists manual_account_approval_enabled boolean not null default true;

create or replace view public.public_auth_options with (security_invoker = false) as
select otp_login_enabled,password_login_enabled,email_magic_login_enabled,
  email_signup_enabled,phone_signup_enabled,show_registration_link,
  online_payment_enabled,card_to_card_enabled,bank_card_number,bank_iban,
  bank_account_owner,
  registration_documents_enabled,manual_account_approval_enabled,payment_provider
from public.auth_settings where id=1;
grant select on public.public_auth_options to anon,authenticated;

create or replace function public._apply_signup_completion_settings()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_manual boolean := true;
begin
  if new.signup_completed_at is not null and
     (old.signup_completed_at is null or new.signup_completed_at is distinct from old.signup_completed_at) then
    select coalesce(manual_account_approval_enabled,true) into v_manual from public.auth_settings where id=1;
    if coalesce(v_manual,true) then
      new.requires_account_approval:=true; new.account_status:='pending'; new.activated_at:=null;
    else
      new.requires_account_approval:=false; new.account_status:='active';
      new.activated_at:=coalesce(new.activated_at,now()); new.rejection_reason:=null;
    end if;
  end if;
  return new;
end $$;

create or replace function public._protect_account_approval_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_auto_completion boolean := false;
begin
  if auth.uid() is distinct from old.id or public.is_super_admin() then return new; end if;
  v_auto_completion := new.signup_completed_at is not null
    and new.signup_completed_at is distinct from old.signup_completed_at
    and not coalesce((select manual_account_approval_enabled from public.auth_settings where id=1),true);
  if v_auto_completion then return new; end if;
  if old.requires_account_approval then
    if not new.requires_account_approval then raise exception 'protected_profile_fields'; end if;
    if old.account_status='active' and new.account_status is distinct from old.account_status then raise exception 'protected_profile_fields'; end if;
    if old.account_status='pending' and old.signup_completed_at is not null then raise exception 'account_awaiting_approval'; end if;
    if old.account_status='rejected' and not (new.account_status='pending' and new.signup_completed_at is null) then raise exception 'correction_resubmission_required'; end if;
  elsif new.requires_account_approval and new.account_status<>'pending' then
    raise exception 'invalid_account_approval_state';
  elsif not new.requires_account_approval and new.account_status is distinct from old.account_status then
    raise exception 'protected_profile_fields';
  end if;
  return new;
end $$;

drop trigger if exists apply_signup_completion_settings on public.profiles;
create trigger apply_signup_completion_settings before update of signup_completed_at on public.profiles
for each row execute function public._apply_signup_completion_settings();
drop trigger if exists protect_account_approval_state on public.profiles;
create trigger protect_account_approval_state before update on public.profiles
for each row execute function public._protect_account_approval_state();

drop policy if exists leagues_management_write on public.leagues;
create policy leagues_management_write on public.leagues for all to authenticated
using (public.is_super_admin() or public.has_panel_permission('leagues'))
with check (public.is_super_admin() or public.has_panel_permission('leagues'));

alter table public.teams drop constraint if exists teams_company_league_unique;

alter table public.role_section_permissions drop constraint if exists role_section_permissions_section_key_check;
alter table public.role_section_permissions add constraint role_section_permissions_section_key_check
check (section_key in ('tickets','chat','triage','account_activation','finance','team_review','leagues'));
insert into public.role_section_permissions(role_key,section_key,is_enabled)
values ('operations','leagues',false) on conflict do nothing;

drop policy if exists attendance_settings_admin on public.league_attendance_settings;
create policy attendance_settings_admin on public.league_attendance_settings for all to authenticated
using (public.is_super_admin() or public.has_panel_permission('leagues'))
with check (public.is_super_admin() or public.has_panel_permission('leagues'));

create or replace function public._validate_participant_identifiers()
returns trigger language plpgsql set search_path=public as $$
begin
  if not coalesce(new.is_foreign,false) and nullif(new.phone,'') is not null and new.phone !~ '^09[0-9]{9}$' then
    raise exception 'invalid_phone';
  end if;
  if not coalesce(new.is_foreign,false) and new.account_type='individual'
     and nullif(new.national_id,'') is not null and new.national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  if nullif(new.postal_code,'') is not null and new.postal_code !~ '^[0-9]{10}$' then
    raise exception 'invalid_postal_code';
  end if;
  if new.account_type='legal' and nullif(new.legal_representative_national_id,'') is not null
     and new.legal_representative_national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  return new;
end $$;
drop trigger if exists validate_participant_identifiers on public.profiles;
create trigger validate_participant_identifiers before insert or update of phone,national_id,postal_code,legal_representative_national_id,is_foreign
on public.profiles for each row execute function public._validate_participant_identifiers();

create or replace function public._validate_team_person_identifiers()
returns trigger language plpgsql set search_path=public as $$
begin
  if not coalesce(new.is_foreign,false) and nullif(new.national_id,'') is not null and new.national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  if new.role in ('captain','coach') and nullif(new.phone,'') is not null and new.phone !~ '^09[0-9]{9}$' then
    raise exception 'invalid_phone';
  end if;
  return new;
end $$;
drop trigger if exists validate_team_person_identifiers on public.team_members;
create trigger validate_team_person_identifiers before insert or update of phone,national_id,is_foreign,role
on public.team_members for each row execute function public._validate_team_person_identifiers();

-- ===== 0080_league_cycles_auto_review_archive.sql =====
alter table public.auth_settings add column if not exists live_results_enabled boolean not null default false;
alter table public.companies add column if not exists name_en text;

alter table public.leagues
  add column if not exists auto_approve_team_members boolean not null default false,
  add column if not exists min_captains integer not null default 1 check (min_captains >= 0),
  add column if not exists min_coaches integer not null default 0 check (min_coaches >= 0),
  add column if not exists current_season_month integer not null default extract(month from current_date)::integer check (current_season_month between 1 and 12),
  add column if not exists payment_deadline timestamptz,
  add column if not exists incomplete_archive_after_days integer not null default 4 check (incomplete_archive_after_days between 1 and 90);

alter table public.teams
  add column if not exists season_month integer check (season_month between 1 and 12),
  add column if not exists archived_at timestamptz;
update public.teams t set season_month=coalesce(t.season_month,l.current_season_month,1)
from public.leagues l where l.id=t.league_id and t.season_month is null;

create table if not exists public.league_cycle_archives (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete restrict,
  season_year integer not null,
  season_month integer not null check(season_month between 1 and 12),
  label_fa text not null,
  label_en text not null,
  teams_snapshot jsonb not null default '[]'::jsonb,
  results_snapshot jsonb not null default '[]'::jsonb,
  archived_by uuid references public.profiles(id),
  archived_at timestamptz not null default now(),
  unique(league_id,season_year,season_month)
);
alter table public.league_cycle_archives enable row level security;
create policy league_cycle_archives_public_read on public.league_cycle_archives for select using(public.is_super_admin());
create policy league_cycle_archives_admin on public.league_cycle_archives for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());
grant select on public.league_cycle_archives to anon,authenticated;
grant insert,update,delete on public.league_cycle_archives to authenticated;

create or replace function public._team_person_complete(p public.team_members)
returns boolean language sql immutable as $$
 select nullif(trim(coalesce(p.first_name_fa,'')),'') is not null
 and nullif(trim(coalesce(p.last_name_fa,'')),'') is not null
 and nullif(trim(coalesce(p.first_name_en,'')),'') is not null
 and nullif(trim(coalesce(p.last_name_en,'')),'') is not null
 and p.birth_date is not null
 and nullif(trim(coalesce(p.photo_url,'')),'') is not null
 and nullif(trim(coalesce(p.national_id_doc_path,'')),'') is not null
 and (p.is_foreign or p.national_id ~ '^[0-9]{10}$')
 and (not p.is_foreign or nullif(trim(coalesce(p.passport_number,'')),'') is not null)
 and (p.role not in ('captain','coach') or p.phone ~ '^09[0-9]{9}$')
$$;

create or replace function public._auto_review_team_people()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_team_id uuid:=coalesce(new.team_id,old.team_id); v_league public.leagues%rowtype;
begin
  if pg_trigger_depth()>1 then return new; end if;
  select l.* into v_league from public.teams t join public.leagues l on l.id=t.league_id where t.id=v_team_id;
  if not found or not v_league.auto_approve_team_members then return new; end if;
  if (select count(*) from public.team_members where team_id=v_team_id and role='captain') < v_league.min_captains
    or (select count(*) from public.team_members where team_id=v_team_id and role='coach') < v_league.min_coaches
    or not exists(select 1 from public.team_members where team_id=v_team_id)
    or (v_league.team_size_min is not null and (select count(*) from public.team_members where team_id=v_team_id)<v_league.team_size_min)
    or (v_league.team_size_max is not null and (select count(*) from public.team_members where team_id=v_team_id)>v_league.team_size_max)
    or exists(select 1 from public.team_members m where m.team_id=v_team_id and not public._team_person_complete(m))
    or exists(select 1 from public.team_members m where m.team_id=v_team_id and v_league.min_age is not null and extract(year from age(current_date,m.birth_date))<v_league.min_age)
    or exists(select 1 from public.team_members m where m.team_id=v_team_id and v_league.max_age is not null and extract(year from age(current_date,m.birth_date))>v_league.max_age)
  then return new; end if;
  update public.team_members set review_status='approved',rejection_reason=null,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=null
    where team_id=v_team_id and review_status<>'approved';
  update public.teams set status='approved',rejection_reason=null,reviewed_at=coalesce(reviewed_at,now()) where id=v_team_id;
  perform public.sync_team_attendance(v_team_id);
  return new;
end $$;
drop trigger if exists auto_review_team_people on public.team_members;
create trigger auto_review_team_people after insert or update on public.team_members
for each row execute function public._auto_review_team_people();

create or replace function public.archive_expired_incomplete_teams()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.teams t set archived_at=now()
  from public.leagues l where l.id=t.league_id and t.archived_at is null
    and t.lifecycle_status not in ('completed','cancelled') and l.payment_deadline is not null
    and now() > l.payment_deadline + make_interval(days=>l.incomplete_archive_after_days)
    and not exists(select 1 from public.invoices i where i.team_id=t.id and (i.status='paid' or i.receipt_status='pending_review'));
  get diagnostics v_count=row_count; return v_count;
end $$;

create or replace function public.archive_league_cycle(p_league_id uuid)
returns public.league_cycle_archives language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; a public.league_cycle_archives%rowtype; month_names text[]:=array['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into l from public.leagues where id=p_league_id for update; if not found then raise exception 'league_not_found'; end if;
  if (select count(distinct r.rank) from public.results r join public.teams t on t.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and r.rank between 1 and 3 and r.published_at is not null)<>3 then raise exception 'league_results_required'; end if;
  insert into public.league_cycle_archives(league_id,season_year,season_month,label_fa,label_en,teams_snapshot,results_snapshot,archived_by)
  values(l.id,l.current_season_year,l.current_season_month,month_names[l.current_season_month]||' '||l.current_season_year,l.current_season_year||'-'||lpad(l.current_season_month::text,2,'0'),
    (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.teams t where t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month),
    (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.results r join public.teams rt on rt.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(rt.season_month,l.current_season_month)=l.current_season_month and r.published_at is not null),auth.uid()) returning * into a;
  update public.teams set archived_at=coalesce(archived_at,now()) where league_id=l.id and season_year=l.current_season_year and coalesce(season_month,l.current_season_month)=l.current_season_month;
  update public.leagues set registration_cycle_status='archived',results_status='hidden' where id=l.id;
  return a;
end $$;
revoke all on function public.archive_league_cycle(uuid),public.archive_expired_incomplete_teams() from public;
grant execute on function public.archive_league_cycle(uuid),public.archive_expired_incomplete_teams() to authenticated;

-- A team name is unique inside a cycle, not across the permanent league.
create or replace function public.team_name_available(p_league_id uuid,p_season_year integer,p_name text,p_exclude_team_id uuid default null)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(
    select 1 from public.teams t join public.leagues l on l.id=t.league_id
    where t.league_id=p_league_id and coalesce(t.season_year,0)=coalesce(p_season_year,0)
      and coalesce(t.season_month,l.current_season_month)=l.current_season_month
      and lower(btrim(t.name))=lower(btrim(p_name))
      and (p_exclude_team_id is null or t.id<>p_exclude_team_id)
  )
$$;

create or replace function public.guard_unique_team_name_in_league()
returns trigger language plpgsql set search_path=public as $$
declare v_month integer;
begin
  if new.name is null or btrim(new.name)='' then return new; end if;
  select current_season_month into v_month from public.leagues where id=new.league_id;
  new.season_month:=coalesce(new.season_month,v_month);
  perform pg_advisory_xact_lock(hashtextextended(new.league_id::text||':'||coalesce(new.season_year,0)::text||':'||coalesce(new.season_month,0)::text||':'||lower(btrim(new.name)),0));
  if exists(select 1 from public.teams t where t.league_id=new.league_id
    and coalesce(t.season_year,0)=coalesce(new.season_year,0)
    and coalesce(t.season_month,0)=coalesce(new.season_month,0)
    and lower(btrim(t.name))=lower(btrim(new.name)) and t.id<>new.id)
  then raise exception 'team_name_already_exists' using errcode='23505'; end if;
  return new;
end $$;
drop trigger if exists teams_unique_name_per_league_guard on public.teams;
create trigger teams_unique_name_per_league_guard before insert or update of name,league_id,season_year,season_month on public.teams
for each row execute function public.guard_unique_team_name_in_league();

-- Payment closes immediately at the deadline. A provider callback for an
-- already-started transaction may still mark it paid because it does not
-- modify payment_method/receipt_path.
create or replace function public._guard_invoice_payment_deadline()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_deadline timestamptz; v_archived timestamptz;
begin
  select l.payment_deadline,t.archived_at into v_deadline,v_archived
  from public.teams t join public.leagues l on l.id=t.league_id where t.id=new.team_id;
  if v_archived is not null then raise exception 'registration_archived'; end if;
  if v_deadline is not null and now()>v_deadline then raise exception 'payment_deadline_passed'; end if;
  return new;
end $$;
drop trigger if exists guard_invoice_payment_deadline on public.invoices;
create trigger guard_invoice_payment_deadline before insert or update of payment_method,receipt_path on public.invoices
for each row execute function public._guard_invoice_payment_deadline();

-- Archived incomplete registrations are immutable for participants while
-- administrators retain the ability to correct historical records.
create or replace function public._guard_archived_team_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.archived_at is not null and not public.is_super_admin() then raise exception 'registration_archived'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists guard_archived_team_mutation on public.teams;
create trigger guard_archived_team_mutation before update or delete on public.teams for each row execute function public._guard_archived_team_mutation();

create or replace function public._guard_archived_team_child_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_team_id uuid:=case when tg_op='DELETE' then old.team_id else new.team_id end;
begin
  if exists(select 1 from public.teams where id=v_team_id and archived_at is not null) and not public.is_super_admin()
  then raise exception 'registration_archived'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists guard_archived_member_mutation on public.team_members;
create trigger guard_archived_member_mutation before insert or update or delete on public.team_members for each row execute function public._guard_archived_team_child_mutation();
drop trigger if exists guard_archived_document_mutation on public.documents;
create trigger guard_archived_document_mutation before insert or update or delete on public.documents for each row execute function public._guard_archived_team_child_mutation();

create or replace view public.public_competition_podium with (security_invoker=false) as
select r.id,r.league_id,r.team_id,r.season_year,coalesce(t.season_month,l.current_season_month) season_month,r.rank,r.score,
  t.name team_name,t.name_en team_name_en,l.name league_name,l.name_en league_name_en,l.slug league_slug,
  c.name organization_name,c.name_en organization_name_en,
  concat_ws(' ',cap.first_name_fa,cap.last_name_fa) participant_name_fa,
  concat_ws(' ',cap.first_name_en,cap.last_name_en) participant_name_en
from public.results r join public.teams t on t.id=r.team_id join public.leagues l on l.id=r.league_id
join public.league_cycle_archives a on a.league_id=r.league_id and a.season_year=r.season_year and a.season_month=coalesce(t.season_month,l.current_season_month)
left join public.companies c on c.id=t.company_id
left join lateral(select m.first_name_fa,m.last_name_fa,m.first_name_en,m.last_name_en from public.team_members m where m.team_id=t.id and m.role='captain' order by m.id limit 1) cap on true
where r.published_at is not null and r.rank between 1 and 3;
grant select on public.public_competition_podium to anon,authenticated;

create or replace view public.public_league_participants with (security_invoker=false) as
select t.id team_id,t.league_id,t.season_year,coalesce(t.season_month,l.current_season_month) season_month,
  t.name team_name,t.name_en team_name_en,c.name organization_name,c.name_en organization_name_en,
  concat_ws(' ',cap.first_name_fa,cap.last_name_fa) captain_name_fa,
  concat_ws(' ',cap.first_name_en,cap.last_name_en) captain_name_en,
  coalesce(cap.country_code,'IR') country_code,
  (select count(*)::integer from public.team_members m where m.team_id=t.id) member_count,
  case when t.lifecycle_status='completed' then 'confirmed' when t.lifecycle_status='cancelled' then 'withdrawn' else 'pending' end public_status
from public.teams t join public.leagues l on l.id=t.league_id left join public.companies c on c.id=t.company_id
left join lateral(select m.first_name_fa,m.last_name_fa,m.first_name_en,m.last_name_en,m.country_code from public.team_members m where m.team_id=t.id and m.role='captain' order by m.id limit 1) cap on true
where t.archived_at is null and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month;
grant select on public.public_league_participants to anon,authenticated;

create or replace function public.search_podium_by_national_id(p_national_id text)
returns setof public.public_competition_podium language sql stable security definer set search_path=public as $$
  select distinct p.id,p.league_id,p.team_id,p.season_year,p.season_month,p.rank,p.score,
    p.team_name,p.team_name_en,p.league_name,p.league_name_en,p.league_slug,p.organization_name,p.organization_name_en,
    concat_ws(' ',m.first_name_fa,m.last_name_fa),concat_ws(' ',m.first_name_en,m.last_name_en)
  from public.public_competition_podium p join public.team_members m on m.team_id=p.team_id
  where p_national_id ~ '^[0-9]{10}$' and m.national_id=p_national_id order by p.season_year desc,p.season_month desc,p.rank
$$;
revoke all on function public.search_podium_by_national_id(text) from public;
grant execute on function public.search_podium_by_national_id(text) to anon,authenticated;

create or replace function public.set_league_cycle_podium(p_league_id uuid,p_first_team_id uuid,p_second_team_id uuid,p_third_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; v_team_id uuid; v_rank integer;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if cardinality(array(select distinct unnest(array[p_first_team_id,p_second_team_id,p_third_team_id])))<>3 then raise exception 'podium_teams_must_be_distinct'; end if;
  select * into l from public.leagues where id=p_league_id; if not found then raise exception 'league_not_found'; end if;
  if p_first_team_id is null or p_second_team_id is null or p_third_team_id is null then raise exception 'podium_teams_required'; end if;
  update public.results r set rank=null where r.league_id=l.id and r.season_year=l.current_season_year and r.rank between 1 and 3
    and exists(select 1 from public.teams t where t.id=r.team_id and coalesce(t.season_month,l.current_season_month)=l.current_season_month);
  for v_team_id,v_rank in select * from unnest(array[p_first_team_id,p_second_team_id,p_third_team_id],array[1,2,3]) loop
    if not exists(select 1 from public.teams t where t.id=v_team_id and t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and t.lifecycle_status='completed')
    then raise exception 'podium_team_not_eligible'; end if;
    insert into public.results(league_id,team_id,company_id,season_year,rank,notes,published_at)
    select t.league_id,t.id,t.company_id,l.current_season_year,v_rank,'official_cycle_podium',now() from public.teams t where t.id=v_team_id
    on conflict(team_id,season_year) do update set rank=excluded.rank,published_at=coalesce(public.results.published_at,now());
  end loop;
end $$;
revoke all on function public.set_league_cycle_podium(uuid,uuid,uuid,uuid) from public;
grant execute on function public.set_league_cycle_podium(uuid,uuid,uuid,uuid) to authenticated;

revoke all on function public._auto_review_team_people(),public._guard_invoice_payment_deadline(),public._guard_archived_team_mutation(),public._guard_archived_team_child_mutation() from public;

create or replace function public.review_team(p_team_id uuid,p_status registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_league public.leagues%rowtype; v_role user_role; v_missing text[]:=array[]::text[]; v_docs_enabled boolean:=true;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from public.teams where id=p_team_id for update; if not found then raise exception 'team_not_found'; end if;
  select * into v_league from public.leagues where id=v_team.league_id;
  v_role:=public.current_user_role();
  if not (public.is_super_admin() or (v_role='staff' and public.has_panel_permission('triage')) or (v_role='league_admin' and public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=v_team.league_id and la.user_id=v_uid))) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then raise exception 'triage_can_only_mark_under_review'; end if;
  select coalesce(team_documents_enabled,true) into v_docs_enabled from public.league_attendance_settings where league_id=v_team.league_id;
  if p_status in ('under_review','approved') then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='captain')<v_league.min_captains then v_missing:=array_append(v_missing,'captain'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='coach')<v_league.min_coaches then v_missing:=array_append(v_missing,'coach'); end if;
    if not exists(select 1 from public.team_members where team_id=p_team_id) then v_missing:=array_append(v_missing,'members'); end if;
    if exists(select 1 from public.team_members m where m.team_id=p_team_id and (not public._team_person_complete(m) or (v_league.min_age is not null and extract(year from age(current_date,m.birth_date))<v_league.min_age) or (v_league.max_age is not null and extract(year from age(current_date,m.birth_date))>v_league.max_age))) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if v_league.team_size_min is not null and (select count(*) from public.team_members where team_id=p_team_id)<v_league.team_size_min then v_missing:=array_append(v_missing,'team_size_min'); end if;
    if v_league.team_size_max is not null and (select count(*) from public.team_members where team_id=p_team_id)>v_league.team_size_max then v_missing:=array_append(v_missing,'team_size_max'); end if;
    if v_docs_enabled and exists(select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.doc_type=r.code)) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if not exists(select 1 from public.team_attendance_clearances c where c.team_id=p_team_id and c.technical_status in ('pending','approved')) then v_missing:=array_append(v_missing,'technical_submission'); end if;
    if cardinality(v_missing)>0 then raise exception 'team_dossier_incomplete:%',array_to_string(v_missing,','); end if;
  end if;
  update public.teams set status=p_status,rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,reviewed_at=now(),reviewed_by=v_uid where id=p_team_id returning * into v_team;
  perform public.sync_team_attendance(p_team_id); return v_team;
end $$;
revoke all on function public.review_team(uuid,registration_status,text) from public;
grant execute on function public.review_team(uuid,registration_status,text) to authenticated;

-- ===== 0081_dashboard_channels_ticket_management.sql =====
alter table public.site_settings
  add column if not exists communication_channels jsonb not null default '[
    {"id":"telegram","label_fa":"تلگرام","label_en":"Telegram","icon":"telegram","url":"","enabled":true},
    {"id":"instagram","label_fa":"اینستاگرام","label_en":"Instagram","icon":"instagram","url":"","enabled":true},
    {"id":"rubika","label_fa":"روبیکا","label_en":"Rubika","icon":"message","url":"","enabled":true},
    {"id":"bale","label_fa":"پیام‌رسان بله","label_en":"Bale Messenger","icon":"message","url":"","enabled":true}
  ]'::jsonb;

update public.site_settings set communication_channels=jsonb_build_array(
  jsonb_build_object('id','telegram','label_fa','تلگرام','label_en','Telegram','icon','telegram','url',coalesce(telegram_url,''),'enabled',true),
  jsonb_build_object('id','instagram','label_fa','اینستاگرام','label_en','Instagram','icon','instagram','url',coalesce(instagram_url,''),'enabled',true),
  jsonb_build_object('id','rubika','label_fa','روبیکا','label_en','Rubika','icon','rubika','url','','enabled',true),
  jsonb_build_object('id','bale','label_fa','پیام‌رسان بله','label_en','Bale Messenger','icon','bale','url','','enabled',true)
);

alter table public.ticket_messages
  add column if not exists sender_name text,
  add column if not exists sender_role text;

update public.ticket_messages m set
  sender_name=coalesce(m.sender_name,p.full_name),
  sender_role=coalesce(m.sender_role,case
    when p.role='super_admin' then 'مدیریت'
    when p.role='league_admin' then 'داور یا مسئول لیگ'
    when p.role='staff' then case p.staff_department when 'support' then 'کارشناس پشتیبانی' when 'finance' then 'کارشناس مالی' when 'operations' then 'کارشناس اجرایی' when 'judge' then 'داور' else 'کارشناس پشتیبانی' end
    else 'شرکت‌کننده' end)
from public.profiles p where p.id=m.sender_id and (m.sender_name is null or m.sender_role is null);

create or replace function public.snapshot_ticket_message_author()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
  select * into p from public.profiles where id=new.sender_id;
  new.sender_name:=coalesce(nullif(new.sender_name,''),p.full_name,'کاربر سامانه');
  new.sender_role:=coalesce(nullif(new.sender_role,''),case
    when p.role='super_admin' then 'مدیریت'
    when p.role='league_admin' then 'داور یا مسئول لیگ'
    when p.role='staff' then case p.staff_department when 'support' then 'کارشناس پشتیبانی' when 'finance' then 'کارشناس مالی' when 'operations' then 'کارشناس اجرایی' when 'judge' then 'داور' else 'کارشناس پشتیبانی' end
    else 'شرکت‌کننده' end);
  return new;
end $$;
drop trigger if exists snapshot_ticket_message_author on public.ticket_messages;
create trigger snapshot_ticket_message_author before insert on public.ticket_messages
for each row execute function public.snapshot_ticket_message_author();

create or replace function public.manage_ticket(p_ticket_id uuid,p_action text,p_status ticket_status default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_ticket public.tickets%rowtype; v_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_ticket from public.tickets where id=p_ticket_id for update;
  if not found then raise exception 'ticket_not_found'; end if;
  v_allowed:=public.is_super_admin()
    or (public.has_panel_permission('tickets') and (
      public.current_user_role()='staff'
      or v_ticket.assigned_to=auth.uid()
      or exists(select 1 from public.league_admins la where la.league_id=v_ticket.league_id and la.user_id=auth.uid())
    ));
  if not v_allowed then raise exception 'forbidden'; end if;
  if p_action='status' then
    if p_status is null then raise exception 'ticket_status_required'; end if;
    update public.tickets set status=p_status where id=p_ticket_id;
  elsif p_action='delete' then
    delete from public.tickets where id=p_ticket_id;
  else
    raise exception 'invalid_ticket_action';
  end if;
end $$;
revoke all on function public.snapshot_ticket_message_author(),public.manage_ticket(uuid,text,ticket_status) from public;
grant execute on function public.manage_ticket(uuid,text,ticket_status) to authenticated;

-- ===== 0082_home_event_groups_public_teams.sql =====
alter table public.home_events
  add column if not exists group_title_fa text,
  add column if not exists group_title_en text,
  add column if not exists icon_key text not null default 'calendar'
    check (icon_key in ('calendar','registration','payment','team_review','trophy'));

update public.home_events set
  group_title_fa=coalesce(group_title_fa,'تقویم پیش روی جام تبرستان'),
  group_title_en=coalesce(group_title_en,'Upcoming Tabarestan Cup calendar')
where group_title_fa is null or group_title_en is null;

-- Public team history deliberately excludes identity documents, photos,
-- national identifiers, birth dates and private contact information.
create or replace view public.public_company_team_history with (security_invoker=false) as
select t.id,t.company_id,t.name team_name,t.name_en team_name_en,t.season_year,
  coalesce(t.season_month,l.current_season_month) season_month,
  l.name league_name,l.name_en league_name_en,l.slug league_slug,
  coalesce(cap.country_code,'IR') country_code,
  concat_ws(' ',cap.first_name_fa,cap.last_name_fa) captain_name_fa,
  concat_ws(' ',cap.first_name_en,cap.last_name_en) captain_name_en,
  (select count(*)::integer from public.team_members member_count where member_count.team_id=t.id) member_count
from public.teams t
join public.leagues l on l.id=t.league_id
left join lateral (
  select m.first_name_fa,m.last_name_fa,m.first_name_en,m.last_name_en,m.country_code
  from public.team_members m where m.team_id=t.id and m.role='captain'
  order by m.id limit 1
) cap on true
where t.lifecycle_status='completed' or t.status='approved';
grant select on public.public_company_team_history to anon,authenticated;

-- ===== 0083_registration_validation_realtime.sql =====
-- Keep registration review data, validation and live league settings in sync.

alter table public.team_members
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.team_attendance_clearances
  add column if not exists technical_auto_approved boolean not null default false;

alter table public.registration_doc_types
  drop constraint if exists registration_doc_types_scope_check;
alter table public.registration_doc_types
  add constraint registration_doc_types_scope_check
  check (scope in ('profile', 'team', 'member'));

insert into public.registration_doc_types
  (code, label_fa, label_en, account_type, is_required, is_active, sort_order, scope)
values
  ('member_photo', 'تصویر چهره عضو', 'Member portrait', 'both', true, true, 1, 'member'),
  ('member_identity', 'کارت ملی / مدرک هویتی عضو', 'Member identity document', 'both', true, true, 2, 'member')
on conflict (code) do nothing;

create or replace function public._team_person_complete_for_league(
  p_member public.team_members,
  p_league_id uuid
)
returns boolean
language sql
stable
set search_path=public
as $$
  select
    nullif(trim(coalesce(p_member.first_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.first_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_en,'')),'') is not null
    and p_member.birth_date is not null
    and nullif(trim(coalesce(p_member.role,'')),'') is not null
    and nullif(trim(coalesce(p_member.residence,'')),'') is not null
    and nullif(trim(coalesce(p_member.country_code,'')),'') is not null
    and nullif(trim(coalesce(p_member.nationality,'')),'') is not null
    and nullif(trim(coalesce(p_member.education_level,'')),'') is not null
    and (
      not exists (
        select 1 from public.registration_doc_types
        where scope='member' and code='member_photo' and is_active and is_required
      )
      or nullif(trim(coalesce(p_member.photo_url,'')),'') is not null
    )
    and (
      not exists (
        select 1 from public.registration_doc_types
        where scope='member' and code='member_identity' and is_active and is_required
      )
      or nullif(trim(coalesce(p_member.national_id_doc_path,'')),'') is not null
    )
    and (coalesce(p_member.is_foreign,false) or p_member.national_id ~ '^[0-9]{10}$')
    and (not coalesce(p_member.is_foreign,false) or nullif(trim(coalesce(p_member.passport_number,'')),'') is not null)
    and (p_member.role not in ('captain','coach') or p_member.phone ~ '^09[0-9]{9}$')
    and not exists (
      select 1 from public.leagues l
      where l.id=p_league_id and (
        (l.min_age is not null and extract(year from age(current_date,p_member.birth_date)) < l.min_age)
        or (l.max_age is not null and extract(year from age(current_date,p_member.birth_date)) > l.max_age)
      )
    )
$$;

create or replace function public._validate_team_member_age()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_min integer;
  v_max integer;
  v_age integer;
begin
  if new.birth_date is null then return new; end if;
  select l.min_age,l.max_age into v_min,v_max
  from public.teams t join public.leagues l on l.id=t.league_id
  where t.id=new.team_id;
  v_age:=extract(year from age(current_date,new.birth_date));
  if v_min is not null and v_age<v_min then
    raise exception 'member_age_below_min:%',v_min;
  end if;
  if v_max is not null and v_age>v_max then
    raise exception 'member_age_above_max:%',v_max;
  end if;
  return new;
end $$;
drop trigger if exists validate_team_member_age on public.team_members;
create trigger validate_team_member_age
before insert or update of birth_date,team_id on public.team_members
for each row execute function public._validate_team_member_age();

create or replace function public.review_team_member(
  p_member_id uuid,
  p_status text,
  p_reason text default null
)
returns public.team_members
language plpgsql
security definer
set search_path=public
as $$
declare
  v_row public.team_members%rowtype;
  v_league_id uuid;
begin
  if p_status not in ('pending','approved','rejected') then raise exception 'invalid_status'; end if;
  if p_status='rejected' and nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_row from public.team_members where id=p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  select league_id into v_league_id from public.teams where id=v_row.team_id;

  if not (
    public.is_super_admin()
    or (
      public.has_panel_permission('team_review')
      and exists (
        select 1 from public.league_admins la
        where la.league_id=v_league_id and la.user_id=auth.uid()
      )
    )
  ) then raise exception 'forbidden'; end if;

  update public.team_members
  set review_status=p_status,
      rejection_reason=case when p_status='rejected' then trim(p_reason) else null end,
      reviewed_at=case when p_status='pending' then null else now() end,
      reviewed_by=case when p_status='pending' then null else auth.uid() end
  where id=p_member_id
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.review_team_member(uuid,text,text) from public;
grant execute on function public.review_team_member(uuid,text,text) to authenticated;

create or replace function public._auto_review_team_people()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team_id uuid:=coalesce(new.team_id,old.team_id);
  v_league public.leagues%rowtype;
begin
  if pg_trigger_depth()>1 then return new; end if;
  select l.* into v_league
  from public.teams t join public.leagues l on l.id=t.league_id
  where t.id=v_team_id;
  if not found or not v_league.auto_approve_team_members then return new; end if;

  if (select count(*) from public.team_members where team_id=v_team_id and role='captain') < v_league.min_captains
    or (select count(*) from public.team_members where team_id=v_team_id and role='coach') < v_league.min_coaches
    or not exists(select 1 from public.team_members where team_id=v_team_id)
    or (v_league.team_size_min is not null and (select count(*) from public.team_members where team_id=v_team_id)<v_league.team_size_min)
    or (v_league.team_size_max is not null and (select count(*) from public.team_members where team_id=v_team_id)>v_league.team_size_max)
    or exists (
      select 1 from public.team_members m
      where m.team_id=v_team_id and not public._team_person_complete_for_league(m,v_league.id)
    )
  then return new; end if;

  update public.team_members
  set review_status='approved',rejection_reason=null,
      reviewed_at=coalesce(reviewed_at,now()),reviewed_by=null
  where team_id=v_team_id and review_status<>'approved';
  perform public.sync_team_attendance(v_team_id);
  return new;
end $$;

-- A callable-by-trigger helper processes existing teams when league settings change.
create or replace function public._auto_review_team_people_for_id(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_league public.leagues%rowtype;
begin
  select l.* into v_league from public.teams t join public.leagues l on l.id=t.league_id where t.id=p_team_id;
  if not found or not v_league.auto_approve_team_members then return; end if;
  if (select count(*) from public.team_members where team_id=p_team_id and role='captain') < v_league.min_captains
    or (select count(*) from public.team_members where team_id=p_team_id and role='coach') < v_league.min_coaches
    or not exists(select 1 from public.team_members where team_id=p_team_id)
    or (v_league.team_size_min is not null and (select count(*) from public.team_members where team_id=p_team_id)<v_league.team_size_min)
    or (v_league.team_size_max is not null and (select count(*) from public.team_members where team_id=p_team_id)>v_league.team_size_max)
    or exists(select 1 from public.team_members m where m.team_id=p_team_id and not public._team_person_complete_for_league(m,v_league.id))
  then return; end if;
  update public.team_members set review_status='approved',rejection_reason=null,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=null
  where team_id=p_team_id and review_status<>'approved';
end $$;

create or replace function public._refresh_league_registration_flows(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_team public.teams%rowtype;
  v_settings public.league_attendance_settings%rowtype;
begin
  select * into v_settings from public.league_attendance_settings where league_id=p_league_id;
  for v_team in select * from public.teams where league_id=p_league_id and archived_at is null loop
    if (select auto_approve_team_members from public.leagues where id=p_league_id) then
      perform public._auto_review_team_people_for_id(v_team.id);
    end if;
    insert into public.team_attendance_clearances(team_id,league_id)
    values(v_team.id,p_league_id) on conflict(team_id) do nothing;
    if coalesce(v_settings.article_required,true)=false and coalesce(v_settings.video_required,true)=false then
      update public.team_attendance_clearances
      set technical_status='approved',technical_rejection_reason=null,
          technical_auto_approved=true,updated_at=now()
      where team_id=v_team.id and technical_status in ('locked','draft','rejected','pending');
    else
      update public.team_attendance_clearances
      set technical_status='draft',technical_auto_approved=false,updated_at=now()
      where team_id=v_team.id and technical_auto_approved;
    end if;
    perform public.sync_team_attendance(v_team.id);
  end loop;
end $$;

create or replace function public._refresh_registration_after_league_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public._refresh_league_registration_flows(new.id);
  return new;
end $$;

create or replace function public._refresh_registration_after_attendance_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public._refresh_league_registration_flows(new.league_id);
  return new;
end $$;

drop trigger if exists refresh_registration_after_league_change on public.leagues;
create trigger refresh_registration_after_league_change
after update of auto_approve_team_members,min_captains,min_coaches,min_age,max_age,team_size_min,team_size_max
on public.leagues for each row execute function public._refresh_registration_after_league_change();

drop trigger if exists refresh_registration_after_attendance_change on public.league_attendance_settings;
create trigger refresh_registration_after_attendance_change
after update of enabled,team_documents_enabled,article_required,video_required
on public.league_attendance_settings for each row execute function public._refresh_registration_after_attendance_change();

revoke all on function public._auto_review_team_people_for_id(uuid) from public,anon,authenticated;
revoke all on function public._refresh_league_registration_flows(uuid) from public,anon,authenticated;

-- Apply the repaired schema and current rules to legacy records immediately.
do $$
declare v_league_id uuid;
begin
  for v_league_id in select id from public.leagues loop
    perform public._refresh_league_registration_flows(v_league_id);
  end loop;
end $$;

-- Feed review/configuration changes to the existing SSE realtime bridge.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'team_members','team_technical_files','league_attendance_settings','registration_doc_types'
  ] loop
    execute format('drop trigger if exists app_realtime_capture on public.%I',table_name);
    execute format('create trigger app_realtime_capture after insert or update or delete on public.%I for each row execute function app_private.capture_realtime_event()',table_name);
  end loop;
end $$;

-- ===== 0084_fix_sms_trigger_and_doc_deactivation.sql =====
-- Fix 1: _enqueue_team_lifecycle_sms referenced new.id which does not exist
--         on team_attendance_clearances (PK is team_id).  The permit_code was
--         intended to identify the clearance record; use team_id instead.
-- Fix 2: Wrap the notification INSERT in an exception handler so a bug in the
--         SMS metadata can never abort the core clearance / settings transaction.
-- Fix 3: _refresh_league_registration_flows now applies article_required=false
--         correctly when saving attendance settings, ensuring existing teams
--         with no article are auto-approved for the technical step.
-- Fix 4: A dedicated server-side function lets the backend return HTTP 409
--         when a registration_doc_type deletion is blocked by a FK constraint,
--         instead of leaking a raw PostgreSQL error.

-- ─── 1.  Fix _enqueue_team_lifecycle_sms ─────────────────────────────────────
-- Root cause: new.id::text on a table whose PK is team_id (uuid), not id.
-- The permit_code field in the SMS payload is meant to be a human-visible
-- reference code for the clearance.  The closest meaningful identifier is
-- team_id; if a human-readable code is added later it can replace this.

create or replace function public._enqueue_team_lifecycle_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_phone  text;
  v_team   text;
  v_league text;
  v_reason text;
  v_template text;
  v_key      text;
begin
  select p.phone, t.name, l.name
    into v_phone, v_team, v_league
  from public.teams      t
  join public.profiles   p on p.id = t.captain_id
  join public.leagues    l on l.id = t.league_id
  where t.id = new.team_id;

  if not public.is_real_phone(v_phone) then return new; end if;

  if new.stage = 'confirmed' and old.stage is distinct from new.stage then
    v_template := 'attendance_permit_issued';
    v_key      := 'attendance_permit_issued:' || new.team_id::text;

  elsif new.technical_status = 'rejected'
        and old.technical_status is distinct from new.technical_status then
    v_template := 'team_correction_required';
    v_reason   := coalesce(new.technical_rejection_reason, 'نیاز به اصلاح مدارک فنی');
    v_key      := 'team_correction_required:technical:'
                  || new.team_id::text || ':'
                  || extract(epoch from new.updated_at)::bigint::text;

  elsif new.stage = 'rules' and old.stage is distinct from new.stage then
    v_template := 'team_review_approved';
    v_key      := 'team_review_approved:' || new.team_id::text;

  else
    return new;
  end if;

  -- Fault-tolerant: a failure here must NEVER abort the attendance transaction.
  begin
    if public.sms_template_enabled(v_template) then
      insert into public.notification_log
        (team_id, channel, template_key, phone, status, idempotency_key, meta)
      values
        (new.team_id, 'sms', v_template, v_phone, 'pending', v_key,
         jsonb_build_object(
           'team_name',   v_team,
           'league_name', v_league,
           'reason',      v_reason,
           'next_step',   'تأیید قوانین و پرداخت',
           -- permit_code: use team_id as a stable reference identifier.
           -- team_attendance_clearances has no separate id column.
           'permit_code', new.team_id::text
         ))
      on conflict do nothing;
    end if;
  exception when others then
    -- Log the error but do not propagate — SMS enqueuing is best-effort.
    raise warning '_enqueue_team_lifecycle_sms: notification skipped for team % (%) — %',
      new.team_id, v_template, sqlerrm;
  end;

  return new;
end $$;

-- Re-create the trigger (drop first to pick up the new function body).
drop trigger if exists enqueue_team_lifecycle_sms on public.team_attendance_clearances;
create trigger enqueue_team_lifecycle_sms
  after update of stage, technical_status on public.team_attendance_clearances
  for each row execute function public._enqueue_team_lifecycle_sms();


-- ─── 2.  Make _refresh_league_registration_flows fault-tolerant ───────────────
-- The function iterates over every team in a league when any attendance setting
-- changes.  sync_team_attendance triggers enqueue_team_lifecycle_sms which (now
-- safely) could have other errors.  Wrap per-team sync in its own savepoint so
-- one bad team never rolls back the settings upsert.

create or replace function public._refresh_league_registration_flows(p_league_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_team     public.teams%rowtype;
  v_settings public.league_attendance_settings%rowtype;
begin
  select * into v_settings
  from public.league_attendance_settings
  where league_id = p_league_id;

  for v_team in
    select * from public.teams
    where league_id = p_league_id and archived_at is null
  loop
    begin
      -- Auto-approve members when league is configured for it.
      if (select auto_approve_team_members from public.leagues where id = p_league_id) then
        perform public._auto_review_team_people_for_id(v_team.id);
      end if;

      -- Ensure clearance row exists.
      insert into public.team_attendance_clearances(team_id, league_id)
      values (v_team.id, p_league_id)
      on conflict (team_id) do nothing;

      -- When both article and video are disabled, auto-approve the technical step
      -- for teams that are still awaiting it so they are not blocked.
      if coalesce(v_settings.article_required, true) = false
         and coalesce(v_settings.video_required, true) = false then
        update public.team_attendance_clearances
        set technical_status      = 'approved',
            technical_rejection_reason = null,
            technical_auto_approved    = true,
            updated_at                 = now()
        where team_id = v_team.id
          and technical_status in ('locked', 'draft', 'rejected', 'pending');
      else
        -- Re-enable the draft status for any record that was previously auto-
        -- approved so teams are prompted to upload files again.
        update public.team_attendance_clearances
        set technical_status    = 'draft',
            technical_auto_approved = false,
            updated_at              = now()
        where team_id = v_team.id
          and technical_auto_approved;
      end if;

      perform public.sync_team_attendance(v_team.id);

    exception when others then
      raise warning '_refresh_league_registration_flows: skipped team % — %',
        v_team.id, sqlerrm;
    end;
  end loop;
end $$;


-- ─── 3.  Safe deletion helper for registration_doc_types ─────────────────────
-- Returns true when deletion succeeded, raises document_type_in_use when the
-- FK constraint blocks it (profile_documents / documents reference it).

create or replace function public.delete_registration_doc_type(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;

  delete from public.registration_doc_types where id = p_id;
  return true;

exception
  when foreign_key_violation then
    raise exception 'document_type_in_use'
      using detail = 'The document type is referenced by existing profile or team documents and cannot be deleted.',
            hint   = 'Deactivate the document type instead of deleting it to preserve historical data.';
end $$;

revoke all on function public.delete_registration_doc_type(uuid) from public, anon;
grant execute on function public.delete_registration_doc_type(uuid) to authenticated;

-- Expose the new RPC name in the application RPCS allow-list (handled in query.ts).


-- ─── 4.  Ensure is_active column exists (already present since 0036) ──────────
-- Idempotent guard; no-op on a live database that already has the column.
alter table public.registration_doc_types
  add column if not exists is_active boolean not null default true;

-- Index to speed up the active-only lookups used during registration.
create index if not exists registration_doc_types_active_scope_idx
  on public.registration_doc_types (scope, sort_order)
  where is_active;


-- ─── 5.  Realtime: registration_doc_types is already in the capture list ──────
-- (added in 0083_registration_validation_realtime.sql — no further action needed)


-- ─── 6.  Re-apply _refresh_league_registration_flows to all leagues ───────────
-- Makes the new fault-tolerant behaviour take effect immediately and fixes any
-- team that was stuck due to the old NEW.id bug.
do $$
declare v_league_id uuid;
begin
  for v_league_id in select id from public.leagues loop
    begin
      perform public._refresh_league_registration_flows(v_league_id);
    exception when others then
      raise warning 'apply _refresh_league_registration_flows for league % failed: %',
        v_league_id, sqlerrm;
    end;
  end loop;
end $$;

-- ===== 0085_stabilize_registration_review.sql =====
-- Stabilize registration/review rules. Configuration is read from the league
-- attendance row by every lifecycle function; historical documents are kept.

create or replace function public.team_registration_step_enabled(p_league_id uuid,p_step text)
returns boolean language sql stable set search_path=public as $$
  select case p_step
    when 'documents' then coalesce(s.team_documents_enabled,true)
    when 'technical' then coalesce(s.enabled,true) and (coalesce(s.article_required,true) or coalesce(s.video_required,true))
    when 'rules' then coalesce(s.enabled,true)
    else true
  end
  from (select 1) seed
  left join public.league_attendance_settings s on s.league_id=p_league_id
$$;

create or replace function public._team_person_complete_for_league(
  p_member public.team_members,
  p_league_id uuid
)
returns boolean language sql stable set search_path=public as $$
  select
    nullif(trim(coalesce(p_member.first_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.first_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_en,'')),'') is not null
    and p_member.birth_date is not null
    and nullif(trim(coalesce(p_member.role,'')),'') is not null
    and nullif(trim(coalesce(p_member.residence,'')),'') is not null
    and nullif(trim(coalesce(p_member.country_code,'')),'') is not null
    and nullif(trim(coalesce(p_member.nationality,'')),'') is not null
    and nullif(trim(coalesce(p_member.education_level,'')),'') is not null
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_photo' and is_active and is_required)
      or nullif(trim(coalesce(p_member.photo_url,'')),'') is not null)
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_identity' and is_active and is_required)
      or nullif(trim(coalesce(p_member.national_id_doc_path,'')),'') is not null)
    and (coalesce(p_member.is_foreign,false) or p_member.national_id ~ '^[0-9]{10}$')
    and (not coalesce(p_member.is_foreign,false) or nullif(trim(coalesce(p_member.passport_number,'')),'') is not null)
    and (p_member.role not in ('captain','coach') or p_member.phone ~ '^09[0-9]{9}$')
    and (p_member.role <> 'member' or not exists(
      select 1 from public.leagues l where l.id=p_league_id and (
        (l.min_age is not null and extract(year from age(current_date,p_member.birth_date)) < l.min_age)
        or (l.max_age is not null and extract(year from age(current_date,p_member.birth_date)) > l.max_age)
      )
    ))
$$;

create or replace function public._validate_team_member_age()
returns trigger language plpgsql set search_path=public as $$
declare v_min integer; v_max integer; v_age integer;
begin
  -- League participant limits intentionally apply only to ordinary members.
  if new.role is distinct from 'member' or new.birth_date is null then return new; end if;
  select l.min_age,l.max_age into v_min,v_max
  from public.teams t join public.leagues l on l.id=t.league_id where t.id=new.team_id;
  v_age:=extract(year from age(current_date,new.birth_date));
  if v_min is not null and v_age<v_min then raise exception 'member_age_below_min:%',v_min; end if;
  if v_max is not null and v_age>v_max then raise exception 'member_age_above_max:%',v_max; end if;
  return new;
end $$;
drop trigger if exists validate_team_member_age on public.team_members;
create trigger validate_team_member_age before insert or update of birth_date,team_id,role
on public.team_members for each row execute function public._validate_team_member_age();

-- Lifecycle transitions produced by the canonical clearance row may skip any
-- disabled steps. Pre-clearance wizard transitions retain the stricter matrix.
create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status=old.lifecycle_status then return new; end if;
  if new.lifecycle_status='cancelled' then return new; end if;
  if new.lifecycle_status='awaiting_documents' and not public.team_registration_step_enabled(new.league_id,'documents') then raise exception 'registration_step_disabled:documents'; end if;
  if new.lifecycle_status='awaiting_technical_review' and not public.team_registration_step_enabled(new.league_id,'technical') then raise exception 'registration_step_disabled:technical'; end if;
  if new.lifecycle_status='awaiting_rules' and not public.team_registration_step_enabled(new.league_id,'rules') then raise exception 'registration_step_disabled:rules'; end if;
  if exists(
    select 1 from public.team_attendance_clearances c where c.team_id=new.id and new.lifecycle_status=case c.stage
      when 'members' then case
        when not exists(select 1 from public.team_members m where m.team_id=new.id) then 'incomplete'
        when public.team_registration_step_enabled(new.league_id,'documents') and exists(
          select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
          and not exists(select 1 from public.documents d where d.team_id=new.id and d.team_member_id is null and d.doc_type=r.code)
        ) then 'awaiting_documents'
        else 'awaiting_review'
      end
      when 'technical' then case when c.technical_status='pending' then 'awaiting_technical_review' else 'awaiting_review' end
      when 'rules' then 'awaiting_rules'
      when 'payment' then 'awaiting_payment'
      when 'confirmed' then 'completed'
    end
  ) then return new; end if;
  if old.lifecycle_status='completed' and new.lifecycle_status='incomplete' and not exists(select 1 from public.team_members where team_id=new.id) then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents') and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status='awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_technical_review' and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_rules' and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status='awaiting_payment' and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%',old.lifecycle_status,new.lifecycle_status;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype; v_row public.team_attendance_clearances%rowtype;
  v_paid boolean:=false; v_people_ok boolean:=false; v_members_ok boolean:=false; v_has_members boolean:=false;
  v_member_rejected boolean:=false; v_member_pending boolean:=false;
  v_attendance boolean:=true; v_technical boolean:=true; v_documents boolean:=true; v_documents_ok boolean:=true;
  v_was_confirmed boolean:=false;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  insert into public.league_attendance_settings(league_id) values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id;
  select stage='confirmed' into v_was_confirmed from public.team_attendance_clearances where team_id=p_team_id;
  v_attendance:=public.team_registration_step_enabled(v_team.league_id,'rules');
  v_technical:=public.team_registration_step_enabled(v_team.league_id,'technical');
  v_documents:=public.team_registration_step_enabled(v_team.league_id,'documents');
  select exists(select 1 from public.invoices i where i.team_id=p_team_id and
    (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)) into v_paid;
  select exists(select 1 from public.team_members where team_id=p_team_id),
    exists(select 1 from public.team_members where team_id=p_team_id and review_status='rejected'),
    exists(select 1 from public.team_members m where m.team_id=p_team_id and
      (m.review_status='pending' or (not v_was_confirmed and not public._team_person_complete_for_league(m,v_team.league_id))))
    into v_has_members,v_member_rejected,v_member_pending;
  v_people_ok:=v_has_members and not v_member_rejected and not v_member_pending;
  v_documents_ok:=v_was_confirmed or not v_documents or not exists(
    select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
    and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.team_member_id is null and d.doc_type=r.code)
  );
  v_members_ok:=v_people_ok and v_documents_ok;
  update public.team_attendance_clearances set
    technical_status=case when not v_technical then 'approved' else technical_status end,
    technical_auto_approved=case when not v_technical then true else technical_auto_approved end,
    rules_accepted_at=case when not v_attendance then coalesce(rules_accepted_at,now()) else rules_accepted_at end,
    stage=case
      when v_members_ok and (not v_technical or technical_status='approved') and
        (not v_attendance or rules_accepted_at is not null) and v_paid then 'confirmed'
      when v_members_ok and (not v_technical or technical_status='approved') and
        (not v_attendance or rules_accepted_at is not null) then 'payment'
      when v_members_ok and (not v_technical or technical_status='approved') then 'rules'
      when not v_members_ok then 'members'
      else 'technical'
    end,
    confirmed_at=case when v_members_ok and (not v_technical or technical_status='approved') and
      (not v_attendance or rules_accepted_at is not null) and v_paid then coalesce(confirmed_at,now()) else null end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;

  update public.teams set
    status=case
      when not v_has_members or (v_people_ok and not v_documents_ok) then 'draft'::public.registration_status
      when v_member_rejected or v_row.technical_status='rejected' then 'rejected'::public.registration_status
      when v_member_pending or v_row.technical_status='pending' then 'under_review'::public.registration_status
      else 'approved'::public.registration_status
    end,
    lifecycle_status=case v_row.stage
      when 'members' then case when not v_has_members then 'incomplete' when not v_documents_ok then 'awaiting_documents' else 'awaiting_review' end
      when 'technical' then case when v_row.technical_status='pending' then 'awaiting_technical_review' else 'awaiting_review' end
      when 'rules' then 'awaiting_rules'
      when 'payment' then 'awaiting_payment'
      when 'confirmed' then 'completed'
    end,
    registration_stage=case v_row.stage
      when 'members' then case when not v_has_members then 'members' when not v_documents_ok then 'documents' else 'review' end
      when 'technical' then case when v_row.technical_status='pending' then 'technical_review' else 'technical' end
      when 'rules' then 'rules'
      when 'payment' then 'invoice'
      when 'confirmed' then 'completed'
    end,
    registration_progress=case v_row.stage when 'members' then case when not v_has_members then 22 when not v_documents_ok then 34 else 44 end when 'technical' then 64 when 'rules' then 74 when 'payment' then 82 when 'confirmed' then 100 end,
    rejection_reason=case when v_member_rejected then rejection_reason when v_row.technical_status='rejected' then v_row.technical_rejection_reason when v_row.stage='confirmed' then null else rejection_reason end,
    reviewed_at=case when v_row.stage='confirmed' then coalesce(reviewed_at,now()) else reviewed_at end,
    last_activity_at=now()
  where id=p_team_id and lifecycle_status<>'cancelled';
  return v_row;
end $$;

create or replace function public.review_team(p_team_id uuid,p_status registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_league public.leagues%rowtype; v_role user_role; v_missing text[]:=array[]::text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from public.teams where id=p_team_id for update; if not found then raise exception 'team_not_found'; end if;
  select * into v_league from public.leagues where id=v_team.league_id;
  v_role:=public.current_user_role();
  if not (public.is_super_admin() or (v_role='staff' and public.has_panel_permission('triage')) or
    (v_role='league_admin' and public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_team.league_id and user_id=v_uid))) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then raise exception 'triage_can_only_mark_under_review'; end if;
  if p_status in ('under_review','approved') then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='captain')<v_league.min_captains then v_missing:=array_append(v_missing,'captain'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='coach')<v_league.min_coaches then v_missing:=array_append(v_missing,'coach'); end if;
    if not exists(select 1 from public.team_members where team_id=p_team_id) then v_missing:=array_append(v_missing,'members'); end if;
    if exists(select 1 from public.team_members m where m.team_id=p_team_id and not public._team_person_complete_for_league(m,v_team.league_id)) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if public.team_registration_step_enabled(v_team.league_id,'documents') and exists(
      select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
      and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.doc_type=r.code)
    ) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if cardinality(v_missing)>0 then raise exception 'team_dossier_incomplete:%',array_to_string(v_missing,','); end if;
  end if;
  update public.teams set status=p_status,rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,
    reviewed_at=now(),reviewed_by=v_uid where id=p_team_id returning * into v_team;
  perform public.sync_team_attendance(p_team_id);
  select * into v_team from public.teams where id=p_team_id;
  return v_team;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype; v_league_id uuid;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  -- A %rowtype record cannot be mixed with scalar INTO targets. Load the
  -- complete settings row first, then derive its league id from that row.
  select s.* into v_setting
  from public.teams t
  join public.league_attendance_settings s on s.league_id=t.league_id
  where t.id=p_team_id;
  if not found then raise exception 'attendance_settings_not_found'; end if;
  v_league_id:=v_setting.league_id;
  if not public.team_registration_step_enabled(v_league_id,'technical') then raise exception 'registration_step_disabled:technical'; end if;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'technical' or v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),edit_reopened_at=null,edit_reopened_by=null,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),
    technical_reviewed_by=auth.uid(),technical_auto_approved=false,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_notes boolean; v_league_id uuid;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select t.league_id,s.participant_note_enabled into v_league_id,v_notes from public.teams t join public.league_attendance_settings s on s.league_id=t.league_id where t.id=p_team_id;
  if not public.team_registration_step_enabled(v_league_id,'rules') then raise exception 'registration_step_disabled:rules'; end if;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update public.team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),
    participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  return v_row;
end $$;

-- The audit table is queryable only through its RLS policy. Support staff with
-- explicit team-review permission may read the same dossier history they can review.
drop policy if exists team_registration_change_log_read on public.team_registration_change_log;
create policy team_registration_change_log_read on public.team_registration_change_log for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (public.has_panel_permission('team_review') and (
    public.current_user_role()='staff'
    or exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid())
  ))
);

-- Disabled types are not valid for new uploads. Rows and files already stored
-- remain untouched and continue to be available to their authorized owners/reviewers.
create or replace function public._reject_disabled_profile_document()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.registration_doc_types where id=new.doc_type_id and is_active and scope='profile') then
    raise exception 'document_type_disabled';
  end if;
  return new;
end $$;
drop trigger if exists reject_disabled_profile_document on public.profile_documents;
create trigger reject_disabled_profile_document before insert or update of doc_type_id on public.profile_documents
for each row execute function public._reject_disabled_profile_document();

create or replace function public._reject_disabled_team_document()
returns trigger language plpgsql set search_path=public as $$
declare v_league_id uuid;
begin
  select league_id into v_league_id from public.teams where id=new.team_id;
  if new.team_member_id is not null or new.doc_type='member_national_id' then
    if not exists(select 1 from public.registration_doc_types where code='member_identity' and scope='member' and is_active) then
      raise exception 'document_type_disabled';
    end if;
  elsif not public.team_registration_step_enabled(v_league_id,'documents')
     or not exists(select 1 from public.registration_doc_types where code=new.doc_type and scope='team' and is_active) then
    raise exception 'document_type_disabled';
  end if;
  return new;
end $$;
drop trigger if exists reject_disabled_team_document on public.documents;
create trigger reject_disabled_team_document before insert or update of doc_type,team_member_id,team_id on public.documents
for each row execute function public._reject_disabled_team_document();

create or replace function public._guard_disabled_technical_step()
returns trigger language plpgsql set search_path=public as $$
declare v_league_id uuid; v_article boolean; v_video boolean;
begin
  select t.league_id,s.article_required,s.video_required into v_league_id,v_article,v_video
  from public.teams t left join public.league_attendance_settings s on s.league_id=t.league_id
  where t.id=new.team_id;
  if not public.team_registration_step_enabled(v_league_id,'technical')
     or (new.kind='article' and not coalesce(v_article,true))
     or (new.kind='robot_video' and not coalesce(v_video,true)) then
    raise exception 'technical_step_disabled';
  end if;
  return new;
end $$;
drop trigger if exists guard_disabled_technical_file on public.team_technical_files;
create trigger guard_disabled_technical_file before insert or update of kind,team_id on public.team_technical_files
for each row execute function public._guard_disabled_technical_step();

create or replace function public._guard_disabled_technical_submission()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.technical_status='pending' and old.technical_status is distinct from new.technical_status
     and not public.team_registration_step_enabled(new.league_id,'technical') then
    raise exception 'technical_step_disabled';
  end if;
  return new;
end $$;
drop trigger if exists guard_disabled_technical_submission on public.team_attendance_clearances;
create trigger guard_disabled_technical_submission before update of technical_status on public.team_attendance_clearances
for each row execute function public._guard_disabled_technical_submission();

-- Reconcile every non-historical registration through the same canonical sync
-- whenever league or document-type settings change. Confirmed registrations are
-- intentionally not reopened merely because a technical requirement is enabled.
create or replace function public._refresh_league_registration_flows(p_league_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype;
  v_settings public.league_attendance_settings%rowtype;
  v_stage text;
begin
  select * into v_settings from public.league_attendance_settings where league_id=p_league_id;
  for v_team in select * from public.teams where league_id=p_league_id and archived_at is null loop
    begin
      insert into public.team_attendance_clearances(team_id,league_id)
      values(v_team.id,p_league_id) on conflict(team_id) do nothing;
      select stage into v_stage from public.team_attendance_clearances where team_id=v_team.id;

      if v_stage<>'confirmed' then
        update public.team_members m
        set review_status='pending',rejection_reason=null,reviewed_at=null,reviewed_by=null
        where m.team_id=v_team.id and m.review_status='approved'
          and not public._team_person_complete_for_league(m,p_league_id);
      end if;

      if (select auto_approve_team_members from public.leagues where id=p_league_id) then
        perform public._auto_review_team_people_for_id(v_team.id);
      end if;

      if not public.team_registration_step_enabled(p_league_id,'technical') then
        update public.team_attendance_clearances
        set technical_status='approved',technical_rejection_reason=null,
            technical_auto_approved=true,updated_at=now()
        where team_id=v_team.id and technical_status in ('locked','draft','rejected','pending');
      else
        update public.team_attendance_clearances
        set technical_status='draft',technical_auto_approved=false,updated_at=now()
        where team_id=v_team.id and technical_auto_approved and stage<>'confirmed';
      end if;

      perform public.sync_team_attendance(v_team.id);
    exception when others then
      raise warning '_refresh_league_registration_flows: skipped team % -- %',v_team.id,sqlerrm;
    end;
  end loop;
end $$;

create or replace function public._refresh_registration_after_doc_type_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_league_id uuid; v_scope text:=case when tg_op='DELETE' then old.scope else new.scope end;
begin
  if v_scope in ('member','team') then
    for v_league_id in select id from public.leagues loop
      perform public._refresh_league_registration_flows(v_league_id);
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists refresh_registration_after_doc_type_change on public.registration_doc_types;
create trigger refresh_registration_after_doc_type_change
after insert or update of is_active,is_required,scope,code or delete on public.registration_doc_types
for each row execute function public._refresh_registration_after_doc_type_change();

revoke all on function public.team_registration_step_enabled(uuid,text) from public;
grant execute on function public.team_registration_step_enabled(uuid,text) to authenticated;
revoke all on function public.review_team(uuid,registration_status,text) from public;
grant execute on function public.review_team(uuid,registration_status,text) to authenticated;
revoke all on function public.submit_team_technical_files(uuid) from public;
grant execute on function public.submit_team_technical_files(uuid) to authenticated;
revoke all on function public.review_team_technical_files(uuid,boolean,text) from public;
grant execute on function public.review_team_technical_files(uuid,boolean,text) to authenticated;
revoke all on function public.accept_team_attendance_rules(uuid,boolean,text) from public;
grant execute on function public.accept_team_attendance_rules(uuid,boolean,text) to authenticated;

do $$
declare v_league_id uuid;
begin
  for v_league_id in select id from public.leagues loop
    perform public._refresh_league_registration_flows(v_league_id);
  end loop;
end $$;

-- ===== 0086_registration_cancel_and_human_text.sql =====
-- Destructive cancellation is limited to incomplete, unpaid registrations.
-- Paid/submitted registrations remain historical records.

create or replace function public.cancel_incomplete_team_registration(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team public.teams%rowtype;
  v_fk record;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'team_not_found';
  end if;

  if not public.is_super_admin()
     and v_team.captain_id <> auth.uid()
     and not exists (
       select 1 from public.company_members cm
       where cm.company_id = v_team.company_id and cm.user_id = auth.uid()
     ) then
    raise exception 'forbidden';
  end if;

  if v_team.lifecycle_status not in ('draft', 'incomplete', 'awaiting_documents')
     or v_team.status not in ('draft', 'rejected') then
    raise exception 'registration_already_submitted';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.team_id = p_team_id
      and (i.status = 'paid' or i.receipt_status in ('pending_review', 'approved'))
  ) then
    raise exception 'registration_has_payment';
  end if;

  -- Follow direct foreign keys so registration-owned rows added by later
  -- migrations cannot leave orphans or make cancellation fail unexpectedly.
  for v_fk in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality as key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.teams'::regclass
      and array_length(con.conkey, 1) = 1
      and not (ns.nspname = 'public' and cls.relname = 'teams')
  loop
    execute format('delete from %I.%I where %I = $1', v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      using p_team_id;
  end loop;

  delete from public.teams where id = p_team_id;
  return jsonb_build_object('id', p_team_id, 'deleted', true, 'name', v_team.name);
end;
$$;

revoke all on function public.cancel_incomplete_team_registration(uuid) from public, anon;
grant execute on function public.cancel_incomplete_team_registration(uuid) to authenticated;

create or replace function public.admin_archive_team(p_team_id uuid, p_archived boolean default true)
returns public.teams
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_team public.teams%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  update public.teams
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
      last_activity_at = now()
  where id = p_team_id
  returning * into v_team;
  if not found then raise exception 'team_not_found'; end if;
  return v_team;
end;
$$;
revoke all on function public.admin_archive_team(uuid, boolean) from public, anon;
grant execute on function public.admin_archive_team(uuid, boolean) to authenticated;

-- Replace the legacy auto-review path so it uses the same person-completeness
-- rule as manual review. In particular, league age limits only affect members.
create or replace function public._auto_review_team_people()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_team_id uuid:=coalesce(new.team_id,old.team_id); v_league public.leagues%rowtype;
begin
  if pg_trigger_depth()>1 then return new; end if;
  select l.* into v_league from public.teams t join public.leagues l on l.id=t.league_id where t.id=v_team_id;
  if not found or not v_league.auto_approve_team_members then return new; end if;
  if (select count(*) from public.team_members where team_id=v_team_id and role='captain') < v_league.min_captains
    or (select count(*) from public.team_members where team_id=v_team_id and role='coach') < v_league.min_coaches
    or not exists(select 1 from public.team_members where team_id=v_team_id)
    or (v_league.team_size_min is not null and (select count(*) from public.team_members where team_id=v_team_id)<v_league.team_size_min)
    or (v_league.team_size_max is not null and (select count(*) from public.team_members where team_id=v_team_id)>v_league.team_size_max)
    or exists(select 1 from public.team_members m where m.team_id=v_team_id and not public._team_person_complete_for_league(m,v_league.id))
  then return new; end if;
  update public.team_members set review_status='approved',rejection_reason=null,reviewed_at=coalesce(reviewed_at,now()),reviewed_by=null
    where team_id=v_team_id and review_status<>'approved';
  update public.teams set status='approved',rejection_reason=null,reviewed_at=coalesce(reviewed_at,now()) where id=v_team_id;
  perform public.sync_team_attendance(v_team_id);
  return new;
end;
$$;

create or replace function public.guard_profile_human_text()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.full_name is distinct from old.full_name
      or new.first_name_fa is distinct from old.first_name_fa or new.last_name_fa is distinct from old.last_name_fa
      or new.first_name_en is distinct from old.first_name_en or new.last_name_en is distinct from old.last_name_en)
     and concat_ws(' ', new.full_name, new.first_name_fa, new.last_name_fa, new.first_name_en, new.last_name_en)
       ~ '[0-9۰-۹٠-٩]' then
    raise exception 'invalid_name_characters';
  end if;
  if (tg_op = 'INSERT' or new.province is distinct from old.province or new.city is distinct from old.city)
     and concat_ws(' ', new.province, new.city) ~ '[0-9۰-۹٠-٩]' then
    raise exception 'invalid_location_characters';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_profile_human_text on public.profiles;
create trigger guard_profile_human_text
before insert or update of full_name, first_name_fa, last_name_fa, first_name_en, last_name_en, province, city
on public.profiles for each row execute function public.guard_profile_human_text();

create or replace function public.guard_team_member_human_text()
returns trigger language plpgsql set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.full_name is distinct from old.full_name
      or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name
      or new.first_name_fa is distinct from old.first_name_fa or new.last_name_fa is distinct from old.last_name_fa
      or new.first_name_en is distinct from old.first_name_en or new.last_name_en is distinct from old.last_name_en
      or new.father_name_fa is distinct from old.father_name_fa or new.father_name_en is distinct from old.father_name_en)
     and concat_ws(' ', new.full_name, new.first_name, new.last_name, new.first_name_fa, new.last_name_fa,
    new.first_name_en, new.last_name_en, new.father_name_fa, new.father_name_en) ~ '[0-9۰-۹٠-٩]' then
    raise exception 'invalid_name_characters';
  end if;
  if (tg_op = 'INSERT' or new.province is distinct from old.province or new.city is distinct from old.city)
     and concat_ws(' ', new.province, new.city) ~ '[0-9۰-۹٠-٩]' then
    raise exception 'invalid_location_characters';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_team_member_human_text on public.team_members;
create trigger guard_team_member_human_text
before insert or update of full_name, first_name, last_name, first_name_fa, last_name_fa,
  first_name_en, last_name_en, father_name_fa, father_name_en, province, city
on public.team_members for each row execute function public.guard_team_member_human_text();

create or replace function public.guard_team_location_text()
returns trigger language plpgsql set search_path = public as $$
begin
  if concat_ws(' ', new.province, new.city) ~ '[0-9۰-۹٠-٩]' then
    raise exception 'invalid_location_characters';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_team_location_text on public.teams;
create trigger guard_team_location_text before insert or update of province, city
on public.teams for each row execute function public.guard_team_location_text();

-- Update previously stored CMS navigation labels as well as frontend defaults.
update public.site_settings s
set nav_items = coalesce((
      select jsonb_agg(
        case
          when regexp_replace(coalesce(item->>'href', ''), '/+$', '') in ('/companies', '/participants')
            then item || jsonb_build_object('label_fa', 'شرکت‌کنندگان', 'label_en', 'Participants')
          else item
        end order by ord
      )
      from jsonb_array_elements(coalesce(s.nav_items, '[]'::jsonb)) with ordinality as entries(item, ord)
    ), '[]'::jsonb),
    updated_at = now()
where s.id = 1;

-- Accept Persian and Arabic-Indic numeral keyboards at the database boundary,
-- then store one canonical phone representation for uniqueness and login.
create or replace function public.normalize_iran_mobile(p_value text)
returns text language sql immutable returns null on null input as $$
  with normalized as (
    select translate(p_value, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789') as value
  ), cleaned as (
    select value, regexp_replace(value, '[^0-9]', '', 'g') as digits from normalized
  )
  select case
    when digits ~ '^00989[0-9]{9}$' then '0' || substr(digits, 5)
    when digits ~ '^989[0-9]{9}$' then '0' || substr(digits, 3)
    when digits ~ '^9[0-9]{9}$' then '0' || digits
    when digits ~ '^09[0-9]{9}$' then digits
    when trim(value) like '+%' and digits ~ '^[1-9][0-9]{7,14}$' then '+' || digits
    when digits ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(digits, 3)
    else null
  end
  from cleaned
$$;

-- ===== 0087_optional_fields_and_registration_validation.sql =====
-- Optional presentation fields are controlled centrally. Existing values are
-- deliberately retained when a field is hidden.
alter table public.site_settings
  add column if not exists team_motto_enabled boolean not null default true,
  add column if not exists company_tagline_enabled boolean not null default true;

-- The old lifecycle trigger duplicated dossier rules and always required a
-- portrait, even when that document type had been disabled. Delegate to the
-- canonical league-aware validator used by review and payment flows.
create or replace function public.validate_team_people_before_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person public.team_members%rowtype;
begin
  if new.lifecycle_status in ('awaiting_review', 'payment_pending', 'payment_submitted', 'registered')
     and old.lifecycle_status is distinct from new.lifecycle_status then
    for v_person in
      select * from public.team_members where team_id = new.id
    loop
      if not public._team_person_complete_for_league(v_person, new.league_id) then
        raise exception 'team_dossier_incomplete:member_identity';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- Script validation is also enforced server-side so imports and direct API
-- writes cannot bypass the same rule shown by the forms.
create or replace function public.validate_localized_profile_names()
returns trigger language plpgsql as $$
begin
  if coalesce(new.first_name_fa, '') ~ '[A-Za-z]' or coalesce(new.last_name_fa, '') ~ '[A-Za-z]' then
    raise exception 'invalid_persian_text';
  end if;
  if coalesce(new.first_name_en, '') ~ '[؀-ۿ]' or coalesce(new.last_name_en, '') ~ '[؀-ۿ]' then
    raise exception 'invalid_english_text';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_localized_profile_names on public.profiles;
create trigger validate_localized_profile_names
before insert or update of first_name_fa, last_name_fa, first_name_en, last_name_en on public.profiles
for each row execute function public.validate_localized_profile_names();

create or replace function public.validate_localized_team_member_names()
returns trigger language plpgsql as $$
begin
  if coalesce(new.first_name, '') ~ '[A-Za-z]'
     or coalesce(new.last_name, '') ~ '[A-Za-z]'
     or coalesce(new.father_name_fa, '') ~ '[A-Za-z]' then
    raise exception 'invalid_persian_text';
  end if;
  if coalesce(new.first_name_en, '') ~ '[؀-ۿ]'
     or coalesce(new.last_name_en, '') ~ '[؀-ۿ]'
     or coalesce(new.father_name_en, '') ~ '[؀-ۿ]' then
    raise exception 'invalid_english_text';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_localized_team_member_names on public.team_members;
create trigger validate_localized_team_member_names
before insert or update of first_name, last_name, first_name_en, last_name_en, father_name_fa, father_name_en on public.team_members
for each row execute function public.validate_localized_team_member_names();

create or replace function public.validate_localized_team_text()
returns trigger language plpgsql as $$
begin
  if coalesce(new.name, '') ~ '[A-Za-z]' or coalesce(new.motto_fa, '') ~ '[A-Za-z]' then
    raise exception 'invalid_persian_text';
  end if;
  if coalesce(new.name_en, '') ~ '[؀-ۿ]' or coalesce(new.motto_en, '') ~ '[؀-ۿ]' then
    raise exception 'invalid_english_text';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_localized_team_text on public.teams;
create trigger validate_localized_team_text
before insert or update of name, name_en, motto_fa, motto_en on public.teams
for each row execute function public.validate_localized_team_text();

-- ===== 0088_account_delete_and_ticket_permissions.sql =====
-- Repair installations whose older constraints/grants drifted from the current
-- account-deletion and ticket authorization model.

alter table public.teams drop constraint if exists teams_company_id_fkey;
alter table public.teams
  add constraint teams_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.invoices drop constraint if exists invoices_team_id_fkey;
alter table public.invoices
  add constraint invoices_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.invoices drop constraint if exists invoices_company_id_fkey;
alter table public.invoices
  add constraint invoices_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.results drop constraint if exists results_team_id_fkey;
alter table public.results
  add constraint results_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.results drop constraint if exists results_company_id_fkey;
alter table public.results
  add constraint results_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.tickets drop constraint if exists tickets_team_id_fkey;
alter table public.tickets
  add constraint tickets_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

-- These SECURITY DEFINER functions still enforce visibility using auth.uid().
-- Re-granting execution restores access for authenticated users without making
-- ticket data public or bypassing the function-level authorization rules.
revoke all on function public.count_unread_tickets() from public;
revoke all on function public.list_unread_ticket_ids() from public;
grant execute on function public.count_unread_tickets() to authenticated;
grant execute on function public.list_unread_ticket_ids() to authenticated;

-- ===== 0089_repair_team_payment_validation.sql =====
-- Some upgraded databases can still retain the pre-registration-flow trigger
-- that hard-coded portrait/document requirements and raises
-- incomplete_team_person. Reinstall the trigger against the canonical,
-- league-aware person validator.

create or replace function public.validate_team_people_before_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person public.team_members%rowtype;
begin
  if new.lifecycle_status in (
       'awaiting_review',
       'awaiting_payment',
       'payment_pending',
       'payment_submitted',
       'registered'
     )
     and old.lifecycle_status is distinct from new.lifecycle_status then
    for v_person in
      select * from public.team_members where team_id = new.id
    loop
      if not public._team_person_complete_for_league(v_person, new.league_id) then
        raise exception 'team_dossier_incomplete:member_identity';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_team_people_before_payment on public.teams;
create trigger validate_team_people_before_payment
before update of lifecycle_status on public.teams
for each row execute function public.validate_team_people_before_payment();

-- ===== 0090_registration_fields_and_iran_cities.sql =====
-- Registration form controls and canonical Iranian city data. Hidden fields
-- retain their historical values; only active requirements participate in
-- dossier validation.

alter table public.site_settings
  add column if not exists member_education_enabled boolean not null default true,
  add column if not exists member_field_of_study_enabled boolean not null default true;

create table if not exists public.iran_cities (
  id bigint generated by default as identity primary key,
  province text not null,
  name text not null,
  sort_order integer not null default 0,
  constraint iran_cities_province_name_key unique (province, name)
);

with source(province, cities) as (values
  ('آذربایجان شرقی','تبریز،مراغه،مرند،میانه،اهر،بناب،سراب،آذرشهر،اسکو،شبستر،هشترود،جلفا،کلیبر،ملکان،بستان‌آباد'),
  ('آذربایجان غربی','ارومیه،خوی،میاندوآب،مهاباد،بوکان،سلماس،نقده،پیرانشهر،سردشت،شاهین‌دژ،ماکو،اشنویه،تکاب،چایپاره،شوط،پلدشت'),
  ('اردبیل','اردبیل،پارس‌آباد،مشگین‌شهر،خلخال،گرمی،بیله‌سوار،نمین،نیر،کوثر،اصلاندوز،سرعین'),
  ('اصفهان','اصفهان،کاشان،خمینی‌شهر،نجف‌آباد،شاهین‌شهر،شهرضا،فلاورجان،مبارکه،زرین‌شهر،آران و بیدگل،گلپایگان،فریدون‌شهر،نطنز،سمیرم،خوانسار،اردستان،نائین'),
  ('البرز','کرج،فردیس،نظرآباد،هشتگرد،محمدشهر،اشتهارد،کمال‌شهر،ماهدشت،طالقان،چهارباغ'),
  ('ایلام','ایلام،دهلران،ایوان،آبدانان،دره‌شهر،مهران،سرابله،بدره،چرداول،ملکشاهی'),
  ('بوشهر','بوشهر،برازجان،گناوه،کنگان،خورموج،جم،دیر،دیلم،عسلویه،اهرم،دلوار'),
  ('تهران','تهران،شهریار،اسلامشهر،قدس،ملارد،پاکدشت،قرچک،ورامین،رباط کریم،پرند،پردیس،دماوند،فیروزکوه،ری،شمیرانات،بومهن'),
  ('چهارمحال و بختیاری','شهرکرد،بروجن،فارسان،لردگان،فرخ‌شهر،سامان،اردل،بن،کیان،کوهرنگ،خانمیرزا'),
  ('خراسان جنوبی','بیرجند،قائن،طبس،فردوس،نهبندان،سربیشه،بشرویه،خوسف،درمیان،سرایان،زیرکوه'),
  ('خراسان رضوی','مشهد،نیشابور،سبزوار،تربت حیدریه،کاشمر،قوچان،تربت جام،تایباد،چناران،گناباد،سرخس،خواف،درگز،فریمان،بردسکن،طرقبه،شاندیز،فیروزه'),
  ('خراسان شمالی','بجنورد،شیروان،اسفراین،آشخانه،جاجرم،گرمه،فاروج،راز،مانه،سملقان'),
  ('خوزستان','اهواز،آبادان،خرمشهر،دزفول،اندیمشک،ماهشهر،بهبهان،شوشتر،مسجدسلیمان،ایذه،رامهرمز،شوش،شادگان،سوسنگرد،هندیجان،باغ‌ملک،امیدیه،رامشیر'),
  ('زنجان','زنجان،ابهر،خرمدره،قیدار،سلطانیه،آب‌بر،ماه‌نشان،زرین‌آباد،ایجرود،طارم'),
  ('سمنان','سمنان،شاهرود،دامغان،گرمسار،مهدی‌شهر،سرخه،آرادان،میامی،ایوانکی'),
  ('سیستان و بلوچستان','زاهدان،زابل،ایرانشهر،چابهار،خاش،سراوان،کنارک،نیک‌شهر،زهک،هیرمند،دلگان،قصرقند،راسک،سیب و سوران،مهرستان،میرجاوه'),
  ('فارس','شیراز،مرودشت،جهرم،کازرون،فسا،داراب،لار،فیروزآباد،آباده،اقلید،نی‌ریز،نورآباد،لامرد،استهبان،سپیدان،قیر،خنج،زرقان،گراش'),
  ('قزوین','قزوین،تاکستان،الوند،آبیک،بوئین‌زهرا،محمدیه،اقبالیه،آوج،شال،ضیاءآباد'),
  ('قم','قم،جعفریه،کهک،قنوات،دستجرد،سلفچگان'),
  ('کردستان','سنندج،سقز،مریوان،بانه،قروه،کامیاران،بیجار،دیواندره،دهگلان،سروآباد'),
  ('کرمان','کرمان،سیرجان،رفسنجان،جیرفت،بم،زرند،کهنوج،بافت،بردسیر،شهربابک،عنبرآباد،منوجان،راور،رودبار جنوب،فهرج،ریگان'),
  ('کرمانشاه','کرمانشاه،اسلام‌آباد غرب،جوانرود،کنگاور،سنقر،سرپل ذهاب،پاوه،صحنه،هرسین،گیلانغرب،قصر شیرین،روانسر،ثلاث باباجانی'),
  ('کهگیلویه و بویراحمد','یاسوج،دهدشت،دوگنبدان،لیکک،سی‌سخت،چرام،باشت،لنده،مارگون'),
  ('گلستان','گرگان،گنبد کاووس،علی‌آباد کتول،بندر ترکمن،آق‌قلا،کردکوی،مینودشت،کلاله،آزادشهر،رامیان،گمیشان،گالیکش،بندر گز'),
  ('گیلان','رشت،بندر انزلی،لاهیجان،لنگرود،تالش،آستارا،رودسر،صومعه‌سرا،فومن،رودبار،آستانه اشرفیه،رضوانشهر،ماسال،شفت،سیاهکل'),
  ('لرستان','خرم‌آباد،بروجرد،دورود،کوهدشت،الیگودرز،نورآباد،ازنا،پلدختر،الشتر،چگنی،رومشکان'),
  ('مازندران','ساری،بابل،آمل،قائم‌شهر،بهشهر،نکا،بابلسر،چالوس،تنکابن،نوشهر،رامسر،جویبار،محمودآباد،نور،فریدونکنار،کلاردشت،عباس‌آباد،گلوگاه'),
  ('مرکزی','اراک،ساوه،خمین،محلات،دلیجان،تفرش،شازند،آشتیان،کمیجان،زرندیه،خنداب،فراهان'),
  ('هرمزگان','بندرعباس،میناب،قشم،بندر لنگه،کیش،رودان،حاجی‌آباد،جاسک،بستک،پارسیان،خمیر،سیریک،ابوموسی'),
  ('همدان','همدان،ملایر،نهاوند،تویسرکان،کبودرآهنگ،اسدآباد،بهار،رزن،لالجین،فامنین،درگزین'),
  ('یزد','یزد،میبد،اردکان،بافق،مهریز،ابرکوه،تفت،اشکذر،زارچ،بهاباد،خاتم،مروست')
), expanded as (
  select source.province, trim(city.name) as name, city.ordinality::integer as sort_order
  from source
  cross join lateral unnest(string_to_array(source.cities, '،')) with ordinality as city(name, ordinality)
)
insert into public.iran_cities(province, name, sort_order)
select province, name, sort_order from expanded
on conflict (province, name) do update set sort_order=excluded.sort_order;

alter table public.iran_cities enable row level security;
drop policy if exists iran_cities_read on public.iran_cities;
create policy iran_cities_read on public.iran_cities for select to authenticated using (true);
grant select on public.iran_cities to authenticated;
grant usage, select on sequence public.iran_cities_id_seq to authenticated;

create or replace function public.validate_team_people_before_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person public.team_members%rowtype;
begin
  if new.lifecycle_status in (
       'awaiting_review',
       'awaiting_payment',
       'payment_pending',
       'payment_submitted',
       'registered'
     )
     and old.lifecycle_status is distinct from new.lifecycle_status then
    if nullif(trim(coalesce(new.province, '')), '') is null
       or nullif(trim(coalesce(new.city, '')), '') is null then
      raise exception 'team_location_required';
    end if;
    for v_person in
      select * from public.team_members where team_id = new.id
    loop
      if not public._team_person_complete_for_league(v_person, new.league_id) then
        raise exception 'team_dossier_incomplete:member_identity';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public._team_person_complete_for_league(
  p_member public.team_members,
  p_league_id uuid
)
returns boolean language sql stable set search_path=public as $$
  select
    nullif(trim(coalesce(p_member.first_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.first_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_en,'')),'') is not null
    and p_member.birth_date is not null
    and nullif(trim(coalesce(p_member.role,'')),'') is not null
    and nullif(trim(coalesce(p_member.residence,'')),'') is not null
    and nullif(trim(coalesce(p_member.country_code,'')),'') is not null
    and nullif(trim(coalesce(p_member.nationality,'')),'') is not null
    and (
      not coalesce((select member_education_enabled from public.site_settings where id=1), true)
      or nullif(trim(coalesce(p_member.education_level,'')),'') is not null
    )
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_photo' and is_active and is_required)
      or nullif(trim(coalesce(p_member.photo_url,'')),'') is not null)
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_identity' and is_active and is_required)
      or nullif(trim(coalesce(p_member.national_id_doc_path,'')),'') is not null)
    and (coalesce(p_member.is_foreign,false) or p_member.national_id ~ '^[0-9]{10}$')
    and (not coalesce(p_member.is_foreign,false) or nullif(trim(coalesce(p_member.passport_number,'')),'') is not null)
    and (p_member.role not in ('captain','coach') or p_member.phone ~ '^09[0-9]{9}$')
    and (p_member.role <> 'member' or not exists(
      select 1 from public.leagues l where l.id=p_league_id and (
        (l.min_age is not null and extract(year from age(current_date,p_member.birth_date)) < l.min_age)
        or (l.max_age is not null and extract(year from age(current_date,p_member.birth_date)) > l.max_age)
      )
    ))
$$;

-- ===== 0091_remove_redundant_residence_field.sql =====
-- The profile form keeps one canonical location field: address. Historical
-- residence values remain stored, but they no longer block completion.
update public.participant_field_rules
set is_required = false, updated_at = now()
where field_key = 'residence';

-- ===== 0092_complete_iran_city_catalog.sql =====
-- Complete Iranian city catalog (idempotent).
-- Keeps historical rows and only adds/normalizes province-city names.
with source(province, names) as (values
  ('مرکزی', ARRAY['اراک','داودآباد','ساروق','کارچان','آشتیان','خمین','تفرش','شهباز','ساوه','آوه','نوبران','دلیجان','نراق','مهاجران','توره','آستانه','شازند','هندودر','جاورسیان','محلات','نیمور','رازقان','مامونیه','خشکرود','پرندک','زاویه','کمیجان','میلاجرد','خنداب','فرمهین','خنجین','تلخاب']),
  ('گیلان', ARRAY['آستارا','لوندویل','کیاشهر','بندرانزلی','لیسار','لوشان','رودبار','منجیل','اسالم','حویق','چوبر','سنگر','کوچصفهان','لولمان','پیربازار','فومن','ماسوله','ماکلوان','لنگرود','رشت','خشکبیجار','توتکابن','جیرنده','رودسر','چابکسر','کلاچای','واجارگاه','مرجقل','ضیابر','اطاقور','کومله','شلمان','لاهیجان','رودبنه','شفت','رانکوه','املش','رضوانشهر','دیلمان','سیاهکل','ماسال','خمام','چوکام']),
  ('مازندران', ARRAY['رینه','گزنک','آمل','دابودشت','بابکان','امیرکلا','بابل','گلوگاه','مرزیکلا','زرگر','گتاب','بهشهر','رستمکلا','شیرود','تنکابن','نشتارود','رامسر','دالخانی','کیاسر','فریم','ساری','اکند','بلده','آلاشت','زیرآب','ارطه','بهنمیر','چمستان','نور','رویان','ایزدشهر','پول','کجور','نوشهر','بابلسر','سرخرود','محمودآباد','نکا','چالوس','هچیرود','جویبار','فریدونکنار','کلارآباد','سورک','طبقده','کیاکلا','شیرگاه','کلاردشت']),
  ('آذربایجان شرقی', ARRAY['اهر','تبریز','سردرود','اسفهلان','لاهیجان','خسروشاه','مهربان','شربیان','دوزدوزان','باسمنج','سراب','مراغه','خداجوخراجو','زنوز','مرند','یامچی','کشکسرای','ترکمانچای','آقکند','ترک','میانه','اچاچی','هشترود','نظرکهریزی','بناب','کلیبر','کردکندی','صوفیان','خامنه','شبستر','شرفخانه','شندآباد','سیس','وایقان','داریان','علیشاه','تسوج','خواجه','اربطان','هریس','زرنق','بخشایش','کلوانق','جلفا','هادیشهر','ملکان','گوگان','تیمورلو','ممقان','ایلخچی','اسکو','سهند','آذرشهر','خاروانا','ورزقان','خمارلو','عاشقلو','لاریجان','هوراند','لیلان']),
  ('آذربایجان غربی', ARRAY['قوشچی','سیلوانه','سرو','ارومیه','نوشین','پیرانشهر','لاجان','خوی','زرآباد','ایواوغلی','قطور','فیرورق','سلماس','سردشت','ربط','نلاس','ماکو','بازرگان','خلیفان','مهاباد','میاندوآب','بکتاش','نقده','محمدیار','سیمینه','بوکان','محمودآباد','کشاورز','تکاب','اشنویه','نالوس','آواجیق','پلدشت','حاجیلار','مرگنلر','شوط','یولاگلدی','چهاربرج','باروق','میرآباد']),
  ('کرمانشاه', ARRAY['حمیل','هلشی','کرمانشاه','رباط','کوزران','قلعه','باینگان','بانوره','پاوه','نودشه','نوسود','سنقر','سطر','سومار','قصرشیرین','کنگاور','گودین','سرمست','گیلانغرب','جوانرود','شروینه','دینور','صحنه','بیستون','هرسین','ازگله','میرآباد','گهواره','کرند','ریجاب','شاهو','روانسر']),
  ('خوزستان', ARRAY['اروندکنار','آبادان','چویبده','حسینیه','بیدروبه','اندیمشک','آزادی','اهواز','الهایی','ایذه','بندرماهشهر','چمران','سردشت','بهبهان','منصوریه','تشان','خرمشهر','مقاومت','مینوشهر','حمزه','سالند','دزفول','میانرود','منتظران','چغامیش','شهیون','بستان','سوسنگرد','ابوحمیظه','رامهرمز','باوج','شادگان','خنافره','دارخوین','شوشتر','شرافت','سرداران','گوریه','مسجدسلیمان','گلگیر','عنبر','شوش','حر','هندیجان','میداود','جایزان','امیدیه','میانکوه','لالی','تراز','زهره','رامشیر','مشراگه','ترکالکی','سماله','گتوند','آبژدان','زاووت','هفتگل','رفیع','هویزه','ملاثانی','ویس','شیبان','حمیدیه','آغاجاری','جولکی','الوان','شاوور','دهدز','صیدون']),
  ('فارس', ARRAY['آباده','ایزدخواست','سورمق','صغاد','بهمن','رونیز','استهبان','ایج','دژکرد','سده','اقلید','دوزه','جهرم','رستاق','داراب','فدامی','دوبرجی','پاسخن','اردکان','هماشهر','شیراز','شهرصدرا','داریان','ششده','زاهدشهر','میانشهر','فسا','نوبندگان','فیروزآباد','میمند','بالاده','کنارتخته','کازرون','خشت','لار','لطیفی','خور','دهکویه','بیرم','بنارویه','کامفیروز','مرودشت','رامجرد','مشکان','سیدان','فاروق','خانیمن','بابامنیر','نورآباد','قطرویه','لامرد','اشکنان','اهل','علامرودشت','خیرگو','بوانات','مزایجان','ارسنجان','قادراباد','صفاشهر','شهرپیر','دبیران','افزر','قیر','فال','مهر','وراوی','خوزی','اسیر','فراشبند','نوجین','دهرم','مادرسلیمان','محمله','طسوج','خنج','کوهنجان','سروستان','کوپن','مصیری','گراش','ارد','اکبرآباد','مظفری','کوار','خرامه','معزآبادجابری','خیراباد','زرقان','لپویی','بیضا','حسامی','توجردی','قایمیه','نودان','خاوران','اوز','کوره','جویم']),
  ('کرمان', ARRAY['بافت','بزنجان','کشکوییه','بم','بروات','دهبکری','جبالبارز','جیرفت','بلوک','رفسنجان','بهرمان','صفاییه','زرند','خانوک','ریحان','سیریز','سیرجان','پاریز','هماشهر','زیدآباد','بلورد','شهداد','اندوهجرد','گلباف','شهربابک','خورسند','جوزم','دهج','جوپار','ماهان','کرمان','باغین','اختیارآباد','راین','چترود','کهنوج','بردسیر','دشتکار','گلزار','نگار','هجدک','راور','عنبرآباد','دوساری','مردهک','منوجان','نودژ','کیانشهر','کوهبنان','رودبار','رمشک','محمدآباد','رابر','هنزا','فهرج','انار','نرماشیر','فاریاب','پاسفید','ارزوییه','گنبکی','زهکلوت']),
  ('خراسان رضوی', ARRAY['تایباد','کاریز','بایک','کدکن','نصرآباد','نسر','چاپشلو','درگز','نوخندان','باجگیران','روداب','سبزوار','مزرج','قوچان','آلماجق','کاشمر','بیدخت','گناباد','روشناوند','کاخک','مشهد','رضویه','چکنه','نیشابور','بار','فریمان','فرهادگرد','چناران','رادکان','سیدآباد','سنگان','خواف','نشتیفان','سده','سلامی','مزدآوند','سرخس','انابد','بردسکن','شهرآباد','جنگل','رشتخوار','چنار','کلات','کندر','شادمهر','بجستان','یونسی','طرقبه','فیروزه','شاندیز','گرماب','جغتای','ریواده','چخماق','مشکان','نقاب','باخرز','داورزن','ریوند','ریوش','درود','قدمگاه','خرو','گلبهار','ششتمد','شامکان','گلمکان']),
  ('اصفهان', ARRAY['اردستان','زواره','مهاباد','بیده','اصفهان','قهجاورستان','بهارستان','زیار','درچه','کوشک','اصغرآباد','ویست','خوانسار','کمه','سمیرم','حنا','ونک','داران','دامنه','فریدونشهر','طاد','پیربکران','فلاورجان','ابریشم','اشترجان','مینادشت','قهدریجان','زازران','شهرضا','منظریه','قمصر','کاشان','مشکات','نیاسر','برزک','گلپایگان','گوگد','گلشهر','چرمهین','چمگردان','ورنامخواست','فولادشهر','باغشاد','انارک','نایین','بافران','جوزدان','گلدشت','کهریزسنگ','دهق','علویجه','نطنز','بادرود','خالدآباد','میمه','وزوان','گزبرخوار','گرگاب','مبارکه','مجلسی','دیزیچه','طالخونچه','کرکوند','زیباشهر','ابوزیدآباد','عسگران','تیران','رضوانشهر','چادگان','رزوه','دهاقان','گلشن','شاپورآباد','کمشچه','خورزوق','دستگرد','سین','خور','فرخی','جندق','افوس','کوهپایه','تودشک','سجزی','محمدآباد','نصرآباد','ورزنه','هرند','اژیه']),
  ('سیستان و بلوچستان', ARRAY['بزمان','ایرانشهر','پلان','خاش','زابل','بنجار','زاهدان','سرجنگل','سراوان','محمدی','گشت','سیرکان','اسفندک','بنت','چانف','پیشین','راسک','پارود','کنارک','جزینک','زهک','قرقری','گلمورتی','چگرد','مهرستان','آشار','سیب','سوران','هیدوچ','ادیمی','محمدآباد','میرجاوه','لادیز','قصرقند','ساربوک','فنوج','گتیج','محمدان','بمپور','بریس','نگور','سرباز','جالق','اسپکه','زرآباد']),
  ('کردستان', ARRAY['آرمرده','بابارشانی','پیرتاج','بانه','یاسوکند','بیجار','صاحب','سقز','سنته','سنندج','شویشه','قروه','دزج','مالوجه','دلبران','چناره','مریوان','زرینه','دیواندره','هزارکانیان','کامیاران','موچش','سروآباد','دهگلان']),
  ('همدان', ARRAY['فرسفج','تویسرکان','سرکان','ازندریان','جوکار','سامن','ملایر','زنگنه','فیروزان','نهاوند','برزول','گیان','قهاوند','مریانج','همدان','جورقان','کبودرآهنگ','اسدآباد','پالیز','دمق','آجین','لالجین','مهاجران','بهار','رزن','فامنین','شاهنجرین','کرفس']),
  ('چهارمحال و بختیاری', ARRAY['گندمان','بروجن','فرادبنه','سفیددشت','نقنه','بلداجی','شهرکرد','هفشجان','کیان','طاقانک','نافچ','سورشجان','سودجان','هارونی','فارسان','گوجان','باباحیدر','جونقان','پردنجان','چلیچه','لردگان','منج','سردشت','اردل','کاج','دشتک','سرخون','بازفت','چلگرد','صمصامی','شلمزار','گهرو','دستنا','ناغان','سامان','هوره','بن','وردنجان','آلونی']),
  ('لرستان', ARRAY['الیگودرز','شاهپوراباد','اشترینان','ونایی','بروجرد','سپیددشت','زاغه','نورآباد','برخوردار','چالانچولان','دورود','گراب','کوهدشت','کوهنانی','ازنا','پلدختر','فیروزآباد','الشتر','ویسیان','سوری','چقابل','معمولان']),
  ('ایلام', ARRAY['ایلام','جعفراباد','ماژین','پهله','دهلران','موسیان','میمه','سرابله','شباب','بلاوه','مهران','مورموری','آبدانان','زرنه','چوار','ایوان','ارکواز','دلگشا','مهر','لومار','بدره','توحید']),
  ('کهگیلویه و بویراحمد', ARRAY['یاسوج','مادوان','چیتاب','سپیدار','دهدشت','دیشموک','سوق','دوگنبدان','پاتاوه','لیکک','چرام','سرفاریاب','باشت','بوستان','لنده','مارگون']),
  ('بوشهر', ARRAY['خارک','بوشهر','چغادک','دلوار','برازجان','دالکی','اهرم','آباد','وحدتیه','شبانکاره','کلمه','بوشکان','کاکی','بادوله','خورموج','شنبه','بردخون','بندردیر','بردستان','دوراهک','آبدان','بندرکنگان','بنک','شیرینو','سیراف','بندرریگ','بندرگناوه','بندردیلم','انارستان','ریز','جم','بهارستان','عسلویه','بیدخون']),
  ('زنجان', ARRAY['ابهر','هیدج','گرماب','قیدار','سهرورد','کرسف','نوربهار','سجاس','زنجان','ارمغانخانه','حلب','خرمدره','چورزق','دندی','سلطانیه']),
  ('سمنان', ARRAY['امیریه','دامغان','دیباج','کلاته','سمنان','بسطام','مجن','بیارجمند','شاهرود','رودیان','ایوانکی','گرمسار','شهمیرزاد','درجزین','آرادان','میامی','رضوان','سرخه']),
  ('یزد', ARRAY['خرانق','اردکان','عقدا','بافق','تفت','نیر','بخ','مهریز','یزد','شاهدیه','حمیدیا','میبد','ندوشن','بفروییه','خضرآباد','مهردشت','ابرکوه','اشکذر','مجومرد','هرات','بهاباد','مروست','زارچ']),
  ('هرمزگان', ARRAY['ابوموسی','فین','تخت','هرمز','چارک','کیش','کنگ','لمزان','سوزا','رمکان','لافت','قشم','درگهان','طبل','سندرک','میناب','تیرور','هشتبندی','زهوکی','کرگان','لیردف','زیارتعلی','دهبارز','بیکاء','فارغان','سرگز','جناح','هنگوییه','بستک','کوهیچ','رویدر','خمیر','پل','کوشکنار','پارسیان','دشتی','کوهستک','سیریک','گروک','سردشت','گوهران']),
  ('تهران', ARRAY['تهران','دماوند','کیلان','آبسرد','رودهن','آبعلی','ملارد','صفادشت','پیشوا','باقرشهر','کهریزک','ری','فشم','تجریش','شمشک','لواسان','جوادآباد','ورامین','شهریار','صباشهر','شاهدشهر','باغستان','اندیشه','وحیدیه','فردوسیه','چهاردانگه','اسلامشهر','رباطکریم','نصیرشهر','پرند','پاکدشت','ارجمند','فیروزکوه','قدس','گلستان','صالحیه','بومهن','سعیداباد','خسرواباد','پردیس','قرچک']),
  ('اردبیل', ARRAY['هشتجین','کلور','اردبیل','هیر','آراللو','ثمرین','جعفرآباد','خلخال','رضی','النی','لاهرود','فخراباد','مرادلو','قصابه','گرمی','زهرا','اولتان','گیوی','فیروزآباد','نمین','عنبران','نیر','کوراییم','سرعین','اردیموسی','اصلاندوز','زیوه']),
  ('قم', ARRAY['دستجرد','قم','قنوات','سلفچگان','جعفریه','قاهان','کهک']),
  ('قزوین', ARRAY['دانسفهان','شال','سگزآباد','ارداق','اسفرورین','خرمدشت','ضیاآباد','تاکستان','نرجه','رازمیان','سیردان','قزوین','اقبالیه','محمودآبادنمونه','کوهین','خاکعلی','آبیک','زیاران','قشلاق','شریفیه','محمدیه','بیدستان','الوند','آوج','آبگرم']),
  ('گلستان', ARRAY['بندرگز','نوکنده','بندرترکمن','سیجوال','مزرعه','سنگدوین','کردکوی','گرگان','جلین','سرخنکلاته','قرق','کرند','فراغی','گنبدکاووس','القجر','مینودشت','دوزین','کلاله','آزادشهر','رامیان','دلند','مراوه','گلیداغ','ینقاق','گالیکش']),
  ('خراسان شمالی', ARRAY['اسفراین','بجنورد','حصارگرمخان','سنخواست','شوقان','جاجرم','لوجلی','خانلق','شیروان','زیارت','قوشخانه','تیتکانلو','فاروج','قاضی','آوا','آشخانه','ایور','گرمه','درق','راز','غلامان']),
  ('خراسان جنوبی', ARRAY['بیرجند','قهستان','گزیک','اسدیه','سربیشه','مود','درح','قاین','اسفدن','نیمبلوک','شوسف','نهبندان','سرایان','آیسک','باغستان','اسلامیه','فردوس','زهان','بشرویه','ارسک','آبیز','خوسف','ماژان','طبس','دیهوک']),
  ('البرز', ARRAY['کرج','ماهدشت','گرمدره','آسارا','هشتگرد','گلسار','مهستان','کوهسار','نظرآباد','تنکمان','طالقان','اشتهارد','فردیس','چهارباغ'])
), expanded as (
  select s.province, trim(u.city) as name, row_number() over (partition by s.province order by u.ordinality, trim(u.city))::integer as sort_order
  from source s
  cross join lateral unnest(s.names) with ordinality as u(city, ordinality)
  where trim(u.city) <> ''
), inserted as (
  insert into public.iran_cities (province, name, sort_order)
  select province, name, sort_order from expanded
  on conflict (province, name) do update set sort_order = excluded.sort_order
  returning 1
)
select count(*) as upserted_city_count from inserted;

-- ===== 0093_remove_member_residence_requirement.sql =====
-- Residence is no longer collected for team members. Keep the column for
-- historical data, but do not require it during review/payment validation.
create or replace function public._team_person_complete_for_league(
  p_member public.team_members,
  p_league_id uuid
)
returns boolean language sql stable set search_path=public as $$
  select
    nullif(trim(coalesce(p_member.first_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.first_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_en,'')),'') is not null
    and p_member.birth_date is not null
    and nullif(trim(coalesce(p_member.role,'')),'') is not null
    and nullif(trim(coalesce(p_member.country_code,'')),'') is not null
    and nullif(trim(coalesce(p_member.nationality,'')),'') is not null
    and (not coalesce((select member_education_enabled from public.site_settings where id=1), true)
      or nullif(trim(coalesce(p_member.education_level,'')),'') is not null)
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_photo' and is_active and is_required)
      or nullif(trim(coalesce(p_member.photo_url,'')),'') is not null)
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_identity' and is_active and is_required)
      or nullif(trim(coalesce(p_member.national_id_doc_path,'')),'') is not null)
    and (coalesce(p_member.is_foreign,false) or p_member.national_id ~ '^[0-9]{10}$')
    and (not coalesce(p_member.is_foreign,false) or nullif(trim(coalesce(p_member.passport_number,'')),'') is not null)
    and (p_member.role not in ('captain','coach') or p_member.phone ~ '^09[0-9]{9}$')
    and (p_member.role <> 'member' or not exists(
      select 1 from public.leagues l where l.id=p_league_id and (
        (l.min_age is not null and extract(year from age(current_date,p_member.birth_date)) < l.min_age)
        or (l.max_age is not null and extract(year from age(current_date,p_member.birth_date)) > l.max_age)
      )
    ))
$$;

-- ===== 0094_allow_league_pdf_uploads.sql =====
-- League regulation/rules PDFs use the existing public content-media bucket.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf']
where id = 'content-media';

-- ===== 0095_seed_managed_static_pages.sql =====
-- Keep every public information page represented in the CMS. Public pages
-- consume these rows when populated, so content is not split silently between
-- hardcoded React copy and the admin editor.
insert into public.static_pages(slug,title,title_en,excerpt,excerpt_en,body,body_en)
values
('about','درباره ما','About us','معرفی جام تبرستان','About Tabarestan Cup','<h2>جام تبرستان</h2><p>جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهای رباتیک، مکاترونیک و هوش مصنوعی است.</p><h2>ماموریت و چشم‌انداز</h2><p>هدف ما برگزاری رقابت‌های شفاف و استاندارد، رشد مهارت‌های فنی و ساختن مسیر پایدار از تجربه نخست تا فعالیت حرفه‌ای است.</p><h2>حوزه‌های فعالیت</h2><ul><li>رباتیک و مکاترونیک</li><li>هوش مصنوعی و سامانه‌های هوشمند</li><li>مسابقات حرفه‌ای و داوری تخصصی</li></ul>','<h2>Tabarestan Cup</h2><p>Tabarestan Cup is a professional platform for competition, learning and recognition across robotics, mechatronics and artificial intelligence.</p><h2>Mission and vision</h2><p>We create transparent, rigorous competitions that turn technical knowledge into practical capability and professional opportunity.</p>'),
('contact','تماس با ما','Contact us','راه‌های ارتباط با دبیرخانه','Contact the secretariat','<h2>ارتباط با دبیرخانه</h2><p>برای پرسش‌های مربوط به ثبت‌نام، لیگ‌ها و پشتیبانی از راه‌های ارتباطی درج‌شده در همین صفحه استفاده کنید.</p>','<h2>Contact the secretariat</h2><p>For registration, league and support questions, use the contact channels shown on this page.</p>'),
('faq','سوالات متداول','Frequently asked questions','پاسخ پرسش‌های پرتکرار','Answers to common questions','<h2>ثبت‌نام چگونه انجام می‌شود؟</h2><p>پس از ورود یا ساخت حساب، اطلاعات هویتی و تیم را تکمیل کنید، مدارک را بارگذاری و مراحل بررسی، پذیرش قوانین و پرداخت را انجام دهید.</p><h2>آیا اعضای تیم حساب جداگانه دارند؟</h2><p>خیر. اعضا به‌عنوان افراد وابسته به تیم ثبت می‌شوند و حساب CRM مستقل ندارند.</p><h2>برای پشتیبانی چه کار کنم؟</h2><p>از صفحه تماس با ما پیام ارسال کنید یا از شماره و ایمیل دبیرخانه استفاده کنید.</p>','<h2>How does registration work?</h2><p>Create or sign in to your account, complete identity and team information, upload documents, accept the rules and pay.</p><h2>Do team members need separate accounts?</h2><p>No. Team members are stored as people belonging to the team and do not receive separate CRM accounts.</p>'),
('registration-guide','راهنمای ثبت‌نام','Registration guide','مراحل ثبت‌نام و پرداخت','Registration and payment steps','<h2>مراحل ثبت‌نام</h2><ol><li>ورود یا ساخت حساب و تأیید شماره موبایل</li><li>تکمیل اطلاعات هویتی و نوع شرکت‌کننده</li><li>انتخاب لیگ، ساخت تیم و افزودن اعضا</li><li>بازبینی اطلاعات و بارگذاری مدارک فعال</li><li>ارسال مستندات فنی، پذیرش قوانین و پرداخت</li><li>دریافت مجوز حضور پس از تأیید پرداخت</li></ol><p>سرپرست، مربی و اعضا افراد وابسته به تیم هستند و حساب CRM جداگانه دریافت نمی‌کنند.</p>','<h2>Registration steps</h2><ol><li>Sign in or create an account and verify your mobile number.</li><li>Complete identity and participant information.</li><li>Select a league, create a team and add its people.</li><li>Review information and upload active required documents.</li><li>Submit technical files, accept the rules and pay.</li><li>Receive attendance clearance after payment approval.</li></ol><p>Captains, coaches and members belong to the team and do not receive separate CRM accounts.</p>'),
('privacy','حریم خصوصی','Privacy policy','حفاظت از اطلاعات کاربران','Protection of participant information','','')
on conflict (slug) do update set
  title = case when nullif(trim(public.static_pages.title),'') is null then excluded.title else public.static_pages.title end,
  title_en = case when nullif(trim(public.static_pages.title_en),'') is null then excluded.title_en else public.static_pages.title_en end,
  excerpt = case when nullif(trim(public.static_pages.excerpt),'') is null then excluded.excerpt else public.static_pages.excerpt end,
  excerpt_en = case when nullif(trim(public.static_pages.excerpt_en),'') is null then excluded.excerpt_en else public.static_pages.excerpt_en end,
  body = case when nullif(trim(public.static_pages.body),'') is null then excluded.body else public.static_pages.body end,
  body_en = case when nullif(trim(public.static_pages.body_en),'') is null then excluded.body_en else public.static_pages.body_en end;

-- ===== 0096_complete_iran_city_catalog_reference.sql =====
-- Complete Iranian city catalog from the maintained province-by-province reference list.
-- This migration is additive and preserves historical city values.
with source(province, name, sort_order) as (values
  ('اردبیل', 'اردبیل', 1),
  ('اردبیل', 'اصلاندوز', 2),
  ('اردبیل', 'آبی بیگلو', 3),
  ('اردبیل', 'بیله سوار', 4),
  ('اردبیل', 'پارس آباد', 5),
  ('اردبیل', 'تازه کند', 6),
  ('اردبیل', 'تازه کندانگوت', 7),
  ('اردبیل', 'جعفرآباد', 8),
  ('اردبیل', 'خلخال', 9),
  ('اردبیل', 'رضی', 10),
  ('اردبیل', 'سرعین', 11),
  ('اردبیل', 'عنبران', 12),
  ('اردبیل', 'فخرآباد', 13),
  ('اردبیل', 'کلور', 14),
  ('اردبیل', 'کوراییم', 15),
  ('اردبیل', 'گرمی', 16),
  ('اردبیل', 'گیوی', 17),
  ('اردبیل', 'لاهرود', 18),
  ('اردبیل', 'مرادلو', 19),
  ('اردبیل', 'مشگین شهر', 20),
  ('اردبیل', 'نمین', 21),
  ('اردبیل', 'نیر', 22),
  ('اردبیل', 'هشتجین', 23),
  ('اردبیل', 'هیر', 24),
  ('اصفهان', 'ابریشم', 1),
  ('اصفهان', 'ابوزیدآباد', 2),
  ('اصفهان', 'اردستان', 3),
  ('اصفهان', 'اژیه', 4),
  ('اصفهان', 'اصفهان', 5),
  ('اصفهان', 'افوس', 6),
  ('اصفهان', 'انارک', 7),
  ('اصفهان', 'ایمانشهر', 8),
  ('اصفهان', 'آران وبیدگل', 9),
  ('اصفهان', 'بادرود', 10),
  ('اصفهان', 'باغ بهادران', 11),
  ('اصفهان', 'بافران', 12),
  ('اصفهان', 'برزک', 13),
  ('اصفهان', 'برف انبار', 14),
  ('اصفهان', 'بوئین ومیاندشت', 15),
  ('اصفهان', 'بهاران شهر', 16),
  ('اصفهان', 'بهارستان', 17),
  ('اصفهان', 'پیربکران', 18),
  ('اصفهان', 'تودشک', 19),
  ('اصفهان', 'تیران', 20),
  ('اصفهان', 'جندق', 21),
  ('اصفهان', 'جوزدان', 22),
  ('اصفهان', 'جوشقان وکامو', 23),
  ('اصفهان', 'چادگان', 24),
  ('اصفهان', 'چرمهین', 25),
  ('اصفهان', 'چمگردان', 26),
  ('اصفهان', 'حبیب آباد', 27),
  ('اصفهان', 'حسن آباد', 28),
  ('اصفهان', 'حنا', 29),
  ('اصفهان', 'خالدآباد', 30),
  ('اصفهان', 'خمینی شهر', 31),
  ('اصفهان', 'خوانسار', 32),
  ('اصفهان', 'خور', 33),
  ('اصفهان', 'خوراسگان', 34),
  ('اصفهان', 'خورزوق', 35),
  ('اصفهان', 'داران', 36),
  ('اصفهان', 'دامنه', 37),
  ('اصفهان', 'درچه پیاز', 38),
  ('اصفهان', 'دستگرد', 39),
  ('اصفهان', 'دولت آباد', 40),
  ('اصفهان', 'دهاقان', 41),
  ('اصفهان', 'دهق', 42),
  ('اصفهان', 'دیزیچه', 43),
  ('اصفهان', 'رزوه', 44),
  ('اصفهان', 'رضوانشهر', 45),
  ('اصفهان', 'زاینده رود', 46),
  ('اصفهان', 'زرین شهر', 47),
  ('اصفهان', 'زواره', 48),
  ('اصفهان', 'زیباشهر', 49),
  ('اصفهان', 'سده لنجان', 50),
  ('اصفهان', 'سفیدشهر', 51),
  ('اصفهان', 'سگزی', 52),
  ('اصفهان', 'سمیرم', 53),
  ('اصفهان', 'شاپورآباد', 54),
  ('اصفهان', 'شاهین شهر', 55),
  ('اصفهان', 'شهرضا', 56),
  ('اصفهان', 'طالخونچه', 57),
  ('اصفهان', 'عسگران', 58),
  ('اصفهان', 'علویچه', 59),
  ('اصفهان', 'فرخی', 60),
  ('اصفهان', 'فریدونشهر', 61),
  ('اصفهان', 'فلاورجان', 62),
  ('اصفهان', 'فولادشهر', 63),
  ('اصفهان', 'قمصر', 64),
  ('اصفهان', 'قهجاورستان', 65),
  ('اصفهان', 'قهدریجان', 66),
  ('اصفهان', 'کاشان', 67),
  ('اصفهان', 'کرکوند', 68),
  ('اصفهان', 'کلیشادوسودرجان', 69),
  ('اصفهان', 'کمشچه', 70),
  ('اصفهان', 'کمه', 71),
  ('اصفهان', 'کوشک', 72),
  ('اصفهان', 'کوهپایه', 73),
  ('اصفهان', 'کهریزسنگ', 74),
  ('اصفهان', 'گرگاب', 75),
  ('اصفهان', 'گزبرخوار', 76),
  ('اصفهان', 'گلپایگان', 77),
  ('اصفهان', 'گلدشت', 78),
  ('اصفهان', 'گلشن', 79),
  ('اصفهان', 'گلشهر', 80),
  ('اصفهان', 'گوگد', 81),
  ('اصفهان', 'لای بید', 82),
  ('اصفهان', 'مبارکه', 83),
  ('اصفهان', 'محمدآباد', 84),
  ('اصفهان', 'مشکات', 85),
  ('اصفهان', 'منظریه', 86),
  ('اصفهان', 'مهاباد', 87),
  ('اصفهان', 'میمه', 88),
  ('اصفهان', 'نائین', 89),
  ('اصفهان', 'نجف آباد', 90),
  ('اصفهان', 'نصرآباد', 91),
  ('اصفهان', 'نطنز', 92),
  ('اصفهان', 'نوش آباد', 93),
  ('اصفهان', 'نیاسر', 94),
  ('اصفهان', 'نیک آباد', 95),
  ('اصفهان', 'ورزنه', 96),
  ('اصفهان', 'ورنامخواست', 97),
  ('اصفهان', 'وزوان', 98),
  ('اصفهان', 'ونک', 99),
  ('اصفهان', 'هرند', 100),
  ('البرز', 'اشتهارد', 1),
  ('البرز', 'آسارا', 2),
  ('البرز', 'تنکمان', 3),
  ('البرز', 'چهارباغ', 4),
  ('البرز', 'سیف آباد', 5),
  ('البرز', 'شهرجدیدهشتگرد', 6),
  ('البرز', 'طالقان', 7),
  ('البرز', 'کرج', 8),
  ('البرز', 'کمال شهر', 9),
  ('البرز', 'کوهسار', 10),
  ('البرز', 'گرمدره', 11),
  ('البرز', 'ماهدشت', 12),
  ('البرز', 'محمدشهر', 13),
  ('البرز', 'مشکین دشت', 14),
  ('البرز', 'نظرآباد', 15),
  ('البرز', 'هشتگرد', 16),
  ('ایلام', 'ارکواز', 1),
  ('ایلام', 'ایلام', 2),
  ('ایلام', 'ایوان', 3),
  ('ایلام', 'آبدانان', 4),
  ('ایلام', 'آسمان آباد', 5),
  ('ایلام', 'بدره', 6),
  ('ایلام', 'پهله', 7),
  ('ایلام', 'توحید', 8),
  ('ایلام', 'چوار', 9),
  ('ایلام', 'دره شهر', 10),
  ('ایلام', 'دلگشا', 11),
  ('ایلام', 'دهلران', 12),
  ('ایلام', 'زرنه', 13),
  ('ایلام', 'سراب باغ', 14),
  ('ایلام', 'سرابله', 15),
  ('ایلام', 'صالح آباد', 16),
  ('ایلام', 'لومار', 17),
  ('ایلام', 'مورموری', 18),
  ('ایلام', 'موسیان', 19),
  ('ایلام', 'مهران', 20),
  ('ایلام', 'میمه', 21),
  ('آذربایجان شرقی', 'اسکو', 1),
  ('آذربایجان شرقی', 'اهر', 2),
  ('آذربایجان شرقی', 'ایلخچی', 3),
  ('آذربایجان شرقی', 'آبش احمد', 4),
  ('آذربایجان شرقی', 'آذرشهر', 5),
  ('آذربایجان شرقی', 'آقکند', 6),
  ('آذربایجان شرقی', 'باسمنج', 7),
  ('آذربایجان شرقی', 'بخشایش', 8),
  ('آذربایجان شرقی', 'بستان آباد', 9),
  ('آذربایجان شرقی', 'بناب', 10),
  ('آذربایجان شرقی', 'بناب جدید', 11),
  ('آذربایجان شرقی', 'تبریز', 12),
  ('آذربایجان شرقی', 'ترک', 13),
  ('آذربایجان شرقی', 'ترکمانچای', 14),
  ('آذربایجان شرقی', 'تسوج', 15),
  ('آذربایجان شرقی', 'تیکمه داش', 16),
  ('آذربایجان شرقی', 'جلفا', 17),
  ('آذربایجان شرقی', 'خاروانا', 18),
  ('آذربایجان شرقی', 'خامنه', 19),
  ('آذربایجان شرقی', 'خراجو', 20),
  ('آذربایجان شرقی', 'خسروشهر', 21),
  ('آذربایجان شرقی', 'خمارلو', 22),
  ('آذربایجان شرقی', 'خواجه', 23),
  ('آذربایجان شرقی', 'دوزدوزان', 24),
  ('آذربایجان شرقی', 'زرنق', 25),
  ('آذربایجان شرقی', 'زنوز', 26),
  ('آذربایجان شرقی', 'سراب', 27),
  ('آذربایجان شرقی', 'سردرود', 28),
  ('آذربایجان شرقی', 'سیس', 29),
  ('آذربایجان شرقی', 'سیه رود', 30),
  ('آذربایجان شرقی', 'شبستر', 31),
  ('آذربایجان شرقی', 'شربیان', 32),
  ('آذربایجان شرقی', 'شرفخانه', 33),
  ('آذربایجان شرقی', 'شندآباد', 34),
  ('آذربایجان شرقی', 'شهرجدیدسهند', 35),
  ('آذربایجان شرقی', 'صوفیان', 36),
  ('آذربایجان شرقی', 'عجب شیر', 37),
  ('آذربایجان شرقی', 'قره آغاج', 38),
  ('آذربایجان شرقی', 'کشکسرای', 39),
  ('آذربایجان شرقی', 'کلوانق', 40),
  ('آذربایجان شرقی', 'کلیبر', 41),
  ('آذربایجان شرقی', 'کوزه کنان', 42),
  ('آذربایجان شرقی', 'گوگان', 43),
  ('آذربایجان شرقی', 'لیلان', 44),
  ('آذربایجان شرقی', 'مراغه', 45),
  ('آذربایجان شرقی', 'مرند', 46),
  ('آذربایجان شرقی', 'ملکان', 47),
  ('آذربایجان شرقی', 'ممقان', 48),
  ('آذربایجان شرقی', 'مهربان', 49),
  ('آذربایجان شرقی', 'میانه', 50),
  ('آذربایجان شرقی', 'نظرکهریزی', 51),
  ('آذربایجان شرقی', 'وایقان', 52),
  ('آذربایجان شرقی', 'ورزقان', 53),
  ('آذربایجان شرقی', 'هادیشهر', 54),
  ('آذربایجان شرقی', 'هریس', 55),
  ('آذربایجان شرقی', 'هشترود', 56),
  ('آذربایجان شرقی', 'هوراند', 57),
  ('آذربایجان شرقی', 'یامچی', 58),
  ('آذربایجان غربی', 'ارومیه', 1),
  ('آذربایجان غربی', 'اشنویه', 2),
  ('آذربایجان غربی', 'ایواوغلی', 3),
  ('آذربایجان غربی', 'آواجیق', 4),
  ('آذربایجان غربی', 'باروق', 5),
  ('آذربایجان غربی', 'بازرگان', 6),
  ('آذربایجان غربی', 'بوکان', 7),
  ('آذربایجان غربی', 'پلدشت', 8),
  ('آذربایجان غربی', 'پیرانشهر', 9),
  ('آذربایجان غربی', 'تازه شهر', 10),
  ('آذربایجان غربی', 'تکاب', 11),
  ('آذربایجان غربی', 'چهاربرج', 12),
  ('آذربایجان غربی', 'خلیفان', 13),
  ('آذربایجان غربی', 'خوی', 14),
  ('آذربایجان غربی', 'دیزج دیز', 15),
  ('آذربایجان غربی', 'ربط', 16),
  ('آذربایجان غربی', 'سردشت', 17),
  ('آذربایجان غربی', 'سرو', 18),
  ('آذربایجان غربی', 'سلماس', 19),
  ('آذربایجان غربی', 'سیلوانه', 20),
  ('آذربایجان غربی', 'سیمینه', 21),
  ('آذربایجان غربی', 'سیه چشمه', 22),
  ('آذربایجان غربی', 'شاهین دژ', 23),
  ('آذربایجان غربی', 'شوط', 24),
  ('آذربایجان غربی', 'فیرورق', 25),
  ('آذربایجان غربی', 'قره ضیاءالدین', 26),
  ('آذربایجان غربی', 'قطور', 27),
  ('آذربایجان غربی', 'قوشچی', 28),
  ('آذربایجان غربی', 'کشاورز', 29),
  ('آذربایجان غربی', 'گردکشانه', 30),
  ('آذربایجان غربی', 'ماکو', 31),
  ('آذربایجان غربی', 'محمدیار', 32),
  ('آذربایجان غربی', 'محمودآباد', 33),
  ('آذربایجان غربی', 'مهاباد', 34),
  ('آذربایجان غربی', 'میاندوآب', 35),
  ('آذربایجان غربی', 'میرآباد', 36),
  ('آذربایجان غربی', 'نالوس', 37),
  ('آذربایجان غربی', 'نقده', 38),
  ('آذربایجان غربی', 'نوشین', 39),
  ('بوشهر', 'امام حسن', 1),
  ('بوشهر', 'انارستان', 2),
  ('بوشهر', 'اهرم', 3),
  ('بوشهر', 'آبپخش', 4),
  ('بوشهر', 'آبدان', 5),
  ('بوشهر', 'برازجان', 6),
  ('بوشهر', 'بردخون', 7),
  ('بوشهر', 'بردستان', 8),
  ('بوشهر', 'بندردیر', 9),
  ('بوشهر', 'بندردیلم', 10),
  ('بوشهر', 'بندرریگ', 11),
  ('بوشهر', 'بندرکنگان', 12),
  ('بوشهر', 'بندرگناوه', 13),
  ('بوشهر', 'بنک', 14),
  ('بوشهر', 'بوشهر', 15),
  ('بوشهر', 'تنگ ارم', 16),
  ('بوشهر', 'جم', 17),
  ('بوشهر', 'چغادک', 18),
  ('بوشهر', 'خارک', 19),
  ('بوشهر', 'خورموج', 20),
  ('بوشهر', 'دالکی', 21),
  ('بوشهر', 'دلوار', 22),
  ('بوشهر', 'ریز', 23),
  ('بوشهر', 'سعدآباد', 24),
  ('بوشهر', 'سیراف', 25),
  ('بوشهر', 'شبانکاره', 26),
  ('بوشهر', 'شنبه', 27),
  ('بوشهر', 'عسلویه', 28),
  ('بوشهر', 'کاکی', 29),
  ('بوشهر', 'کلمه', 30),
  ('بوشهر', 'نخل تقی', 31),
  ('بوشهر', 'وحدتیه', 32),
  ('تهران', 'ارجمند', 1),
  ('تهران', 'اسلامشهر', 2),
  ('تهران', 'اندیشه', 3),
  ('تهران', 'آبسرد', 4),
  ('تهران', 'آبعلی', 5),
  ('تهران', 'باغستان', 6),
  ('تهران', 'باقرشهر', 7),
  ('تهران', 'بومهن', 8),
  ('تهران', 'پاکدشت', 9),
  ('تهران', 'پردیس', 10),
  ('تهران', 'پیشوا', 11),
  ('تهران', 'تجریش', 12),
  ('تهران', 'تهران', 13),
  ('تهران', 'جوادآباد', 14),
  ('تهران', 'چهاردانگه', 15),
  ('تهران', 'حسن آباد', 16),
  ('تهران', 'دماوند', 17),
  ('تهران', 'رباط کریم', 18),
  ('تهران', 'رودهن', 19),
  ('تهران', 'ری', 20),
  ('تهران', 'شاهدشهر', 21),
  ('تهران', 'شریف آباد', 22),
  ('تهران', 'شهریار', 23),
  ('تهران', 'صالح آباد', 24),
  ('تهران', 'صباشهر', 25),
  ('تهران', 'صفادشت', 26),
  ('تهران', 'فردوسیه', 27),
  ('تهران', 'فرون آباد', 28),
  ('تهران', 'فشم', 29),
  ('تهران', 'فیروزکوه', 30),
  ('تهران', 'قدس', 31),
  ('تهران', 'قرچک', 32),
  ('تهران', 'کهریزک', 33),
  ('تهران', 'کیلان', 34),
  ('تهران', 'گلستان', 35),
  ('تهران', 'لواسان', 36),
  ('تهران', 'ملارد', 37),
  ('تهران', 'نسیم شهر', 38),
  ('تهران', 'نصیرآباد', 39),
  ('تهران', 'وحیدیه', 40),
  ('تهران', 'ورامین', 41),
  ('چهارمحال و بختیاری', 'اردل', 1),
  ('چهارمحال و بختیاری', 'آلونی', 2),
  ('چهارمحال و بختیاری', 'باباحیدر', 3),
  ('چهارمحال و بختیاری', 'بروجن', 4),
  ('چهارمحال و بختیاری', 'بلداجی', 5),
  ('چهارمحال و بختیاری', 'بن', 6),
  ('چهارمحال و بختیاری', 'جونقان', 7),
  ('چهارمحال و بختیاری', 'چلگرد', 8),
  ('چهارمحال و بختیاری', 'سامان', 9),
  ('چهارمحال و بختیاری', 'سفیددشت', 10),
  ('چهارمحال و بختیاری', 'سودجان', 11),
  ('چهارمحال و بختیاری', 'سورشجان', 12),
  ('چهارمحال و بختیاری', 'شلمزار', 13),
  ('چهارمحال و بختیاری', 'شهرکرد', 14),
  ('چهارمحال و بختیاری', 'طاقانک', 15),
  ('چهارمحال و بختیاری', 'فارسان', 16),
  ('چهارمحال و بختیاری', 'فرادنبه', 17),
  ('چهارمحال و بختیاری', 'فرخ شهر', 18),
  ('چهارمحال و بختیاری', 'کیان', 19),
  ('چهارمحال و بختیاری', 'گندمان', 20),
  ('چهارمحال و بختیاری', 'گهرو', 21),
  ('چهارمحال و بختیاری', 'لردگان', 22),
  ('چهارمحال و بختیاری', 'مال خلیفه', 23),
  ('چهارمحال و بختیاری', 'ناغان', 24),
  ('چهارمحال و بختیاری', 'نافچ', 25),
  ('چهارمحال و بختیاری', 'نقنه', 26),
  ('چهارمحال و بختیاری', 'هفشجان', 27),
  ('خراسان جنوبی', 'ارسک', 1),
  ('خراسان جنوبی', 'اسدیه', 2),
  ('خراسان جنوبی', 'اسفدن', 3),
  ('خراسان جنوبی', 'اسلامیه', 4),
  ('خراسان جنوبی', 'آرین شهر', 5),
  ('خراسان جنوبی', 'آیسک', 6),
  ('خراسان جنوبی', 'بشرویه', 7),
  ('خراسان جنوبی', 'بیرجند', 8),
  ('خراسان جنوبی', 'حاجی آباد', 9),
  ('خراسان جنوبی', 'خضری دشت بیاض', 10),
  ('خراسان جنوبی', 'خوسف', 11),
  ('خراسان جنوبی', 'زهان', 12),
  ('خراسان جنوبی', 'سرایان', 13),
  ('خراسان جنوبی', 'سربیشه', 14),
  ('خراسان جنوبی', 'سه قلعه', 15),
  ('خراسان جنوبی', 'شوسف', 16),
  ('خراسان جنوبی', 'طبس مسینا', 17),
  ('خراسان جنوبی', 'فردوس', 18),
  ('خراسان جنوبی', 'قائن', 19),
  ('خراسان جنوبی', 'قهستان', 20),
  ('خراسان جنوبی', 'گزیک', 21),
  ('خراسان جنوبی', 'محمد شهر', 22),
  ('خراسان جنوبی', 'مود', 23),
  ('خراسان جنوبی', 'نهبندان', 24),
  ('خراسان جنوبی', 'نیمبلوک', 25),
  ('خراسان رضوی', 'احمدآبادصولت', 1),
  ('خراسان رضوی', 'انابد', 2),
  ('خراسان رضوی', 'باجگیران', 3),
  ('خراسان رضوی', 'باخرز', 4),
  ('خراسان رضوی', 'بار', 5),
  ('خراسان رضوی', 'بایگ', 6),
  ('خراسان رضوی', 'بجستان', 7),
  ('خراسان رضوی', 'بردسکن', 8),
  ('خراسان رضوی', 'بیدخت', 9),
  ('خراسان رضوی', 'تایباد', 10),
  ('خراسان رضوی', 'تربت جام', 11),
  ('خراسان رضوی', 'تربت حیدریه', 12),
  ('خراسان رضوی', 'جغتای', 13),
  ('خراسان رضوی', 'جنگل', 14),
  ('خراسان رضوی', 'چاپشلو', 15),
  ('خراسان رضوی', 'چکنه', 16),
  ('خراسان رضوی', 'چناران', 17),
  ('خراسان رضوی', 'خرو', 18),
  ('خراسان رضوی', 'خلیل آباد', 19),
  ('خراسان رضوی', 'خواف', 20),
  ('خراسان رضوی', 'داورزن', 21),
  ('خراسان رضوی', 'درگز', 22),
  ('خراسان رضوی', 'درود', 23),
  ('خراسان رضوی', 'دولت آباد', 24),
  ('خراسان رضوی', 'رباط سنگ', 25),
  ('خراسان رضوی', 'رشتخوار', 26),
  ('خراسان رضوی', 'رضویه', 27),
  ('خراسان رضوی', 'روداب', 28),
  ('خراسان رضوی', 'ریوش', 29),
  ('خراسان رضوی', 'سبزوار', 30),
  ('خراسان رضوی', 'سرخس', 31),
  ('خراسان رضوی', 'سفیدسنگ', 32),
  ('خراسان رضوی', 'سلامی', 33),
  ('خراسان رضوی', 'سلطان آباد', 34),
  ('خراسان رضوی', 'سنگان', 35),
  ('خراسان رضوی', 'شادمهر', 36),
  ('خراسان رضوی', 'شاندیز', 37),
  ('خراسان رضوی', 'ششتمد', 38),
  ('خراسان رضوی', 'شهرآباد', 39),
  ('خراسان رضوی', 'شهرزو', 40),
  ('خراسان رضوی', 'صالح آباد', 41),
  ('خراسان رضوی', 'طرقبه', 42),
  ('خراسان رضوی', 'عشق آباد', 43),
  ('خراسان رضوی', 'فرهادگرد', 44),
  ('خراسان رضوی', 'فریمان', 45),
  ('خراسان رضوی', 'فیروزه', 46),
  ('خراسان رضوی', 'فیض آباد', 47),
  ('خراسان رضوی', 'قاسم آباد', 48),
  ('خراسان رضوی', 'قدمگاه', 49),
  ('خراسان رضوی', 'قلندرآباد', 50),
  ('خراسان رضوی', 'قوچان', 51),
  ('خراسان رضوی', 'کاخک', 52),
  ('خراسان رضوی', 'کاریز', 53),
  ('خراسان رضوی', 'کاشمر', 54),
  ('خراسان رضوی', 'کدکن', 55),
  ('خراسان رضوی', 'کلات', 56),
  ('خراسان رضوی', 'کندر', 57),
  ('خراسان رضوی', 'گلمکان', 58),
  ('خراسان رضوی', 'گناباد', 59),
  ('خراسان رضوی', 'لطف آباد', 60),
  ('خراسان رضوی', 'مزدآوند', 61),
  ('خراسان رضوی', 'مشهد', 62),
  ('خراسان رضوی', 'مشهدریزه', 63),
  ('خراسان رضوی', 'ملک آباد', 64),
  ('خراسان رضوی', 'نشتیفان', 65),
  ('خراسان رضوی', 'نصر آباد', 66),
  ('خراسان رضوی', 'نقاب', 67),
  ('خراسان رضوی', 'نوخندان', 68),
  ('خراسان رضوی', 'نیشابور', 69),
  ('خراسان رضوی', 'نیل شهر', 70),
  ('خراسان رضوی', 'همت آباد', 71),
  ('خراسان رضوی', 'یونسی', 72),
  ('خراسان شمالی', 'اسفراین', 1),
  ('خراسان شمالی', 'ایور', 2),
  ('خراسان شمالی', 'آشخانه', 3),
  ('خراسان شمالی', 'بجنورد', 4),
  ('خراسان شمالی', 'پیش قلعه', 5),
  ('خراسان شمالی', 'تیتکانلو', 6),
  ('خراسان شمالی', 'جاجرم', 7),
  ('خراسان شمالی', 'حصارگرمخان', 8),
  ('خراسان شمالی', 'درق', 9),
  ('خراسان شمالی', 'راز', 10),
  ('خراسان شمالی', 'سنخواست', 11),
  ('خراسان شمالی', 'شوقان', 12),
  ('خراسان شمالی', 'شیروان', 13),
  ('خراسان شمالی', 'صفی آباد', 14),
  ('خراسان شمالی', 'فاروج', 15),
  ('خراسان شمالی', 'قاضی', 16),
  ('خراسان شمالی', 'گرمه', 17),
  ('خراسان شمالی', 'لوجلی', 18),
  ('خوزستان', 'اروندکنار', 1),
  ('خوزستان', 'الوان', 2),
  ('خوزستان', 'امیدیه', 3),
  ('خوزستان', 'اندیمشک', 4),
  ('خوزستان', 'اهواز', 5),
  ('خوزستان', 'ایذه', 6),
  ('خوزستان', 'آبادان', 7),
  ('خوزستان', 'آغاجاری', 8),
  ('خوزستان', 'باغ ملک', 9),
  ('خوزستان', 'بستان', 10),
  ('خوزستان', 'بندرامام خمینی', 11),
  ('خوزستان', 'بندرماهشهر', 12),
  ('خوزستان', 'بهبهان', 13),
  ('خوزستان', 'ترکالکی', 14),
  ('خوزستان', 'جایزان', 15),
  ('خوزستان', 'جنت مکان', 16),
  ('خوزستان', 'چغامیش', 17),
  ('خوزستان', 'چمران', 18),
  ('خوزستان', 'چوئبده', 19),
  ('خوزستان', 'حر', 20),
  ('خوزستان', 'حسینیه', 21),
  ('خوزستان', 'حمزه', 22),
  ('خوزستان', 'حمیدیه', 23),
  ('خوزستان', 'خرمشهر', 24),
  ('خوزستان', 'دارخوین', 25),
  ('خوزستان', 'دزآب', 26),
  ('خوزستان', 'دزفول', 27),
  ('خوزستان', 'دهدز', 28),
  ('خوزستان', 'رامشیر', 29),
  ('خوزستان', 'رامهرمز', 30),
  ('خوزستان', 'رفیع', 31),
  ('خوزستان', 'زهره', 32),
  ('خوزستان', 'سالند', 33),
  ('خوزستان', 'سردشت', 34),
  ('خوزستان', 'سماله', 35),
  ('خوزستان', 'سوسنگرد', 36),
  ('خوزستان', 'شادگان', 37),
  ('خوزستان', 'شاوور', 38),
  ('خوزستان', 'شرافت', 39),
  ('خوزستان', 'شوش', 40),
  ('خوزستان', 'شوشتر', 41),
  ('خوزستان', 'شیبان', 42),
  ('خوزستان', 'صالح شهر', 43),
  ('خوزستان', 'صالح مشطط', 44),
  ('خوزستان', 'صفی آباد', 45),
  ('خوزستان', 'صیدون', 46),
  ('خوزستان', 'قلعه تل', 47),
  ('خوزستان', 'قلعه خواجه', 48),
  ('خوزستان', 'گتوند', 49),
  ('خوزستان', 'گوریه', 50),
  ('خوزستان', 'لالی', 51),
  ('خوزستان', 'مسجدسلیمان', 52),
  ('خوزستان', 'مشراگه', 53),
  ('خوزستان', 'مقاومت', 54),
  ('خوزستان', 'ملاثانی', 55),
  ('خوزستان', 'میانرود', 56),
  ('خوزستان', 'میداود', 57),
  ('خوزستان', 'مینوشهر', 58),
  ('خوزستان', 'ویس', 59),
  ('خوزستان', 'هفتگل', 60),
  ('خوزستان', 'هندیجان', 61),
  ('خوزستان', 'هویزه', 62),
  ('زنجان', 'ابهر', 1),
  ('زنجان', 'ارمغانخانه', 2),
  ('زنجان', 'آب بر', 3),
  ('زنجان', 'چورزق', 4),
  ('زنجان', 'حلب', 5),
  ('زنجان', 'خرمدره', 6),
  ('زنجان', 'دندی', 7),
  ('زنجان', 'زرین آباد', 8),
  ('زنجان', 'زرین رود', 9),
  ('زنجان', 'زنجان', 10),
  ('زنجان', 'سجاس', 11),
  ('زنجان', 'سلطانیه', 12),
  ('زنجان', 'سهرورد', 13),
  ('زنجان', 'صائین قلعه', 14),
  ('زنجان', 'قیدار', 15),
  ('زنجان', 'گرماب', 16),
  ('زنجان', 'ماه نشان', 17),
  ('زنجان', 'هیدج', 18),
  ('سمنان', 'امیریه', 1),
  ('سمنان', 'ایوانکی', 2),
  ('سمنان', 'آرادان', 3),
  ('سمنان', 'بسطام', 4),
  ('سمنان', 'بیارجمند', 5),
  ('سمنان', 'دامغان', 6),
  ('سمنان', 'درجزین', 7),
  ('سمنان', 'دیباج', 8),
  ('سمنان', 'سرخه', 9),
  ('سمنان', 'سمنان', 10),
  ('سمنان', 'شاهرود', 11),
  ('سمنان', 'شهمیرزاد', 12),
  ('سمنان', 'کلاته خیج', 13),
  ('سمنان', 'گرمسار', 14),
  ('سمنان', 'مجن', 15),
  ('سمنان', 'مهدی شهر', 16),
  ('سمنان', 'میامی', 17),
  ('سیستان و بلوچستان', 'ادیمی', 1),
  ('سیستان و بلوچستان', 'اسپکه', 2),
  ('سیستان و بلوچستان', 'ایرانشهر', 3),
  ('سیستان و بلوچستان', 'بزمان', 4),
  ('سیستان و بلوچستان', 'بمپور', 5),
  ('سیستان و بلوچستان', 'بنت', 6),
  ('سیستان و بلوچستان', 'بنجار', 7),
  ('سیستان و بلوچستان', 'پیشین', 8),
  ('سیستان و بلوچستان', 'جالق', 9),
  ('سیستان و بلوچستان', 'چاه بهار', 10),
  ('سیستان و بلوچستان', 'خاش', 11),
  ('سیستان و بلوچستان', 'دوست محمد', 12),
  ('سیستان و بلوچستان', 'راسک', 13),
  ('سیستان و بلوچستان', 'زابل', 14),
  ('سیستان و بلوچستان', 'زابلی', 15),
  ('سیستان و بلوچستان', 'زاهدان', 16),
  ('سیستان و بلوچستان', 'زرآباد', 17),
  ('سیستان و بلوچستان', 'زهک', 18),
  ('سیستان و بلوچستان', 'سراوان', 19),
  ('سیستان و بلوچستان', 'سرباز', 20),
  ('سیستان و بلوچستان', 'سوران', 21),
  ('سیستان و بلوچستان', 'سیرکان', 22),
  ('سیستان و بلوچستان', 'علی اکبر', 23),
  ('سیستان و بلوچستان', 'فنوج', 24),
  ('سیستان و بلوچستان', 'قصرقند', 25),
  ('سیستان و بلوچستان', 'کنارک', 26),
  ('سیستان و بلوچستان', 'گشت', 27),
  ('سیستان و بلوچستان', 'گلمورتی', 28),
  ('سیستان و بلوچستان', 'محمدان', 29),
  ('سیستان و بلوچستان', 'محمد آباد', 30),
  ('سیستان و بلوچستان', 'محمدی', 31),
  ('سیستان و بلوچستان', 'میرجاوه', 32),
  ('سیستان و بلوچستان', 'نصرت آباد', 33),
  ('سیستان و بلوچستان', 'نگور', 34),
  ('سیستان و بلوچستان', 'نوک آباد', 35),
  ('سیستان و بلوچستان', 'نیک شهر', 36),
  ('سیستان و بلوچستان', 'هیدوج', 37),
  ('فارس', 'اردکان', 1),
  ('فارس', 'ارسنجان', 2),
  ('فارس', 'استهبان', 3),
  ('فارس', 'اسیر', 4),
  ('فارس', 'اشکنان', 5),
  ('فارس', 'افزر', 6),
  ('فارس', 'اقلید', 7),
  ('فارس', 'امام شهر', 8),
  ('فارس', 'اوز', 9),
  ('فارس', 'اهل', 10),
  ('فارس', 'ایج', 11),
  ('فارس', 'ایزدخواست', 12),
  ('فارس', 'آباده', 13),
  ('فارس', 'آباده طشک', 14),
  ('فارس', 'باب انار', 15),
  ('فارس', 'بالاده', 16),
  ('فارس', 'بنارویه', 17),
  ('فارس', 'بوانات', 18),
  ('فارس', 'بهمن', 19),
  ('فارس', 'بیرم', 20),
  ('فارس', 'بیضا', 21),
  ('فارس', 'جنت شهر', 22),
  ('فارس', 'جویم', 23),
  ('فارس', 'جهرم', 24),
  ('فارس', 'حاجی آباد', 25),
  ('فارس', 'حسامی', 26),
  ('فارس', 'حسن آباد', 27),
  ('فارس', 'خانه زنیان', 28),
  ('فارس', 'خاوران', 29),
  ('فارس', 'خرامه', 30),
  ('فارس', 'خشت', 31),
  ('فارس', 'خنج', 32),
  ('فارس', 'خور', 33),
  ('فارس', 'خومه زار', 34),
  ('فارس', 'داراب', 35),
  ('فارس', 'داریان', 36),
  ('فارس', 'دبیران', 37),
  ('فارس', 'دژکرد', 38),
  ('فارس', 'دوبرجی', 39),
  ('فارس', 'دوزه', 40),
  ('فارس', 'دهرم', 41),
  ('فارس', 'رامجرد', 42),
  ('فارس', 'رونیز', 43),
  ('فارس', 'زاهدشهر', 44),
  ('فارس', 'زرقان', 45),
  ('فارس', 'سده', 46),
  ('فارس', 'سروستان', 47),
  ('فارس', 'سعادت شهر', 48),
  ('فارس', 'سورمق', 49),
  ('فارس', 'سیدان', 50),
  ('فارس', 'ششده', 51),
  ('فارس', 'شهر جدید صدرا', 52),
  ('فارس', 'شهرپیر', 53),
  ('فارس', 'شیراز', 54),
  ('فارس', 'صغاد', 55),
  ('فارس', 'صفاشهر', 56),
  ('فارس', 'علامرودشت', 57),
  ('فارس', 'عمادده', 58),
  ('فارس', 'فدامی', 59),
  ('فارس', 'فراشبند', 60),
  ('فارس', 'فسا', 61),
  ('فارس', 'فیروزآباد', 62),
  ('فارس', 'قادرآباد', 63),
  ('فارس', 'قائمیه', 64),
  ('فارس', 'قطب آباد', 65),
  ('فارس', 'قطرویه', 66),
  ('فارس', 'قیر', 67),
  ('فارس', 'کارزین', 68),
  ('فارس', 'کازرون', 69),
  ('فارس', 'کامفیروز', 70),
  ('فارس', 'کره ای', 71),
  ('فارس', 'کنارتخته', 72),
  ('فارس', 'کوار', 73),
  ('فارس', 'کوهنجان', 74),
  ('فارس', 'گراش', 75),
  ('فارس', 'گله دار', 76),
  ('فارس', 'لار', 77),
  ('فارس', 'لامرد', 78),
  ('فارس', 'لپوئی', 79),
  ('فارس', 'لطیفی', 80),
  ('فارس', 'مبارک آباد', 81),
  ('فارس', 'مرودشت', 82),
  ('فارس', 'مشکان', 83),
  ('فارس', 'مصیری', 84),
  ('فارس', 'مهر', 85),
  ('فارس', 'میمند', 86),
  ('فارس', 'نوبندگان', 87),
  ('فارس', 'نوجین', 88),
  ('فارس', 'نودان', 89),
  ('فارس', 'نورآباد', 90),
  ('فارس', 'نی ریز', 91),
  ('فارس', 'وراوی', 92),
  ('فارس', 'هماشهر', 93),
  ('قزوین', 'ارداق', 1),
  ('قزوین', 'اسفرورین', 2),
  ('قزوین', 'اقبالیه', 3),
  ('قزوین', 'الوند', 4),
  ('قزوین', 'آبگرم', 5),
  ('قزوین', 'آبیک', 6),
  ('قزوین', 'آوج', 7),
  ('قزوین', 'بوئین زهرا', 8),
  ('قزوین', 'بیدستان', 9),
  ('قزوین', 'تاکستان', 10),
  ('قزوین', 'خاکعلی', 11),
  ('قزوین', 'خرمدشت', 12),
  ('قزوین', 'دانسفهان', 13),
  ('قزوین', 'رازمیان', 14),
  ('قزوین', 'سگزآباد', 15),
  ('قزوین', 'سیردان', 16),
  ('قزوین', 'شال', 17),
  ('قزوین', 'شریفیه', 18),
  ('قزوین', 'ضیاءآباد', 19),
  ('قزوین', 'قزوین', 20),
  ('قزوین', 'کوهین', 21),
  ('قزوین', 'محمدیه', 22),
  ('قزوین', 'محمودآبادنمونه', 23),
  ('قزوین', 'معلم کلایه', 24),
  ('قزوین', 'نرجه', 25),
  ('قم', 'جعفریه', 1),
  ('قم', 'دستجرد', 2),
  ('قم', 'سلفچگان', 3),
  ('قم', 'قم', 4),
  ('قم', 'قنوات', 5),
  ('قم', 'کهک', 6),
  ('کردستان', 'آرمرده', 1),
  ('کردستان', 'بابارشانی', 2),
  ('کردستان', 'بانه', 3),
  ('کردستان', 'بلبان آباد', 4),
  ('کردستان', 'بوئین سفلی', 5),
  ('کردستان', 'بیجار', 6),
  ('کردستان', 'چناره', 7),
  ('کردستان', 'دزج', 8),
  ('کردستان', 'دلبران', 9),
  ('کردستان', 'دهگلان', 10),
  ('کردستان', 'دیواندره', 11),
  ('کردستان', 'زرینه', 12),
  ('کردستان', 'سروآباد', 13),
  ('کردستان', 'سریش آباد', 14),
  ('کردستان', 'سقز', 15),
  ('کردستان', 'سنندج', 16),
  ('کردستان', 'شویشه', 17),
  ('کردستان', 'صاحب', 18),
  ('کردستان', 'قروه', 19),
  ('کردستان', 'کامیاران', 20),
  ('کردستان', 'کانی دینار', 21),
  ('کردستان', 'کانی سور', 22),
  ('کردستان', 'مریوان', 23),
  ('کردستان', 'موچش', 24),
  ('کردستان', 'یاسوکند', 25),
  ('کرمان', 'اختیارآباد', 1),
  ('کرمان', 'ارزوئیه', 2),
  ('کرمان', 'امین شهر', 3),
  ('کرمان', 'انار', 4),
  ('کرمان', 'اندوهجرد', 5),
  ('کرمان', 'باغین', 6),
  ('کرمان', 'بافت', 7),
  ('کرمان', 'بردسیر', 8),
  ('کرمان', 'بروات', 9),
  ('کرمان', 'بزنجان', 10),
  ('کرمان', 'بم', 11),
  ('کرمان', 'بهرمان', 12),
  ('کرمان', 'پاریز', 13),
  ('کرمان', 'جبالبارز', 14),
  ('کرمان', 'جوپار', 15),
  ('کرمان', 'جوزم', 16),
  ('کرمان', 'جیرفت', 17),
  ('کرمان', 'چترود', 18),
  ('کرمان', 'خاتون آباد', 19),
  ('کرمان', 'خانوک', 20),
  ('کرمان', 'خورسند', 21),
  ('کرمان', 'درب بهشت', 22),
  ('کرمان', 'دوساری', 23),
  ('کرمان', 'دهج', 24),
  ('کرمان', 'رابر', 25),
  ('کرمان', 'راور', 26),
  ('کرمان', 'راین', 27),
  ('کرمان', 'رفسنجان', 28),
  ('کرمان', 'رودبار', 29),
  ('کرمان', 'ریحان شهر', 30),
  ('کرمان', 'زرند', 31),
  ('کرمان', 'زنگی آباد', 32),
  ('کرمان', 'زیدآباد', 33),
  ('کرمان', 'سرچشمه', 34),
  ('کرمان', 'سیرجان', 35),
  ('کرمان', 'شهداد', 36),
  ('کرمان', 'شهربابک', 37),
  ('کرمان', 'صفائیه', 38),
  ('کرمان', 'عنبرآباد', 39),
  ('کرمان', 'فاریاب', 40),
  ('کرمان', 'فهرج', 41),
  ('کرمان', 'قلعه گنج', 42),
  ('کرمان', 'کاظم آباد', 43),
  ('کرمان', 'کرمان', 44),
  ('کرمان', 'کشکوئیه', 45),
  ('کرمان', 'کوهبنان', 46),
  ('کرمان', 'کهنوج', 47),
  ('کرمان', 'کیانشهر', 48),
  ('کرمان', 'گلباف', 49),
  ('کرمان', 'گلزار', 50),
  ('کرمان', 'لاله زار', 51),
  ('کرمان', 'ماهان', 52),
  ('کرمان', 'محمد آباد', 53),
  ('کرمان', 'محی آباد', 54),
  ('کرمان', 'مردهک', 55),
  ('کرمان', 'منوجان', 56),
  ('کرمان', 'نجف شهر', 57),
  ('کرمان', 'نرماشیر', 58),
  ('کرمان', 'نظام شهر', 59),
  ('کرمان', 'نگار', 60),
  ('کرمان', 'نودژ', 61),
  ('کرمان', 'هجدک', 62),
  ('کرمان', 'هماشهر', 63),
  ('کرمان', 'یزدان شهر', 64),
  ('کرمانشاه', 'ازگله', 1),
  ('کرمانشاه', 'اسلام آبادغرب', 2),
  ('کرمانشاه', 'باینگان', 3),
  ('کرمانشاه', 'بیستون', 4),
  ('کرمانشاه', 'پاوه', 5),
  ('کرمانشاه', 'تازه آباد', 6),
  ('کرمانشاه', 'جوانرود', 7),
  ('کرمانشاه', 'حمیل', 8),
  ('کرمانشاه', 'رباط', 9),
  ('کرمانشاه', 'روانسر', 10),
  ('کرمانشاه', 'سرپل ذهاب', 11),
  ('کرمانشاه', 'سرمست', 12),
  ('کرمانشاه', 'سطر', 13),
  ('کرمانشاه', 'سنقر', 14),
  ('کرمانشاه', 'سومار', 15),
  ('کرمانشاه', 'شاهو', 16),
  ('کرمانشاه', 'صحنه', 17),
  ('کرمانشاه', 'قصرشیرین', 18),
  ('کرمانشاه', 'کرمانشاه', 19),
  ('کرمانشاه', 'کرندغرب', 20),
  ('کرمانشاه', 'کنگاور', 21),
  ('کرمانشاه', 'کوزران', 22),
  ('کرمانشاه', 'گهواره', 23),
  ('کرمانشاه', 'گیلانغرب', 24),
  ('کرمانشاه', 'میان راهان', 25),
  ('کرمانشاه', 'نودشه', 26),
  ('کرمانشاه', 'نوسود', 27),
  ('کرمانشاه', 'هرسین', 28),
  ('کرمانشاه', 'هلشی', 29),
  ('کهگیلویه و بویراحمد', 'باشت', 1),
  ('کهگیلویه و بویراحمد', 'پاتاوه', 2),
  ('کهگیلویه و بویراحمد', 'چرام', 3),
  ('کهگیلویه و بویراحمد', 'چیتاب', 4),
  ('کهگیلویه و بویراحمد', 'دوگنبدان', 5),
  ('کهگیلویه و بویراحمد', 'دهدشت', 6),
  ('کهگیلویه و بویراحمد', 'دیشموک', 7),
  ('کهگیلویه و بویراحمد', 'سوق', 8),
  ('کهگیلویه و بویراحمد', 'سی سخت', 9),
  ('کهگیلویه و بویراحمد', 'قلعه رئیسی', 10),
  ('کهگیلویه و بویراحمد', 'گراب سفلی', 11),
  ('کهگیلویه و بویراحمد', 'لنده', 12),
  ('کهگیلویه و بویراحمد', 'لیکک', 13),
  ('کهگیلویه و بویراحمد', 'مادوان', 14),
  ('کهگیلویه و بویراحمد', 'مارگون', 15),
  ('کهگیلویه و بویراحمد', 'یاسوج', 16),
  ('گلستان', 'انبارآلوم', 1),
  ('گلستان', 'اینچه برون', 2),
  ('گلستان', 'آزادشهر', 3),
  ('گلستان', 'آق قلا', 4),
  ('گلستان', 'بندرگز', 5),
  ('گلستان', 'ترکمن', 6),
  ('گلستان', 'جلین', 7),
  ('گلستان', 'خان ببین', 8),
  ('گلستان', 'دلند', 9),
  ('گلستان', 'رامیان', 10),
  ('گلستان', 'سرخنکلاته', 11),
  ('گلستان', 'سیمین شهر', 12),
  ('گلستان', 'علی آباد', 13),
  ('گلستان', 'فاضل آباد', 14),
  ('گلستان', 'کردکوی', 15),
  ('گلستان', 'کلاله', 16),
  ('گلستان', 'گالیکش', 17),
  ('گلستان', 'گرگان', 18),
  ('گلستان', 'گمیش تپه', 19),
  ('گلستان', 'گنبد کاووس', 20),
  ('گلستان', 'مراوه تپه', 21),
  ('گلستان', 'مینودشت', 22),
  ('گلستان', 'نگین شهر', 23),
  ('گلستان', 'نوده خاندوز', 24),
  ('گلستان', 'نوکنده', 25),
  ('گیلان', 'احمدسرگوراب', 1),
  ('گیلان', 'اسالم', 2),
  ('گیلان', 'اطاقور', 3),
  ('گیلان', 'املش', 4),
  ('گیلان', 'آستارا', 5),
  ('گیلان', 'آستانه اشرفیه', 6),
  ('گیلان', 'بازارجمعه', 7),
  ('گیلان', 'بره سر', 8),
  ('گیلان', 'بندرانزلی', 9),
  ('گیلان', 'پره سر', 10),
  ('گیلان', 'توتکابن', 11),
  ('گیلان', 'جیرنده', 12),
  ('گیلان', 'چابکسر', 13),
  ('گیلان', 'چاف وچمخاله', 14),
  ('گیلان', 'چوبر', 15),
  ('گیلان', 'حویق', 16),
  ('گیلان', 'خشکبیجار', 17),
  ('گیلان', 'خمام', 18),
  ('گیلان', 'دیلمان', 19),
  ('گیلان', 'رانکوه', 20),
  ('گیلان', 'رحیم آباد', 21),
  ('گیلان', 'رستم آباد', 22),
  ('گیلان', 'رشت', 23),
  ('گیلان', 'رضوانشهر', 24),
  ('گیلان', 'رودبار', 25),
  ('گیلان', 'رودبنه', 26),
  ('گیلان', 'رودسر', 27),
  ('گیلان', 'سنگر', 28),
  ('گیلان', 'سیاهکل', 29),
  ('گیلان', 'شفت', 30),
  ('گیلان', 'شلمان', 31),
  ('گیلان', 'صومعه سرا', 32),
  ('گیلان', 'فومن', 33),
  ('گیلان', 'کلاچای', 34),
  ('گیلان', 'کوچصفهان', 35),
  ('گیلان', 'کومله', 36),
  ('گیلان', 'کیاشهر', 37),
  ('گیلان', 'گوراب زرمیخ', 38),
  ('گیلان', 'لاهیجان', 39),
  ('گیلان', 'لشت نشاء', 40),
  ('گیلان', 'لنگرود', 41),
  ('گیلان', 'لوشان', 42),
  ('گیلان', 'لولمان', 43),
  ('گیلان', 'لوندویل', 44),
  ('گیلان', 'لیسار', 45),
  ('گیلان', 'ماسال', 46),
  ('گیلان', 'ماسوله', 47),
  ('گیلان', 'مرجقل', 48),
  ('گیلان', 'منجیل', 49),
  ('گیلان', 'واجارگاه', 50),
  ('گیلان', 'هشتپر', 51),
  ('لرستان', 'ازنا', 1),
  ('لرستان', 'اشترینان', 2),
  ('لرستان', 'الشتر', 3),
  ('لرستان', 'الیگودرز', 4),
  ('لرستان', 'بروجرد', 5),
  ('لرستان', 'پلدختر', 6),
  ('لرستان', 'چالانچولان', 7),
  ('لرستان', 'چغلوندی', 8),
  ('لرستان', 'چقابل', 9),
  ('لرستان', 'خرم آباد', 10),
  ('لرستان', 'درب گنبد', 11),
  ('لرستان', 'دورود', 12),
  ('لرستان', 'زاغه', 13),
  ('لرستان', 'سپیددشت', 14),
  ('لرستان', 'سراب دوره', 15),
  ('لرستان', 'شول آباد', 16),
  ('لرستان', 'فیروز آباد', 17),
  ('لرستان', 'کونانی', 18),
  ('لرستان', 'کوهدشت', 19),
  ('لرستان', 'گراب', 20),
  ('لرستان', 'معمولان', 21),
  ('لرستان', 'مؤمن آباد', 22),
  ('لرستان', 'نور آباد', 23),
  ('لرستان', 'ویسیان', 24),
  ('لرستان', 'هفت چشمه', 25),
  ('مازندران', 'امیرکلا', 1),
  ('مازندران', 'ایزدشهر', 2),
  ('مازندران', 'آلاشت', 3),
  ('مازندران', 'آمل', 4),
  ('مازندران', 'بابل', 5),
  ('مازندران', 'بابلسر', 6),
  ('مازندران', 'بلده', 7),
  ('مازندران', 'بهشهر', 8),
  ('مازندران', 'بهنمیر', 9),
  ('مازندران', 'پل سفید', 10),
  ('مازندران', 'پول', 11),
  ('مازندران', 'تنکابن', 12),
  ('مازندران', 'جویبار', 13),
  ('مازندران', 'چالوس', 14),
  ('مازندران', 'چمستان', 15),
  ('مازندران', 'خرم آباد', 16),
  ('مازندران', 'خلیل شهر', 17),
  ('مازندران', 'خوش رودپی', 18),
  ('مازندران', 'دابودشت', 19),
  ('مازندران', 'رامسر', 20),
  ('مازندران', 'رستمکلا', 21),
  ('مازندران', 'رویان', 22),
  ('مازندران', 'رینه', 23),
  ('مازندران', 'زرگر محله', 24),
  ('مازندران', 'زیرآب', 25),
  ('مازندران', 'ساری', 26),
  ('مازندران', 'سرخرود', 27),
  ('مازندران', 'سلمان شهر', 28),
  ('مازندران', 'سورک', 29),
  ('مازندران', 'شیرگاه', 30),
  ('مازندران', 'شیرود', 31),
  ('مازندران', 'عباس آباد', 32),
  ('مازندران', 'فریدونکنار', 33),
  ('مازندران', 'فریم', 34),
  ('مازندران', 'قائم شهر', 35),
  ('مازندران', 'کتالم وسادات شهر', 36),
  ('مازندران', 'کلارآباد', 37),
  ('مازندران', 'کلاردشت', 38),
  ('مازندران', 'کله بست', 39),
  ('مازندران', 'کوهی خیل', 40),
  ('مازندران', 'کیاسر', 41),
  ('مازندران', 'کیاکلا', 42),
  ('مازندران', 'گتاب', 43),
  ('مازندران', 'گزنک', 44),
  ('مازندران', 'گلوگاه', 45),
  ('مازندران', 'محمود آباد', 46),
  ('مازندران', 'مرزن آباد', 47),
  ('مازندران', 'مرزیکلا', 48),
  ('مازندران', 'نشتارود', 49),
  ('مازندران', 'نکا', 50),
  ('مازندران', 'نور', 51),
  ('مازندران', 'نوشهر', 52),
  ('مرکزی', 'اراک', 1),
  ('مرکزی', 'آستانه', 2),
  ('مرکزی', 'آشتیان', 3),
  ('مرکزی', 'پرندک', 4),
  ('مرکزی', 'تفرش', 5),
  ('مرکزی', 'توره', 6),
  ('مرکزی', 'جاورسیان', 7),
  ('مرکزی', 'خشکرود', 8),
  ('مرکزی', 'خمین', 9),
  ('مرکزی', 'خنداب', 10),
  ('مرکزی', 'داودآباد', 11),
  ('مرکزی', 'دلیجان', 12),
  ('مرکزی', 'رازقان', 13),
  ('مرکزی', 'زاویه', 14),
  ('مرکزی', 'ساروق', 15),
  ('مرکزی', 'ساوه', 16),
  ('مرکزی', 'سنجان', 17),
  ('مرکزی', 'شازند', 18),
  ('مرکزی', 'شهرجدیدمهاجران', 19),
  ('مرکزی', 'غرق آباد', 20),
  ('مرکزی', 'فرمهین', 21),
  ('مرکزی', 'قورچی باشی', 22),
  ('مرکزی', 'کرهرود', 23),
  ('مرکزی', 'کمیجان', 24),
  ('مرکزی', 'مأمونیه', 25),
  ('مرکزی', 'محلات', 26),
  ('مرکزی', 'میلاجرد', 27),
  ('مرکزی', 'نراق', 28),
  ('مرکزی', 'نوبران', 29),
  ('مرکزی', 'نیمور', 30),
  ('مرکزی', 'هندودر', 31),
  ('هرمزگان', 'ابوموسی', 1),
  ('هرمزگان', 'بستک', 2),
  ('هرمزگان', 'بندرجاسک', 3),
  ('هرمزگان', 'بندرچارک', 4),
  ('هرمزگان', 'بندرعباس', 5),
  ('هرمزگان', 'بندرلنگه', 6),
  ('هرمزگان', 'بیکاه', 7),
  ('هرمزگان', 'پارسیان', 8),
  ('هرمزگان', 'تخت', 9),
  ('هرمزگان', 'جناح', 10),
  ('هرمزگان', 'حاجی آباد', 11),
  ('هرمزگان', 'خمیر', 12),
  ('هرمزگان', 'درگهان', 13),
  ('هرمزگان', 'دهبارز', 14),
  ('هرمزگان', 'رویدر', 15),
  ('هرمزگان', 'زیارتعلی', 16),
  ('هرمزگان', 'سردشت بشاگرد', 17),
  ('هرمزگان', 'سرگز', 18),
  ('هرمزگان', 'سندرک', 19),
  ('هرمزگان', 'سوزا', 20),
  ('هرمزگان', 'سیریک', 21),
  ('هرمزگان', 'فارغان', 22),
  ('هرمزگان', 'فین', 23),
  ('هرمزگان', 'قشم', 24),
  ('هرمزگان', 'قلعه قاضی', 25),
  ('هرمزگان', 'کنگ', 26),
  ('هرمزگان', 'کوشکنار', 27),
  ('هرمزگان', 'کیش', 28),
  ('هرمزگان', 'گوهران', 29),
  ('هرمزگان', 'میناب', 30),
  ('هرمزگان', 'هرمز', 31),
  ('هرمزگان', 'هشتبندی', 32),
  ('همدان', 'ازندریان', 1),
  ('همدان', 'اسدآباد', 2),
  ('همدان', 'برزول', 3),
  ('همدان', 'بهار', 4),
  ('همدان', 'تویسرکان', 5),
  ('همدان', 'جورقان', 6),
  ('همدان', 'جوکار', 7),
  ('همدان', 'دمق', 8),
  ('همدان', 'رزن', 9),
  ('همدان', 'زنگنه', 10),
  ('همدان', 'سامن', 11),
  ('همدان', 'سرکان', 12),
  ('همدان', 'شیرین سو', 13),
  ('همدان', 'صالح آباد', 14),
  ('همدان', 'فامنین', 15),
  ('همدان', 'فرسفج', 16),
  ('همدان', 'فیروزان', 17),
  ('همدان', 'قروه در جزین', 18),
  ('همدان', 'قهاوند', 19),
  ('همدان', 'کبودرآهنگ', 20),
  ('همدان', 'گل تپه', 21),
  ('همدان', 'گیان', 22),
  ('همدان', 'لالجین', 23),
  ('همدان', 'مریانج', 24),
  ('همدان', 'ملایر', 25),
  ('همدان', 'نهاوند', 26),
  ('همدان', 'همدان', 27),
  ('یزد', 'ابرکوه', 1),
  ('یزد', 'احمدآباد', 2),
  ('یزد', 'اردکان', 3),
  ('یزد', 'اشکذر', 4),
  ('یزد', 'بافق', 5),
  ('یزد', 'بفروئیه', 6),
  ('یزد', 'بهاباد', 7),
  ('یزد', 'تفت', 8),
  ('یزد', 'حمیدیا', 9),
  ('یزد', 'خضرآباد', 10),
  ('یزد', 'دیهوک', 11),
  ('یزد', 'زارچ', 12),
  ('یزد', 'شاهدیه', 13),
  ('یزد', 'طبس', 14),
  ('یزد', 'عشق آباد', 15),
  ('یزد', 'عقدا', 16),
  ('یزد', 'مروست', 17),
  ('یزد', 'مهردشت', 18),
  ('یزد', 'مهریز', 19),
  ('یزد', 'میبد', 20),
  ('یزد', 'ندوشن', 21),
  ('یزد', 'نیر', 22),
  ('یزد', 'هرات', 23),
  ('یزد', 'یزد', 24)
), deduplicated as (
  select province, name, min(sort_order)::integer as sort_order
  from source
  where nullif(trim(province), '') is not null and nullif(trim(name), '') is not null
  group by province, name
)
insert into public.iran_cities(province, name, sort_order)
select province, name, sort_order
from deduplicated
on conflict (province, name) do update
  set sort_order = excluded.sort_order;

alter table public.iran_cities enable row level security;
drop policy if exists iran_cities_read on public.iran_cities;
create policy iran_cities_read on public.iran_cities
  for select to authenticated using (true);
grant select on public.iran_cities to authenticated;
grant usage, select on sequence public.iran_cities_id_seq to authenticated;

-- ===== 0097_league_rules_notice_and_revision.sql =====
-- Keep public rules metadata and the configurable rules notice in the same
-- source of truth as the records that render them.
alter table public.leagues
  add column if not exists rules_updated_at timestamptz not null default now();

update public.leagues
set rules_updated_at = coalesce(rules_updated_at, created_at, now())
where rules_updated_at is null;

create or replace function public.touch_league_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.rules_summary is distinct from old.rules_summary
     or new.rules_summary_en is distinct from old.rules_summary_en
     or new.rules_pdf_url is distinct from old.rules_pdf_url
  then
    new.rules_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists leagues_rules_updated_at on public.leagues;
create trigger leagues_rules_updated_at
before update of rules_summary, rules_summary_en, rules_pdf_url on public.leagues
for each row execute function public.touch_league_rules_updated_at();

alter table public.site_settings
  add column if not exists league_rules_notice_enabled boolean not null default true,
  add column if not exists league_rules_notice_fa text not null default 'توجه: قوانین لیگ ممکن است تا ۱۰ روز پیش از شروع مسابقات تغییر کند. لطفاً صفحه لیگ را تا زمان آغاز مسابقه بررسی کنید.',
  add column if not exists league_rules_notice_en text not null default 'Please note: league rules may change up to 10 days before the competition starts. Check the league page until the event begins.';

update public.site_settings
set league_rules_notice_fa = coalesce(nullif(trim(league_rules_notice_fa), ''), 'توجه: قوانین لیگ ممکن است تا ۱۰ روز پیش از شروع مسابقات تغییر کند. لطفاً صفحه لیگ را تا زمان آغاز مسابقه بررسی کنید.'),
    league_rules_notice_en = coalesce(nullif(trim(league_rules_notice_en), ''), 'Please note: league rules may change up to 10 days before the competition starts. Check the league page until the event begins.');

-- The first managed About page seed was intentionally short. Preserve it for
-- administrators who already edited it, but restore the original public copy
-- only when the row still contains that untouched seed.
update public.static_pages
set body = '<h2>جام تبرستان</h2><p>جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهایی است که در مرز رباتیک، مکاترونیک و هوش مصنوعی مسئله حل می‌کنند.</p><h2>ماموریت و چشم‌انداز</h2><p>ما مسابقات را یک تجربه آموزشی و صنعتی یکپارچه می‌دانیم؛ جایی که تیم‌ها ایده خود را به سامانه‌ای واقعی تبدیل می‌کنند، زیر فشار مسابقه تصمیم می‌گیرند و با داوری شفاف بازخورد می‌گیرند. هدف ما برگزاری رقابت‌های استاندارد و ساختن مسیر پایدار از نخستین تجربه تا فعالیت حرفه‌ای است.</p><h2>حوزه‌های فعالیت</h2><ul><li>رباتیک و مکاترونیک</li><li>هوش مصنوعی و سامانه‌های هوشمند</li><li>مسابقات حرفه‌ای و داوری تخصصی</li></ul>',
    body_en = '<h2>Tabarestan Cup</h2><p>Tabarestan Cup is a professional arena where emerging talent competes, learns and earns recognition across robotics, mechatronics and artificial intelligence.</p><h2>Mission and vision</h2><p>We see competition as a complete learning and engineering experience. Our goal is to create rigorous, transparent competitions and a sustainable path from a first experience to professional activity.</p><h2>What we work on</h2><ul><li>Robotics and mechatronics</li><li>Artificial intelligence and intelligent systems</li><li>Professional competitions and specialist judging</li></ul>'
where slug = 'about'
  and body = '<h2>جام تبرستان</h2><p>جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهای رباتیک، مکاترونیک و هوش مصنوعی است.</p><h2>ماموریت و چشم‌انداز</h2><p>هدف ما برگزاری رقابت‌های شفاف و استاندارد، رشد مهارت‌های فنی و ساختن مسیر پایدار از تجربه نخست تا فعالیت حرفه‌ای است.</p><h2>حوزه‌های فعالیت</h2><ul><li>رباتیک و مکاترونیک</li><li>هوش مصنوعی و سامانه‌های هوشمند</li><li>مسابقات حرفه‌ای و داوری تخصصی</li></ul>';

-- ===== 0098_league_cycle_podium_and_judging_mode.sql =====
-- A league has one reusable identity, while every completed cycle owns its
-- own immutable podium.  Keep the public archive in sync with cycle archive.
alter table public.leagues
  add column if not exists judging_enabled boolean not null default true;

alter table public.league_past_results
  add column if not exists season_month integer;

update public.league_past_results p
set season_month = coalesce(
  (select a.season_month from public.league_cycle_archives a
   where a.league_id = p.league_id and a.season_year = p.season_year
   order by a.archived_at desc limit 1),
  1
)
where p.season_month is null;

alter table public.league_past_results
  alter column season_month set default 1,
  alter column season_month set not null;
alter table public.league_past_results
  drop constraint if exists league_past_results_league_id_season_year_key;
alter table public.league_past_results
  add constraint league_past_results_cycle_unique unique (league_id, season_year, season_month);
alter table public.league_past_results
  add constraint league_past_results_season_month_check check (season_month between 1 and 12);

create or replace function public._guard_disabled_league_judging()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_league_judging on public.judge_scores;
create trigger guard_disabled_league_judging
before insert or update of league_id, team_id, season_year, score_payload, total_score, status on public.judge_scores
for each row execute function public._guard_disabled_league_judging();

create or replace function public._guard_disabled_official_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notes = 'official_multi_judge_engine'
     and exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_official_result on public.results;
create trigger guard_disabled_official_result
before insert or update of league_id, team_id, season_year, notes on public.results
for each row execute function public._guard_disabled_official_result();

revoke all on function public._guard_disabled_league_judging() from public;
revoke all on function public._guard_disabled_official_result() from public;

create or replace function public._guard_disabled_league_person_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_kind = 'judge'
     and exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_league_person_role on public.league_people;
create trigger guard_disabled_league_person_role
before insert or update of league_id, role_kind on public.league_people
for each row execute function public._guard_disabled_league_person_role();
revoke all on function public._guard_disabled_league_person_role() from public;

create or replace function public._guard_manual_league_archive_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registration_cycle_status = 'archived'
     and not exists (
       select 1 from public.league_cycle_archives a
       where a.league_id = new.id
         and a.season_year = new.current_season_year
         and a.season_month = new.current_season_month
     ) then
    raise exception 'archive_cycle_required';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_manual_league_archive_status on public.leagues;
create trigger guard_manual_league_archive_status
before insert or update of registration_cycle_status on public.leagues
for each row execute function public._guard_manual_league_archive_status();
revoke all on function public._guard_manual_league_archive_status() from public;

create or replace function public.aggregate_official_league_results(p_league_id uuid,p_season_year integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_required integer; v_formula text; v_enabled boolean;
begin
  select coalesce(required_judge_count,(select count(*) from league_admins where league_id=p_league_id and assignment_role in ('judge','head_judge'))),result_formula,judging_enabled
    into v_required,v_formula,v_enabled from leagues where id=p_league_id;
  if not coalesce(v_enabled,true) or v_required < 1 then return; end if;
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

create or replace function public.set_league_cycle_podium(p_league_id uuid,p_first_team_id uuid,p_second_team_id uuid,p_third_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; v_team_id uuid; v_rank integer;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into l from public.leagues where id=p_league_id; if not found then raise exception 'league_not_found'; end if;
  if l.judging_enabled then raise exception 'manual_podium_requires_judging_disabled'; end if;
  if cardinality(array(select distinct unnest(array[p_first_team_id,p_second_team_id,p_third_team_id])))<>3 then raise exception 'podium_teams_must_be_distinct'; end if;
  if p_first_team_id is null or p_second_team_id is null or p_third_team_id is null then raise exception 'podium_teams_required'; end if;
  update public.results r set rank=null where r.league_id=l.id and r.season_year=l.current_season_year and r.rank between 1 and 3
    and exists(select 1 from public.teams t where t.id=r.team_id and coalesce(t.season_month,l.current_season_month)=l.current_season_month);
  for v_team_id,v_rank in select * from unnest(array[p_first_team_id,p_second_team_id,p_third_team_id],array[1,2,3]) loop
    if not exists(select 1 from public.teams t where t.id=v_team_id and t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and t.lifecycle_status='completed') then raise exception 'podium_team_not_eligible'; end if;
    insert into public.results(league_id,team_id,company_id,season_year,rank,notes,published_at)
    select t.league_id,t.id,t.company_id,l.current_season_year,v_rank,'official_cycle_podium',now() from public.teams t where t.id=v_team_id
    on conflict(team_id,season_year) do update set rank=excluded.rank,published_at=coalesce(public.results.published_at,now()),notes=excluded.notes;
  end loop;
end $$;

create or replace function public.archive_league_cycle(p_league_id uuid)
returns public.league_cycle_archives language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; a public.league_cycle_archives%rowtype; month_names text[]:=array['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into l from public.leagues where id=p_league_id for update; if not found then raise exception 'league_not_found'; end if;
  if exists (select 1 from public.league_cycle_archives a where a.league_id=l.id and a.season_year=l.current_season_year and a.season_month=l.current_season_month) then
    raise exception 'league_cycle_already_archived';
  end if;
  if (select count(distinct r.rank) from public.results r join public.teams t on t.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and r.rank between 1 and 3 and r.published_at is not null)<>3 then raise exception 'league_results_required'; end if;
  insert into public.league_cycle_archives(league_id,season_year,season_month,label_fa,label_en,teams_snapshot,results_snapshot,archived_by)
  values(l.id,l.current_season_year,l.current_season_month,month_names[l.current_season_month]||' '||l.current_season_year,l.current_season_year||'-'||lpad(l.current_season_month::text,2,'0'),
    (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.teams t where t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month),
    (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.results r join public.teams rt on rt.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(rt.season_month,l.current_season_month)=l.current_season_month and r.published_at is not null),auth.uid()) returning * into a;
  insert into public.league_past_results(league_id,season_year,season_month,first_place,second_place,third_place)
  select l.id,l.current_season_year,l.current_season_month,
    max(t.name) filter (where r.rank=1),max(t.name) filter (where r.rank=2),max(t.name) filter (where r.rank=3)
  from public.results r join public.teams t on t.id=r.team_id
  where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and r.rank between 1 and 3 and r.published_at is not null
  on conflict (league_id,season_year,season_month) do update set first_place=excluded.first_place,second_place=excluded.second_place,third_place=excluded.third_place;
  update public.teams set archived_at=coalesce(archived_at,now()) where league_id=l.id and season_year=l.current_season_year and coalesce(season_month,l.current_season_month)=l.current_season_month;
  update public.leagues set registration_cycle_status='archived',results_status='hidden' where id=l.id;
  return a;
end $$;

-- ===== 0099_shared_competition_people_and_sponsors.sql =====
-- Shared competition directory.  A person or sponsor is stored once and is
-- assigned to any number of league pages through the relation tables.
create table if not exists public.competition_people (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  full_name text not null,
  full_name_en text,
  photo_url text,
  specialty text,
  specialty_en text,
  bio text,
  bio_en text,
  identity_summary_fa text,
  identity_summary_en text,
  education_fa text,
  education_en text,
  honors_fa text,
  honors_en text,
  awards_fa text,
  awards_en text,
  courses_fa text,
  courses_en text,
  company_info_fa text,
  company_info_en text,
  birth_date date,
  nationality_fa text,
  nationality_en text,
  city_fa text,
  city_en text,
  email text,
  phone text,
  website_url text,
  linkedin_url text,
  is_profile_published boolean not null default true,
  role_kind text not null default 'judge' check (role_kind in ('judge','committee')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists competition_people_slug_uidx on public.competition_people(lower(slug));

create table if not exists public.competition_people_leagues (
  person_id uuid not null references public.competition_people(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (person_id, league_id)
);
create index if not exists competition_people_leagues_league_idx
  on public.competition_people_leagues(league_id, sort_order, person_id);

create table if not exists public.competition_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  logo_url text,
  website_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_sponsor_leagues (
  sponsor_id uuid not null references public.competition_sponsors(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (sponsor_id, league_id)
);
create index if not exists competition_sponsor_leagues_league_idx
  on public.competition_sponsor_leagues(league_id, sort_order, sponsor_id);

-- Preserve all existing league-specific records and their public URLs.  The
-- old tables remain intact for historical compatibility; new management uses
-- the shared directory and relation tables.
insert into public.competition_people (
  id, slug, full_name, full_name_en, photo_url, specialty, specialty_en,
  bio, bio_en, identity_summary_fa, identity_summary_en, education_fa,
  education_en, honors_fa, honors_en, awards_fa, awards_en, courses_fa,
  courses_en, company_info_fa, company_info_en, birth_date, nationality_fa,
  nationality_en, city_fa, city_en, email, phone, website_url, linkedin_url,
  is_profile_published, role_kind, sort_order, created_at, updated_at
)
select p.id, p.slug, p.full_name, p.full_name_en, p.photo_url, p.specialty,
  p.specialty_en, p.bio, p.bio_en, p.identity_summary_fa,
  p.identity_summary_en, p.education_fa, p.education_en, p.honors_fa,
  p.honors_en, p.awards_fa, p.awards_en, p.courses_fa, p.courses_en,
  p.company_info_fa, p.company_info_en, p.birth_date, p.nationality_fa,
  p.nationality_en, p.city_fa, p.city_en, p.email, p.phone, p.website_url,
  p.linkedin_url, p.is_profile_published, p.role_kind, p.sort_order,
  p.created_at, coalesce(p.updated_at, p.created_at)
from public.league_people p
on conflict (id) do nothing;

insert into public.competition_people_leagues(person_id, league_id, sort_order)
select p.id, p.league_id, p.sort_order
from public.league_people p
on conflict (person_id, league_id) do nothing;

insert into public.competition_sponsors(id, name, name_en, logo_url, website_url, sort_order, created_at, updated_at)
select s.id, s.name, s.name_en, s.logo_url, s.website_url, s.sort_order, s.created_at, s.created_at
from public.league_sponsors s
on conflict (id) do nothing;

insert into public.competition_sponsor_leagues(sponsor_id, league_id, sort_order)
select s.id, s.league_id, s.sort_order
from public.league_sponsors s
on conflict (sponsor_id, league_id) do nothing;

alter table public.competition_people enable row level security;
alter table public.competition_people_leagues enable row level security;
alter table public.competition_sponsors enable row level security;
alter table public.competition_sponsor_leagues enable row level security;

drop policy if exists competition_people_public_read on public.competition_people;
create policy competition_people_public_read on public.competition_people
for select using (is_profile_published = true or public.is_super_admin());
drop policy if exists competition_people_admin on public.competition_people;
create policy competition_people_admin on public.competition_people
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update, delete on public.competition_people to authenticated;

drop policy if exists competition_people_leagues_public_read on public.competition_people_leagues;
create policy competition_people_leagues_public_read on public.competition_people_leagues
for select using (true);
drop policy if exists competition_people_leagues_admin on public.competition_people_leagues;
create policy competition_people_leagues_admin on public.competition_people_leagues
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update, delete on public.competition_people_leagues to authenticated;

drop policy if exists competition_sponsors_admin on public.competition_sponsors;
create policy competition_sponsors_admin on public.competition_sponsors
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update, delete on public.competition_sponsors to authenticated;
drop policy if exists competition_sponsor_leagues_public_read on public.competition_sponsor_leagues;
create policy competition_sponsor_leagues_public_read on public.competition_sponsor_leagues
for select using (true);
drop policy if exists competition_sponsor_leagues_admin on public.competition_sponsor_leagues;
create policy competition_sponsor_leagues_admin on public.competition_sponsor_leagues
for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update, delete on public.competition_sponsor_leagues to authenticated;

create or replace function public._guard_shared_judge_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from public.competition_people p
    join public.leagues l on l.id = new.league_id
    where p.id = new.person_id and p.role_kind = 'judge' and not l.judging_enabled
  ) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_shared_judge_assignment on public.competition_people_leagues;
create trigger guard_shared_judge_assignment
before insert or update of person_id, league_id on public.competition_people_leagues
for each row execute function public._guard_shared_judge_assignment();
revoke all on function public._guard_shared_judge_assignment() from public;

create or replace function public.set_competition_person_leagues(p_person_id uuid, p_league_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.competition_people where id = p_person_id) then raise exception 'competition_person_not_found'; end if;
  delete from public.competition_people_leagues where person_id = p_person_id;
  insert into public.competition_people_leagues(person_id, league_id, sort_order)
  select p_person_id, v.league_id, row_number() over ()::integer - 1
  from unnest(coalesce(p_league_ids, '{}'::uuid[])) as v(league_id);
end;
$$;
revoke all on function public.set_competition_person_leagues(uuid, uuid[]) from public;
grant execute on function public.set_competition_person_leagues(uuid, uuid[]) to authenticated;

create or replace function public.set_competition_sponsor_leagues(p_sponsor_id uuid, p_league_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.competition_sponsors where id = p_sponsor_id) then raise exception 'competition_sponsor_not_found'; end if;
  delete from public.competition_sponsor_leagues where sponsor_id = p_sponsor_id;
  insert into public.competition_sponsor_leagues(sponsor_id, league_id, sort_order)
  select p_sponsor_id, v.league_id, row_number() over ()::integer - 1
  from unnest(coalesce(p_league_ids, '{}'::uuid[])) as v(league_id);
end;
$$;
revoke all on function public.set_competition_sponsor_leagues(uuid, uuid[]) from public;
grant execute on function public.set_competition_sponsor_leagues(uuid, uuid[]) to authenticated;

create or replace view public.public_league_people
with (security_invoker = false) as
select p.*, a.league_id, a.sort_order as assignment_sort_order
from public.competition_people p
join public.competition_people_leagues a on a.person_id = p.id
join public.leagues l on l.id = a.league_id
where p.is_profile_published = true
  and l.is_active = true
  and (p.role_kind <> 'judge' or l.judging_enabled = true);
grant select on public.public_league_people to anon, authenticated;

create or replace view public.public_league_sponsors
with (security_invoker = false) as
select s.*, a.league_id, a.sort_order as assignment_sort_order
from public.competition_sponsors s
join public.competition_sponsor_leagues a on a.sponsor_id = s.id
join public.leagues l on l.id = a.league_id
where l.is_active = true;
grant select on public.public_league_sponsors to anon, authenticated;

-- ===== 10000_security_hardening.sql =====
-- Keep payment provider secrets out of the broad runtime table grants.
-- SECURITY DEFINER functions continue to read this table through their owner
-- privileges, while API roles can no longer query or mutate it directly.
alter table if exists public.payment_config enable row level security;
drop policy if exists payment_config_no_direct_access on public.payment_config;
create policy payment_config_no_direct_access on public.payment_config
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.payment_config from anon, authenticated;

-- An administrator deleting an account must be able to remove the complete
-- company dossier.  Teams belong to their company, so the FK must cascade;
-- the account deletion transaction still deletes teams explicitly first to
-- clean dependent operational rows and storage paths.
alter table public.teams drop constraint if exists teams_company_id_fkey;
alter table public.teams add constraint teams_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

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


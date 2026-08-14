-- RoboCactus Phase 0: initial schema, RLS, profile trigger

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

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

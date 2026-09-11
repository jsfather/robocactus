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

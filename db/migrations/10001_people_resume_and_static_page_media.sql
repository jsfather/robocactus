-- Resume presentation fields for the shared competition directory.
alter table public.competition_people
  add column if not exists short_bio text,
  add column if not exists short_bio_en text,
  add column if not exists experience_years integer,
  add column if not exists is_founder boolean not null default false,
  add column if not exists founder_badge_url text;

alter table public.competition_people
  drop constraint if exists competition_people_experience_years_check;
alter table public.competition_people
  add constraint competition_people_experience_years_check
  check (experience_years is null or experience_years between 0 and 100);

-- The public view was created before these columns existed. Recreate it so
-- public league cards and profile pages expose the new presentation fields
-- without changing the visibility rules for unpublished people or disabled
-- judging leagues.
drop view if exists public.public_league_people;
create view public.public_league_people
with (security_invoker = false) as
select p.*, a.league_id, a.sort_order as assignment_sort_order
from public.competition_people p
join public.competition_people_leagues a on a.person_id = p.id
join public.leagues l on l.id = a.league_id
where p.is_profile_published = true
  and l.is_active = true
  and (p.role_kind <> 'judge' or l.judging_enabled = true);
grant select on public.public_league_people to anon, authenticated;

-- Static pages keep the existing cover/OG image and gain two purpose-specific
-- media slots for the About page layout.
alter table public.static_pages
  add column if not exists hero_image text,
  add column if not exists scope_image text;

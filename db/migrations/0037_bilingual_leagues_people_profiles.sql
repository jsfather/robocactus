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


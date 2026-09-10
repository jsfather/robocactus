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

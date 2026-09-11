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

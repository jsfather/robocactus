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

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

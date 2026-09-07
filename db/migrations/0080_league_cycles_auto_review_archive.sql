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

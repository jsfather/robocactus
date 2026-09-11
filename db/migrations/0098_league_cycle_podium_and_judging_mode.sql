-- A league has one reusable identity, while every completed cycle owns its
-- own immutable podium.  Keep the public archive in sync with cycle archive.
alter table public.leagues
  add column if not exists judging_enabled boolean not null default true;

alter table public.league_past_results
  add column if not exists season_month integer;

update public.league_past_results p
set season_month = coalesce(
  (select a.season_month from public.league_cycle_archives a
   where a.league_id = p.league_id and a.season_year = p.season_year
   order by a.archived_at desc limit 1),
  1
)
where p.season_month is null;

alter table public.league_past_results
  alter column season_month set default 1,
  alter column season_month set not null;
alter table public.league_past_results
  drop constraint if exists league_past_results_league_id_season_year_key;
alter table public.league_past_results
  add constraint league_past_results_cycle_unique unique (league_id, season_year, season_month);
alter table public.league_past_results
  add constraint league_past_results_season_month_check check (season_month between 1 and 12);

create or replace function public._guard_disabled_league_judging()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_league_judging on public.judge_scores;
create trigger guard_disabled_league_judging
before insert or update of league_id, team_id, season_year, score_payload, total_score, status on public.judge_scores
for each row execute function public._guard_disabled_league_judging();

create or replace function public._guard_disabled_official_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notes = 'official_multi_judge_engine'
     and exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_official_result on public.results;
create trigger guard_disabled_official_result
before insert or update of league_id, team_id, season_year, notes on public.results
for each row execute function public._guard_disabled_official_result();

revoke all on function public._guard_disabled_league_judging() from public;
revoke all on function public._guard_disabled_official_result() from public;

create or replace function public._guard_disabled_league_person_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role_kind = 'judge'
     and exists (select 1 from public.leagues l where l.id = new.league_id and not l.judging_enabled) then
    raise exception 'league_judging_disabled';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_disabled_league_person_role on public.league_people;
create trigger guard_disabled_league_person_role
before insert or update of league_id, role_kind on public.league_people
for each row execute function public._guard_disabled_league_person_role();
revoke all on function public._guard_disabled_league_person_role() from public;

create or replace function public._guard_manual_league_archive_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.registration_cycle_status = 'archived'
     and not exists (
       select 1 from public.league_cycle_archives a
       where a.league_id = new.id
         and a.season_year = new.current_season_year
         and a.season_month = new.current_season_month
     ) then
    raise exception 'archive_cycle_required';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_manual_league_archive_status on public.leagues;
create trigger guard_manual_league_archive_status
before insert or update of registration_cycle_status on public.leagues
for each row execute function public._guard_manual_league_archive_status();
revoke all on function public._guard_manual_league_archive_status() from public;

create or replace function public.aggregate_official_league_results(p_league_id uuid,p_season_year integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_required integer; v_formula text; v_enabled boolean;
begin
  select coalesce(required_judge_count,(select count(*) from league_admins where league_id=p_league_id and assignment_role in ('judge','head_judge'))),result_formula,judging_enabled
    into v_required,v_formula,v_enabled from leagues where id=p_league_id;
  if not coalesce(v_enabled,true) or v_required < 1 then return; end if;
  insert into results(league_id,team_id,company_id,season_year,score,rank,notes,published_at)
  select p_league_id,t.id,t.company_id,p_season_year,
    case when v_formula='sum' then sum(js.total_score) else avg(js.total_score) end,null,
    'official_multi_judge_engine',null
  from teams t
  join judge_scores js on js.team_id=t.id and js.season_year=p_season_year and js.status='submitted'
  join league_admins assigned on assigned.league_id=p_league_id and assigned.user_id=js.judge_id and assigned.assignment_role in ('judge','head_judge')
  where t.league_id=p_league_id group by t.id,t.company_id
  having count(distinct js.judge_id)>=v_required
  on conflict(team_id,season_year) do update set score=excluded.score,notes=excluded.notes;
  with ranked as(select id,dense_rank() over(order by score desc nulls last)::integer as calculated_rank from results where league_id=p_league_id and season_year=p_season_year and notes='official_multi_judge_engine')
  update results r set rank=ranked.calculated_rank from ranked where r.id=ranked.id;
end $$;

create or replace function public.set_league_cycle_podium(p_league_id uuid,p_first_team_id uuid,p_second_team_id uuid,p_third_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; v_team_id uuid; v_rank integer;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into l from public.leagues where id=p_league_id; if not found then raise exception 'league_not_found'; end if;
  if l.judging_enabled then raise exception 'manual_podium_requires_judging_disabled'; end if;
  if cardinality(array(select distinct unnest(array[p_first_team_id,p_second_team_id,p_third_team_id])))<>3 then raise exception 'podium_teams_must_be_distinct'; end if;
  if p_first_team_id is null or p_second_team_id is null or p_third_team_id is null then raise exception 'podium_teams_required'; end if;
  update public.results r set rank=null where r.league_id=l.id and r.season_year=l.current_season_year and r.rank between 1 and 3
    and exists(select 1 from public.teams t where t.id=r.team_id and coalesce(t.season_month,l.current_season_month)=l.current_season_month);
  for v_team_id,v_rank in select * from unnest(array[p_first_team_id,p_second_team_id,p_third_team_id],array[1,2,3]) loop
    if not exists(select 1 from public.teams t where t.id=v_team_id and t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and t.lifecycle_status='completed') then raise exception 'podium_team_not_eligible'; end if;
    insert into public.results(league_id,team_id,company_id,season_year,rank,notes,published_at)
    select t.league_id,t.id,t.company_id,l.current_season_year,v_rank,'official_cycle_podium',now() from public.teams t where t.id=v_team_id
    on conflict(team_id,season_year) do update set rank=excluded.rank,published_at=coalesce(public.results.published_at,now()),notes=excluded.notes;
  end loop;
end $$;

create or replace function public.archive_league_cycle(p_league_id uuid)
returns public.league_cycle_archives language plpgsql security definer set search_path=public as $$
declare l public.leagues%rowtype; a public.league_cycle_archives%rowtype; month_names text[]:=array['ژانویه','فوریه','مارس','آوریل','مه','ژوئن','ژوئیه','اوت','سپتامبر','اکتبر','نوامبر','دسامبر'];
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into l from public.leagues where id=p_league_id for update; if not found then raise exception 'league_not_found'; end if;
  if exists (select 1 from public.league_cycle_archives a where a.league_id=l.id and a.season_year=l.current_season_year and a.season_month=l.current_season_month) then
    raise exception 'league_cycle_already_archived';
  end if;
  if (select count(distinct r.rank) from public.results r join public.teams t on t.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and r.rank between 1 and 3 and r.published_at is not null)<>3 then raise exception 'league_results_required'; end if;
  insert into public.league_cycle_archives(league_id,season_year,season_month,label_fa,label_en,teams_snapshot,results_snapshot,archived_by)
  values(l.id,l.current_season_year,l.current_season_month,month_names[l.current_season_month]||' '||l.current_season_year,l.current_season_year||'-'||lpad(l.current_season_month::text,2,'0'),
    (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.teams t where t.league_id=l.id and t.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month),
    (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.results r join public.teams rt on rt.id=r.team_id where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(rt.season_month,l.current_season_month)=l.current_season_month and r.published_at is not null),auth.uid()) returning * into a;
  insert into public.league_past_results(league_id,season_year,season_month,first_place,second_place,third_place)
  select l.id,l.current_season_year,l.current_season_month,
    max(t.name) filter (where r.rank=1),max(t.name) filter (where r.rank=2),max(t.name) filter (where r.rank=3)
  from public.results r join public.teams t on t.id=r.team_id
  where r.league_id=l.id and r.season_year=l.current_season_year and coalesce(t.season_month,l.current_season_month)=l.current_season_month and r.rank between 1 and 3 and r.published_at is not null
  on conflict (league_id,season_year,season_month) do update set first_place=excluded.first_place,second_place=excluded.second_place,third_place=excluded.third_place;
  update public.teams set archived_at=coalesce(archived_at,now()) where league_id=l.id and season_year=l.current_season_year and coalesce(season_month,l.current_season_month)=l.current_season_month;
  update public.leagues set registration_cycle_status='archived',results_status='hidden' where id=l.id;
  return a;
end $$;

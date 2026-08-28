-- Participant-selected ticket department and race-safe team-name validation.
-- An organization may register multiple teams in one league; only their names
-- must be distinct for the same league season.
alter table public.teams drop constraint if exists teams_company_league_unique;

create or replace function public.create_ticket_with_department(
  p_team_id uuid,
  p_subject text,
  p_body text,
  p_league_id uuid default null,
  p_department_id uuid default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team public.teams%rowtype;
  v_ticket public.tickets%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if not (public.is_super_admin() or v_team.captain_id = v_uid or exists (
    select 1 from public.company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid
  )) then raise exception 'forbidden'; end if;
  if p_department_id is null or not exists (
    select 1 from public.ticket_departments d where d.id = p_department_id and d.is_active = true
  ) then raise exception 'invalid_department'; end if;

  insert into public.tickets (team_id, league_id, department_id, subject, status)
  values (p_team_id, p_league_id, p_department_id, trim(p_subject), 'open')
  returning * into v_ticket;
  insert into public.ticket_messages (ticket_id, sender_id, body)
  values (v_ticket.id, v_uid, trim(p_body));
  return v_ticket;
end;
$$;

revoke all on function public.create_ticket_with_department(uuid,text,text,uuid,uuid) from public;
grant execute on function public.create_ticket_with_department(uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.team_name_available(
  p_league_id uuid,
  p_season_year integer,
  p_name text,
  p_exclude_team_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.teams t
    where t.league_id = p_league_id
      and coalesce(t.season_year, 0) = coalesce(p_season_year, 0)
      and lower(btrim(t.name)) = lower(btrim(p_name))
      and (p_exclude_team_id is null or t.id <> p_exclude_team_id)
  );
$$;

revoke all on function public.team_name_available(uuid,integer,text,uuid) from public;
grant execute on function public.team_name_available(uuid,integer,text,uuid) to authenticated;

create or replace function public.guard_unique_team_name_in_league()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is null or btrim(new.name) = '' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.league_id::text || ':' || coalesce(new.season_year, 0)::text || ':' || lower(btrim(new.name)), 0));
  if exists (
    select 1 from public.teams t
    where t.league_id = new.league_id
      and coalesce(t.season_year, 0) = coalesce(new.season_year, 0)
      and lower(btrim(t.name)) = lower(btrim(new.name))
      and t.id <> new.id
  ) then raise exception 'team_name_already_exists' using errcode = '23505'; end if;
  return new;
end;
$$;

drop trigger if exists teams_unique_name_per_league_guard on public.teams;
create trigger teams_unique_name_per_league_guard
before insert or update of name, league_id, season_year on public.teams
for each row execute function public.guard_unique_team_name_in_league();

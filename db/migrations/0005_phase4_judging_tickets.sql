-- Phase 4: judging + staff ticketing helpers and tighter ticket visibility

-- League admins need to download team documents while reviewing
drop policy if exists "team_documents_select" on storage.objects;
create policy "team_documents_select"
  on storage.objects for select using (
    bucket_id = 'team-documents'
    and (
      public.is_super_admin()
      or public.current_user_role() = 'staff'
      or auth.uid()::text = (storage.foldername(name))[1]
      or exists (
        select 1
        from documents d
        join teams t on t.id = d.team_id
        join league_admins la on la.league_id = t.league_id and la.user_id = auth.uid()
        where d.file_path = name
      )
    )
  );

-- Review team status (league admin / staff / super_admin)
create or replace function public.review_team(
  p_team_id uuid,
  p_status registration_status,
  p_rejection_reason text default null
)
returns teams
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_status not in ('under_review', 'approved', 'rejected', 'waitlisted') then
    raise exception 'invalid review status';
  end if;

  select * into v_team from teams where id = p_team_id for update;
  if not found then
    raise exception 'team not found';
  end if;

  v_role := public.current_user_role();

  if not (
    public.is_super_admin()
    or v_role = 'staff'
    or exists (
      select 1 from league_admins la
      where la.league_id = v_team.league_id and la.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  -- Staff may only do initial triage to under_review
  if v_role = 'staff' and not public.is_super_admin() then
    if p_status <> 'under_review' then
      raise exception 'staff can only mark under_review';
    end if;
  end if;

  update teams
  set
    status = p_status,
    rejection_reason = case
      when p_status = 'rejected' then p_rejection_reason
      else null
    end,
    reviewed_at = now(),
    reviewed_by = v_uid
  where id = p_team_id
  returning * into v_team;

  return v_team;
end;
$$;

revoke all on function public.review_team from public;
grant execute on function public.review_team to authenticated;

-- Create ticket (captain/company)
create or replace function public.create_ticket(
  p_team_id uuid,
  p_subject text,
  p_body text,
  p_league_id uuid default null
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_ticket tickets%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if not (
    public.is_super_admin()
    or v_team.captain_id = v_uid
    or exists (
      select 1 from company_members cm
      where cm.company_id = v_team.company_id and cm.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  insert into tickets (team_id, league_id, subject, status)
  values (
    p_team_id,
    p_league_id, -- null = general (staff queue)
    trim(p_subject),
    'open'
  )
  returning * into v_ticket;

  insert into ticket_messages (ticket_id, sender_id, body)
  values (v_ticket.id, v_uid, trim(p_body));

  return v_ticket;
end;
$$;

revoke all on function public.create_ticket from public;
grant execute on function public.create_ticket to authenticated;

-- Staff refers a general ticket to a league (and optional league admin)
create or replace function public.refer_ticket(
  p_ticket_id uuid,
  p_league_id uuid,
  p_assigned_to uuid default null
)
returns tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
  v_role user_role;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_role := public.current_user_role();
  if not (public.is_super_admin() or v_role = 'staff') then
    raise exception 'forbidden';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found';
  end if;

  if v_ticket.league_id is not null and not public.is_super_admin() then
    raise exception 'ticket already referred';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  if p_assigned_to is not null then
    if not exists (
      select 1 from league_admins la
      where la.league_id = p_league_id and la.user_id = p_assigned_to
    ) and not public.is_super_admin() then
      raise exception 'assignee is not a league admin for this league';
    end if;
  end if;

  update tickets
  set
    league_id = p_league_id,
    assigned_to = p_assigned_to,
    status = case when status = 'closed' then status else 'open' end
  where id = p_ticket_id
  returning * into v_ticket;

  return v_ticket;
end;
$$;

revoke all on function public.refer_ticket from public;
grant execute on function public.refer_ticket to authenticated;

create or replace function public.reply_ticket(
  p_ticket_id uuid,
  p_body text,
  p_mark_answered boolean default true
)
returns ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ticket tickets%rowtype;
  v_msg ticket_messages%rowtype;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'ticket not found';
  end if;

  -- Same visibility rules as tickets_select
  v_allowed :=
    public.is_super_admin()
    or v_ticket.assigned_to = v_uid
    or exists (
      select 1 from teams t
      where t.id = v_ticket.team_id
        and (
          t.captain_id = v_uid
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = v_uid
          )
        )
    )
    or (
      v_ticket.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      v_ticket.league_id is not null
      and v_ticket.assigned_to is null
      and exists (
        select 1 from league_admins la
        where la.league_id = v_ticket.league_id and la.user_id = v_uid
      )
    );

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  insert into ticket_messages (ticket_id, sender_id, body)
  values (p_ticket_id, v_uid, trim(p_body))
  returning * into v_msg;

  if p_mark_answered and public.current_user_role() in ('staff', 'league_admin', 'super_admin') then
    update tickets set status = 'answered' where id = p_ticket_id and status = 'open';
  end if;

  return v_msg;
end;
$$;

revoke all on function public.reply_ticket from public;
grant execute on function public.reply_ticket to authenticated;

-- Tighten tickets_select: after referral with assignee, only that admin (+ owners + super_admin)
drop policy if exists "tickets_select" on tickets;
create policy "tickets_select"
  on tickets for select using (
    public.is_super_admin()
    or assigned_to = auth.uid()
    or exists (
      select 1 from teams t
      where t.id = tickets.team_id
        and (
          t.captain_id = auth.uid()
          or exists (
            select 1 from company_members cm
            where cm.company_id = t.company_id and cm.user_id = auth.uid()
          )
        )
    )
    or (
      tickets.league_id is null
      and public.current_user_role() = 'staff'
    )
    or (
      tickets.league_id is not null
      and tickets.assigned_to is null
      and exists (
        select 1 from league_admins la
        where la.league_id = tickets.league_id and la.user_id = auth.uid()
      )
    )
  );

-- Align ticket message visibility with tickets_select
drop policy if exists "ticket_messages_select" on ticket_messages;
create policy "ticket_messages_select"
  on ticket_messages for select using (
    exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          public.is_super_admin()
          or tk.assigned_to = auth.uid()
          or exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or (
            tk.league_id is null
            and public.current_user_role() = 'staff'
          )
          or (
            tk.league_id is not null
            and tk.assigned_to is null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

drop policy if exists "ticket_messages_insert" on ticket_messages;
create policy "ticket_messages_insert"
  on ticket_messages for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from tickets tk
      where tk.id = ticket_messages.ticket_id
        and (
          public.is_super_admin()
          or tk.assigned_to = auth.uid()
          or exists (
            select 1 from teams t
            where t.id = tk.team_id
              and (
                t.captain_id = auth.uid()
                or exists (
                  select 1 from company_members cm
                  where cm.company_id = t.company_id and cm.user_id = auth.uid()
                )
              )
          )
          or (
            tk.league_id is null
            and public.current_user_role() = 'staff'
          )
          or (
            tk.league_id is not null
            and tk.assigned_to is null
            and exists (
              select 1 from league_admins la
              where la.league_id = tk.league_id and la.user_id = auth.uid()
            )
          )
        )
    )
  );

-- Upsert result for a team
create or replace function public.upsert_team_result(
  p_team_id uuid,
  p_season_year integer,
  p_rank integer default null,
  p_score numeric default null,
  p_notes text default null,
  p_publish boolean default false
)
returns results
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_row results%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = v_team.league_id and la.user_id = v_uid
    )
  ) then
    raise exception 'forbidden';
  end if;

  select * into v_row
  from results
  where team_id = p_team_id and season_year = p_season_year
  limit 1;

  if found then
    update results
    set
      rank = p_rank,
      score = p_score,
      notes = p_notes,
      published_at = case when p_publish then coalesce(published_at, now()) else published_at end
    where id = v_row.id
    returning * into v_row;
  else
    insert into results (
      league_id, team_id, company_id, season_year, rank, score, notes, published_at
    ) values (
      v_team.league_id,
      v_team.id,
      v_team.company_id,
      p_season_year,
      p_rank,
      p_score,
      p_notes,
      case when p_publish then now() else null end
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.upsert_team_result from public;
grant execute on function public.upsert_team_result to authenticated;

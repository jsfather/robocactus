-- Phase 6: Realtime ticketing + unread receipts

create table if not exists ticket_reads (
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table ticket_reads enable row level security;

create policy "ticket_reads_select_own"
  on ticket_reads for select using (
    user_id = auth.uid() or public.is_super_admin()
  );

create policy "ticket_reads_upsert_own"
  on ticket_reads for all using (
    user_id = auth.uid()
  )
  with check (
    user_id = auth.uid()
  );

create or replace function public.mark_ticket_read(p_ticket_id uuid)
returns ticket_reads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row ticket_reads%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- must be allowed to see the ticket (reuse tickets_select logic via exists)
  if not exists (
    select 1 from tickets tk
    where tk.id = p_ticket_id
      and (
        public.is_super_admin()
        or tk.assigned_to = v_uid
        or exists (
          select 1 from teams t
          where t.id = tk.team_id
            and (
              t.captain_id = v_uid
              or exists (
                select 1 from company_members cm
                where cm.company_id = t.company_id and cm.user_id = v_uid
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
            where la.league_id = tk.league_id and la.user_id = v_uid
          )
        )
      )
  ) then
    raise exception 'forbidden';
  end if;

  insert into ticket_reads (ticket_id, user_id, last_read_at)
  values (p_ticket_id, v_uid, now())
  on conflict (ticket_id, user_id)
  do update set last_read_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.mark_ticket_read from public;
grant execute on function public.mark_ticket_read to authenticated;

-- Count tickets with at least one unread message for current user
create or replace function public.count_unread_tickets()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select tk.id
    from tickets tk
    where
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
  select count(*)::integer
  from visible v
  where exists (
    select 1
    from ticket_messages tm
    left join ticket_reads tr
      on tr.ticket_id = v.id and tr.user_id = auth.uid()
    where tm.ticket_id = v.id
      and tm.sender_id is distinct from auth.uid()
      and tm.created_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
  );
$$;

revoke all on function public.count_unread_tickets from public;
grant execute on function public.count_unread_tickets to authenticated;

create or replace function public.list_unread_ticket_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select tk.id
    from tickets tk
    where
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
  select v.id
  from visible v
  where exists (
    select 1
    from ticket_messages tm
    left join ticket_reads tr
      on tr.ticket_id = v.id and tr.user_id = auth.uid()
    where tm.ticket_id = v.id
      and tm.sender_id is distinct from auth.uid()
      and tm.created_at > coalesce(tr.last_read_at, 'epoch'::timestamptz)
  );
$$;

revoke all on function public.list_unread_ticket_ids from public;
grant execute on function public.list_unread_ticket_ids to authenticated;

-- Enable Realtime for chat tables (ignore if already added)
do $$
begin
  begin
    alter publication supabase_realtime add table ticket_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table tickets;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table ticket_reads;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

-- Replica identity full helps filtered realtime (optional but useful)
alter table ticket_messages replica identity full;
alter table tickets replica identity full;
alter table ticket_reads replica identity full;

-- Phase 5: SMS notifications with idempotent notification_log

alter table notification_log
  add column if not exists idempotency_key text,
  add column if not exists phone text,
  add column if not exists error_message text,
  add column if not exists meta jsonb default '{}'::jsonb,
  add column if not exists provider_message_id text,
  add column if not exists created_at timestamptz default now();

update notification_log
set idempotency_key = coalesce(idempotency_key, id::text)
where idempotency_key is null;

alter table notification_log
  alter column idempotency_key set not null;

create unique index if not exists notification_log_idempotency_key_uidx
  on notification_log (idempotency_key);

create index if not exists notification_log_status_created_idx
  on notification_log (status, created_at asc);

create or replace function public.claim_notification(
  p_idempotency_key text,
  p_team_id uuid,
  p_template_key text,
  p_phone text,
  p_channel text default 'sms',
  p_meta jsonb default '{}'::jsonb
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  select * into v_row
  from notification_log
  where idempotency_key = p_idempotency_key;

  if found then
    return v_row;
  end if;

  begin
    insert into notification_log (
      team_id,
      channel,
      template_key,
      status,
      idempotency_key,
      phone,
      meta
    ) values (
      p_team_id,
      p_channel,
      p_template_key,
      'pending',
      p_idempotency_key,
      p_phone,
      coalesce(p_meta, '{}'::jsonb)
    )
    returning * into v_row;
  exception
    when unique_violation then
      select * into v_row
      from notification_log
      where idempotency_key = p_idempotency_key;
  end;

  return v_row;
end;
$$;

revoke all on function public.claim_notification from public;
grant execute on function public.claim_notification to service_role;

create or replace function public.finalize_notification(
  p_idempotency_key text,
  p_success boolean,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  update notification_log
  set
    status = case when p_success then 'sent' else 'failed' end,
    provider_message_id = coalesce(p_provider_message_id, provider_message_id),
    error_message = case when p_success then null else coalesce(p_error_message, error_message) end,
    sent_at = now()
  where idempotency_key = p_idempotency_key
  returning * into v_row;

  if not found then
    raise exception 'notification not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.finalize_notification from public;
grant execute on function public.finalize_notification to service_role;

create or replace function public.enqueue_team_sms(
  p_team_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_team teams%rowtype;
begin
  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  select phone into v_phone from profiles where id = v_team.captain_id;

  return public.claim_notification(
    p_idempotency_key,
    p_team_id,
    p_template_key,
    coalesce(v_phone, ''),
    'sms',
    case
      when v_phone is null or length(trim(v_phone)) < 8 then
        coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('skip', 'missing_phone')
      else
        coalesce(p_meta, '{}'::jsonb)
    end
  );
end;
$$;

revoke all on function public.enqueue_team_sms from public;
grant execute on function public.enqueue_team_sms to service_role;

create or replace function public.trg_teams_status_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template text;
  v_key text;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_template := case new.status
      when 'submitted' then 'registration_submitted'
      when 'approved' then 'registration_approved'
      when 'rejected' then 'registration_rejected'
      when 'waitlisted' then 'registration_waitlisted'
      else null
    end;

    if v_template is not null then
      v_key := 'team:' || new.id::text || ':status:' || new.status::text;
      perform public.enqueue_team_sms(
        new.id,
        v_template,
        v_key,
        jsonb_build_object(
          'status', new.status,
          'league_id', new.league_id,
          'rejection_reason', new.rejection_reason
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_team_status_notify on teams;
create trigger on_team_status_notify
  after update of status on teams
  for each row execute function public.trg_teams_status_notify();

create or replace function public.trg_invoice_paid_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'paid'
     and old.status is distinct from 'paid' then
    perform public.enqueue_team_sms(
      new.team_id,
      'payment_confirmed',
      'invoice:' || new.id::text || ':paid',
      jsonb_build_object(
        'invoice_id', new.id,
        'amount', new.amount,
        'invoice_number', new.invoice_number
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_paid_notify on invoices;
create trigger on_invoice_paid_notify
  after update of status on invoices
  for each row execute function public.trg_invoice_paid_notify();

create or replace function public.trg_result_published_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_at is not null
     and (tg_op = 'INSERT' or old.published_at is null) then
    perform public.enqueue_team_sms(
      new.team_id,
      'result_announced',
      'team:' || new.team_id::text || ':result:' || new.season_year::text || ':published',
      jsonb_build_object(
        'season_year', new.season_year,
        'rank', new.rank,
        'score', new.score,
        'league_id', new.league_id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_result_published_notify on results;
create trigger on_result_published_notify
  after insert or update of published_at on results
  for each row execute function public.trg_result_published_notify();

create or replace function public.enqueue_registration_deadline_reminders(
  p_hours_before integer default 48
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
  v_key text;
  v_close_date text;
begin
  for r in
    select t.id as team_id, t.league_id, l.registration_close_at
    from teams t
    join leagues l on l.id = t.league_id
    where t.status = 'draft'
      and l.is_active = true
      and l.registration_close_at is not null
      and l.registration_close_at > now()
      and l.registration_close_at <= now() + make_interval(hours => p_hours_before)
  loop
    v_close_date := to_char(timezone('UTC', r.registration_close_at), 'YYYY-MM-DD');
    v_key := 'team:' || r.team_id::text || ':deadline:' || r.league_id::text || ':' || v_close_date;
    perform public.enqueue_team_sms(
      r.team_id,
      'registration_deadline_reminder',
      v_key,
      jsonb_build_object(
        'league_id', r.league_id,
        'registration_close_at', r.registration_close_at
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_registration_deadline_reminders from public;
grant execute on function public.enqueue_registration_deadline_reminders to service_role;

create or replace function public.list_pending_notifications(p_limit integer default 50)
returns setof notification_log
language sql
security definer
set search_path = public
as $$
  select *
  from notification_log
  where status = 'pending'
  order by created_at asc nulls first
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_pending_notifications from public;
grant execute on function public.list_pending_notifications to service_role;

-- Atomic claim for dispatch workers (prevents double SMS under concurrent invokes)
create or replace function public.claim_notification_for_send(p_idempotency_key text)
returns notification_log
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row notification_log%rowtype;
begin
  update notification_log
  set status = 'sending'
  where idempotency_key = p_idempotency_key
    and status = 'pending'
  returning * into v_row;

  if not found then
    select * into v_row
    from notification_log
    where idempotency_key = p_idempotency_key;
  end if;

  return v_row;
end;
$$;

revoke all on function public.claim_notification_for_send from public;
grant execute on function public.claim_notification_for_send to service_role;

drop policy if exists "notification_log_insert_service" on notification_log;
create policy "notification_log_insert_service"
  on notification_log for insert with check (public.is_super_admin());

drop policy if exists "notification_log_update_super_admin" on notification_log;
create policy "notification_log_update_super_admin"
  on notification_log for update using (public.is_super_admin());

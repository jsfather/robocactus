-- Respect sms_settings toggles, league_joined on paid registration,
-- always promote assign_league_admin role, incomplete-profile enqueue helper

-- ── assign league admin: always set role (except super_admin) ──────
create or replace function public.assign_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user not found';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  insert into league_admins (league_id, user_id)
  values (p_league_id, p_user_id)
  on conflict do nothing;

  update profiles
  set role = 'league_admin'
  where id = p_user_id
    and role is distinct from 'super_admin';
end;
$$;

-- ── gate template keys against sms_settings ─────────────────────────
create or replace function public.sms_template_enabled(p_template text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s sms_settings%rowtype;
begin
  select * into s from sms_settings where id = 1;
  if not found then
    return true;
  end if;

  return case p_template
    when 'account_approved' then s.enable_account_approved
    when 'league_joined' then s.enable_league_joined
    when 'result_announced' then s.enable_results
    when 'incomplete_profile' then s.enable_incomplete_profile
    when 'account_issue' then s.enable_account_issue
    -- legacy registration / payment templates follow related toggles
    when 'registration_submitted' then s.enable_league_joined
    when 'payment_confirmed' then s.enable_league_joined
    when 'registration_approved' then true
    when 'registration_rejected' then true
    when 'registration_waitlisted' then true
    else true
  end;
end;
$$;

revoke all on function public.sms_template_enabled from public;
grant execute on function public.sms_template_enabled to authenticated, service_role;

-- Wrap enqueue_team_sms to honor flags (preserve 0006 signature + claim_notification)
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
  if not public.sms_template_enabled(p_template_key) then
    return null;
  end if;

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

-- Also enqueue league_joined when payment confirms participation
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
    perform public.enqueue_team_sms(
      new.team_id,
      'league_joined',
      'invoice:' || new.id::text || ':league_joined',
      jsonb_build_object(
        'invoice_id', new.id,
        'team_id', new.team_id
      )
    );
  end if;
  return new;
end;
$$;

-- Gate activate / account_issue / broadcast inserts via helper used from activate RPC
create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone into v_phone;

  if v_phone is not null and public.sms_template_enabled('account_approved') then
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      'account_approved',
      v_phone,
      'pending',
      'account_approved:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    )
    on conflict do nothing;
  end if;
end;
$$;

-- Incomplete profile SMS for one user (callable from client when profile incomplete)
create or replace function public.enqueue_incomplete_profile_sms(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if auth.uid() is distinct from p_user_id and not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not public.sms_template_enabled('incomplete_profile') then
    return;
  end if;

  select phone into v_phone from profiles where id = p_user_id;
  if v_phone is null then
    return;
  end if;

  insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
  values (
    'sms',
    'incomplete_profile',
    v_phone,
    'pending',
    'incomplete_profile:' || p_user_id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
    jsonb_build_object('user_id', p_user_id)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.enqueue_incomplete_profile_sms from public;
grant execute on function public.enqueue_incomplete_profile_sms to authenticated;

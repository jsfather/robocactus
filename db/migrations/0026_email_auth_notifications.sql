-- Email auth + email notifications for international users

alter table profiles
  add column if not exists email text,
  add column if not exists auth_channel text not null default 'phone',
  add column if not exists email_verified_at timestamptz;

alter table profiles drop constraint if exists profiles_auth_channel_check;
alter table profiles
  add constraint profiles_auth_channel_check
  check (auth_channel in ('phone', 'email'));

create unique index if not exists profiles_email_uidx
  on profiles (lower(email))
  where email is not null and length(trim(email)) > 0;

alter table notification_log
  add column if not exists email text;

alter table sms_settings
  add column if not exists enable_email_account_approved boolean not null default true,
  add column if not exists enable_email_notifications boolean not null default true;

-- Profile bootstrap: phone stays unique; email-only users get synthetic phone e:{uuid}
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
  v_channel text;
  v_invite captain_invites%rowtype;
begin
  v_email := nullif(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')), '');
  v_phone := nullif(trim(coalesce(new.raw_user_meta_data->>'phone', new.phone, '')), '');
  v_channel := coalesce(
    nullif(new.raw_user_meta_data->>'auth_channel', ''),
    case when v_email is not null and v_phone is null then 'email' else 'phone' end
  );

  if v_phone is null then
    v_phone := 'e:' || new.id::text;
  end if;

  insert into public.profiles (id, full_name, phone, email, auth_channel, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'کاربر جدید'),
    v_phone,
    v_email,
    case when v_channel in ('phone', 'email') then v_channel else 'phone' end,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'team_captain')
  );

  for v_invite in
    select * from captain_invites
    where phone = v_phone and accepted_at is null and team_id is not null
  loop
    update teams
    set captain_id = new.id
    where id = v_invite.team_id;

    update captain_invites
    set accepted_at = now()
    where id = v_invite.id;
  end loop;

  return new;
end;
$$;

create or replace function public.is_real_phone(p_phone text)
returns boolean
language sql
immutable
as $$
  select p_phone is not null
    and length(trim(p_phone)) >= 8
    and p_phone not like 'e:%';
$$;

create or replace function public.enqueue_user_email(
  p_user_id uuid,
  p_template_key text,
  p_idempotency_key text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_enabled boolean;
begin
  select coalesce(enable_email_notifications, true) into v_enabled from sms_settings where id = 1;
  if v_enabled is distinct from true then
    return;
  end if;

  if p_template_key = 'account_approved' then
    select coalesce(enable_email_account_approved, true) into v_enabled from sms_settings where id = 1;
    if v_enabled is distinct from true then
      return;
    end if;
  end if;

  select nullif(trim(email), '') into v_email from profiles where id = p_user_id;
  if v_email is null then
    return;
  end if;

  insert into notification_log (channel, template_key, email, phone, status, idempotency_key, meta)
  values (
    'email',
    p_template_key,
    v_email,
    null,
    'pending',
    p_idempotency_key,
    coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('user_id', p_user_id, 'email', v_email)
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.enqueue_user_email from public;
grant execute on function public.enqueue_user_email to authenticated;
grant execute on function public.enqueue_user_email to service_role;

create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_email text;
  v_channel text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone, email, auth_channel into v_phone, v_email, v_channel;

  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
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

  if v_email is not null or v_channel = 'email' then
    perform public.enqueue_user_email(
      p_user_id,
      'account_approved',
      'account_approved_email:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    );
  end if;
end;
$$;

drop function if exists public.list_pending_notifications(integer);
drop function if exists public.list_pending_notifications(integer, text);

create function public.list_pending_notifications(
  p_limit integer default 50,
  p_channel text default null
)
returns setof notification_log
language sql
security definer
set search_path = public
as $$
  select *
  from notification_log
  where status = 'pending'
    and (p_channel is null or channel = p_channel)
  order by created_at asc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.list_pending_notifications(integer, text) from public;
grant execute on function public.list_pending_notifications(integer, text) to service_role;

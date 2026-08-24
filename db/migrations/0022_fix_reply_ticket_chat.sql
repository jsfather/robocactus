-- Fix reply_ticket overload ambiguity + ensure 0021 objects exist

drop function if exists public.reply_ticket(uuid, text, boolean);
drop function if exists public.reply_ticket(uuid, text, boolean, text, text, text, integer);
drop function if exists public.reply_ticket(uuid, text, boolean, text, text, text, int);

-- Re-apply core pieces from 0021 safely (IF NOT EXISTS / OR REPLACE)

alter table account_issues
  add column if not exists user_response text,
  add column if not exists user_responded_at timestamptz;

do $$
begin
  alter table account_issues drop constraint if exists account_issues_status_check;
exception when undefined_object then null;
end $$;

alter table account_issues
  drop constraint if exists account_issues_status_check;

alter table account_issues
  add constraint account_issues_status_check
  check (status in ('open', 'awaiting_review', 'resolved'));

drop policy if exists "account_issues_user_update" on account_issues;
create policy "account_issues_user_update" on account_issues
  for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

create or replace function public.respond_account_issue(
  p_issue_id uuid,
  p_response text
)
returns account_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row account_issues%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update account_issues
  set
    user_response = trim(p_response),
    user_responded_at = now(),
    status = 'awaiting_review'
  where id = p_issue_id
    and user_id = auth.uid()
    and status in ('open', 'awaiting_review')
  returning * into v_row;

  if not found then
    raise exception 'issue not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.respond_account_issue(uuid, text) from public;
grant execute on function public.respond_account_issue(uuid, text) to authenticated;

create or replace function public.resolve_account_issue(p_issue_id uuid)
returns account_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row account_issues%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update account_issues
  set status = 'resolved', resolved_at = now()
  where id = p_issue_id
  returning * into v_row;

  if not found then
    raise exception 'issue not found';
  end if;
  return v_row;
end;
$$;

revoke all on function public.resolve_account_issue(uuid) from public;
grant execute on function public.resolve_account_issue(uuid) to authenticated;

alter table sms_settings
  add column if not exists provider text not null default 'ippanel',
  add column if not exists kavenegar_sender text,
  add column if not exists kavenegar_api_key_hint text;

do $$
begin
  alter table sms_settings drop constraint if exists sms_settings_provider_check;
exception when undefined_object then null;
end $$;

alter table sms_settings drop constraint if exists sms_settings_provider_check;
alter table sms_settings
  add constraint sms_settings_provider_check
  check (provider in ('ippanel', 'kavenegar'));

alter table site_settings
  add column if not exists business_hours jsonb not null default '{
    "timezone":"Asia/Tehran",
    "days":{
      "sat":{"open":"09:00","close":"18:00"},
      "sun":{"open":"09:00","close":"18:00"},
      "mon":{"open":"09:00","close":"18:00"},
      "tue":{"open":"09:00","close":"18:00"},
      "wed":{"open":"09:00","close":"18:00"},
      "thu":{"open":"09:00","close":"14:00"},
      "fri":null
    }
  }'::jsonb,
  add column if not exists chat_enabled boolean not null default true,
  add column if not exists agents_online boolean not null default true,
  add column if not exists chat_welcome_fa text
    default 'سلام! خوش آمدید. نام و شماره موبایل خود را وارد کنید تا پشتیبانی پاسخ دهد.',
  add column if not exists chat_welcome_en text
    default 'Welcome! Enter your name and mobile so support can reply.',
  add column if not exists chat_away_fa text
    default 'در حال حاضر کارشناس آنلاین نیست. پیام شما ثبت شد و به‌زودی پاسخ داده می‌شود.',
  add column if not exists chat_away_en text
    default 'No agent is online right now. Your message was saved and we will reply soon.',
  add column if not exists chat_offline_fa text
    default 'خارج از ساعت کاری هستیم. پیام شما ثبت شد و در اولین فرصت پاسخ داده می‌شود.',
  add column if not exists chat_offline_en text
    default 'We are outside business hours. Your message was saved for the next shift.';

create table if not exists live_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_phone text not null,
  session_token text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_to uuid references profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists live_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_chat_sessions(id) on delete cascade,
  sender_kind text not null check (sender_kind in ('guest', 'agent', 'system')),
  sender_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists live_chat_sessions_last_idx on live_chat_sessions (last_message_at desc);
create index if not exists live_chat_messages_session_idx on live_chat_messages (session_id, created_at);

alter table live_chat_sessions enable row level security;
alter table live_chat_messages enable row level security;

drop policy if exists "live_chat_sessions_staff" on live_chat_sessions;
create policy "live_chat_sessions_staff" on live_chat_sessions for all to authenticated
  using (public.is_super_admin() or public.current_user_role() = 'staff')
  with check (public.is_super_admin() or public.current_user_role() = 'staff');

drop policy if exists "live_chat_messages_staff" on live_chat_messages;
create policy "live_chat_messages_staff" on live_chat_messages for all to authenticated
  using (public.is_super_admin() or public.current_user_role() = 'staff')
  with check (public.is_super_admin() or public.current_user_role() = 'staff');

create or replace function public._chat_is_business_hours()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s site_settings%rowtype;
  bh jsonb;
  day_key text;
  slot jsonb;
  now_local time;
  open_t time;
  close_t time;
  dow int;
  tz text;
begin
  select * into s from site_settings where id = 1;
  if not found then
    return true;
  end if;
  bh := coalesce(s.business_hours, '{}'::jsonb);
  tz := coalesce(bh->>'timezone', 'Asia/Tehran');
  dow := extract(dow from timezone(tz, now()))::int;
  day_key := case dow
    when 0 then 'sun'
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
  end;
  slot := bh->'days'->day_key;
  if slot is null or slot = 'null'::jsonb then
    return false;
  end if;
  open_t := (slot->>'open')::time;
  close_t := (slot->>'close')::time;
  now_local := timezone(tz, now())::time;
  return now_local >= open_t and now_local <= close_t;
end;
$$;

create or replace function public.start_live_chat(
  p_name text,
  p_phone text,
  p_locale text default 'fa'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s site_settings%rowtype;
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_session live_chat_sessions%rowtype;
  v_system text;
  v_mode text := 'online';
  v_welcome text;
begin
  select * into s from site_settings where id = 1;
  if not found or coalesce(s.chat_enabled, true) = false then
    raise exception 'chat_disabled';
  end if;
  if length(trim(p_name)) < 2 then
    raise exception 'invalid_name';
  end if;
  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'invalid_phone';
  end if;

  insert into live_chat_sessions (guest_name, guest_phone, session_token)
  values (trim(p_name), regexp_replace(p_phone, '\D', '', 'g'), v_token)
  returning * into v_session;

  v_welcome := case when p_locale like 'en%' then s.chat_welcome_en else s.chat_welcome_fa end;
  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'system', coalesce(v_welcome, 'Welcome'));

  if not public._chat_is_business_hours() then
    v_mode := 'offline';
    v_system := case when p_locale like 'en%' then s.chat_offline_en else s.chat_offline_fa end;
  elsif coalesce(s.agents_online, true) = false then
    v_mode := 'away';
    v_system := case when p_locale like 'en%' then s.chat_away_en else s.chat_away_fa end;
  end if;

  if v_system is not null then
    insert into live_chat_messages (session_id, sender_kind, body)
    values (v_session.id, 'system', v_system);
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'session_token', v_token,
    'mode', v_mode,
    'guest_name', v_session.guest_name,
    'guest_phone', v_session.guest_phone
  );
end;
$$;

revoke all on function public.start_live_chat(text, text, text) from public;
grant execute on function public.start_live_chat(text, text, text) to anon, authenticated;

create or replace function public.send_live_chat_guest_message(
  p_token text,
  p_body text
)
returns live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session live_chat_sessions%rowtype;
  v_msg live_chat_messages%rowtype;
begin
  select * into v_session from live_chat_sessions where session_token = p_token for update;
  if not found or v_session.status <> 'open' then
    raise exception 'session_not_found';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then
    raise exception 'empty_body';
  end if;

  insert into live_chat_messages (session_id, sender_kind, body)
  values (v_session.id, 'guest', trim(p_body))
  returning * into v_msg;

  update live_chat_sessions set last_message_at = now() where id = v_session.id;
  return v_msg;
end;
$$;

revoke all on function public.send_live_chat_guest_message(text, text) from public;
grant execute on function public.send_live_chat_guest_message(text, text) to anon, authenticated;

create or replace function public.fetch_live_chat_guest_messages(p_token text)
returns setof live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from live_chat_sessions where session_token = p_token) then
    raise exception 'session_not_found';
  end if;
  return query
    select m.*
    from live_chat_messages m
    join live_chat_sessions s on s.id = m.session_id
    where s.session_token = p_token
    order by m.created_at asc;
end;
$$;

revoke all on function public.fetch_live_chat_guest_messages(text) from public;
grant execute on function public.fetch_live_chat_guest_messages(text) to anon, authenticated;

create or replace function public.reply_live_chat_agent(
  p_session_id uuid,
  p_body text
)
returns live_chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_msg live_chat_messages%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not (public.is_super_admin() or public.current_user_role() = 'staff') then
    raise exception 'forbidden';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 then
    raise exception 'empty_body';
  end if;

  insert into live_chat_messages (session_id, sender_kind, sender_id, body)
  values (p_session_id, 'agent', v_uid, trim(p_body))
  returning * into v_msg;

  update live_chat_sessions
  set last_message_at = now(),
      assigned_to = coalesce(assigned_to, v_uid)
  where id = p_session_id;

  return v_msg;
end;
$$;

revoke all on function public.reply_live_chat_agent(uuid, text) from public;
grant execute on function public.reply_live_chat_agent(uuid, text) to authenticated;

create or replace function public.close_live_chat_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_super_admin() or public.current_user_role() = 'staff') then
    raise exception 'forbidden';
  end if;
  update live_chat_sessions set status = 'closed' where id = p_session_id;
end;
$$;

revoke all on function public.close_live_chat_session(uuid) from public;
grant execute on function public.close_live_chat_session(uuid) to authenticated;

alter table ticket_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size int;

create or replace function public.reply_ticket(
  p_ticket_id uuid,
  p_body text,
  p_mark_answered boolean default true,
  p_attachment_url text default null,
  p_attachment_name text default null,
  p_attachment_mime text default null,
  p_attachment_size int default null
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
      and exists (
        select 1 from league_admins la
        where la.league_id = v_ticket.league_id and la.user_id = v_uid
      )
    );

  if not v_allowed then
    raise exception 'forbidden';
  end if;

  if length(trim(coalesce(p_body, ''))) < 1 and p_attachment_url is null then
    raise exception 'empty_body';
  end if;

  insert into ticket_messages (
    ticket_id, sender_id, body,
    attachment_url, attachment_name, attachment_mime, attachment_size
  )
  values (
    p_ticket_id,
    v_uid,
    coalesce(nullif(trim(p_body), ''), '📎'),
    p_attachment_url,
    p_attachment_name,
    p_attachment_mime,
    p_attachment_size
  )
  returning * into v_msg;

  if p_mark_answered and public.current_user_role() in ('staff', 'league_admin', 'super_admin') then
    update tickets set status = 'answered' where id = p_ticket_id and status <> 'closed';
  elsif v_ticket.status = 'answered' then
    update tickets set status = 'open' where id = p_ticket_id;
  end if;

  return v_msg;
end;
$$;

revoke all on function public.reply_ticket(uuid, text, boolean, text, text, text, int) from public;
grant execute on function public.reply_ticket(uuid, text, boolean, text, text, text, int) to authenticated;

insert into storage.buckets (id, name, public)
values ('ticket-attachments', 'ticket-attachments', false)
on conflict (id) do nothing;

drop policy if exists "ticket_att_upload" on storage.objects;
create policy "ticket_att_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "ticket_att_select" on storage.objects;
create policy "ticket_att_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'ticket-attachments');

drop policy if exists "ticket_att_delete" on storage.objects;
create policy "ticket_att_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

do $$
begin
  begin
    alter publication supabase_realtime add table live_chat_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table live_chat_sessions;
  exception when duplicate_object then null;
  end;
end $$;

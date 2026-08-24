-- Hard-fix live chat token: never call gen_random_bytes

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
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
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

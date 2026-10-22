alter table public.live_chat_messages
  add column if not exists read_at timestamptz,
  add column if not exists sender_name text,
  add column if not exists sender_avatar_url text;

-- Snapshot only public-facing identity, never expose full profiles to guests.
create or replace function public.snapshot_live_chat_sender()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.read_at := null;
  if new.sender_kind='guest' then
    select guest_name into new.sender_name from public.live_chat_sessions where id=new.session_id;
    new.sender_avatar_url := null;
  elsif new.sender_kind='agent' then
    select full_name,avatar_url into new.sender_name,new.sender_avatar_url from public.profiles where id=new.sender_id;
  else
    new.sender_name := null; new.sender_avatar_url := null;
  end if;
  return new;
end;
$$;
revoke all on function public.snapshot_live_chat_sender() from public;
drop trigger if exists live_chat_sender_snapshot on public.live_chat_messages;
create trigger live_chat_sender_snapshot before insert on public.live_chat_messages
for each row execute function public.snapshot_live_chat_sender();

update public.live_chat_messages m set sender_name=s.guest_name
from public.live_chat_sessions s where m.session_id=s.id and m.sender_kind='guest' and m.sender_name is null;
update public.live_chat_messages m set sender_name=p.full_name,sender_avatar_url=p.avatar_url
from public.profiles p where m.sender_id=p.id and m.sender_kind='agent' and m.sender_name is null;

create or replace function public.get_live_chat_guest_session(p_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_session public.live_chat_sessions%rowtype;
begin
  select * into v_session from public.live_chat_sessions where session_token=p_token;
  if not found then raise exception 'session_not_found'; end if;
  return jsonb_build_object('id',v_session.id,'guest_name',v_session.guest_name,'guest_phone',v_session.guest_phone,'status',v_session.status,'assigned_to',v_session.assigned_to,'last_message_at',v_session.last_message_at,'created_at',v_session.created_at);
end;
$$;

-- Explicit IDs are the messages visible in the reader's viewport, not every
-- message in a conversation merely because the inbox or tab was opened.
create or replace function public.mark_live_chat_messages_read(
  p_session_id uuid, p_message_ids jsonb, p_token text default null
) returns void language plpgsql security definer set search_path=public as $$
declare v_kind text;
begin
  if p_token is not null then
    if not exists(select 1 from public.live_chat_sessions where id=p_session_id and session_token=p_token) then
      raise exception 'session_not_found';
    end if;
    v_kind := 'agent';
  else
    if auth.uid() is null or not coalesce(public.has_panel_permission('chat'),false) then raise exception 'forbidden'; end if;
    v_kind := 'guest';
  end if;
  if jsonb_typeof(p_message_ids) is distinct from 'array' then raise exception 'invalid_message_ids'; end if;
  if jsonb_array_length(p_message_ids)>500 then raise exception 'invalid_message_ids'; end if;
  update public.live_chat_messages set read_at=now()
  where session_id=p_session_id and sender_kind=v_kind and read_at is null
    and id in(select value::uuid from jsonb_array_elements_text(p_message_ids));
end;
$$;

create or replace function public.close_live_chat_guest_session(p_token text)
returns void language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select id into v_id from public.live_chat_sessions where session_token=p_token for update;
  if not found then raise exception 'session_not_found'; end if;
  update public.live_chat_sessions set status='closed' where id=v_id and status='open';
end;
$$;

create or replace function public.close_live_chat_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not coalesce(public.has_panel_permission('chat'),false) then raise exception 'forbidden'; end if;
  perform 1 from public.live_chat_sessions where id=p_session_id for update;
  if not found then raise exception 'session_not_found'; end if;
  update public.live_chat_sessions set status='closed' where id=p_session_id and status='open';
end;
$$;

create or replace function public.reply_live_chat_agent(p_session_id uuid,p_body text)
returns public.live_chat_messages language plpgsql security definer set search_path=public as $$
declare v_msg public.live_chat_messages%rowtype; v_session public.live_chat_sessions%rowtype;
begin
  if auth.uid() is null or not coalesce(public.has_panel_permission('chat'),false) then raise exception 'forbidden'; end if;
  select * into v_session from public.live_chat_sessions where id=p_session_id for update;
  if not found or v_session.status<>'open' then raise exception 'session_not_found'; end if;
  if length(trim(coalesce(p_body,'')))<1 then raise exception 'empty_body'; end if;
  if length(p_body)>5000 then raise exception 'message_too_long'; end if;
  insert into public.live_chat_messages(session_id,sender_kind,sender_id,body)
  values(p_session_id,'agent',auth.uid(),trim(p_body)) returning * into v_msg;
  update public.live_chat_sessions set last_message_at=now(),assigned_to=coalesce(assigned_to,auth.uid()) where id=p_session_id;
  return v_msg;
end;
$$;

revoke all on function public.get_live_chat_guest_session(text),public.mark_live_chat_messages_read(uuid,jsonb,text),public.close_live_chat_guest_session(text),public.close_live_chat_session(uuid),public.reply_live_chat_agent(uuid,text) from public;
grant execute on function public.get_live_chat_guest_session(text),public.mark_live_chat_messages_read(uuid,jsonb,text),public.close_live_chat_guest_session(text) to anon,authenticated;
grant execute on function public.close_live_chat_session(uuid),public.reply_live_chat_agent(uuid,text) to authenticated;

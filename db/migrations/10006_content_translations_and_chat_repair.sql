-- Keep existing columns as Persian content; translations are independent and optional.
alter table public.home_banners
  add column if not exists title_en text,
  add column if not exists subtitle_en text;
alter table public.blog_posts
  add column if not exists title_en text,
  add column if not exists body_en text,
  add column if not exists excerpt_en text,
  add column if not exists seo_title_en text,
  add column if not exists meta_description_en text,
  add column if not exists author_name_en text,
  add column if not exists cover_alt_en text;

create or replace function public.send_live_chat_guest_message(p_token text,p_body text)
returns public.live_chat_messages language plpgsql security definer set search_path=public as $$
declare v_session public.live_chat_sessions%rowtype; v_msg public.live_chat_messages%rowtype;
begin
  select * into v_session from public.live_chat_sessions where session_token=p_token for update;
  if not found or v_session.status<>'open' then raise exception 'session_not_found'; end if;
  if length(trim(coalesce(p_body,'')))<1 then raise exception 'empty_body'; end if;
  if length(p_body)>5000 then raise exception 'message_too_long'; end if;
  if (select count(*) from public.live_chat_messages where session_id=v_session.id and sender_kind='guest' and created_at>now()-interval '1 minute')>=12 then
    raise exception 'too_many_attempts';
  end if;
  insert into public.live_chat_messages(session_id,sender_kind,body) values(v_session.id,'guest',trim(p_body)) returning * into v_msg;
  update public.live_chat_sessions set last_message_at=now() where id=v_session.id;
  return v_msg;
end;
$$;
revoke all on function public.send_live_chat_guest_message(text,text) from public;
grant execute on function public.send_live_chat_guest_message(text,text) to anon,authenticated;

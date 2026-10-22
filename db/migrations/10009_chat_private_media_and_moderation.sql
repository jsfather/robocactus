create table if not exists app_private.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_chat_sessions(id) on delete cascade,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','audio/webm','audio/ogg','audio/mp4')),
  filename text not null,
  size integer not null check(size>0 and size<=5242880),
  content bytea not null,
  created_at timestamptz not null default now(),
  check(octet_length(content)=size)
);
revoke all on app_private.chat_attachments from public,anon,authenticated;
create index if not exists chat_attachments_session_idx on app_private.chat_attachments(session_id);
alter table public.live_chat_messages
  add column if not exists attachment_id uuid references app_private.chat_attachments(id) on delete set null,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size integer,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default clock_timestamp();

create table if not exists app_private.chat_message_audit (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.live_chat_messages(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('edit','delete')),
  previous_body text not null,
  created_at timestamptz not null default now()
);
revoke all on app_private.chat_message_audit from public,anon,authenticated;

create or replace function public.touch_live_chat_message()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
revoke all on function public.touch_live_chat_message() from public;
drop trigger if exists live_chat_message_revision on public.live_chat_messages;
create trigger live_chat_message_revision before update on public.live_chat_messages
for each row execute function public.touch_live_chat_message();

-- Do not allow generic query mutations to forge receipts, attachments, or
-- bypass moderation history. Writes use authorized server routes or RPCs.
drop policy if exists live_chat_messages_staff on public.live_chat_messages;
create policy live_chat_messages_staff on public.live_chat_messages for select to authenticated
using (public.has_panel_permission('chat'));
revoke insert,update,delete on public.live_chat_messages from anon,authenticated;

-- ArCaptcha controls and actionable contact/SMS inboxes.

alter table public.auth_settings
  add column if not exists captcha_provider text not null default 'arcaptcha',
  add column if not exists captcha_enabled boolean not null default false,
  add column if not exists arcaptcha_site_key text,
  add column if not exists arcaptcha_secret_key text,
  add column if not exists captcha_on_login boolean not null default true,
  add column if not exists captcha_on_signup boolean not null default true,
  add column if not exists captcha_on_password_reset boolean not null default true,
  add column if not exists captcha_on_contact boolean not null default true,
  add column if not exists captcha_on_live_chat boolean not null default true;

alter table public.auth_settings drop constraint if exists auth_settings_captcha_provider_check;
alter table public.auth_settings add constraint auth_settings_captcha_provider_check
  check (captcha_provider in ('arcaptcha'));

alter table public.contact_messages
  add column if not exists status text not null default 'new',
  add column if not exists admin_note text,
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.contact_messages drop constraint if exists contact_messages_status_check;
alter table public.contact_messages add constraint contact_messages_status_check
  check (status in ('new', 'in_review', 'resolved', 'spam'));

create index if not exists contact_messages_status_created_idx
  on public.contact_messages (status, created_at desc);

drop policy if exists "contact_messages_insert_public" on public.contact_messages;
revoke insert on public.contact_messages from anon, authenticated;
drop policy if exists "contact_messages_update_admin" on public.contact_messages;
create policy "contact_messages_update_admin" on public.contact_messages for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists public.captcha_verification_log (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  success boolean not null,
  ip_hash text,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists captcha_verification_created_idx
  on public.captcha_verification_log (created_at desc);
alter table public.captcha_verification_log enable row level security;
drop policy if exists "captcha_verification_sa" on public.captcha_verification_log;
create policy "captcha_verification_sa" on public.captcha_verification_log for select to authenticated
  using (public.is_super_admin());
revoke all on public.captcha_verification_log from anon, authenticated;
grant select on public.captcha_verification_log to authenticated;

-- Guests must use the captcha-protected application endpoint to open a chat.
revoke execute on function public.start_live_chat(text, text, text) from anon, authenticated;

create table if not exists public.kavenegar_inbox (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique,
  sender text not null,
  receptor text,
  message text not null,
  received_at timestamptz not null,
  status text not null default 'new'
    check (status in ('new', 'in_review', 'resolved', 'spam')),
  admin_note text,
  assigned_to uuid references public.profiles(id) on delete set null,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists kavenegar_inbox_status_received_idx
  on public.kavenegar_inbox (status, received_at desc);
create index if not exists kavenegar_inbox_sender_idx
  on public.kavenegar_inbox (sender);
alter table public.kavenegar_inbox enable row level security;
drop policy if exists "kavenegar_inbox_sa" on public.kavenegar_inbox;
create policy "kavenegar_inbox_sa" on public.kavenegar_inbox for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.kavenegar_inbox from anon;
grant select, insert, update, delete on public.kavenegar_inbox to authenticated;

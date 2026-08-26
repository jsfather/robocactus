-- Kavenegar operations center: provider defaults, audit trail and webhook events.

alter table public.auth_settings
  add column if not exists kavenegar_sender text,
  add column if not exists kavenegar_default_type smallint not null default 1,
  add column if not exists kavenegar_default_tag text,
  add column if not exists kavenegar_default_policy text,
  add column if not exists kavenegar_webhook_secret text;

alter table public.auth_settings drop constraint if exists auth_settings_kavenegar_type_check;
alter table public.auth_settings add constraint auth_settings_kavenegar_type_check
  check (kavenegar_default_type in (0, 1, 2, 3));

create table if not exists public.kavenegar_operations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  operation text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  provider_status integer,
  provider_message text,
  message_ids text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'webhook')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists kavenegar_operations_created_idx
  on public.kavenegar_operations (created_at desc);
create index if not exists kavenegar_operations_operation_idx
  on public.kavenegar_operations (operation, created_at desc);
create index if not exists kavenegar_operations_status_idx
  on public.kavenegar_operations (status, created_at desc);

alter table public.kavenegar_operations enable row level security;
drop policy if exists "kavenegar_operations_sa" on public.kavenegar_operations;
create policy "kavenegar_operations_sa" on public.kavenegar_operations
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.kavenegar_operations from anon;
grant select, insert, update, delete on public.kavenegar_operations to authenticated;

comment on table public.kavenegar_operations is
  'Audit log for Kavenegar API calls and delivery/inbound callbacks. API keys are never stored here.';

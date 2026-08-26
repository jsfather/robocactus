-- Password recovery and database-managed integration credentials.
-- Access remains restricted to super admins by the existing auth_settings RLS policy.

alter table public.auth_settings
  add column if not exists sms_provider text not null default 'ippanel',
  add column if not exists ippanel_api_key text,
  add column if not exists ippanel_originator text,
  add column if not exists kavenegar_api_key text,
  add column if not exists sms_patterns jsonb not null default '{}'::jsonb,
  add column if not exists zarinpal_merchant_id text,
  add column if not exists zarinpal_sandbox boolean not null default false;

alter table public.auth_settings drop constraint if exists auth_settings_sms_provider_check;
alter table public.auth_settings add constraint auth_settings_sms_provider_check
  check (sms_provider in ('ippanel', 'kavenegar'));


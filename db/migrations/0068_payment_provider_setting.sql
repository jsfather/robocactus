-- Payment provider selection is managed from the admin panel. NULL preserves
-- the deployment environment as a backwards-compatible fallback.
alter table public.auth_settings
  add column if not exists payment_provider text;

alter table public.auth_settings drop constraint if exists auth_settings_payment_provider_check;
alter table public.auth_settings add constraint auth_settings_payment_provider_check
  check (payment_provider is null or payment_provider in ('mock','zarinpal'));

comment on column public.auth_settings.payment_provider is
  'mock or zarinpal; NULL falls back to PAYMENT_PROVIDER/VITE_PAYMENT_PROVIDER.';

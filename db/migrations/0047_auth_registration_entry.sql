-- Public registration-link visibility is independent from signup availability.
alter table public.auth_settings
  add column if not exists show_registration_link boolean not null default true;

drop view if exists public.public_auth_options;
create view public.public_auth_options
with (security_invoker = false)
as select
  otp_login_enabled, password_login_enabled, email_magic_login_enabled,
  email_signup_enabled, phone_signup_enabled, show_registration_link,
  online_payment_enabled, card_to_card_enabled,
  bank_card_number, bank_iban, bank_account_owner
from public.auth_settings where id = 1;

grant select on public.public_auth_options to anon, authenticated;

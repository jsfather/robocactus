alter table public.auth_otp_challenges drop constraint if exists auth_otp_challenges_purpose_check;
alter table public.auth_otp_challenges add constraint auth_otp_challenges_purpose_check
  check (purpose in ('login','signup','profile','password_reset'));

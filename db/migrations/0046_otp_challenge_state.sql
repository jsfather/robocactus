-- Explicit OTP challenge identity and lifecycle state.
-- Server-side timestamptz/now() remains the sole expiration authority.
alter table public.auth_otp_challenges
  add column if not exists purpose text not null default 'login',
  add column if not exists invalidated_at timestamptz;

alter table public.auth_otp_challenges drop constraint if exists auth_otp_challenges_purpose_check;
alter table public.auth_otp_challenges add constraint auth_otp_challenges_purpose_check
  check (purpose in ('login','signup','profile'));

create index if not exists auth_otp_challenges_lookup_idx
  on public.auth_otp_challenges(phone,purpose,created_at desc);
create index if not exists auth_otp_challenges_cleanup_idx
  on public.auth_otp_challenges(expires_at) where consumed_at is null and invalidated_at is null;

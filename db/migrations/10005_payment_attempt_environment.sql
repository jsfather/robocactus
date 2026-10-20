-- Never reuse or verify a sandbox authority against the live gateway (or vice versa).
-- NULL preserves unknown legacy attempts without guessing their environment.
alter table public.payment_attempts add column if not exists sandbox boolean;

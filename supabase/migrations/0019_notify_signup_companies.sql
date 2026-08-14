-- Notifications hub, signup activation, company cover, league judging path, registration docs

-- ── profiles: account type / activation ──────────────────────────────
alter table profiles
  add column if not exists account_type text not null default 'individual'
    check (account_type in ('individual', 'legal')),
  add column if not exists account_status text not null default 'active'
    check (account_status in ('pending', 'active', 'rejected', 'suspended')),
  add column if not exists national_id text,
  add column if not exists company_name text,
  add column if not exists company_national_id text,
  add column if not exists economic_code text,
  add column if not exists address text,
  add column if not exists activated_at timestamptz,
  add column if not exists rejection_reason text;

-- New signups should wait for activation (existing stay active)
-- (no bulk update)

-- ── companies cover ────────────────────────────────────────────────
alter table companies
  add column if not exists cover_image_url text,
  add column if not exists tagline text;

-- ── leagues: judging path / technical notes ────────────────────────
alter table leagues
  add column if not exists judging_path text,
  add column if not exists technical_committee_notes text;

-- ── SMS settings (single row) ──────────────────────────────────────
create table if not exists sms_settings (
  id int primary key default 1 check (id = 1),
  mock_mode boolean not null default true,
  originator text,
  api_key_hint text,
  pattern_codes jsonb not null default '{}'::jsonb,
  enable_account_approved boolean not null default true,
  enable_league_joined boolean not null default true,
  enable_results boolean not null default true,
  enable_incomplete_profile boolean not null default true,
  enable_account_issue boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into sms_settings (id) values (1) on conflict (id) do nothing;

alter table sms_settings enable row level security;
drop policy if exists "sms_settings_sa" on sms_settings;
create policy "sms_settings_sa" on sms_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists "sms_settings_read_auth" on sms_settings;
create policy "sms_settings_read_auth" on sms_settings for select to authenticated using (true);

-- ── registration document requirements (signup) ────────────────────
create table if not exists registration_doc_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label_fa text not null,
  label_en text not null,
  account_type text not null default 'both'
    check (account_type in ('individual', 'legal', 'both')),
  is_required boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into registration_doc_types (code, label_fa, label_en, account_type, sort_order)
values
  ('national_card', 'تصویر کارت ملی', 'National ID card', 'individual', 1),
  ('selfie', 'سلفی با کارت ملی', 'Selfie with ID', 'individual', 2),
  ('company_registration', 'آگهی تأسیس / روزنامه رسمی', 'Company registration', 'legal', 1),
  ('company_national_id', 'شناسه ملی شرکت', 'Company national ID doc', 'legal', 2),
  ('authorization', 'معرفی‌نامه نماینده', 'Authorization letter', 'legal', 3)
on conflict (code) do nothing;

alter table registration_doc_types enable row level security;
drop policy if exists "reg_docs_public_select" on registration_doc_types;
create policy "reg_docs_public_select" on registration_doc_types for select using (is_active = true);
drop policy if exists "reg_docs_sa" on registration_doc_types;
create policy "reg_docs_sa" on registration_doc_types for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create table if not exists profile_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  doc_type_id uuid not null references registration_doc_types(id) on delete restrict,
  file_url text not null,
  created_at timestamptz not null default now()
);

alter table profile_documents enable row level security;
drop policy if exists "profile_docs_own" on profile_documents;
create policy "profile_docs_own" on profile_documents for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- ── account issues ─────────────────────────────────────────────────
create table if not exists account_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table account_issues enable row level security;
drop policy if exists "account_issues_sa" on account_issues;
create policy "account_issues_sa" on account_issues for all to authenticated
  using (public.is_super_admin() or user_id = auth.uid())
  with check (public.is_super_admin());

-- ── in-app notifications ───────────────────────────────────────────
create table if not exists system_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all'
    check (audience in ('all', 'role', 'user')),
  target_role text,
  target_user_id uuid references profiles(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists system_notification_reads (
  notification_id uuid not null references system_notifications(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table system_notifications enable row level security;
alter table system_notification_reads enable row level security;

drop policy if exists "sys_notif_select" on system_notifications;
create policy "sys_notif_select" on system_notifications for select to authenticated
  using (
    audience = 'all'
    or (audience = 'role' and target_role = (select role::text from profiles where id = auth.uid()))
    or (audience = 'user' and target_user_id = auth.uid())
    or public.is_super_admin()
  );

drop policy if exists "sys_notif_sa_write" on system_notifications;
create policy "sys_notif_sa_write" on system_notifications for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "sys_notif_reads" on system_notification_reads;
create policy "sys_notif_reads" on system_notification_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── site_settings: inactive account copy ───────────────────────────
alter table site_settings
  add column if not exists inactive_message_fa text
    default 'حساب کاربری شما هنوز فعال نشده است. تا زمان فعال‌سازی، دسترسی شما محدود است. فعال‌سازی از طریق پیامک انجام می‌شود. در صورت بروز مشکل با پشتیبانی تماس بگیرید.',
  add column if not exists inactive_message_en text
    default 'Your account is not active yet. Access stays limited until activation via SMS. Contact support if you need help.',
  add column if not exists support_phone text default '021-00000000';

-- ── enqueue broadcast SMS (manual) ─────────────────────────────────
create or replace function public.enqueue_broadcast_sms(
  p_template_key text,
  p_audience text,
  p_target_role text default null,
  p_target_user_id uuid default null,
  p_body_hint text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  for r in
    select id, phone from profiles
    where phone is not null and length(trim(phone)) > 5
      and (
        p_audience = 'all'
        or (p_audience = 'role' and role::text = p_target_role)
        or (p_audience = 'user' and id = p_target_user_id)
      )
  loop
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      p_template_key,
      r.phone,
      'pending',
      'broadcast:' || p_template_key || ':' || r.id::text || ':' || extract(epoch from now())::text,
      jsonb_build_object('hint', coalesce(p_body_hint, ''), 'user_id', r.id)
    )
    on conflict do nothing;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_broadcast_sms from public;
grant execute on function public.enqueue_broadcast_sms to authenticated;

-- Activate account + enqueue SMS
create or replace function public.activate_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set account_status = 'active', activated_at = now(), rejection_reason = null
  where id = p_user_id
  returning phone into v_phone;

  if v_phone is not null then
    insert into notification_log (channel, template_key, phone, status, idempotency_key, meta)
    values (
      'sms',
      'account_approved',
      v_phone,
      'pending',
      'account_approved:' || p_user_id::text,
      jsonb_build_object('user_id', p_user_id)
    )
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.activate_user_account from public;
grant execute on function public.activate_user_account to authenticated;

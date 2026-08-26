-- Tabarestan Cup: configurable access, complete identities, reusable league cycles,
-- bilingual teams and card-to-card payment review.

alter table auth.users add column if not exists username text;
create unique index if not exists auth_users_username_uidx
  on auth.users (lower(username)) where username is not null and length(trim(username)) > 0;

alter table public.profiles
  add column if not exists username text,
  add column if not exists first_name_fa text,
  add column if not exists last_name_fa text,
  add column if not exists first_name_en text,
  add column if not exists last_name_en text,
  add column if not exists birth_date date,
  add column if not exists postal_code text,
  add column if not exists legal_representative_national_id text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists identity_completed_at timestamptz;

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username)) where username is not null and length(trim(username)) > 0;

update auth.users set email = replace(email, '@robocactus.demo', '@tabarestancup.demo')
where email like '%@robocactus.demo'
  and not exists (select 1 from auth.users newer where newer.email = replace(auth.users.email, '@robocactus.demo', '@tabarestancup.demo'));
with demo_usernames(email, username) as (values
  ('admin@tabarestancup.demo', 'admin'),
  ('league@tabarestancup.demo', 'league-admin'),
  ('staff@tabarestancup.demo', 'staff'),
  ('company@tabarestancup.demo', 'company-admin'),
  ('captain@tabarestancup.demo', 'captain')
)
update auth.users target set username = demo.username
from demo_usernames demo
where target.email = demo.email
  and (target.username is null or length(trim(target.username)) = 0)
  and not exists (
    select 1 from auth.users occupied
    where occupied.id <> target.id and lower(occupied.username) = lower(demo.username)
  );
update public.profiles p set username = u.username from auth.users u where u.id = p.id and u.username is not null;

create or replace function public.sync_profile_username()
returns trigger language plpgsql security definer set search_path = public, auth
as $$
begin
  if new.username is distinct from old.username then
    update auth.users set username = nullif(lower(trim(new.username)), ''), updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_profile_username on public.profiles;
create trigger sync_profile_username after update of username on public.profiles
for each row execute function public.sync_profile_username();

alter table public.leagues
  add column if not exists captain_fee numeric not null default 0,
  add column if not exists member_fee numeric not null default 0,
  add column if not exists team_edit_deadline timestamptz,
  add column if not exists min_age integer,
  add column if not exists max_age integer,
  add column if not exists current_season_year integer not null default extract(year from current_date)::integer,
  add column if not exists registration_cycle_status text not null default 'open';

alter table public.leagues drop constraint if exists leagues_registration_cycle_status_check;
alter table public.leagues add constraint leagues_registration_cycle_status_check
  check (registration_cycle_status in ('draft', 'open', 'closed', 'archived'));

alter table public.teams
  add column if not exists name_en text,
  add column if not exists motto_fa text,
  add column if not exists motto_en text,
  add column if not exists season_year integer;

update public.teams t set season_year = l.current_season_year
from public.leagues l where l.id = t.league_id and t.season_year is null;

alter table public.team_members
  add column if not exists first_name_fa text,
  add column if not exists last_name_fa text,
  add column if not exists first_name_en text,
  add column if not exists last_name_en text;

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams for insert to authenticated with check (
  public.is_super_admin() or (
    exists (select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid())
    and exists (select 1 from public.leagues l where l.id = teams.league_id and l.is_active
      and l.registration_cycle_status = 'open'
      and (l.registration_open_at is null or l.registration_open_at <= now())
      and (l.registration_close_at is null or l.registration_close_at >= now()))
  )
);

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update to authenticated using (
  public.is_super_admin() or (
    (captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid()))
    and exists (select 1 from public.leagues l where l.id = teams.league_id and (l.team_edit_deadline is null or l.team_edit_deadline >= now()))
  )
) with check (public.is_super_admin() or captain_id = auth.uid() or exists (
  select 1 from public.company_members cm where cm.company_id = teams.company_id and cm.user_id = auth.uid()
));

drop policy if exists team_members_manage on public.team_members;
create policy team_members_manage on public.team_members for all to authenticated using (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = team_members.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
) with check (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = team_members.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
);

drop policy if exists documents_manage on public.documents;
create policy documents_manage on public.documents for all to authenticated using (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = documents.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
) with check (
  public.is_super_admin() or exists (
    select 1 from public.teams t join public.leagues l on l.id = t.league_id
    where t.id = documents.team_id
      and (t.captain_id = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = t.company_id and cm.user_id = auth.uid()))
      and (l.team_edit_deadline is null or l.team_edit_deadline >= now())
  )
);

alter table public.invoices
  add column if not exists payment_method text not null default 'online',
  add column if not exists receipt_path text,
  add column if not exists receipt_status text,
  add column if not exists receipt_rejection_reason text,
  add column if not exists receipt_submitted_at timestamptz,
  add column if not exists receipt_reviewed_at timestamptz,
  add column if not exists receipt_reviewed_by uuid references public.profiles(id);

alter table public.invoices drop constraint if exists invoices_payment_method_check;
alter table public.invoices add constraint invoices_payment_method_check
  check (payment_method in ('online', 'card_to_card'));
alter table public.invoices drop constraint if exists invoices_receipt_status_check;
alter table public.invoices add constraint invoices_receipt_status_check
  check (receipt_status is null or receipt_status in ('pending_review', 'approved', 'rejected'));

create table if not exists public.auth_settings (
  id integer primary key default 1 check (id = 1),
  otp_login_enabled boolean not null default true,
  password_login_enabled boolean not null default true,
  email_magic_login_enabled boolean not null default true,
  email_signup_enabled boolean not null default true,
  phone_signup_enabled boolean not null default true,
  online_payment_enabled boolean not null default true,
  card_to_card_enabled boolean not null default false,
  bank_card_number text,
  bank_iban text,
  bank_account_owner text,
  email_provider text not null default 'resend',
  email_from text,
  email_api_key text,
  updated_at timestamptz not null default now()
);

insert into public.auth_settings (id, email_from)
values (1, 'Tabarestan Cup <onboarding@resend.dev>') on conflict (id) do nothing;

insert into public.registration_doc_types (code, label_fa, label_en, account_type, is_required, is_active, sort_order)
values ('legal_representative_national_card', 'کارت ملی نماینده قانونی', 'Legal representative national ID', 'legal', true, true, 2)
on conflict (code) do update set is_required = true, is_active = true;

alter table public.auth_settings enable row level security;
drop policy if exists auth_settings_super_admin on public.auth_settings;
create policy auth_settings_super_admin on public.auth_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace view public.public_auth_options
with (security_invoker = false)
as select
  otp_login_enabled, password_login_enabled, email_magic_login_enabled,
  email_signup_enabled, phone_signup_enabled, online_payment_enabled,
  card_to_card_enabled, bank_card_number, bank_iban, bank_account_owner
from public.auth_settings where id = 1;

grant select on public.public_auth_options to anon, authenticated;
grant select, insert, update, delete on public.auth_settings to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists payment_receipts_insert on storage.objects;
create policy payment_receipts_insert on storage.objects for insert to authenticated
with check (bucket_id = 'payment-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists payment_receipts_select on storage.objects;
create policy payment_receipts_select on storage.objects for select to authenticated
using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));
drop policy if exists payment_receipts_delete on storage.objects;
create policy payment_receipts_delete on storage.objects for delete to authenticated
using (bucket_id = 'payment-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin()));

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_fee numeric;
  v_member_count integer;
  v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if v_team.status <> 'draft' then raise exception 'team is not in draft status'; end if;
  if not public.is_super_admin()
     and not exists (select 1 from company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid)
     and v_team.captain_id <> v_uid then raise exception 'forbidden'; end if;

  select count(*)::integer into v_member_count from team_members
  where team_id = p_team_id and coalesce(role, 'member') <> 'captain';
  select coalesce(registration_fee, 0) + coalesce(captain_fee, 0)
       + coalesce(member_fee, 0) * greatest(v_member_count, 0)
  into v_fee from leagues where id = v_team.league_id;

  select * into v_invoice from invoices
  where team_id = p_team_id and status in ('pending', 'failed')
  order by created_at desc limit 1;
  if found then
    update invoices set amount = v_fee, company_id = v_team.company_id,
      status = case when receipt_status = 'pending_review' then status else 'pending'::payment_status end
    where id = v_invoice.id returning * into v_invoice;
    return v_invoice;
  end if;
  insert into invoices (team_id, company_id, amount, status, invoice_number)
  values (v_team.id, v_team.company_id, v_fee, 'pending', public._next_invoice_number())
  returning * into v_invoice;
  return v_invoice;
end;
$$;

create or replace function public.submit_card_receipt(p_invoice_id uuid, p_receipt_path text)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not coalesce((select card_to_card_enabled from auth_settings where id = 1), false)
    then raise exception 'card_to_card_disabled'; end if;
  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice not found'; end if;
  if not public.is_super_admin()
     and not exists (select 1 from company_members cm where cm.company_id = v_invoice.company_id and cm.user_id = v_uid)
     and not exists (select 1 from teams t where t.id = v_invoice.team_id and t.captain_id = v_uid)
    then raise exception 'forbidden'; end if;
  update invoices set payment_method = 'card_to_card', receipt_path = p_receipt_path,
    receipt_status = 'pending_review', receipt_rejection_reason = null,
    receipt_submitted_at = now(), receipt_reviewed_at = null, receipt_reviewed_by = null,
    status = 'pending'
  where id = p_invoice_id returning * into v_invoice;
  return v_invoice;
end;
$$;

create or replace function public.review_card_receipt(p_invoice_id uuid, p_approved boolean, p_reason text default null)
returns invoices
language plpgsql security definer set search_path = public
as $$
declare v_invoice invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if not p_approved and length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'rejection_reason_required'; end if;
  update invoices set receipt_status = case when p_approved then 'approved' else 'rejected' end,
    receipt_rejection_reason = case when p_approved then null else trim(p_reason) end,
    receipt_reviewed_at = now(), receipt_reviewed_by = auth.uid(),
    status = case when p_approved then 'paid'::payment_status else 'failed'::payment_status end,
    paid_at = case when p_approved then now() else null end
  where id = p_invoice_id and payment_method = 'card_to_card'
  returning * into v_invoice;
  if not found then raise exception 'receipt not found'; end if;
  if p_approved then
    update teams set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id and status = 'draft';
  end if;
  return v_invoice;
end;
$$;

revoke all on function public.submit_card_receipt(uuid, text) from public;
grant execute on function public.submit_card_receipt(uuid, text) to authenticated;
revoke all on function public.review_card_receipt(uuid, boolean, text) from public;
grant execute on function public.review_card_receipt(uuid, boolean, text) to authenticated;

create or replace view public.invoice_finance_view with (security_invoker = true) as
select i.*, t.name as team_name, t.status as team_status, t.league_id,
  l.name as league_name, c.name as company_name, c.slug as company_slug
from invoices i join teams t on t.id = i.team_id
join leagues l on l.id = t.league_id join companies c on c.id = i.company_id;

-- Replace the visible legacy brand in persisted content.
create or replace function public._tabarestan_brand_text(p_value text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_value, ''),
    'روبوکاپ تبرستان', 'جام تبرستان'), 'روبو کاپ تبرستان', 'جام تبرستان'),
    'روبوکاکتوس', 'جام تبرستان'), 'روبو کاکتوس', 'جام تبرستان'),
    'روبوککتوس', 'جام تبرستان'), 'RoboCup Tabarestan', 'Tabarestan Cup'),
    'RoboCactus', 'Tabarestan Cup'), 'RoboCup', 'Tabarestan Cup'), 'RoboParts', 'TechParts')
$$;

update public.site_settings set
  site_name_fa = 'جام تبرستان', site_name_en = 'Tabarestan Cup',
  tagline_fa = public._tabarestan_brand_text(tagline_fa),
  tagline_en = public._tabarestan_brand_text(tagline_en),
  footer_fa = public._tabarestan_brand_text(footer_fa),
  footer_en = public._tabarestan_brand_text(footer_en),
  copyright_fa = public._tabarestan_brand_text(copyright_fa),
  copyright_en = public._tabarestan_brand_text(copyright_en), updated_at = now()
where id = 1;

update public.static_pages set title = public._tabarestan_brand_text(title), body = public._tabarestan_brand_text(body);
update public.blog_posts set title = public._tabarestan_brand_text(title), excerpt = public._tabarestan_brand_text(excerpt), body = public._tabarestan_brand_text(body);
update public.announcements set title = public._tabarestan_brand_text(title), body = public._tabarestan_brand_text(body);
update public.home_banners set title = public._tabarestan_brand_text(title), subtitle = public._tabarestan_brand_text(subtitle);
update public.leagues set name = public._tabarestan_brand_text(name), description = public._tabarestan_brand_text(description), venue_name = public._tabarestan_brand_text(venue_name);
update public.league_people set full_name = public._tabarestan_brand_text(full_name), specialty = public._tabarestan_brand_text(specialty), bio = public._tabarestan_brand_text(bio);
update public.league_sponsors set name = public._tabarestan_brand_text(name);

drop function public._tabarestan_brand_text(text);

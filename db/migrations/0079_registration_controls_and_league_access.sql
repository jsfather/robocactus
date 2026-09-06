alter table public.auth_settings
  add column if not exists registration_documents_enabled boolean not null default true,
  add column if not exists manual_account_approval_enabled boolean not null default true;

create or replace view public.public_auth_options with (security_invoker = false) as
select otp_login_enabled,password_login_enabled,email_magic_login_enabled,
  email_signup_enabled,phone_signup_enabled,show_registration_link,
  registration_documents_enabled,manual_account_approval_enabled,
  online_payment_enabled,card_to_card_enabled,bank_card_number,bank_iban,
  bank_account_owner,payment_provider
from public.auth_settings where id=1;
grant select on public.public_auth_options to anon,authenticated;

create or replace function public._apply_signup_completion_settings()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_manual boolean := true;
begin
  if new.signup_completed_at is not null and
     (old.signup_completed_at is null or new.signup_completed_at is distinct from old.signup_completed_at) then
    select coalesce(manual_account_approval_enabled,true) into v_manual from public.auth_settings where id=1;
    if coalesce(v_manual,true) then
      new.requires_account_approval:=true; new.account_status:='pending'; new.activated_at:=null;
    else
      new.requires_account_approval:=false; new.account_status:='active';
      new.activated_at:=coalesce(new.activated_at,now()); new.rejection_reason:=null;
    end if;
  end if;
  return new;
end $$;

create or replace function public._protect_account_approval_state()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_auto_completion boolean := false;
begin
  if auth.uid() is distinct from old.id or public.is_super_admin() then return new; end if;
  v_auto_completion := new.signup_completed_at is not null
    and new.signup_completed_at is distinct from old.signup_completed_at
    and not coalesce((select manual_account_approval_enabled from public.auth_settings where id=1),true);
  if v_auto_completion then return new; end if;
  if old.requires_account_approval then
    if not new.requires_account_approval then raise exception 'protected_profile_fields'; end if;
    if old.account_status='active' and new.account_status is distinct from old.account_status then raise exception 'protected_profile_fields'; end if;
    if old.account_status='pending' and old.signup_completed_at is not null then raise exception 'account_awaiting_approval'; end if;
    if old.account_status='rejected' and not (new.account_status='pending' and new.signup_completed_at is null) then raise exception 'correction_resubmission_required'; end if;
  elsif new.requires_account_approval and new.account_status<>'pending' then
    raise exception 'invalid_account_approval_state';
  elsif not new.requires_account_approval and new.account_status is distinct from old.account_status then
    raise exception 'protected_profile_fields';
  end if;
  return new;
end $$;

drop trigger if exists apply_signup_completion_settings on public.profiles;
create trigger apply_signup_completion_settings before update of signup_completed_at on public.profiles
for each row execute function public._apply_signup_completion_settings();
drop trigger if exists protect_account_approval_state on public.profiles;
create trigger protect_account_approval_state before update on public.profiles
for each row execute function public._protect_account_approval_state();

drop policy if exists leagues_management_write on public.leagues;
create policy leagues_management_write on public.leagues for all to authenticated
using (public.is_super_admin() or public.has_panel_permission('leagues'))
with check (public.is_super_admin() or public.has_panel_permission('leagues'));

alter table public.teams drop constraint if exists teams_company_league_unique;

alter table public.role_section_permissions drop constraint if exists role_section_permissions_section_key_check;
alter table public.role_section_permissions add constraint role_section_permissions_section_key_check
check (section_key in ('tickets','chat','triage','account_activation','finance','team_review','leagues'));
insert into public.role_section_permissions(role_key,section_key,is_enabled)
values ('operations','leagues',false) on conflict do nothing;

drop policy if exists attendance_settings_admin on public.league_attendance_settings;
create policy attendance_settings_admin on public.league_attendance_settings for all to authenticated
using (public.is_super_admin() or public.has_panel_permission('leagues'))
with check (public.is_super_admin() or public.has_panel_permission('leagues'));

create or replace function public._validate_participant_identifiers()
returns trigger language plpgsql set search_path=public as $$
begin
  if not coalesce(new.is_foreign,false) and nullif(new.phone,'') is not null and new.phone !~ '^09[0-9]{9}$' then
    raise exception 'invalid_phone';
  end if;
  if not coalesce(new.is_foreign,false) and new.account_type='individual'
     and nullif(new.national_id,'') is not null and new.national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  if nullif(new.postal_code,'') is not null and new.postal_code !~ '^[0-9]{10}$' then
    raise exception 'invalid_postal_code';
  end if;
  if new.account_type='legal' and nullif(new.legal_representative_national_id,'') is not null
     and new.legal_representative_national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  return new;
end $$;
drop trigger if exists validate_participant_identifiers on public.profiles;
create trigger validate_participant_identifiers before insert or update of phone,national_id,postal_code,legal_representative_national_id,is_foreign
on public.profiles for each row execute function public._validate_participant_identifiers();

create or replace function public._validate_team_person_identifiers()
returns trigger language plpgsql set search_path=public as $$
begin
  if not coalesce(new.is_foreign,false) and nullif(new.national_id,'') is not null and new.national_id !~ '^[0-9]{10}$' then
    raise exception 'invalid_national_id';
  end if;
  if new.role in ('captain','coach') and nullif(new.phone,'') is not null and new.phone !~ '^09[0-9]{9}$' then
    raise exception 'invalid_phone';
  end if;
  return new;
end $$;
drop trigger if exists validate_team_person_identifiers on public.team_members;
create trigger validate_team_person_identifiers before insert or update of phone,national_id,is_foreign,role
on public.team_members for each row execute function public._validate_team_person_identifiers();

-- Account approval gate for new registrations and lifecycle SMS events.

alter table public.profiles
  add column if not exists requires_account_approval boolean not null default false;

alter table public.sms_settings
  add column if not exists enable_attendance_permit_issued boolean not null default true,
  add column if not exists enable_team_correction_required boolean not null default true,
  add column if not exists enable_team_review_approved boolean not null default true;

create or replace function public.sms_template_enabled(p_template text)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare s public.sms_settings%rowtype;
begin
  select * into s from public.sms_settings where id=1;
  if not found then return true; end if;
  return case p_template
    when 'account_approved' then s.enable_account_approved
    when 'league_joined' then s.enable_league_joined
    when 'result_announced' then s.enable_results
    when 'incomplete_profile' then s.enable_incomplete_profile
    when 'account_issue' then s.enable_account_issue
    when 'attendance_permit_issued' then s.enable_attendance_permit_issued
    when 'team_correction_required' then s.enable_team_correction_required
    when 'team_review_approved' then s.enable_team_review_approved
    when 'registration_submitted' then s.enable_league_joined
    when 'payment_confirmed' then s.enable_league_joined
    else true
  end;
end $$;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (requires_account_approval and account_status in ('pending','rejected') and public.has_panel_permission('account_activation')));

drop policy if exists profile_docs_account_reviewer on public.profile_documents;
create policy profile_docs_account_reviewer on public.profile_documents for select to authenticated
  using (public.has_panel_permission('account_activation'));

drop policy if exists profile_documents_storage_account_reviewer on storage.objects;
create policy profile_documents_storage_account_reviewer on storage.objects for select to authenticated
  using (bucket_id='profile-documents' and public.has_panel_permission('account_activation'));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text; v_name text; v_organization text;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  update public.profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel,full_name,coalesce(nullif(company_name,''),full_name) into v_phone,v_email,v_channel,v_name,v_organization;
  if not found then raise exception 'user_not_found'; end if;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into public.notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,
      jsonb_build_object('full_name',v_name,'organization_name',v_organization)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then
    perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,
      jsonb_build_object('full_name',v_name,'organization_name',v_organization));
  end if;
end $$;

create or replace function public.review_user_account(p_user_id uuid,p_approved boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and requires_account_approval and signup_completed_at is not null) then
    raise exception 'registration_not_ready_for_review';
  end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected',rejection_reason=trim(p_reason),activated_at=null where id=p_user_id;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;

create or replace function public._enqueue_team_lifecycle_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_phone text; v_team text; v_league text; v_reason text; v_template text; v_key text;
begin
  select p.phone,t.name,l.name into v_phone,v_team,v_league
  from public.teams t join public.profiles p on p.id=t.captain_id join public.leagues l on l.id=t.league_id
  where t.id=new.team_id;
  if not public.is_real_phone(v_phone) then return new; end if;

  if new.stage='confirmed' and old.stage is distinct from new.stage then
    v_template:='attendance_permit_issued'; v_key:='attendance_permit_issued:'||new.team_id::text;
  elsif new.technical_status='rejected' and old.technical_status is distinct from new.technical_status then
    v_template:='team_correction_required'; v_reason:=coalesce(new.technical_rejection_reason,'نیاز به اصلاح مدارک فنی');
    v_key:='team_correction_required:technical:'||new.team_id::text||':'||extract(epoch from new.updated_at)::bigint::text;
  elsif new.stage='rules' and old.stage is distinct from new.stage then
    v_template:='team_review_approved'; v_key:='team_review_approved:'||new.team_id::text;
  else return new;
  end if;
  if public.sms_template_enabled(v_template) then
    insert into public.notification_log(team_id,channel,template_key,phone,status,idempotency_key,meta)
    values(new.team_id,'sms',v_template,v_phone,'pending',v_key,
      jsonb_build_object('team_name',v_team,'league_name',v_league,'reason',v_reason,'next_step','تأیید قوانین و پرداخت','permit_code',new.id::text))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists enqueue_team_lifecycle_sms on public.team_attendance_clearances;
create trigger enqueue_team_lifecycle_sms after update of stage,technical_status on public.team_attendance_clearances
for each row execute function public._enqueue_team_lifecycle_sms();

create or replace function public._enqueue_member_rejection_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_phone text; v_team text; v_league text;
begin
  if new.review_status='rejected' and old.review_status is distinct from new.review_status then
    select p.phone,t.name,l.name into v_phone,v_team,v_league from public.teams t
      join public.profiles p on p.id=t.captain_id join public.leagues l on l.id=t.league_id where t.id=new.team_id;
    if public.is_real_phone(v_phone) and public.sms_template_enabled('team_correction_required') then
      insert into public.notification_log(team_id,channel,template_key,phone,status,idempotency_key,meta)
      values(new.team_id,'sms','team_correction_required',v_phone,'pending',
        'team_correction_required:member:'||new.id::text||':'||extract(epoch from clock_timestamp())::bigint::text,
        jsonb_build_object('team_name',v_team,'league_name',v_league,'reason',coalesce(new.rejection_reason,'نقص اطلاعات یکی از اعضای تیم')))
      on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enqueue_member_rejection_sms on public.team_members;
create trigger enqueue_member_rejection_sms after update of review_status on public.team_members
for each row execute function public._enqueue_member_rejection_sms();

grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

create or replace function public._require_approved_participant_account()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_blocked boolean;
begin
  if auth.uid() is null or public.is_super_admin() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select coalesce(requires_account_approval,false) and account_status<>'active' into v_blocked
    from public.profiles where id=auth.uid();
  if coalesce(v_blocked,false) then raise exception 'account_approval_required'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

drop trigger if exists require_approved_account_teams on public.teams;
create trigger require_approved_account_teams before insert or update or delete on public.teams
for each row execute function public._require_approved_participant_account();
drop trigger if exists require_approved_account_team_members on public.team_members;
create trigger require_approved_account_team_members before insert or update or delete on public.team_members
for each row execute function public._require_approved_participant_account();
drop trigger if exists require_approved_account_companies on public.companies;
create trigger require_approved_account_companies before insert or update or delete on public.companies
for each row execute function public._require_approved_participant_account();

create or replace function public._protect_account_approval_state()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is distinct from old.id or public.is_super_admin() then return new; end if;
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

drop trigger if exists protect_account_approval_state on public.profiles;
create trigger protect_account_approval_state before update on public.profiles
for each row execute function public._protect_account_approval_state();

drop policy if exists profile_docs_approval_gate on public.profile_documents;
create policy profile_docs_approval_gate on public.profile_documents as restrictive for all to authenticated
  using (user_id<>auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and (not p.requires_account_approval or p.signup_completed_at is null or p.account_status='rejected')))
  with check (user_id<>auth.uid() or exists(select 1 from public.profiles p where p.id=auth.uid() and (not p.requires_account_approval or p.signup_completed_at is null or p.account_status='rejected')));

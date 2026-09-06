-- Account reviewers must see legacy pending accounts as well as new gated registrations.
drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (account_status in ('pending','rejected') and public.has_panel_permission('account_activation')));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text; v_name text; v_organization text; v_requires boolean; v_completed timestamptz;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  select requires_account_approval,signup_completed_at into v_requires,v_completed from public.profiles where id=p_user_id;
  if not found then raise exception 'user_not_found'; end if;
  if v_requires and v_completed is null then raise exception 'registration_not_ready_for_review'; end if;
  update public.profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel,full_name,coalesce(nullif(company_name,''),full_name) into v_phone,v_email,v_channel,v_name,v_organization;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into public.notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,jsonb_build_object('full_name',v_name,'organization_name',v_organization)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,jsonb_build_object('full_name',v_name,'organization_name',v_organization)); end if;
end $$;

create or replace function public.review_user_account(p_user_id uuid,p_approved boolean,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then raise exception 'user_not_found'; end if;
  if v_profile.account_status not in ('pending','rejected') then raise exception 'account_not_pending_review'; end if;
  if v_profile.requires_account_approval and v_profile.signup_completed_at is null then raise exception 'registration_not_ready_for_review'; end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected',rejection_reason=trim(p_reason),activated_at=null where id=p_user_id;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;

grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

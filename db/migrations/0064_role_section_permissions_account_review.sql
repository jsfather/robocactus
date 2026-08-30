create table if not exists public.role_section_permissions (
  role_key text not null,
  section_key text not null,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role_key, section_key),
  check (role_key in ('support', 'finance', 'operations', 'judge')),
  check (section_key in ('tickets', 'chat', 'triage', 'account_activation', 'finance', 'team_review'))
);

insert into public.role_section_permissions(role_key, section_key, is_enabled) values
  ('support','tickets',true), ('support','chat',true),
  ('finance','finance',true),
  ('operations','triage',true), ('operations','account_activation',true),
  ('judge','team_review',true)
on conflict do nothing;

alter table public.role_section_permissions enable row level security;
drop policy if exists role_section_permissions_read on public.role_section_permissions;
create policy role_section_permissions_read on public.role_section_permissions for select to authenticated using (true);
drop policy if exists role_section_permissions_manage on public.role_section_permissions;
create policy role_section_permissions_manage on public.role_section_permissions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.has_panel_permission(p_section text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles p
    join public.role_section_permissions rp
      on rp.role_key = case when p.role='league_admin' then 'judge' else coalesce(p.staff_department,'operations') end
     and rp.section_key=p_section and rp.is_enabled
    where p.id=auth.uid() and p.role in ('staff','league_admin')
  )
$$;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated
  using (id=auth.uid() or public.is_super_admin() or (account_status='pending' and public.has_panel_permission('account_activation')));

create or replace function public.activate_user_account(p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_phone text; v_email text; v_channel text;
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  update profiles set account_status='active',activated_at=now(),rejection_reason=null where id=p_user_id
    returning phone,email,auth_channel into v_phone,v_email,v_channel;
  if not found then raise exception 'user_not_found'; end if;
  if public.is_real_phone(v_phone) and public.sms_template_enabled('account_approved') then
    insert into notification_log(channel,template_key,phone,status,idempotency_key,meta)
    values('sms','account_approved',v_phone,'pending','account_approved:'||p_user_id::text,jsonb_build_object('user_id',p_user_id)) on conflict do nothing;
  end if;
  if v_email is not null or v_channel='email' then perform public.enqueue_user_email(p_user_id,'account_approved','account_approved_email:'||p_user_id::text,jsonb_build_object('user_id',p_user_id)); end if;
end $$;

grant select on public.role_section_permissions to authenticated;
grant execute on function public.has_panel_permission(text) to authenticated;
grant execute on function public.activate_user_account(uuid) to authenticated;

create or replace function public.review_user_account(p_user_id uuid, p_approved boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.has_panel_permission('account_activation') then raise exception 'forbidden'; end if;
  if p_approved then
    perform public.activate_user_account(p_user_id);
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
    update public.profiles set account_status='rejected', rejection_reason=trim(p_reason), activated_at=null where id=p_user_id;
    if not found then raise exception 'user_not_found'; end if;
  end if;
  return jsonb_build_object('id',p_user_id,'account_status',case when p_approved then 'active' else 'rejected' end);
end $$;
grant execute on function public.review_user_account(uuid,boolean,text) to authenticated;

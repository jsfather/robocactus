-- Phase 3: super-admin helpers for roles and league admin assignment

create or replace function public.set_user_role(p_user_id uuid, p_role user_role)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile profiles%rowtype;
  v_super_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_profile from profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found';
  end if;

  if v_profile.role = 'super_admin' and p_role <> 'super_admin' then
    select count(*) into v_super_count from profiles where role = 'super_admin';
    if v_super_count <= 1 then
      raise exception 'cannot demote the last super_admin';
    end if;
  end if;

  update profiles
  set role = p_role
  where id = p_user_id
  returning * into v_profile;

  return v_profile;
end;
$$;

revoke all on function public.set_user_role from public;
grant execute on function public.set_user_role to authenticated;

create or replace function public.assign_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'user not found';
  end if;

  if not exists (select 1 from leagues where id = p_league_id) then
    raise exception 'league not found';
  end if;

  insert into league_admins (league_id, user_id)
  values (p_league_id, p_user_id)
  on conflict do nothing;

  update profiles
  set role = 'league_admin'
  where id = p_user_id
    and role = 'team_captain';
end;
$$;

revoke all on function public.assign_league_admin from public;
grant execute on function public.assign_league_admin to authenticated;

create or replace function public.remove_league_admin(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  delete from league_admins
  where league_id = p_league_id and user_id = p_user_id;

  select count(*) into v_remaining
  from league_admins
  where user_id = p_user_id;

  if v_remaining = 0 then
    update profiles
    set role = 'team_captain'
    where id = p_user_id
      and role = 'league_admin';
  end if;
end;
$$;

revoke all on function public.remove_league_admin from public;
grant execute on function public.remove_league_admin to authenticated;

-- Allow super_admin to select all profiles even if other policies overlap (already covered)
-- Ensure inactive leagues can be managed (already covered by leagues_super_admin_all)

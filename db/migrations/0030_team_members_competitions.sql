-- Richer team members + review status + profile admin edits

alter table team_members
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists education text,
  add column if not exists national_id_doc_path text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists rejection_reason text;

alter table team_members drop constraint if exists team_members_review_status_check;
alter table team_members
  add constraint team_members_review_status_check
  check (review_status in ('pending', 'approved', 'rejected'));

update team_members
set
  first_name = coalesce(nullif(trim(first_name), ''), split_part(full_name, ' ', 1)),
  last_name = coalesce(
    nullif(trim(last_name), ''),
    nullif(trim(regexp_replace(full_name, '^\S+\s*', '')), '')
  )
where first_name is null or last_name is null;

alter table documents
  add column if not exists team_member_id uuid references team_members(id) on delete set null;

create or replace function public.review_team_member(
  p_member_id uuid,
  p_status text,
  p_reason text default null
)
returns team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row team_members%rowtype;
  v_league_id uuid;
begin
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'invalid_status';
  end if;

  select t.league_id into v_league_id
  from team_members tm
  join teams t on t.id = tm.team_id
  where tm.id = p_member_id;

  if v_league_id is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = v_league_id and la.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden';
  end if;

  update team_members
  set
    review_status = p_status,
    rejection_reason = case when p_status = 'rejected' then nullif(trim(p_reason), '') else null end
  where id = p_member_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.review_team_member from public;
grant execute on function public.review_team_member to authenticated;

create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_full_name text default null,
  p_phone text default null,
  p_national_id text default null,
  p_address text default null,
  p_company_name text default null,
  p_company_national_id text default null,
  p_economic_code text default null,
  p_email text default null
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row profiles%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  update profiles
  set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    national_id = case when p_national_id is null then national_id else nullif(trim(p_national_id), '') end,
    address = case when p_address is null then address else nullif(trim(p_address), '') end,
    company_name = case when p_company_name is null then company_name else nullif(trim(p_company_name), '') end,
    company_national_id = case when p_company_national_id is null then company_national_id else nullif(trim(p_company_national_id), '') end,
    economic_code = case when p_economic_code is null then economic_code else nullif(trim(p_economic_code), '') end,
    email = case when p_email is null then email else nullif(trim(lower(p_email)), '') end
  where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_profile from public;
grant execute on function public.admin_update_profile to authenticated;

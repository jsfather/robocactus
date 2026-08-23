-- Fix infinite recursion on company_members RLS
-- Run in Supabase SQL Editor

create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.is_owner = true
  );
$$;

revoke all on function public.is_company_member(uuid) from public;
revoke all on function public.is_company_owner(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.is_company_owner(uuid) to authenticated;

drop policy if exists "company_members_select" on company_members;
drop policy if exists "company_members_manage" on company_members;

create policy "company_members_select"
  on company_members for select using (
    user_id = auth.uid()
    or public.is_company_member(company_id)
    or public.is_super_admin()
  );

create policy "company_members_manage"
  on company_members for all using (
    public.is_company_owner(company_id)
    or public.is_super_admin()
  )
  with check (
    public.is_company_owner(company_id)
    or public.is_super_admin()
    or user_id = auth.uid()
  );

-- Keep companies policies consistent (non-recursive via helpers)
drop policy if exists "companies_manage" on companies;
create policy "companies_manage"
  on companies for all using (
    public.is_company_member(id)
    or public.is_super_admin()
  )
  with check (
    public.is_company_member(id)
    or public.is_super_admin()
  );

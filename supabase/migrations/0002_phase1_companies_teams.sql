-- Phase 1: company ownership helpers, captain invites, logos bucket

-- One team per company per league
alter table teams
  add constraint teams_company_league_unique unique (company_id, league_id);

-- Pending captain invitations (phone may not have an account yet)
create table captain_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  phone text not null,
  full_name_hint text,
  invited_by uuid not null references profiles(id),
  accepted_at timestamptz,
  created_at timestamptz default now(),
  unique (team_id)
);

create index captain_invites_phone_idx on captain_invites (phone);

alter table captain_invites enable row level security;

create policy "captain_invites_select"
  on captain_invites for select using (
    invited_by = auth.uid()
    or exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
    )
    or public.is_super_admin()
  );

create policy "captain_invites_insert"
  on captain_invites for insert with check (
    invited_by = auth.uid()
    and exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
  );

create policy "captain_invites_update"
  on captain_invites for update using (
    public.is_super_admin()
    or exists (
      select 1 from company_members cm
      where cm.company_id = captain_invites.company_id
        and cm.user_id = auth.uid()
        and cm.is_owner = true
    )
  );

-- Atomic company create + owner membership + role bump
create or replace function public.create_company(
  p_name text,
  p_slug text,
  p_bio text default null,
  p_founded_year integer default null,
  p_website text default null,
  p_logo_url text default null
)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company companies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into companies (name, slug, bio, founded_year, website, logo_url)
  values (p_name, p_slug, p_bio, p_founded_year, p_website, p_logo_url)
  returning * into v_company;

  insert into company_members (company_id, user_id, is_owner)
  values (v_company.id, auth.uid(), true);

  update profiles
  set role = 'company_admin'
  where id = auth.uid()
    and role = 'team_captain';

  return v_company;
end;
$$;

revoke all on function public.create_company from public;
grant execute on function public.create_company to authenticated;

-- Resolve captain by phone, or queue invite (returns profile id to use as captain)
create or replace function public.resolve_team_captain(
  p_company_id uuid,
  p_phone text,
  p_full_name_hint text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_captain_id uuid;
  v_phone text := trim(p_phone);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = v_uid
      and cm.is_owner = true
  ) and not public.is_super_admin() then
    raise exception 'not company owner';
  end if;

  select id into v_captain_id
  from profiles
  where phone = v_phone
  limit 1;

  if v_captain_id is not null then
    update profiles
    set role = case
      when role = 'team_captain' then 'team_captain'::user_role
      else role
    end
    where id = v_captain_id;

    return v_captain_id;
  end if;

  -- No account yet: company owner acts as interim captain; invite stored by caller with team_id
  return v_uid;
end;
$$;

revoke all on function public.resolve_team_captain from public;
grant execute on function public.resolve_team_captain to authenticated;

-- Lookup whether a phone already has a profile (for UI feedback)
create or replace function public.profile_exists_by_phone(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where phone = trim(p_phone));
$$;

revoke all on function public.profile_exists_by_phone from public;
grant execute on function public.profile_exists_by_phone to authenticated;

-- When invited user signs up, assign them as captain on matching teams
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_invite captain_invites%rowtype;
begin
  v_phone := coalesce(new.raw_user_meta_data->>'phone', new.phone, new.id::text);

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'کاربر جدید'),
    v_phone,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'team_captain')
  );

  for v_invite in
    select * from captain_invites
    where phone = v_phone and accepted_at is null and team_id is not null
  loop
    update teams
    set captain_id = new.id
    where id = v_invite.team_id;

    update captain_invites
    set accepted_at = now()
    where id = v_invite.id;
  end loop;

  return new;
end;
$$;

-- Public company logos bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos',
  'company-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "company_logos_public_select"
  on storage.objects for select using (bucket_id = 'company-logos');

create policy "company_logos_insert"
  on storage.objects for insert with check (
    bucket_id = 'company-logos'
    and auth.uid() is not null
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "company_logos_update"
  on storage.objects for update using (
    bucket_id = 'company-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "company_logos_delete"
  on storage.objects for delete using (
    bucket_id = 'company-logos'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_super_admin()
    )
  );

-- Allow company owners to update own company after membership exists (already covered)
-- Allow team captains to update draft teams they captain (already covered)

-- Staff/league can still select teams; company_admin update via membership

grant usage on schema public to authenticated;

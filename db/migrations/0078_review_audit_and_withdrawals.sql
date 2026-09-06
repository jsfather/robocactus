-- Auditable account/team reviews and participant withdrawal workflow.
alter table public.profiles
  add column if not exists account_reviewed_at timestamptz,
  add column if not exists account_reviewed_by uuid references public.profiles(id) on delete set null;

drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_account_review_select on public.profiles for select to authenticated using (
  id=auth.uid() or public.is_super_admin()
  or (public.has_panel_permission('account_activation') and signup_completed_at is not null)
);

create table if not exists public.review_audit_log (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('account','team_member','technical_files','withdrawal')),
  subject_id uuid not null,
  team_id uuid references public.teams(id) on delete cascade,
  action text not null,
  reason text,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);
create index if not exists review_audit_subject_idx on public.review_audit_log(subject_type,subject_id,reviewed_at desc);
create index if not exists review_audit_team_idx on public.review_audit_log(team_id,reviewed_at desc);

alter table public.league_attendance_settings
  add column if not exists withdrawal_enabled boolean not null default false,
  add column if not exists withdrawal_deadline timestamptz,
  add column if not exists withdrawal_terms_fa text not null default '',
  add column if not exists withdrawal_terms_en text not null default '';

create table if not exists public.team_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 10 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists team_withdrawal_open_uidx on public.team_withdrawal_requests(team_id) where status='pending';

alter table public.review_audit_log enable row level security;
alter table public.team_withdrawal_requests enable row level security;
create policy review_audit_read on public.review_audit_log for select to authenticated using (
  public.is_super_admin() or public.has_panel_permission('account_activation') or public.has_panel_permission('team_review')
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=review_audit_log.team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (subject_type='account' and subject_id=auth.uid())
);
create policy withdrawal_read on public.team_withdrawal_requests for select to authenticated using (
  public.is_super_admin() or public.has_panel_permission('team_review')
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
);

create or replace function public._audit_account_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.account_status is distinct from old.account_status and new.account_status in ('active','rejected') then
    new.account_reviewed_at:=now(); new.account_reviewed_by:=auth.uid();
    insert into public.review_audit_log(subject_type,subject_id,action,reason,reviewer_id)
    values('account',new.id,new.account_status,new.rejection_reason,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists audit_account_review on public.profiles;
create trigger audit_account_review before update of account_status on public.profiles for each row execute function public._audit_account_review();

create or replace function public._audit_member_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.review_status is distinct from old.review_status and new.review_status in ('approved','rejected') then
    insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id,reviewed_at)
    values('team_member',new.id,new.team_id,new.review_status,new.rejection_reason,new.reviewed_by,coalesce(new.reviewed_at,now()));
  end if; return new;
end $$;
drop trigger if exists audit_member_review on public.team_members;
create trigger audit_member_review after update of review_status on public.team_members for each row execute function public._audit_member_review();

create or replace function public._audit_technical_review() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.technical_status is distinct from old.technical_status and new.technical_status in ('approved','rejected') then
    insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id,reviewed_at)
    values('technical_files',new.team_id,new.team_id,new.technical_status,new.technical_rejection_reason,new.technical_reviewed_by,coalesce(new.technical_reviewed_at,now()));
  end if; return new;
end $$;
drop trigger if exists audit_technical_review on public.team_attendance_clearances;
create trigger audit_technical_review after update of technical_status on public.team_attendance_clearances for each row execute function public._audit_technical_review();

create or replace function public.request_team_withdrawal(p_team_id uuid,p_reason text)
returns public.team_withdrawal_requests language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_setting public.league_attendance_settings%rowtype; v_row public.team_withdrawal_requests%rowtype;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if not (v_team.captain_id=auth.uid() or exists(select 1 from public.company_members where company_id=v_team.company_id and user_id=auth.uid())) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.team_attendance_clearances where team_id=p_team_id and stage='confirmed') then raise exception 'clearance_required'; end if;
  select * into v_setting from public.league_attendance_settings where league_id=v_team.league_id;
  if not coalesce(v_setting.withdrawal_enabled,false) then raise exception 'withdrawal_disabled'; end if;
  if v_setting.withdrawal_deadline is not null and now()>v_setting.withdrawal_deadline then raise exception 'withdrawal_deadline_passed'; end if;
  if length(trim(coalesce(p_reason,'')))<10 then raise exception 'withdrawal_reason_too_short'; end if;
  insert into public.team_withdrawal_requests(team_id,league_id,requested_by,reason) values(p_team_id,v_team.league_id,auth.uid(),trim(p_reason)) returning * into v_row;
  return v_row;
end $$;

create or replace function public.review_team_withdrawal(p_request_id uuid,p_approved boolean,p_reason text default null)
returns public.team_withdrawal_requests language plpgsql security definer set search_path=public as $$
declare v_row public.team_withdrawal_requests%rowtype;
begin
  select * into v_row from public.team_withdrawal_requests where id=p_request_id for update;
  if not found then raise exception 'withdrawal_not_found'; end if;
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_row.league_id and user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if v_row.status<>'pending' then raise exception 'withdrawal_already_reviewed'; end if;
  if not p_approved and length(trim(coalesce(p_reason,'')))<3 then raise exception 'rejection_reason_required'; end if;
  update public.team_withdrawal_requests set status=case when p_approved then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_reason=nullif(trim(p_reason),''),updated_at=now() where id=p_request_id returning * into v_row;
  if p_approved then update public.teams set lifecycle_status='cancelled',last_activity_at=now() where id=v_row.team_id; end if;
  insert into public.review_audit_log(subject_type,subject_id,team_id,action,reason,reviewer_id) values('withdrawal',v_row.id,v_row.team_id,v_row.status,v_row.review_reason,auth.uid());
  return v_row;
end $$;

revoke all on function public.request_team_withdrawal(uuid,text),public.review_team_withdrawal(uuid,boolean,text) from public;
grant execute on function public.request_team_withdrawal(uuid,text),public.review_team_withdrawal(uuid,boolean,text) to authenticated;

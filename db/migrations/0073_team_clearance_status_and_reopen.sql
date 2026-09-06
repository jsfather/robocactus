-- Clearance is derived from the full dossier. Reopening is deadline-bound and audited.

alter table public.team_attendance_clearances
  add column if not exists edit_reopened_at timestamptz,
  add column if not exists edit_reopened_by uuid references public.profiles(id) on delete set null;

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status=old.lifecycle_status then return new; end if;
  if new.lifecycle_status='cancelled' then return new; end if;
  if old.lifecycle_status='completed' and new.lifecycle_status='incomplete' and not exists(select 1 from public.team_members where team_id=new.id) then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents') and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status='awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_technical_review' and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_rules' and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status='awaiting_payment' and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%',old.lifecycle_status,new.lifecycle_status;
end $$;

create table if not exists public.team_registration_change_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  entity_type text not null check (entity_type in ('team','member','document','flow')),
  entity_id uuid,
  change_kind text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists team_registration_change_log_team_idx
  on public.team_registration_change_log(team_id,changed_at desc);
alter table public.team_registration_change_log enable row level security;
drop policy if exists team_registration_change_log_read on public.team_registration_change_log;
create policy team_registration_change_log_read on public.team_registration_change_log for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid()))
);

create or replace function public._log_team_registration_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_team_id uuid; v_entity text;
begin
  v_entity:=case tg_table_name when 'team_members' then 'member' when 'documents' then 'document' else 'team' end;
  v_team_id:=case when tg_op='DELETE' then old.team_id else new.team_id end;
  if tg_table_name='teams' then v_team_id:=case when tg_op='DELETE' then old.id else new.id end; end if;
  if v_team_id is null or not exists(select 1 from public.team_attendance_clearances c where c.team_id=v_team_id) then return coalesce(new,old); end if;
  insert into public.team_registration_change_log(team_id,entity_type,entity_id,change_kind,before_data,after_data,changed_by)
  values(v_team_id,v_entity,case when tg_op='DELETE' then old.id else new.id end,lower(tg_op),case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end,auth.uid());
  return coalesce(new,old);
end $$;
drop trigger if exists log_team_member_registration_change on public.team_members;
create trigger log_team_member_registration_change after insert or update or delete on public.team_members for each row execute function public._log_team_registration_change();
drop trigger if exists log_team_document_registration_change on public.documents;
create trigger log_team_document_registration_change after insert or update or delete on public.documents for each row execute function public._log_team_registration_change();

create or replace function public.reopen_team_registration_for_edit(p_team_id uuid)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_deadline timestamptz;
begin
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  select team_edit_deadline into v_deadline from public.leagues where id=v_team.league_id;
  if not (v_team.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=v_team.company_id and cm.user_id=auth.uid())) then raise exception 'forbidden'; end if;
  if v_deadline is not null and v_deadline<now() then raise exception 'team_edit_deadline_passed'; end if;
  if exists(select 1 from public.team_attendance_clearances c where c.team_id=p_team_id and c.stage='confirmed') then raise exception 'clearance_already_issued'; end if;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,edit_reopened_at=now(),edit_reopened_by=auth.uid(),updated_at=now() where team_id=p_team_id;
  update public.team_members set review_status='pending',rejection_reason=null where team_id=p_team_id;
  update public.teams set status='draft',rejection_reason=null,reviewed_at=null,reviewed_by=null,lifecycle_status='incomplete',registration_stage='members',registration_progress=22,last_activity_at=now() where id=p_team_id returning * into v_team;
  insert into public.team_registration_change_log(team_id,entity_type,entity_id,change_kind,after_data,changed_by)
    values(p_team_id,'flow',p_team_id,'reopened_for_edit',jsonb_build_object('deadline',v_deadline),auth.uid());
  return v_team;
end $$;

create or replace function public._protect_reviewed_member_edits()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_reviewer boolean; v_reopened boolean;
begin
  v_reviewer:=public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=old.team_id and la.user_id=auth.uid()));
  select exists(select 1 from public.team_attendance_clearances c join public.teams t on t.id=c.team_id join public.leagues l on l.id=t.league_id where c.team_id=old.team_id and c.edit_reopened_at is not null and (l.team_edit_deadline is null or l.team_edit_deadline>=now())) into v_reopened;
  if not v_reviewer and exists(select 1 from public.team_attendance_clearances where team_id=old.team_id) and (
    old.first_name_fa is distinct from new.first_name_fa or old.last_name_fa is distinct from new.last_name_fa or old.first_name_en is distinct from new.first_name_en or old.last_name_en is distinct from new.last_name_en or old.national_id is distinct from new.national_id or old.birth_date is distinct from new.birth_date or old.role is distinct from new.role or old.phone is distinct from new.phone or old.national_id_doc_path is distinct from new.national_id_doc_path or old.photo_url is distinct from new.photo_url
  ) and old.review_status<>'rejected' and not v_reopened then raise exception 'member_edit_not_allowed'; end if;
  return new;
end $$;

-- Close the edit window as soon as the dossier is submitted again.
create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  perform public.sync_team_attendance(p_team_id);
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),edit_reopened_at=null,edit_reopened_by=null,updated_at=now() where team_id=p_team_id returning * into v_row;
  update public.teams set status='under_review',rejection_reason=null,lifecycle_status='awaiting_review',registration_stage='technical_review',registration_progress=60,last_activity_at=now() where id=p_team_id;
  return v_row;
end $$;

create or replace function public._sync_team_status_from_clearance(p_team_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_flow public.team_attendance_clearances%rowtype; v_rejected boolean; v_pending boolean; v_has_members boolean;
begin
  select * into v_flow from public.team_attendance_clearances where team_id=p_team_id;
  if not found then return; end if;
  select exists(select 1 from public.team_members where team_id=p_team_id),exists(select 1 from public.team_members where team_id=p_team_id and review_status='rejected'),exists(select 1 from public.team_members where team_id=p_team_id and review_status='pending') into v_has_members,v_rejected,v_pending;
  update public.teams set
    status=case when not v_has_members then 'draft'::public.registration_status when v_flow.stage='confirmed' then 'approved'::public.registration_status when v_rejected or v_flow.technical_status='rejected' then 'rejected'::public.registration_status when v_pending or v_flow.technical_status='pending' then 'under_review'::public.registration_status else status end,
    lifecycle_status=case when not v_has_members then 'incomplete' when v_flow.stage='confirmed' then 'completed' else lifecycle_status end,
    registration_stage=case when not v_has_members then 'members' when v_flow.stage='confirmed' then 'completed' else registration_stage end,
    registration_progress=case when not v_has_members then 22 when v_flow.stage='confirmed' then 100 else registration_progress end,
    rejection_reason=case when v_flow.technical_status='rejected' then v_flow.technical_rejection_reason when v_flow.stage='confirmed' then null else rejection_reason end,
    reviewed_at=case when v_flow.stage='confirmed' then now() else reviewed_at end
  where id=p_team_id;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_row public.team_attendance_clearances%rowtype; v_paid boolean:=false; v_members_ok boolean:=false; v_enabled boolean:=true;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  insert into public.league_attendance_settings(league_id) values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id) on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();
  select coalesce(enabled,true) into v_enabled from public.league_attendance_settings where league_id=v_team.league_id;
  select exists(select 1 from public.invoices i where i.team_id=p_team_id and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)) into v_paid;
  select exists(select 1 from public.team_members where team_id=p_team_id) and not exists(select 1 from public.team_members where team_id=p_team_id and review_status<>'approved') into v_members_ok;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not coalesce(v_enabled,true) then
    update public.team_attendance_clearances set stage=case when v_paid then 'confirmed' else 'payment' end,rules_accepted_at=coalesce(rules_accepted_at,now()),confirmed_at=case when v_paid then coalesce(confirmed_at,now()) else null end,updated_at=now() where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;
  update public.team_attendance_clearances set
    stage=case
      when v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then 'confirmed'
      when v_members_ok and technical_status='approved' and rules_accepted_at is not null then 'payment'
      when v_members_ok and technical_status='approved' then 'rules'
      when not v_members_ok then 'members'
      else 'technical'
    end,
    confirmed_at=case when v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then coalesce(confirmed_at,now()) else null end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public._attendance_after_member_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_team_attendance(new.team_id);
  perform public._sync_team_status_from_clearance(new.team_id);
  return new;
end $$;

create or replace function public._attendance_sync_derived_team_status()
returns trigger language plpgsql security definer set search_path=public as $$ begin perform public._sync_team_status_from_clearance(new.team_id); return new; end $$;
drop trigger if exists attendance_sync_derived_team_status on public.team_attendance_clearances;
create trigger attendance_sync_derived_team_status after insert or update of stage,technical_status on public.team_attendance_clearances for each row execute function public._attendance_sync_derived_team_status();

create or replace function public.review_team(p_team_id uuid,p_status public.registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype;
begin
  if p_status<>'under_review' then raise exception 'team_status_is_automatic'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  if not (public.is_super_admin() or (public.has_panel_permission('triage')) or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_team.league_id and user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not exists(select 1 from public.team_members where team_id=p_team_id) then raise exception 'team_members_required'; end if;
  update public.teams set status='under_review',rejection_reason=null,reviewed_at=null,reviewed_by=null,last_activity_at=now() where id=p_team_id returning * into v_team;
  return v_team;
end $$;

revoke all on function public.reopen_team_registration_for_edit(uuid) from public;
grant execute on function public.reopen_team_registration_for_edit(uuid) to authenticated;

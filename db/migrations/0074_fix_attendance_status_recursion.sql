-- Break the clearance <-> team status trigger loop introduced by 0073.

drop trigger if exists attendance_sync_derived_team_status on public.team_attendance_clearances;

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
    reviewed_at=case when v_flow.stage='confirmed' then coalesce(reviewed_at,now()) else reviewed_at end
  where id=p_team_id and (
    status is distinct from (case when not v_has_members then 'draft'::public.registration_status when v_flow.stage='confirmed' then 'approved'::public.registration_status when v_rejected or v_flow.technical_status='rejected' then 'rejected'::public.registration_status when v_pending or v_flow.technical_status='pending' then 'under_review'::public.registration_status else status end)
    or lifecycle_status is distinct from (case when not v_has_members then 'incomplete' when v_flow.stage='confirmed' then 'completed' else lifecycle_status end)
    or registration_stage is distinct from (case when not v_has_members then 'members' when v_flow.stage='confirmed' then 'completed' else registration_stage end)
    or registration_progress is distinct from (case when not v_has_members then 22 when v_flow.stage='confirmed' then 100 else registration_progress end)
  );
end $$;

create or replace function public._attendance_after_team_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status is distinct from new.status and exists(select 1 from public.invoices where team_id=new.id and (status='paid' or amount<=0)) then
    perform public.sync_team_attendance(new.id);
  end if;
  return new;
end $$;

create or replace function public._attendance_after_payment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='paid' and old.status is distinct from new.status then
    perform public.sync_team_attendance(new.team_id);
    perform public._sync_team_status_from_clearance(new.team_id);
  end if;
  return new;
end $$;

create or replace function public.get_or_create_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null or public.is_super_admin()
      or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid())))) then raise exception 'forbidden'; end if;
  insert into public.league_attendance_settings(league_id) select league_id from public.teams where id=p_team_id on conflict(league_id) do nothing;
  select * into v_row from public.sync_team_attendance(p_team_id);
  perform public._sync_team_status_from_clearance(p_team_id);
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  perform public._sync_team_status_from_clearance(p_team_id);
  update public.teams set lifecycle_status=case when p_approved and v_row.stage='rules' then 'awaiting_rules' else 'awaiting_review' end,registration_stage=case when p_approved and v_row.stage='rules' then 'rules' else 'technical_review' end,registration_progress=case when p_approved and v_row.stage='rules' then 72 else 60 end,last_activity_at=now() where id=p_team_id;
  return v_row;
end $$;

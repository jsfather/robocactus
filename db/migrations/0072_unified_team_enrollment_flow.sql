-- Unified enrollment: team data -> review -> technical approval -> rules -> payment -> clearance.

alter table public.league_attendance_settings
  add column if not exists team_documents_enabled boolean not null default true,
  add column if not exists team_documents_notice_fa text not null default 'برای شرکت در این دوره ارائه مدارک و مستندات تیم الزامی است.',
  add column if not exists team_documents_notice_en text not null default 'Team documents are required to participate in this competition.';

drop policy if exists attendance_settings_public_read on public.league_attendance_settings;
create policy attendance_settings_public_read on public.league_attendance_settings
  for select to anon using (true);

alter table public.team_attendance_clearances drop constraint if exists team_attendance_clearances_stage_check;
alter table public.team_attendance_clearances add constraint team_attendance_clearances_stage_check
  check (stage in ('members','technical','rules','payment','confirmed'));

alter table public.teams drop constraint if exists teams_lifecycle_status_check;
alter table public.teams add constraint teams_lifecycle_status_check check (lifecycle_status in (
  'draft','incomplete','awaiting_documents','awaiting_review','awaiting_technical_review',
  'awaiting_rules','awaiting_payment','completed','cancelled'
));
alter table public.teams drop constraint if exists teams_registration_stage_check;
alter table public.teams add constraint teams_registration_stage_check check (registration_stage in (
  'team_info','members','documents','review','technical','technical_review','rules','invoice','payment','completed'
));

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status = old.lifecycle_status then return new; end if;
  if new.lifecycle_status = 'cancelled' then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents')
     and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status = 'awaiting_review'
     and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status = 'awaiting_technical_review'
     and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status = 'awaiting_rules'
     and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status = 'awaiting_payment'
     and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%', old.lifecycle_status, new.lifecycle_status;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances
language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype;
  v_row public.team_attendance_clearances%rowtype;
  v_paid boolean := false;
  v_members_ok boolean := false;
  v_enabled boolean := true;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;

  insert into public.league_attendance_settings(league_id)
  values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id)
  values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();

  select coalesce(s.enabled,true) into v_enabled
  from public.league_attendance_settings s where s.league_id=v_team.league_id;
  select exists(
    select 1 from public.invoices i where i.team_id=p_team_id
      and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)
  ) into v_paid;
  select exists(select 1 from public.team_members m where m.team_id=p_team_id)
    and not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.review_status<>'approved')
    into v_members_ok;

  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not coalesce(v_enabled,true) then
    update public.team_attendance_clearances set
      stage=case when v_paid then 'confirmed' else 'payment' end,
      rules_accepted_at=coalesce(rules_accepted_at,now()),
      confirmed_at=case when v_paid then coalesce(confirmed_at,now()) else null end,
      updated_at=now()
    where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;

  update public.team_attendance_clearances set
    stage=case
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid then 'confirmed'
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null then 'payment'
      when v_team.status='approved' and v_members_ok and technical_status='approved' then 'rules'
      when not (v_team.status='approved' and v_members_ok) then 'members'
      when technical_status in ('draft','pending','rejected') then 'technical'
      else 'members'
    end,
    confirmed_at=case
      when v_team.status='approved' and v_members_ok and technical_status='approved' and rules_accepted_at is not null and v_paid
        then coalesce(confirmed_at,now())
      else null
    end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.upsert_team_technical_file(p_team_id uuid,p_kind text,p_file_path text,p_original_name text,p_mime_type text,p_size_bytes bigint)
returns public.team_technical_files language plpgsql security definer set search_path=public as $$
declare
  v_row public.team_technical_files%rowtype;
  v_setting public.league_attendance_settings%rowtype;
  v_allowed boolean;
  v_owned boolean;
  v_status text;
  v_max bigint;
begin
  if p_kind not in ('article','robot_video') then raise exception 'invalid_file_kind'; end if;
  select exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) into v_allowed;
  if not v_allowed then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  if not found then raise exception 'attendance_settings_not_found'; end if;
  v_max:=case when p_kind='article' then coalesce(v_setting.article_max_bytes,94371840) else coalesce(v_setting.video_max_bytes,94371840) end;
  if p_size_bytes<=0 or p_size_bytes>v_max then raise exception 'file_too_large'; end if;
  if p_kind='article' and p_mime_type not in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document') then raise exception 'invalid_file_type'; end if;
  if p_kind='robot_video' and p_mime_type not in ('video/mp4','video/webm','video/quicktime') then raise exception 'invalid_file_type'; end if;
  if split_part(p_file_path,'/',1)<>p_team_id::text then raise exception 'invalid_file_reference'; end if;
  select exists(select 1 from storage.objects o where o.bucket_id='technical-submissions' and o.name=p_file_path and o.owner=auth.uid()) into v_owned;
  if not v_owned then raise exception 'invalid_file_reference'; end if;
  perform public.sync_team_attendance(p_team_id);
  select technical_status into v_status from public.team_attendance_clearances where team_id=p_team_id;
  if v_status not in ('locked','draft','rejected') then raise exception 'technical_submission_locked'; end if;
  insert into public.team_technical_files(team_id,kind,file_path,original_name,mime_type,size_bytes,uploaded_by)
  values(p_team_id,p_kind,p_file_path,left(p_original_name,255),p_mime_type,p_size_bytes,auth.uid())
  on conflict(team_id,kind) do update set file_path=excluded.file_path,original_name=excluded.original_name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,uploaded_by=auth.uid(),updated_at=now()
  returning * into v_row;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,updated_at=now() where team_id=p_team_id;
  return v_row;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  perform public.sync_team_attendance(p_team_id);
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),updated_at=now() where team_id=p_team_id returning * into v_row;
  update public.teams set status=case when status='draft' then 'submitted' else status end,
    lifecycle_status='awaiting_review',registration_stage='technical_review',registration_progress=60,last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(
    select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()
  ))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from public.team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,
    technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),updated_at=now()
  where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  update public.teams set
    lifecycle_status=case when p_approved and v_row.stage='rules' then 'awaiting_rules' else 'awaiting_review' end,
    registration_stage=case when p_approved and v_row.stage='rules' then 'rules' else 'technical_review' end,
    registration_progress=case when p_approved and v_row.stage='rules' then 72 else 60 end,
    last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_notes boolean;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select participant_note_enabled into v_notes from public.league_attendance_settings s join public.teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update public.team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),
    participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,updated_at=now()
  where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  update public.teams set lifecycle_status=case when v_row.stage='confirmed' then 'completed' else 'awaiting_payment' end,
    registration_stage=case when v_row.stage='confirmed' then 'completed' else 'invoice' end,
    registration_progress=case when v_row.stage='confirmed' then 100 else 82 end,last_activity_at=now()
  where id=p_team_id;
  return v_row;
end $$;

create or replace function public.review_team(p_team_id uuid,p_status registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_role user_role; v_missing text[]:=array[]::text[]; v_docs_enabled boolean:=true;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from public.teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  v_role:=public.current_user_role();
  if not (public.is_super_admin() or (v_role='staff' and public.has_panel_permission('triage')) or
    (v_role='league_admin' and public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=v_team.league_id and la.user_id=v_uid))) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then raise exception 'triage_can_only_mark_under_review'; end if;
  select coalesce(team_documents_enabled,true) into v_docs_enabled from public.league_attendance_settings where league_id=v_team.league_id;
  if p_status in ('under_review','approved') then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if not exists(select 1 from public.team_members m where m.team_id=p_team_id and m.role='captain') then v_missing:=array_append(v_missing,'captain'); end if;
    if exists(select 1 from public.team_members m where m.team_id=p_team_id and (nullif(trim(coalesce(m.first_name_fa,'')),'') is null or nullif(trim(coalesce(m.last_name_fa,'')),'') is null or m.birth_date is null or nullif(trim(coalesce(m.national_id_doc_path,'')),'') is null or nullif(trim(coalesce(m.photo_url,'')),'') is null)) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if v_docs_enabled and exists(select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.doc_type=r.code)) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if not exists(select 1 from public.team_attendance_clearances c where c.team_id=p_team_id and c.technical_status in ('pending','approved')) then v_missing:=array_append(v_missing,'technical_submission'); end if;
    if cardinality(v_missing)>0 then raise exception 'team_dossier_incomplete:%',array_to_string(v_missing,','); end if;
  end if;
  update public.teams set status=p_status,rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,reviewed_at=now(),reviewed_by=v_uid where id=p_team_id returning * into v_team;
  perform public.sync_team_attendance(p_team_id);
  return v_team;
end $$;

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns public.invoices language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_league public.leagues%rowtype; v_flow public.team_attendance_clearances%rowtype; v_fee numeric; v_member_count integer; v_coach_count integer; v_invoice public.invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_team from public.teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not public.is_super_admin() and not exists(select 1 from public.company_members cm where cm.company_id=v_team.company_id and cm.user_id=v_uid) and v_team.captain_id<>v_uid then raise exception 'forbidden'; end if;
  select * into v_flow from public.sync_team_attendance(p_team_id);
  if v_flow.stage not in ('payment','confirmed') or v_flow.rules_accepted_at is null then raise exception 'registration_incomplete:approval'; end if;
  select * into v_league from public.leagues where id=v_team.league_id;
  select count(*) filter(where role='member'),count(*) filter(where role='coach') into v_member_count,v_coach_count from public.team_members where team_id=p_team_id;
  v_fee:=coalesce(v_league.registration_fee,0)+coalesce(v_league.captain_fee,0)+coalesce(v_league.member_fee,0)*v_member_count+coalesce(v_league.coach_fee,0)*v_coach_count;
  select * into v_invoice from public.invoices where team_id=p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then update public.invoices set amount=v_fee,company_id=v_team.company_id,status=case when receipt_status='pending_review' then status else 'pending'::public.payment_status end,archived_at=null,updated_at=now() where id=v_invoice.id returning * into v_invoice; return v_invoice; end if;
  insert into public.invoices(team_id,company_id,amount,status,invoice_number,registration_id) values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number(),v_team.id) returning * into v_invoice;
  return v_invoice;
end $$;

revoke all on function public.sync_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.review_team(uuid,registration_status,text),public.create_invoice_for_team(uuid) from public;
grant execute on function public.get_or_create_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.create_invoice_for_team(uuid) to authenticated;

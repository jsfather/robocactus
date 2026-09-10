-- Stabilize registration/review rules. Configuration is read from the league
-- attendance row by every lifecycle function; historical documents are kept.

create or replace function public.team_registration_step_enabled(p_league_id uuid,p_step text)
returns boolean language sql stable set search_path=public as $$
  select case p_step
    when 'documents' then coalesce(s.team_documents_enabled,true)
    when 'technical' then coalesce(s.enabled,true) and (coalesce(s.article_required,true) or coalesce(s.video_required,true))
    when 'rules' then coalesce(s.enabled,true)
    else true
  end
  from (select 1) seed
  left join public.league_attendance_settings s on s.league_id=p_league_id
$$;

create or replace function public._team_person_complete_for_league(
  p_member public.team_members,
  p_league_id uuid
)
returns boolean language sql stable set search_path=public as $$
  select
    nullif(trim(coalesce(p_member.first_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.first_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.last_name_en,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_fa,'')),'') is not null
    and nullif(trim(coalesce(p_member.father_name_en,'')),'') is not null
    and p_member.birth_date is not null
    and nullif(trim(coalesce(p_member.role,'')),'') is not null
    and nullif(trim(coalesce(p_member.residence,'')),'') is not null
    and nullif(trim(coalesce(p_member.country_code,'')),'') is not null
    and nullif(trim(coalesce(p_member.nationality,'')),'') is not null
    and nullif(trim(coalesce(p_member.education_level,'')),'') is not null
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_photo' and is_active and is_required)
      or nullif(trim(coalesce(p_member.photo_url,'')),'') is not null)
    and (not exists(select 1 from public.registration_doc_types where scope='member' and code='member_identity' and is_active and is_required)
      or nullif(trim(coalesce(p_member.national_id_doc_path,'')),'') is not null)
    and (coalesce(p_member.is_foreign,false) or p_member.national_id ~ '^[0-9]{10}$')
    and (not coalesce(p_member.is_foreign,false) or nullif(trim(coalesce(p_member.passport_number,'')),'') is not null)
    and (p_member.role not in ('captain','coach') or p_member.phone ~ '^09[0-9]{9}$')
    and (p_member.role <> 'member' or not exists(
      select 1 from public.leagues l where l.id=p_league_id and (
        (l.min_age is not null and extract(year from age(current_date,p_member.birth_date)) < l.min_age)
        or (l.max_age is not null and extract(year from age(current_date,p_member.birth_date)) > l.max_age)
      )
    ))
$$;

create or replace function public._validate_team_member_age()
returns trigger language plpgsql set search_path=public as $$
declare v_min integer; v_max integer; v_age integer;
begin
  -- League participant limits intentionally apply only to ordinary members.
  if new.role is distinct from 'member' or new.birth_date is null then return new; end if;
  select l.min_age,l.max_age into v_min,v_max
  from public.teams t join public.leagues l on l.id=t.league_id where t.id=new.team_id;
  v_age:=extract(year from age(current_date,new.birth_date));
  if v_min is not null and v_age<v_min then raise exception 'member_age_below_min:%',v_min; end if;
  if v_max is not null and v_age>v_max then raise exception 'member_age_above_max:%',v_max; end if;
  return new;
end $$;
drop trigger if exists validate_team_member_age on public.team_members;
create trigger validate_team_member_age before insert or update of birth_date,team_id,role
on public.team_members for each row execute function public._validate_team_member_age();

-- Lifecycle transitions produced by the canonical clearance row may skip any
-- disabled steps. Pre-clearance wizard transitions retain the stricter matrix.
create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.lifecycle_status=old.lifecycle_status then return new; end if;
  if new.lifecycle_status='cancelled' then return new; end if;
  if new.lifecycle_status='awaiting_documents' and not public.team_registration_step_enabled(new.league_id,'documents') then raise exception 'registration_step_disabled:documents'; end if;
  if new.lifecycle_status='awaiting_technical_review' and not public.team_registration_step_enabled(new.league_id,'technical') then raise exception 'registration_step_disabled:technical'; end if;
  if new.lifecycle_status='awaiting_rules' and not public.team_registration_step_enabled(new.league_id,'rules') then raise exception 'registration_step_disabled:rules'; end if;
  if exists(
    select 1 from public.team_attendance_clearances c where c.team_id=new.id and new.lifecycle_status=case c.stage
      when 'members' then case
        when not exists(select 1 from public.team_members m where m.team_id=new.id) then 'incomplete'
        when public.team_registration_step_enabled(new.league_id,'documents') and exists(
          select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
          and not exists(select 1 from public.documents d where d.team_id=new.id and d.team_member_id is null and d.doc_type=r.code)
        ) then 'awaiting_documents'
        else 'awaiting_review'
      end
      when 'technical' then case when c.technical_status='pending' then 'awaiting_technical_review' else 'awaiting_review' end
      when 'rules' then 'awaiting_rules'
      when 'payment' then 'awaiting_payment'
      when 'confirmed' then 'completed'
    end
  ) then return new; end if;
  if old.lifecycle_status='completed' and new.lifecycle_status='incomplete' and not exists(select 1 from public.team_members where team_id=new.id) then return new; end if;
  if old.lifecycle_status in ('draft','incomplete','awaiting_documents') and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_review') then return new; end if;
  if old.lifecycle_status='awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_technical_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_technical_review' and new.lifecycle_status in ('incomplete','awaiting_review','awaiting_rules') then return new; end if;
  if old.lifecycle_status='awaiting_rules' and new.lifecycle_status in ('awaiting_review','awaiting_technical_review','awaiting_payment') then return new; end if;
  if old.lifecycle_status='awaiting_payment' and new.lifecycle_status in ('awaiting_review','awaiting_rules','completed') then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%',old.lifecycle_status,new.lifecycle_status;
end $$;

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype; v_row public.team_attendance_clearances%rowtype;
  v_paid boolean:=false; v_people_ok boolean:=false; v_members_ok boolean:=false; v_has_members boolean:=false;
  v_member_rejected boolean:=false; v_member_pending boolean:=false;
  v_attendance boolean:=true; v_technical boolean:=true; v_documents boolean:=true; v_documents_ok boolean:=true;
  v_was_confirmed boolean:=false;
begin
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  insert into public.league_attendance_settings(league_id) values(v_team.league_id) on conflict(league_id) do nothing;
  insert into public.team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id;
  select stage='confirmed' into v_was_confirmed from public.team_attendance_clearances where team_id=p_team_id;
  v_attendance:=public.team_registration_step_enabled(v_team.league_id,'rules');
  v_technical:=public.team_registration_step_enabled(v_team.league_id,'technical');
  v_documents:=public.team_registration_step_enabled(v_team.league_id,'documents');
  select exists(select 1 from public.invoices i where i.team_id=p_team_id and
    (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)) into v_paid;
  select exists(select 1 from public.team_members where team_id=p_team_id),
    exists(select 1 from public.team_members where team_id=p_team_id and review_status='rejected'),
    exists(select 1 from public.team_members m where m.team_id=p_team_id and
      (m.review_status='pending' or (not v_was_confirmed and not public._team_person_complete_for_league(m,v_team.league_id))))
    into v_has_members,v_member_rejected,v_member_pending;
  v_people_ok:=v_has_members and not v_member_rejected and not v_member_pending;
  v_documents_ok:=v_was_confirmed or not v_documents or not exists(
    select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
    and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.team_member_id is null and d.doc_type=r.code)
  );
  v_members_ok:=v_people_ok and v_documents_ok;
  update public.team_attendance_clearances set
    technical_status=case when not v_technical then 'approved' else technical_status end,
    technical_auto_approved=case when not v_technical then true else technical_auto_approved end,
    rules_accepted_at=case when not v_attendance then coalesce(rules_accepted_at,now()) else rules_accepted_at end,
    stage=case
      when v_members_ok and (not v_technical or technical_status='approved') and
        (not v_attendance or rules_accepted_at is not null) and v_paid then 'confirmed'
      when v_members_ok and (not v_technical or technical_status='approved') and
        (not v_attendance or rules_accepted_at is not null) then 'payment'
      when v_members_ok and (not v_technical or technical_status='approved') then 'rules'
      when not v_members_ok then 'members'
      else 'technical'
    end,
    confirmed_at=case when v_members_ok and (not v_technical or technical_status='approved') and
      (not v_attendance or rules_accepted_at is not null) and v_paid then coalesce(confirmed_at,now()) else null end,
    updated_at=now()
  where team_id=p_team_id returning * into v_row;

  update public.teams set
    status=case
      when not v_has_members or (v_people_ok and not v_documents_ok) then 'draft'::public.registration_status
      when v_member_rejected or v_row.technical_status='rejected' then 'rejected'::public.registration_status
      when v_member_pending or v_row.technical_status='pending' then 'under_review'::public.registration_status
      else 'approved'::public.registration_status
    end,
    lifecycle_status=case v_row.stage
      when 'members' then case when not v_has_members then 'incomplete' when not v_documents_ok then 'awaiting_documents' else 'awaiting_review' end
      when 'technical' then case when v_row.technical_status='pending' then 'awaiting_technical_review' else 'awaiting_review' end
      when 'rules' then 'awaiting_rules'
      when 'payment' then 'awaiting_payment'
      when 'confirmed' then 'completed'
    end,
    registration_stage=case v_row.stage
      when 'members' then case when not v_has_members then 'members' when not v_documents_ok then 'documents' else 'review' end
      when 'technical' then case when v_row.technical_status='pending' then 'technical_review' else 'technical' end
      when 'rules' then 'rules'
      when 'payment' then 'invoice'
      when 'confirmed' then 'completed'
    end,
    registration_progress=case v_row.stage when 'members' then case when not v_has_members then 22 when not v_documents_ok then 34 else 44 end when 'technical' then 64 when 'rules' then 74 when 'payment' then 82 when 'confirmed' then 100 end,
    rejection_reason=case when v_member_rejected then rejection_reason when v_row.technical_status='rejected' then v_row.technical_rejection_reason when v_row.stage='confirmed' then null else rejection_reason end,
    reviewed_at=case when v_row.stage='confirmed' then coalesce(reviewed_at,now()) else reviewed_at end,
    last_activity_at=now()
  where id=p_team_id and lifecycle_status<>'cancelled';
  return v_row;
end $$;

create or replace function public.review_team(p_team_id uuid,p_status registration_status,p_rejection_reason text default null)
returns public.teams language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_team public.teams%rowtype; v_league public.leagues%rowtype; v_role user_role; v_missing text[]:=array[]::text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from public.teams where id=p_team_id for update; if not found then raise exception 'team_not_found'; end if;
  select * into v_league from public.leagues where id=v_team.league_id;
  v_role:=public.current_user_role();
  if not (public.is_super_admin() or (v_role='staff' and public.has_panel_permission('triage')) or
    (v_role='league_admin' and public.has_panel_permission('team_review') and exists(select 1 from public.league_admins where league_id=v_team.league_id and user_id=v_uid))) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then raise exception 'triage_can_only_mark_under_review'; end if;
  if p_status in ('under_review','approved') then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='captain')<v_league.min_captains then v_missing:=array_append(v_missing,'captain'); end if;
    if (select count(*) from public.team_members where team_id=p_team_id and role='coach')<v_league.min_coaches then v_missing:=array_append(v_missing,'coach'); end if;
    if not exists(select 1 from public.team_members where team_id=p_team_id) then v_missing:=array_append(v_missing,'members'); end if;
    if exists(select 1 from public.team_members m where m.team_id=p_team_id and not public._team_person_complete_for_league(m,v_team.league_id)) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if public.team_registration_step_enabled(v_team.league_id,'documents') and exists(
      select 1 from public.registration_doc_types r where r.scope='team' and r.is_active and r.is_required
      and not exists(select 1 from public.documents d where d.team_id=p_team_id and d.doc_type=r.code)
    ) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if cardinality(v_missing)>0 then raise exception 'team_dossier_incomplete:%',array_to_string(v_missing,','); end if;
  end if;
  update public.teams set status=p_status,rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,
    reviewed_at=now(),reviewed_by=v_uid where id=p_team_id returning * into v_team;
  perform public.sync_team_attendance(p_team_id);
  select * into v_team from public.teams where id=p_team_id;
  return v_team;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_setting public.league_attendance_settings%rowtype; v_league_id uuid;
begin
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  -- A %rowtype record cannot be mixed with scalar INTO targets. Load the
  -- complete settings row first, then derive its league id from that row.
  select s.* into v_setting
  from public.teams t
  join public.league_attendance_settings s on s.league_id=t.league_id
  where t.id=p_team_id;
  if not found then raise exception 'attendance_settings_not_found'; end if;
  v_league_id:=v_setting.league_id;
  if not public.team_registration_step_enabled(v_league_id,'technical') then raise exception 'registration_step_disabled:technical'; end if;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'technical' or v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from public.team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update public.team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),edit_reopened_at=null,edit_reopened_by=null,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
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
  update public.team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),
    technical_reviewed_by=auth.uid(),technical_auto_approved=false,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row public.team_attendance_clearances%rowtype; v_notes boolean; v_league_id uuid;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select t.league_id,s.participant_note_enabled into v_league_id,v_notes from public.teams t join public.league_attendance_settings s on s.league_id=t.league_id where t.id=p_team_id;
  if not public.team_registration_step_enabled(v_league_id,'rules') then raise exception 'registration_step_disabled:rules'; end if;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update public.team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),
    participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,updated_at=now() where team_id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  return v_row;
end $$;

-- The audit table is queryable only through its RLS policy. Support staff with
-- explicit team-review permission may read the same dossier history they can review.
drop policy if exists team_registration_change_log_read on public.team_registration_change_log;
create policy team_registration_change_log_read on public.team_registration_change_log for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=team_id and (t.captain_id=auth.uid() or cm.user_id is not null))
  or (public.has_panel_permission('team_review') and (
    public.current_user_role()='staff'
    or exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid())
  ))
);

-- Disabled types are not valid for new uploads. Rows and files already stored
-- remain untouched and continue to be available to their authorized owners/reviewers.
create or replace function public._reject_disabled_profile_document()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.registration_doc_types where id=new.doc_type_id and is_active and scope='profile') then
    raise exception 'document_type_disabled';
  end if;
  return new;
end $$;
drop trigger if exists reject_disabled_profile_document on public.profile_documents;
create trigger reject_disabled_profile_document before insert or update of doc_type_id on public.profile_documents
for each row execute function public._reject_disabled_profile_document();

create or replace function public._reject_disabled_team_document()
returns trigger language plpgsql set search_path=public as $$
declare v_league_id uuid;
begin
  select league_id into v_league_id from public.teams where id=new.team_id;
  if new.team_member_id is not null or new.doc_type='member_national_id' then
    if not exists(select 1 from public.registration_doc_types where code='member_identity' and scope='member' and is_active) then
      raise exception 'document_type_disabled';
    end if;
  elsif not public.team_registration_step_enabled(v_league_id,'documents')
     or not exists(select 1 from public.registration_doc_types where code=new.doc_type and scope='team' and is_active) then
    raise exception 'document_type_disabled';
  end if;
  return new;
end $$;
drop trigger if exists reject_disabled_team_document on public.documents;
create trigger reject_disabled_team_document before insert or update of doc_type,team_member_id,team_id on public.documents
for each row execute function public._reject_disabled_team_document();

create or replace function public._guard_disabled_technical_step()
returns trigger language plpgsql set search_path=public as $$
declare v_league_id uuid; v_article boolean; v_video boolean;
begin
  select t.league_id,s.article_required,s.video_required into v_league_id,v_article,v_video
  from public.teams t left join public.league_attendance_settings s on s.league_id=t.league_id
  where t.id=new.team_id;
  if not public.team_registration_step_enabled(v_league_id,'technical')
     or (new.kind='article' and not coalesce(v_article,true))
     or (new.kind='robot_video' and not coalesce(v_video,true)) then
    raise exception 'technical_step_disabled';
  end if;
  return new;
end $$;
drop trigger if exists guard_disabled_technical_file on public.team_technical_files;
create trigger guard_disabled_technical_file before insert or update of kind,team_id on public.team_technical_files
for each row execute function public._guard_disabled_technical_step();

create or replace function public._guard_disabled_technical_submission()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.technical_status='pending' and old.technical_status is distinct from new.technical_status
     and not public.team_registration_step_enabled(new.league_id,'technical') then
    raise exception 'technical_step_disabled';
  end if;
  return new;
end $$;
drop trigger if exists guard_disabled_technical_submission on public.team_attendance_clearances;
create trigger guard_disabled_technical_submission before update of technical_status on public.team_attendance_clearances
for each row execute function public._guard_disabled_technical_submission();

-- Reconcile every non-historical registration through the same canonical sync
-- whenever league or document-type settings change. Confirmed registrations are
-- intentionally not reopened merely because a technical requirement is enabled.
create or replace function public._refresh_league_registration_flows(p_league_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_team public.teams%rowtype;
  v_settings public.league_attendance_settings%rowtype;
  v_stage text;
begin
  select * into v_settings from public.league_attendance_settings where league_id=p_league_id;
  for v_team in select * from public.teams where league_id=p_league_id and archived_at is null loop
    begin
      insert into public.team_attendance_clearances(team_id,league_id)
      values(v_team.id,p_league_id) on conflict(team_id) do nothing;
      select stage into v_stage from public.team_attendance_clearances where team_id=v_team.id;

      if v_stage<>'confirmed' then
        update public.team_members m
        set review_status='pending',rejection_reason=null,reviewed_at=null,reviewed_by=null
        where m.team_id=v_team.id and m.review_status='approved'
          and not public._team_person_complete_for_league(m,p_league_id);
      end if;

      if (select auto_approve_team_members from public.leagues where id=p_league_id) then
        perform public._auto_review_team_people_for_id(v_team.id);
      end if;

      if not public.team_registration_step_enabled(p_league_id,'technical') then
        update public.team_attendance_clearances
        set technical_status='approved',technical_rejection_reason=null,
            technical_auto_approved=true,updated_at=now()
        where team_id=v_team.id and technical_status in ('locked','draft','rejected','pending');
      else
        update public.team_attendance_clearances
        set technical_status='draft',technical_auto_approved=false,updated_at=now()
        where team_id=v_team.id and technical_auto_approved and stage<>'confirmed';
      end if;

      perform public.sync_team_attendance(v_team.id);
    exception when others then
      raise warning '_refresh_league_registration_flows: skipped team % -- %',v_team.id,sqlerrm;
    end;
  end loop;
end $$;

create or replace function public._refresh_registration_after_doc_type_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_league_id uuid; v_scope text:=case when tg_op='DELETE' then old.scope else new.scope end;
begin
  if v_scope in ('member','team') then
    for v_league_id in select id from public.leagues loop
      perform public._refresh_league_registration_flows(v_league_id);
    end loop;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists refresh_registration_after_doc_type_change on public.registration_doc_types;
create trigger refresh_registration_after_doc_type_change
after insert or update of is_active,is_required,scope,code or delete on public.registration_doc_types
for each row execute function public._refresh_registration_after_doc_type_change();

revoke all on function public.team_registration_step_enabled(uuid,text) from public;
grant execute on function public.team_registration_step_enabled(uuid,text) to authenticated;
revoke all on function public.review_team(uuid,registration_status,text) from public;
grant execute on function public.review_team(uuid,registration_status,text) to authenticated;
revoke all on function public.submit_team_technical_files(uuid) from public;
grant execute on function public.submit_team_technical_files(uuid) to authenticated;
revoke all on function public.review_team_technical_files(uuid,boolean,text) from public;
grant execute on function public.review_team_technical_files(uuid,boolean,text) to authenticated;
revoke all on function public.accept_team_attendance_rules(uuid,boolean,text) from public;
grant execute on function public.accept_team_attendance_rules(uuid,boolean,text) to authenticated;

do $$
declare v_league_id uuid;
begin
  for v_league_id in select id from public.leagues loop
    perform public._refresh_league_registration_flows(v_league_id);
  end loop;
end $$;

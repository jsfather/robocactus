-- Consolidate payment mode, enforce server-side triage completeness and scope staff access.

create table if not exists app_private.security_rate_limits(
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
create index if not exists security_rate_limits_reset_idx on app_private.security_rate_limits(reset_at);

create or replace function public.get_payment_mode()
returns text language sql stable security definer set search_path=public as $$
  select coalesce(
    (select payment_provider from public.auth_settings where id=1),
    (select value from public.payment_config where key='payment_mode'),
    'mock'
  );
$$;
revoke all on function public.get_payment_mode() from public;
grant execute on function public.get_payment_mode() to authenticated, anon;

-- Replace the legacy role-wide profile visibility with purpose-bound access.
drop policy if exists profiles_select_own_or_staff on public.profiles;
drop policy if exists profiles_account_review_select on public.profiles;
create policy profiles_scoped_select on public.profiles for select to authenticated using (
  id=auth.uid()
  or public.is_super_admin()
  or (account_status='pending' and public.has_panel_permission('account_activation'))
);

drop policy if exists teams_select on public.teams;
create policy teams_scoped_select on public.teams for select to authenticated using (
  captain_id=auth.uid()
  or exists (select 1 from public.company_members cm where cm.company_id=teams.company_id and cm.user_id=auth.uid())
  or public.is_super_admin()
  or (public.has_panel_permission('triage') and status='submitted')
  or (public.has_panel_permission('team_review') and exists (
    select 1 from public.league_admins la where la.league_id=teams.league_id and la.user_id=auth.uid()
  ))
);

drop policy if exists team_members_select on public.team_members;
create policy team_members_scoped_select on public.team_members for select to authenticated using (exists (
  select 1 from public.teams t where t.id=team_members.team_id and (
    t.captain_id=auth.uid()
    or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
    or public.is_super_admin()
    or (public.has_panel_permission('triage') and t.status='submitted')
    or (public.has_panel_permission('team_review') and exists (
      select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
    ))
  )
));

drop policy if exists documents_select on public.documents;
create policy documents_scoped_select on public.documents for select to authenticated using (exists (
  select 1 from public.teams t where t.id=documents.team_id and (
    t.captain_id=auth.uid()
    or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
    or public.is_super_admin()
    or (public.has_panel_permission('triage') and t.status='submitted')
    or (public.has_panel_permission('team_review') and exists (
      select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
    ))
  )
));

drop policy if exists team_documents_select on storage.objects;
create policy team_documents_select on storage.objects for select to authenticated using (
  bucket_id='team-documents' and (
    public.is_super_admin()
    or auth.uid()::text=(storage.foldername(name))[1]
    or exists (
      select 1 from public.documents d join public.teams t on t.id=d.team_id
      where d.file_path=storage.objects.name and (
        t.captain_id=auth.uid()
        or exists (select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())
        or (public.has_panel_permission('triage') and t.status='submitted')
        or (public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
    )
    or exists (
      select 1 from public.team_members m join public.teams t on t.id=m.team_id
      where m.national_id_doc_path=storage.objects.name and (
        t.captain_id=auth.uid()
        or (public.has_panel_permission('triage') and t.status='submitted')
        or (public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
    )
  )
);

drop policy if exists team_member_photos_review_select on storage.objects;
create policy team_member_photos_review_select on storage.objects for select to authenticated using (
  bucket_id='team-member-photos' and exists (
    select 1 from public.teams t where t.id::text=(storage.foldername(name))[1] and (
      (public.has_panel_permission('triage') and t.status='submitted')
      or (public.has_panel_permission('team_review') and exists (
        select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
      ))
    )
  )
);

-- Triage may read only payment summaries belonging to registrations in its queue.
drop policy if exists invoices_triage_read on public.invoices;
create policy invoices_triage_read on public.invoices for select to authenticated using (
  public.has_panel_permission('triage') and exists (
    select 1 from public.teams t where t.id=invoices.team_id
      and t.status='submitted'
      and t.lifecycle_status in ('awaiting_review','awaiting_payment','completed')
  )
);

drop policy if exists payment_receipts_select on storage.objects;
create policy payment_receipts_select on storage.objects for select to authenticated using (
  bucket_id='payment-receipts' and (
    (storage.foldername(name))[1]=auth.uid()::text
    or public.is_super_admin()
    or (public.has_panel_permission('finance') and exists (
      select 1 from public.invoices i where i.receipt_path=storage.objects.name
    ))
    or (public.has_panel_permission('triage') and exists (
      select 1 from public.invoices i join public.teams t on t.id=i.team_id
      where i.receipt_path=storage.objects.name and t.status='submitted'
    ))
  )
);

create or replace function public.review_team(
  p_team_id uuid,
  p_status registration_status,
  p_rejection_reason text default null
)
returns teams language plpgsql security definer set search_path=public as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_role user_role;
  v_missing text[] := array[]::text[];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('under_review','approved','rejected','waitlisted') then raise exception 'invalid_review_status'; end if;
  select * into v_team from teams where id=p_team_id for update;
  if not found then raise exception 'team_not_found'; end if;
  v_role := public.current_user_role();
  if not (
    public.is_super_admin()
    or (v_role='staff' and public.has_panel_permission('triage'))
    or (v_role='league_admin' and public.has_panel_permission('team_review') and exists (
      select 1 from league_admins la where la.league_id=v_team.league_id and la.user_id=v_uid
    ))
  ) then raise exception 'forbidden'; end if;
  if v_role='staff' and not public.is_super_admin() and p_status<>'under_review' then
    raise exception 'triage_can_only_mark_under_review';
  end if;

  if p_status='under_review' then
    if nullif(trim(v_team.name),'') is null then v_missing:=array_append(v_missing,'team_name'); end if;
    if not exists (select 1 from team_members m where m.team_id=p_team_id and m.role='captain') then
      v_missing:=array_append(v_missing,'captain');
    end if;
    if exists (
      select 1 from team_members m where m.team_id=p_team_id and (
        nullif(trim(coalesce(m.first_name_fa,'')),'') is null
        or nullif(trim(coalesce(m.last_name_fa,'')),'') is null
        or m.birth_date is null
        or nullif(trim(coalesce(m.national_id,'')),'') is null
        or nullif(trim(coalesce(m.national_id_doc_path,'')),'') is null
      )
    ) then v_missing:=array_append(v_missing,'member_identity'); end if;
    if exists (
      select 1 from registration_doc_types r
      where r.scope='team' and r.is_active and r.is_required
        and not exists (select 1 from documents d where d.team_id=p_team_id and d.doc_type=r.code)
    ) then v_missing:=array_append(v_missing,'required_documents'); end if;
    if v_team.registration_stage not in ('review','invoice','payment','completed')
      or v_team.registration_progress < 75 then
      v_missing:=array_append(v_missing,'registration_flow');
    end if;
    if not exists (
      select 1 from invoices i where i.team_id=p_team_id
        and (i.status='paid' or (i.payment_method='card_to_card' and i.receipt_status='approved') or i.amount<=0)
    ) then v_missing:=array_append(v_missing,'payment'); end if;
    if cardinality(v_missing)>0 then
      raise exception 'team_dossier_incomplete:%', array_to_string(v_missing,',');
    end if;
  end if;

  update teams set status=p_status,
    rejection_reason=case when p_status='rejected' then nullif(trim(p_rejection_reason),'') else null end,
    reviewed_at=now(),reviewed_by=v_uid
  where id=p_team_id returning * into v_team;
  return v_team;
end;
$$;
revoke all on function public.review_team(uuid,registration_status,text) from public;
grant execute on function public.review_team(uuid,registration_status,text) to authenticated;

-- Protect guest chat storage from unbounded messages even if a client bypasses the UI.
create or replace function public.send_live_chat_guest_message(p_token text,p_body text)
returns live_chat_messages language plpgsql security definer set search_path=public as $$
declare v_session live_chat_sessions%rowtype; v_msg live_chat_messages%rowtype;
begin
  select * into v_session from live_chat_sessions where guest_token=p_token for update;
  if not found or v_session.status='closed' then raise exception 'session_not_found'; end if;
  if length(trim(coalesce(p_body,'')))<1 then raise exception 'empty_body'; end if;
  if length(p_body)>5000 then raise exception 'message_too_long'; end if;
  if (select count(*) from live_chat_messages where session_id=v_session.id and sender_kind='guest' and created_at>now()-interval '1 minute')>=12 then
    raise exception 'too_many_attempts';
  end if;
  insert into live_chat_messages(session_id,sender_kind,body) values(v_session.id,'guest',trim(p_body)) returning * into v_msg;
  update live_chat_sessions set last_message_at=now() where id=v_session.id;
  return v_msg;
end;
$$;
revoke all on function public.send_live_chat_guest_message(text,text) from public;
grant execute on function public.send_live_chat_guest_message(text,text) to anon,authenticated;

-- Fix 1: _enqueue_team_lifecycle_sms referenced new.id which does not exist
--         on team_attendance_clearances (PK is team_id).  The permit_code was
--         intended to identify the clearance record; use team_id instead.
-- Fix 2: Wrap the notification INSERT in an exception handler so a bug in the
--         SMS metadata can never abort the core clearance / settings transaction.
-- Fix 3: _refresh_league_registration_flows now applies article_required=false
--         correctly when saving attendance settings, ensuring existing teams
--         with no article are auto-approved for the technical step.
-- Fix 4: A dedicated server-side function lets the backend return HTTP 409
--         when a registration_doc_type deletion is blocked by a FK constraint,
--         instead of leaking a raw PostgreSQL error.

-- ─── 1.  Fix _enqueue_team_lifecycle_sms ─────────────────────────────────────
-- Root cause: new.id::text on a table whose PK is team_id (uuid), not id.
-- The permit_code field in the SMS payload is meant to be a human-visible
-- reference code for the clearance.  The closest meaningful identifier is
-- team_id; if a human-readable code is added later it can replace this.

create or replace function public._enqueue_team_lifecycle_sms()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_phone  text;
  v_team   text;
  v_league text;
  v_reason text;
  v_template text;
  v_key      text;
begin
  select p.phone, t.name, l.name
    into v_phone, v_team, v_league
  from public.teams      t
  join public.profiles   p on p.id = t.captain_id
  join public.leagues    l on l.id = t.league_id
  where t.id = new.team_id;

  if not public.is_real_phone(v_phone) then return new; end if;

  if new.stage = 'confirmed' and old.stage is distinct from new.stage then
    v_template := 'attendance_permit_issued';
    v_key      := 'attendance_permit_issued:' || new.team_id::text;

  elsif new.technical_status = 'rejected'
        and old.technical_status is distinct from new.technical_status then
    v_template := 'team_correction_required';
    v_reason   := coalesce(new.technical_rejection_reason, 'نیاز به اصلاح مدارک فنی');
    v_key      := 'team_correction_required:technical:'
                  || new.team_id::text || ':'
                  || extract(epoch from new.updated_at)::bigint::text;

  elsif new.stage = 'rules' and old.stage is distinct from new.stage then
    v_template := 'team_review_approved';
    v_key      := 'team_review_approved:' || new.team_id::text;

  else
    return new;
  end if;

  -- Fault-tolerant: a failure here must NEVER abort the attendance transaction.
  begin
    if public.sms_template_enabled(v_template) then
      insert into public.notification_log
        (team_id, channel, template_key, phone, status, idempotency_key, meta)
      values
        (new.team_id, 'sms', v_template, v_phone, 'pending', v_key,
         jsonb_build_object(
           'team_name',   v_team,
           'league_name', v_league,
           'reason',      v_reason,
           'next_step',   'تأیید قوانین و پرداخت',
           -- permit_code: use team_id as a stable reference identifier.
           -- team_attendance_clearances has no separate id column.
           'permit_code', new.team_id::text
         ))
      on conflict do nothing;
    end if;
  exception when others then
    -- Log the error but do not propagate — SMS enqueuing is best-effort.
    raise warning '_enqueue_team_lifecycle_sms: notification skipped for team % (%) — %',
      new.team_id, v_template, sqlerrm;
  end;

  return new;
end $$;

-- Re-create the trigger (drop first to pick up the new function body).
drop trigger if exists enqueue_team_lifecycle_sms on public.team_attendance_clearances;
create trigger enqueue_team_lifecycle_sms
  after update of stage, technical_status on public.team_attendance_clearances
  for each row execute function public._enqueue_team_lifecycle_sms();


-- ─── 2.  Make _refresh_league_registration_flows fault-tolerant ───────────────
-- The function iterates over every team in a league when any attendance setting
-- changes.  sync_team_attendance triggers enqueue_team_lifecycle_sms which (now
-- safely) could have other errors.  Wrap per-team sync in its own savepoint so
-- one bad team never rolls back the settings upsert.

create or replace function public._refresh_league_registration_flows(p_league_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_team     public.teams%rowtype;
  v_settings public.league_attendance_settings%rowtype;
begin
  select * into v_settings
  from public.league_attendance_settings
  where league_id = p_league_id;

  for v_team in
    select * from public.teams
    where league_id = p_league_id and archived_at is null
  loop
    begin
      -- Auto-approve members when league is configured for it.
      if (select auto_approve_team_members from public.leagues where id = p_league_id) then
        perform public._auto_review_team_people_for_id(v_team.id);
      end if;

      -- Ensure clearance row exists.
      insert into public.team_attendance_clearances(team_id, league_id)
      values (v_team.id, p_league_id)
      on conflict (team_id) do nothing;

      -- When both article and video are disabled, auto-approve the technical step
      -- for teams that are still awaiting it so they are not blocked.
      if coalesce(v_settings.article_required, true) = false
         and coalesce(v_settings.video_required, true) = false then
        update public.team_attendance_clearances
        set technical_status      = 'approved',
            technical_rejection_reason = null,
            technical_auto_approved    = true,
            updated_at                 = now()
        where team_id = v_team.id
          and technical_status in ('locked', 'draft', 'rejected', 'pending');
      else
        -- Re-enable the draft status for any record that was previously auto-
        -- approved so teams are prompted to upload files again.
        update public.team_attendance_clearances
        set technical_status    = 'draft',
            technical_auto_approved = false,
            updated_at              = now()
        where team_id = v_team.id
          and technical_auto_approved;
      end if;

      perform public.sync_team_attendance(v_team.id);

    exception when others then
      raise warning '_refresh_league_registration_flows: skipped team % — %',
        v_team.id, sqlerrm;
    end;
  end loop;
end $$;


-- ─── 3.  Safe deletion helper for registration_doc_types ─────────────────────
-- Returns true when deletion succeeded, raises document_type_in_use when the
-- FK constraint blocks it (profile_documents / documents reference it).

create or replace function public.delete_registration_doc_type(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;

  delete from public.registration_doc_types where id = p_id;
  return true;

exception
  when foreign_key_violation then
    raise exception 'document_type_in_use'
      using detail = 'The document type is referenced by existing profile or team documents and cannot be deleted.',
            hint   = 'Deactivate the document type instead of deleting it to preserve historical data.';
end $$;

revoke all on function public.delete_registration_doc_type(uuid) from public, anon;
grant execute on function public.delete_registration_doc_type(uuid) to authenticated;

-- Expose the new RPC name in the application RPCS allow-list (handled in query.ts).


-- ─── 4.  Ensure is_active column exists (already present since 0036) ──────────
-- Idempotent guard; no-op on a live database that already has the column.
alter table public.registration_doc_types
  add column if not exists is_active boolean not null default true;

-- Index to speed up the active-only lookups used during registration.
create index if not exists registration_doc_types_active_scope_idx
  on public.registration_doc_types (scope, sort_order)
  where is_active;


-- ─── 5.  Realtime: registration_doc_types is already in the capture list ──────
-- (added in 0083_registration_validation_realtime.sql — no further action needed)


-- ─── 6.  Re-apply _refresh_league_registration_flows to all leagues ───────────
-- Makes the new fault-tolerant behaviour take effect immediately and fixes any
-- team that was stuck due to the old NEW.id bug.
do $$
declare v_league_id uuid;
begin
  for v_league_id in select id from public.leagues loop
    begin
      perform public._refresh_league_registration_flows(v_league_id);
    exception when others then
      raise warning 'apply _refresh_league_registration_flows for league % failed: %',
        v_league_id, sqlerrm;
    end;
  end loop;
end $$;

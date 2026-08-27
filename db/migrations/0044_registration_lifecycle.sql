-- League registration lifecycle, cross-device drafts, invoice ownership and reminder foundation.
alter table public.teams
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists registration_stage text not null default 'team_info',
  add column if not exists registration_progress integer not null default 10,
  add column if not exists registration_draft jsonb not null default '{}'::jsonb,
  add column if not exists last_completed_step integer not null default -1,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists registration_started_at timestamptz not null default now(),
  add column if not exists registration_completed_at timestamptz;

alter table public.teams drop constraint if exists teams_lifecycle_status_check;
alter table public.teams add constraint teams_lifecycle_status_check check (lifecycle_status in (
  'draft','incomplete','awaiting_documents','awaiting_review','awaiting_payment','completed','cancelled'
));
alter table public.teams drop constraint if exists teams_registration_stage_check;
alter table public.teams add constraint teams_registration_stage_check check (registration_stage in (
  'team_info','members','documents','review','invoice','payment','completed'
));
alter table public.teams drop constraint if exists teams_registration_progress_check;
alter table public.teams add constraint teams_registration_progress_check check (registration_progress between 0 and 100);

-- Preserve the real state of registrations created before this lifecycle existed.
-- A paid invoice is definitive; pending invoices and submitted records retain
-- their operational state instead of becoming fresh drafts.
update public.teams t
set lifecycle_status = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 'completed'
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 'awaiting_payment'
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 'awaiting_review'
      else 'incomplete'
    end,
    registration_stage = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 'completed'
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 'payment'
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 'review'
      else 'team_info'
    end,
    registration_progress = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid') then 100
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'pending') then 85
      when t.status in ('submitted', 'under_review', 'approved', 'rejected') then 75
      else 10
    end,
    registration_completed_at = case
      when exists (select 1 from public.invoices i where i.team_id = t.id and i.status = 'paid')
        then coalesce(t.registration_completed_at, (select max(i.paid_at) from public.invoices i where i.team_id = t.id and i.status = 'paid'), now())
      else t.registration_completed_at
    end
where t.registration_draft = '{}'::jsonb
  and t.last_completed_step = -1;

create index if not exists teams_registration_lifecycle_idx
  on public.teams (lifecycle_status, last_activity_at desc);
create index if not exists teams_registration_resume_idx
  on public.teams (captain_id, league_id, season_year, lifecycle_status);

create or replace function public.guard_duplicate_league_registration()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lifecycle_status <> 'cancelled' and exists (
    select 1 from teams t where t.id <> new.id and t.captain_id = new.captain_id
      and t.league_id = new.league_id and coalesce(t.season_year, 0) = coalesce(new.season_year, 0)
      and t.lifecycle_status <> 'cancelled'
  ) then raise exception 'duplicate_league_registration'; end if;
  return new;
end $$;
drop trigger if exists guard_duplicate_league_registration on public.teams;
create trigger guard_duplicate_league_registration before insert or update of captain_id, league_id, season_year
on public.teams for each row execute function public.guard_duplicate_league_registration();

create or replace function public.guard_registration_lifecycle_transition()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.lifecycle_status = old.lifecycle_status then return new; end if;
  if (old.lifecycle_status = 'draft' and new.lifecycle_status in ('incomplete','cancelled'))
    or (old.lifecycle_status = 'incomplete' and new.lifecycle_status in ('awaiting_documents','awaiting_review','awaiting_payment','cancelled'))
    or (old.lifecycle_status = 'awaiting_documents' and new.lifecycle_status in ('incomplete','awaiting_review','cancelled'))
    or (old.lifecycle_status = 'awaiting_review' and new.lifecycle_status in ('incomplete','awaiting_documents','awaiting_payment','cancelled'))
    or (old.lifecycle_status = 'awaiting_payment' and new.lifecycle_status in ('awaiting_review','completed','cancelled'))
  then return new; end if;
  raise exception 'invalid_registration_lifecycle_transition:%->%', old.lifecycle_status, new.lifecycle_status;
end $$;
drop trigger if exists guard_registration_lifecycle_transition on public.teams;
create trigger guard_registration_lifecycle_transition before update of lifecycle_status on public.teams
for each row execute function public.guard_registration_lifecycle_transition();

alter table public.invoices
  add column if not exists registration_id uuid references public.teams(id) on delete restrict;
update public.invoices set registration_id = team_id where registration_id is null;
alter table public.invoices alter column registration_id set not null;
create index if not exists invoices_registration_id_idx on public.invoices(registration_id);

-- Captains may view invoices for their own registration even when they are not
-- yet a formal company member. Existing company-member and super-admin policy
-- remains in force; PostgreSQL combines permissive SELECT policies with OR.
drop policy if exists invoices_select_team_captain on public.invoices;
create policy invoices_select_team_captain on public.invoices for select to authenticated using (
  exists (select 1 from public.teams t where t.id = invoices.team_id and t.captain_id = auth.uid())
);

create or replace function public.sync_registration_payment_lifecycle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registration_id := coalesce(new.registration_id, new.team_id);
  if new.registration_id is distinct from new.team_id then raise exception 'invoice_registration_mismatch'; end if;
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update teams set lifecycle_status = 'completed', registration_stage = 'completed', registration_progress = 100,
      registration_completed_at = now(), last_activity_at = now() where id = new.team_id;
  elsif new.status = 'pending' then
    update teams set lifecycle_status = 'awaiting_payment', registration_stage = 'payment',
      registration_progress = greatest(registration_progress, 85), last_activity_at = now() where id = new.team_id;
  end if;
  return new;
end $$;
drop trigger if exists sync_registration_payment_lifecycle on public.invoices;
create trigger sync_registration_payment_lifecycle before insert or update of status on public.invoices
for each row execute function public.sync_registration_payment_lifecycle();

create table if not exists public.registration_reminder_settings (
  reminder_type text primary key,
  template_key text not null,
  is_active boolean not null default true,
  delay_hours integer not null default 24 check (delay_hours >= 1),
  max_sends integer not null default 3 check (max_sends between 1 and 20),
  interval_hours integer not null default 48 check (interval_hours >= 1),
  variables text[] not null default '{}',
  default_message_fa text,
  updated_at timestamptz not null default now()
);
insert into public.registration_reminder_settings(reminder_type, template_key, variables, default_message_fa) values
 ('incomplete_registration','incomplete_registration_reminder',array['name','league_name'],'ثبت‌نام شما در {league_name} هنوز تکمیل نشده است.'),
 ('team_approval','team_approval_reminder',array['team_name','league_name'],'مراحل تأیید تیم {team_name} هنوز کامل نشده است.'),
 ('account_verification','account_verification_reminder',array['name','league_name'],'برای ادامه ثبت‌نام، اطلاعات حساب خود را تکمیل و تأیید کنید.'),
 ('payment','payment_reminder',array['team_name','league_name','invoice_number'],'صورت‌حساب ثبت‌نام {team_name} هنوز پرداخت نشده است.')
on conflict (reminder_type) do nothing;

create table if not exists public.registration_reminder_log (
  id uuid primary key default gen_random_uuid(),
  reminder_type text not null references public.registration_reminder_settings(reminder_type),
  registration_id uuid not null references public.teams(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  recipient text not null,
  notification_id uuid references public.notification_log(id) on delete set null,
  status text not null default 'queued',
  provider_response jsonb,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists registration_reminder_log_lookup_idx
  on public.registration_reminder_log(registration_id, reminder_type, queued_at desc);

alter table public.registration_reminder_settings enable row level security;
alter table public.registration_reminder_log enable row level security;
drop policy if exists reminder_settings_sa on public.registration_reminder_settings;
create policy reminder_settings_sa on public.registration_reminder_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists reminder_log_sa on public.registration_reminder_log;
create policy reminder_log_sa on public.registration_reminder_log for select to authenticated using (public.is_super_admin());

create or replace function public.enqueue_registration_reminder(p_team_id uuid, p_reminder_type text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_team teams%rowtype; v_setting registration_reminder_settings%rowtype; v_invoice invoices%rowtype;
  v_phone text; v_name text; v_league text; v_count integer; v_last timestamptz; v_notification uuid;
begin
  if auth.uid() is not null and not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into v_setting from registration_reminder_settings where reminder_type = p_reminder_type and is_active;
  if not found then return false; end if;
  select * into v_team from teams where id = p_team_id and lifecycle_status not in ('completed','cancelled');
  if not found or v_team.last_activity_at > now() - make_interval(hours => v_setting.delay_hours) then return false; end if;
  select phone, full_name into v_phone, v_name from profiles where id = v_team.captain_id;
  select name into v_league from leagues where id = v_team.league_id;
  select count(*), max(coalesce(sent_at, queued_at)) into v_count, v_last from registration_reminder_log where registration_id = p_team_id and reminder_type = p_reminder_type;
  if v_count >= v_setting.max_sends or (v_last is not null and v_last > now() - make_interval(hours => v_setting.interval_hours)) then return false; end if;
  if p_reminder_type = 'payment' then
    select * into v_invoice from invoices where team_id = p_team_id and status = 'pending' and archived_at is null order by created_at desc limit 1;
    if not found then return false; end if;
  elsif p_reminder_type = 'account_verification' and not exists (select 1 from profiles where id = v_team.captain_id and account_status = 'pending') then return false;
  elsif p_reminder_type = 'team_approval' and v_team.lifecycle_status not in ('awaiting_documents','awaiting_review') then return false;
  elsif p_reminder_type = 'incomplete_registration' and v_team.lifecycle_status not in ('draft','incomplete','awaiting_documents') then return false;
  end if;
  if nullif(trim(v_phone), '') is null then return false; end if;
  insert into notification_log(channel, template_key, phone, status, idempotency_key, meta)
  values ('sms', case p_reminder_type
      when 'incomplete_registration' then 'incomplete_registration_reminder'
      when 'team_approval' then 'team_approval_reminder'
      when 'account_verification' then 'account_verification_reminder'
      when 'payment' then 'payment_reminder'
    end, v_phone, 'pending', 'registration-reminder:'||p_reminder_type||':'||p_team_id||':'||(v_count+1),
    jsonb_build_object('provider_template',v_setting.template_key,'token_order',to_jsonb(v_setting.variables),'name',v_name,'team_name',v_team.name,'league_name',v_league,'invoice_number',v_invoice.invoice_number,'amount',v_invoice.amount,'registration_id',p_team_id))
  returning id into v_notification;
  insert into registration_reminder_log(reminder_type,registration_id,invoice_id,recipient,notification_id)
  values(p_reminder_type,p_team_id,v_invoice.id,v_phone,v_notification);
  return true;
end $$;
revoke all on function public.enqueue_registration_reminder(uuid,text) from public;
grant execute on function public.enqueue_registration_reminder(uuid,text) to authenticated;

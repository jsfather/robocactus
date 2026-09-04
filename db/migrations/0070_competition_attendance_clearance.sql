-- Post-payment attendance clearance: member review -> technical files -> rules -> confirmed.

create table if not exists public.league_attendance_settings (
  league_id uuid primary key references public.leagues(id) on delete cascade,
  enabled boolean not null default true,
  member_review_title_fa text not null default 'بررسی فنی اعضای تیم',
  member_review_title_en text not null default 'Team member technical review',
  member_review_help_fa text not null default 'تیم و اعضای شما در حال بررسی هستند. لطفاً منتظر بمانید؛ در صورت نیاز از طریق تیکت یا شماره پشتیبانی با ما در ارتباط باشید.',
  member_review_help_en text not null default 'Your team and its members are being reviewed. Please wait, or contact support through a ticket or phone if needed.',
  article_required boolean not null default true,
  video_required boolean not null default true,
  article_max_bytes bigint not null default 94371840 check (article_max_bytes between 1048576 and 94371840),
  video_max_bytes bigint not null default 94371840 check (video_max_bytes between 1048576 and 94371840),
  technical_help_fa text not null default 'مقاله و ویدیوی ربات را بارگذاری و برای بررسی کمیته فنی ارسال کنید.',
  technical_help_en text not null default 'Upload the robot paper and video, then submit them for technical review.',
  rules_title_fa text not null default 'تعهدنامه حضور در مسابقات',
  rules_title_en text not null default 'Competition attendance agreement',
  rules_body_fa text not null default 'با تأیید این بخش، رعایت قوانین اجرایی، ایمنی و انضباطی مسابقات را می‌پذیرم و صحت اطلاعات تیم را تأیید می‌کنم.',
  rules_body_en text not null default 'By confirming, I accept the competition operational, safety and conduct rules and confirm that the team information is accurate.',
  participant_note_enabled boolean not null default true,
  participant_note_label_fa text not null default 'یادداشت برای دبیرخانه (اختیاری)',
  participant_note_label_en text not null default 'Note to the secretariat (optional)',
  confirmation_title_fa text not null default 'مجوز حضور در مسابقات صادر شد',
  confirmation_title_en text not null default 'Competition attendance confirmed',
  confirmation_message_fa text not null default 'فرآیند تأیید تیم کامل شده است. اطلاعات زمان و محل برگزاری را در همین صفحه مشاهده کنید.',
  confirmation_message_en text not null default 'Your team clearance is complete. Competition date and venue are shown on this page.',
  venue_fa text,
  venue_en text,
  venue_address_fa text,
  venue_address_en text,
  event_starts_at timestamptz,
  support_phone text,
  updated_at timestamptz not null default now()
);

insert into public.league_attendance_settings(league_id)
select id from public.leagues on conflict (league_id) do nothing;

create table if not exists public.team_attendance_clearances (
  team_id uuid primary key references public.teams(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  stage text not null default 'members' check (stage in ('members','technical','rules','confirmed')),
  technical_status text not null default 'locked' check (technical_status in ('locked','draft','pending','approved','rejected')),
  technical_rejection_reason text,
  technical_submitted_at timestamptz,
  technical_reviewed_at timestamptz,
  technical_reviewed_by uuid references public.profiles(id) on delete set null,
  rules_accepted_at timestamptz,
  rules_accepted_by uuid references public.profiles(id) on delete set null,
  participant_note text check (participant_note is null or length(participant_note) <= 3000),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_technical_files (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('article','robot_video')),
  file_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 94371840),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id, kind)
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('technical-submissions','technical-submissions',false,94371840,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4','video/webm','video/quicktime'
]) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.league_attendance_settings enable row level security;
alter table public.team_attendance_clearances enable row level security;
alter table public.team_technical_files enable row level security;

create policy attendance_settings_read on public.league_attendance_settings for select to authenticated using (true);
create policy attendance_settings_admin on public.league_attendance_settings for all to authenticated
using (public.is_super_admin()) with check (public.is_super_admin());

create policy attendance_clearance_read on public.team_attendance_clearances for select to authenticated using (
  public.is_super_admin()
  or exists(select 1 from public.teams t where t.id=team_id and (t.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.league_admins la where la.league_id=team_attendance_clearances.league_id and la.user_id=auth.uid()))
);
create policy technical_files_read on public.team_technical_files for select to authenticated using (
  public.is_super_admin()
  or uploaded_by=auth.uid()
  or exists(select 1 from public.teams t where t.id=team_id and (t.captain_id=auth.uid() or exists(select 1 from public.company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))
  or (public.has_panel_permission('team_review') and exists(select 1 from public.teams t join public.league_admins la on la.league_id=t.league_id where t.id=team_id and la.user_id=auth.uid()))
);

create or replace function public.can_access_technical_submission(p_path text, p_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_super_admin() or exists (
    select 1
    from public.teams t
    left join public.company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id::text=(storage.foldername(p_path))[1]
      and (
        t.captain_id=auth.uid()
        or cm.user_id is not null
        or (not p_write and public.has_panel_permission('team_review') and exists (
          select 1 from public.league_admins la where la.league_id=t.league_id and la.user_id=auth.uid()
        ))
      )
  );
$$;
drop policy if exists technical_submission_storage_read on storage.objects;
drop policy if exists technical_submission_storage_write on storage.objects;
drop policy if exists technical_submission_storage_delete on storage.objects;
create policy technical_submission_storage_read on storage.objects for select to authenticated
using (bucket_id='technical-submissions' and (owner=auth.uid() or public.can_access_technical_submission(name, false)));
create policy technical_submission_storage_write on storage.objects for insert to authenticated
with check (bucket_id='technical-submissions' and owner=auth.uid() and public.can_access_technical_submission(name, true));
create policy technical_submission_storage_delete on storage.objects for delete to authenticated
using (bucket_id='technical-submissions' and owner=auth.uid() and public.can_access_technical_submission(name, true));

create or replace function public.sync_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_row team_attendance_clearances%rowtype; v_paid boolean; v_members_ok boolean; v_enabled boolean;
begin
  select * into v_team from teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  select exists(select 1 from invoices i where i.team_id=p_team_id and (i.status='paid' or i.amount<=0)) into v_paid;
  if not v_paid then raise exception 'payment_required'; end if;
  insert into team_attendance_clearances(team_id,league_id) values(p_team_id,v_team.league_id)
  on conflict(team_id) do update set league_id=excluded.league_id,updated_at=now();
  select coalesce(enabled,true) into v_enabled from league_attendance_settings where league_id=v_team.league_id;
  if not coalesce(v_enabled,true) then
    update team_attendance_clearances set stage='confirmed',confirmed_at=coalesce(confirmed_at,now()),updated_at=now() where team_id=p_team_id returning * into v_row;
    return v_row;
  end if;
  select exists(select 1 from team_members where team_id=p_team_id)
    and not exists(select 1 from team_members where team_id=p_team_id and review_status<>'approved') into v_members_ok;
  update team_attendance_clearances set
    stage=case when stage='confirmed' then stage when v_team.status='approved' and v_members_ok then case when technical_status in ('approved') then 'rules' else 'technical' end else 'members' end,
    technical_status=case when v_team.status='approved' and v_members_ok and technical_status='locked' then 'draft' when not (v_team.status='approved' and v_members_ok) then 'locked' else technical_status end,
    updated_at=now() where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.get_or_create_team_attendance(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null or public.is_super_admin()
      or (public.has_panel_permission('team_review') and exists(select 1 from league_admins la where la.league_id=t.league_id and la.user_id=auth.uid())))) then raise exception 'forbidden'; end if;
  insert into league_attendance_settings(league_id) select league_id from teams where id=p_team_id on conflict(league_id) do nothing;
  return public.sync_team_attendance(p_team_id);
end $$;

create or replace function public._create_league_attendance_settings() returns trigger language plpgsql security definer set search_path=public as $$ begin
  insert into league_attendance_settings(league_id) values(new.id) on conflict(league_id) do nothing; return new;
end $$;
drop trigger if exists create_league_attendance_settings on public.leagues;
create trigger create_league_attendance_settings after insert on public.leagues for each row execute function public._create_league_attendance_settings();

create or replace function public.upsert_team_technical_file(p_team_id uuid,p_kind text,p_file_path text,p_original_name text,p_mime_type text,p_size_bytes bigint)
returns public.team_technical_files language plpgsql security definer set search_path=public as $$
declare
  v_row public.team_technical_files%rowtype;
  v_setting public.league_attendance_settings%rowtype;
  v_allowed boolean := false;
  v_file_owned boolean := false;
  v_max_bytes bigint;
  v_technical_status text;
begin
  if p_kind not in ('article', 'robot_video') then
    raise exception 'invalid_file_kind';
  end if;

  select exists (
    select 1
    from public.teams t
    left join public.company_members cm
      on cm.company_id = t.company_id
     and cm.user_id = auth.uid()
    where t.id = p_team_id
      and (t.captain_id = auth.uid() or cm.user_id is not null)
  ) into v_allowed;
  if not v_allowed then
    raise exception 'forbidden';
  end if;

  select s.*
    into v_setting
  from public.league_attendance_settings s
  join public.teams t on t.league_id = s.league_id
  where t.id = p_team_id;
  if not found then
    raise exception 'attendance_settings_not_found';
  end if;

  v_max_bytes := case
    when p_kind = 'article' then coalesce(v_setting.article_max_bytes, 94371840)
    else coalesce(v_setting.video_max_bytes, 94371840)
  end;
  if p_size_bytes <= 0 or p_size_bytes > v_max_bytes then
    raise exception 'file_too_large';
  end if;
  if p_kind = 'article' and p_mime_type not in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) then
    raise exception 'invalid_file_type';
  end if;
  if p_kind = 'robot_video' and p_mime_type not in ('video/mp4', 'video/webm', 'video/quicktime') then
    raise exception 'invalid_file_type';
  end if;
  if split_part(p_file_path, '/', 1) <> p_team_id::text then
    raise exception 'invalid_file_reference';
  end if;

  select exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'technical-submissions'
      and o.name = p_file_path
      and o.owner = auth.uid()
  ) into v_file_owned;
  if not v_file_owned then
    raise exception 'invalid_file_reference';
  end if;

  select a.technical_status
    into v_technical_status
  from public.sync_team_attendance(p_team_id) a;
  if v_technical_status not in ('draft', 'rejected') then
    raise exception 'technical_submission_locked';
  end if;

  insert into public.team_technical_files(team_id,kind,file_path,original_name,mime_type,size_bytes,uploaded_by)
  values(p_team_id,p_kind,p_file_path,left(p_original_name,255),p_mime_type,p_size_bytes,auth.uid())
  on conflict(team_id,kind) do update set file_path=excluded.file_path,original_name=excluded.original_name,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,uploaded_by=auth.uid(),updated_at=now()
  returning * into v_row;
  update public.team_attendance_clearances set technical_status='draft',technical_rejection_reason=null,updated_at=now() where team_id=p_team_id;
  return v_row;
end $$;

create or replace function public.submit_team_technical_files(p_team_id uuid)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype; v_setting league_attendance_settings%rowtype;
begin
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select s.* into v_setting from league_attendance_settings s join teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from public.sync_team_attendance(p_team_id);
  if v_row.stage<>'technical' or v_row.technical_status not in ('draft','rejected') then raise exception 'technical_submission_locked'; end if;
  if coalesce(v_setting.article_required,true) and not exists(select 1 from team_technical_files where team_id=p_team_id and kind='article') then raise exception 'article_required'; end if;
  if coalesce(v_setting.video_required,true) and not exists(select 1 from team_technical_files where team_id=p_team_id and kind='robot_video') then raise exception 'video_required'; end if;
  update team_attendance_clearances set technical_status='pending',technical_rejection_reason=null,technical_submitted_at=now(),updated_at=now() where team_id=p_team_id returning * into v_row;
  return v_row;
end $$;

create or replace function public.review_team_technical_files(p_team_id uuid,p_approved boolean,p_reason text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype;
begin
  if not (public.is_super_admin() or (public.has_panel_permission('team_review') and exists(select 1 from teams t join league_admins la on la.league_id=t.league_id where t.id=p_team_id and la.user_id=auth.uid()))) then raise exception 'forbidden'; end if;
  if not p_approved and nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'rejection_reason_required'; end if;
  select * into v_row from team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.technical_status<>'pending' then raise exception 'technical_submission_not_pending'; end if;
  update team_attendance_clearances set technical_status=case when p_approved then 'approved' else 'rejected' end,
    technical_rejection_reason=case when p_approved then null else trim(p_reason) end,technical_reviewed_at=now(),technical_reviewed_by=auth.uid(),stage=case when p_approved then 'rules' else 'technical' end,updated_at=now()
  where team_id=p_team_id returning * into v_row; return v_row;
end $$;

create or replace function public.accept_team_attendance_rules(p_team_id uuid,p_accepted boolean,p_note text default null)
returns public.team_attendance_clearances language plpgsql security definer set search_path=public as $$
declare v_row team_attendance_clearances%rowtype; v_notes boolean;
begin
  if not p_accepted then raise exception 'rules_acceptance_required'; end if;
  if not exists(select 1 from teams t left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid() where t.id=p_team_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  select participant_note_enabled into v_notes from league_attendance_settings s join teams t on t.league_id=s.league_id where t.id=p_team_id;
  select * into v_row from team_attendance_clearances where team_id=p_team_id for update;
  if not found or v_row.stage<>'rules' or v_row.technical_status<>'approved' then raise exception 'technical_approval_required'; end if;
  update team_attendance_clearances set rules_accepted_at=now(),rules_accepted_by=auth.uid(),participant_note=case when coalesce(v_notes,true) then nullif(trim(p_note),'') else null end,stage='confirmed',confirmed_at=now(),updated_at=now()
  where team_id=p_team_id returning * into v_row; return v_row;
end $$;

create or replace function public._attendance_after_member_review() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.review_status<>'approved' then update teams set status='under_review',reviewed_at=now() where id=new.team_id and status='approved'; end if;
  if exists(select 1 from invoices where team_id=new.team_id and (status='paid' or amount<=0)) then perform public.sync_team_attendance(new.team_id); end if; return new;
end $$;
drop trigger if exists attendance_after_member_review on public.team_members;
create trigger attendance_after_member_review after update of review_status on public.team_members for each row execute function public._attendance_after_member_review();

create or replace function public._protect_reviewed_member_edits() returns trigger language plpgsql security definer set search_path=public as $$
declare v_reviewer boolean;
begin
  v_reviewer := public.is_super_admin() or (public.has_panel_permission('team_review') and exists(
    select 1 from teams t join league_admins la on la.league_id=t.league_id where t.id=old.team_id and la.user_id=auth.uid()
  ));
  if not v_reviewer and exists(select 1 from team_attendance_clearances where team_id=old.team_id) and (
    old.first_name_fa is distinct from new.first_name_fa or old.last_name_fa is distinct from new.last_name_fa
    or old.first_name_en is distinct from new.first_name_en or old.last_name_en is distinct from new.last_name_en
    or old.national_id is distinct from new.national_id or old.birth_date is distinct from new.birth_date
    or old.role is distinct from new.role or old.phone is distinct from new.phone
    or old.national_id_doc_path is distinct from new.national_id_doc_path or old.photo_url is distinct from new.photo_url
  ) then
    if old.review_status<>'rejected' then raise exception 'member_edit_not_allowed'; end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_reviewed_member_edits on public.team_members;
create trigger protect_reviewed_member_edits before update on public.team_members for each row execute function public._protect_reviewed_member_edits();

create or replace function public.submit_team_member_correction(p_member_id uuid)
returns team_members language plpgsql security definer set search_path=public as $$
declare v_row team_members%rowtype;
begin
  if not exists(select 1 from team_members m join teams t on t.id=m.team_id left join company_members cm on cm.company_id=t.company_id and cm.user_id=auth.uid()
    where m.id=p_member_id and (t.captain_id=auth.uid() or cm.user_id is not null)) then raise exception 'forbidden'; end if;
  update team_members set review_status='pending',rejection_reason=null where id=p_member_id and review_status='rejected' returning * into v_row;
  if not found then raise exception 'member_edit_not_allowed'; end if;
  return v_row;
end $$;

create or replace function public._guard_team_approval() returns trigger language plpgsql set search_path=public as $$ begin
  if new.status='approved' and old.status is distinct from new.status and (
    not exists(select 1 from team_members where team_id=new.id)
    or exists(select 1 from team_members where team_id=new.id and review_status<>'approved')
  ) then raise exception 'team_members_not_approved'; end if;
  return new;
end $$;
drop trigger if exists guard_team_approval on public.teams;
create trigger guard_team_approval before update of status on public.teams for each row execute function public._guard_team_approval();

create or replace function public._attendance_after_team_review() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if exists(select 1 from invoices where team_id=new.id and (status='paid' or amount<=0)) then perform public.sync_team_attendance(new.id); end if; return new;
end $$;
drop trigger if exists attendance_after_team_review on public.teams;
create trigger attendance_after_team_review after update of status on public.teams for each row execute function public._attendance_after_team_review();

create or replace function public._attendance_after_payment() returns trigger language plpgsql security definer set search_path=public as $$ begin
  if new.status='paid' and old.status is distinct from new.status then perform public.sync_team_attendance(new.team_id); end if; return new;
end $$;
drop trigger if exists attendance_after_payment on public.invoices;
create trigger attendance_after_payment after update of status on public.invoices for each row execute function public._attendance_after_payment();

revoke all on function public.sync_team_attendance(uuid) from public;
revoke all on function public.get_or_create_team_attendance(uuid) from public;
revoke all on function public.upsert_team_technical_file(uuid,text,text,text,text,bigint) from public;
revoke all on function public.submit_team_technical_files(uuid) from public;
revoke all on function public.review_team_technical_files(uuid,boolean,text) from public;
revoke all on function public.accept_team_attendance_rules(uuid,boolean,text) from public;
revoke all on function public.submit_team_member_correction(uuid) from public;
grant execute on function public.get_or_create_team_attendance(uuid),public.upsert_team_technical_file(uuid,text,text,text,text,bigint),public.submit_team_technical_files(uuid),public.review_team_technical_files(uuid,boolean,text),public.accept_team_attendance_rules(uuid,boolean,text),public.submit_team_member_correction(uuid) to authenticated;

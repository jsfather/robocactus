-- Participant identity, dependent team people and official multi-judge result engine.

create or replace function public.normalize_iran_mobile(p_value text)
returns text language sql immutable returns null on null input as $$
  select case
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^00989[0-9]{9}$' then '0' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 5)
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^989[0-9]{9}$' then '0' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 3)
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^9[0-9]{9}$' then '0' || regexp_replace(p_value, '[^0-9]', '', 'g')
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^09[0-9]{9}$' then regexp_replace(p_value, '[^0-9]', '', 'g')
    when trim(p_value) like '+%' and regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^[1-9][0-9]{7,14}$' then '+' || regexp_replace(p_value, '[^0-9]', '', 'g')
    when regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^00[1-9][0-9]{7,14}$' then '+' || substr(regexp_replace(p_value, '[^0-9]', '', 'g'), 3)
    else null
  end
$$;

create or replace function public.normalize_and_guard_profile_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text;
begin
  v_phone := public.normalize_iran_mobile(new.phone);
  if v_phone is null then raise exception 'invalid_mobile'; end if;
  if exists(select 1 from public.profiles p where p.id <> new.id and public.normalize_iran_mobile(p.phone) = v_phone)
    or exists(select 1 from auth.users u where u.id <> new.id and public.normalize_iran_mobile(u.phone) = v_phone)
  then raise exception 'duplicate_normalized_phone'; end if;
  new.phone := v_phone;
  return new;
end $$;
drop trigger if exists normalize_and_guard_profile_phone on public.profiles;
create trigger normalize_and_guard_profile_phone before insert or update of phone on public.profiles
for each row execute function public.normalize_and_guard_profile_phone();

create or replace function public.normalize_and_guard_auth_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text;
begin
  if nullif(trim(new.phone), '') is null then return new; end if;
  v_phone := public.normalize_iran_mobile(new.phone);
  if v_phone is null then raise exception 'invalid_mobile'; end if;
  if exists(select 1 from auth.users u where u.id <> new.id and public.normalize_iran_mobile(u.phone) = v_phone)
    or exists(select 1 from public.profiles p where p.id <> new.id and public.normalize_iran_mobile(p.phone) = v_phone)
  then raise exception 'duplicate_normalized_phone'; end if;
  new.phone := v_phone;
  return new;
end $$;
drop trigger if exists normalize_and_guard_auth_phone on auth.users;
create trigger normalize_and_guard_auth_phone before insert or update of phone on auth.users
for each row execute function public.normalize_and_guard_auth_phone();
create index if not exists profiles_normalized_phone_idx on public.profiles(public.normalize_iran_mobile(phone));
create index if not exists auth_users_normalized_phone_idx on auth.users(public.normalize_iran_mobile(phone));

alter table public.profiles
  add column if not exists gender text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists landline text,
  add column if not exists country_code text not null default 'IR',
  add column if not exists nationality text,
  add column if not exists residence text,
  add column if not exists is_foreign boolean not null default false,
  add column if not exists passport_number text,
  add column if not exists avatar_url text;
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check(gender is null or gender in ('male','female','other'));
create unique index if not exists profiles_passport_uidx on public.profiles(lower(passport_number)) where passport_number is not null and trim(passport_number) <> '';

create table if not exists public.participant_field_rules (
  field_key text primary key,
  label_fa text not null,
  label_en text not null,
  is_required boolean not null default false,
  is_locked boolean not null default false,
  applies_to text not null default 'both' check(applies_to in ('individual','legal','both')),
  updated_at timestamptz not null default now()
);
insert into public.participant_field_rules(field_key,label_fa,label_en,is_required,is_locked,applies_to) values
 ('first_name_fa','نام فارسی','Persian first name',true,true,'both'),
 ('last_name_fa','نام خانوادگی فارسی','Persian last name',true,true,'both'),
 ('first_name_en','نام انگلیسی','English first name',true,true,'both'),
 ('last_name_en','نام خانوادگی انگلیسی','English last name',true,true,'both'),
 ('birth_date','تاریخ تولد','Date of birth',true,true,'individual'),
 ('gender','جنسیت','Gender',true,false,'individual'),
 ('email','ایمیل','Email',true,false,'both'),
 ('province','استان','Province',true,false,'both'),
 ('city','شهر','City',true,false,'both'),
 ('landline','تلفن ثابت','Landline',false,false,'both'),
 ('country_code','کشور','Country',true,true,'both'),
 ('nationality','تابعیت','Nationality',true,false,'both'),
 ('residence','محل سکونت','Residence',true,false,'both'),
 ('postal_code','کد پستی','Postal code',true,false,'both'),
 ('address','نشانی','Address',true,false,'both'),
 ('avatar_url','تصویر پروفایل','Profile image',false,false,'both')
on conflict(field_key) do nothing;
alter table public.participant_field_rules enable row level security;
drop policy if exists participant_field_rules_read on public.participant_field_rules;
drop policy if exists participant_field_rules_admin on public.participant_field_rules;
create policy participant_field_rules_read on public.participant_field_rules for select to authenticated using(true);
create policy participant_field_rules_admin on public.participant_field_rules for all to authenticated using(public.is_super_admin()) with check(public.is_super_admin());

create or replace function public.validate_completed_participant_identity()
returns trigger language plpgsql set search_path = public as $$
declare v_rule record; v_value text;
begin
  if new.identity_completed_at is null then return new; end if;
  if new.is_foreign and nullif(trim(new.passport_number), '') is null then raise exception 'passport_required_for_foreign_participant'; end if;
  if not new.is_foreign and new.account_type = 'individual' and nullif(trim(new.national_id), '') is null then raise exception 'national_id_required_for_iranian_participant'; end if;
  for v_rule in select * from participant_field_rules where is_required and (applies_to = 'both' or applies_to = new.account_type) loop
    v_value := case v_rule.field_key
      when 'first_name_fa' then new.first_name_fa when 'last_name_fa' then new.last_name_fa
      when 'first_name_en' then new.first_name_en when 'last_name_en' then new.last_name_en
      when 'birth_date' then new.birth_date::text when 'gender' then new.gender when 'email' then new.email
      when 'province' then new.province when 'city' then new.city when 'landline' then new.landline
      when 'country_code' then new.country_code when 'nationality' then new.nationality
      when 'residence' then new.residence when 'postal_code' then new.postal_code when 'address' then new.address
      when 'avatar_url' then new.avatar_url else 'unsupported'
    end;
    if nullif(trim(v_value), '') is null then raise exception 'required_participant_field:%', v_rule.field_key; end if;
  end loop;
  return new;
end $$;
drop trigger if exists validate_completed_participant_identity on public.profiles;
create trigger validate_completed_participant_identity before insert or update on public.profiles
for each row execute function public.validate_completed_participant_identity();

alter table public.team_members
  add column if not exists father_name_fa text,
  add column if not exists father_name_en text,
  add column if not exists photo_url text,
  add column if not exists phone text,
  add column if not exists residence text,
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists country_code text not null default 'IR',
  add column if not exists nationality text,
  add column if not exists is_foreign boolean not null default false,
  add column if not exists passport_number text,
  add column if not exists education_level text,
  add column if not exists field_of_study text;
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check(role in ('captain','coach','member'));
alter table public.team_members drop constraint if exists team_members_education_level_check;
alter table public.team_members add constraint team_members_education_level_check check(education_level is null or education_level in ('primary','middle_school','high_school','associate','bachelor','master','doctorate'));

alter table public.leagues add column if not exists coach_fee numeric not null default 0;
alter table public.leagues add column if not exists result_formula text not null default 'average';
alter table public.leagues add column if not exists required_judge_count integer;
alter table public.leagues add constraint leagues_result_formula_check check(result_formula in ('average','sum'));

create or replace function public.validate_team_people_before_payment()
returns trigger language plpgsql set search_path = public as $$
declare v_person record;
begin
  if new.lifecycle_status <> 'awaiting_payment' or old.lifecycle_status = 'awaiting_payment' then return new; end if;
  if not exists(select 1 from team_members where team_id = new.id and role = 'captain') then raise exception 'team_captain_required'; end if;
  for v_person in select * from team_members where team_id = new.id loop
    if nullif(trim(v_person.first_name_fa), '') is null or nullif(trim(v_person.last_name_fa), '') is null
      or nullif(trim(v_person.first_name_en), '') is null or nullif(trim(v_person.last_name_en), '') is null
      or v_person.birth_date is null or nullif(trim(v_person.photo_url), '') is null
      or nullif(trim(v_person.father_name_fa), '') is null or nullif(trim(v_person.father_name_en), '') is null
      or nullif(trim(v_person.residence), '') is null or nullif(trim(v_person.country_code), '') is null
      or nullif(trim(v_person.education_level), '') is null
    then raise exception 'incomplete_team_person:%', v_person.id; end if;
    if v_person.is_foreign and nullif(trim(v_person.passport_number), '') is null then raise exception 'team_person_passport_required:%', v_person.id; end if;
    if not v_person.is_foreign and nullif(trim(v_person.national_id), '') is null then raise exception 'team_person_national_id_required:%', v_person.id; end if;
    if v_person.role in ('captain','coach') and nullif(trim(v_person.phone), '') is null then raise exception 'team_person_phone_required:%', v_person.id; end if;
  end loop;
  return new;
end $$;
drop trigger if exists validate_team_people_before_payment on public.teams;
create trigger validate_team_people_before_payment before update of lifecycle_status on public.teams
for each row execute function public.validate_team_people_before_payment();

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_team teams%rowtype; v_fee numeric; v_member_count integer; v_coach_count integer; v_invoice invoices%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_team from teams where id = p_team_id;
  if not found then raise exception 'team not found'; end if;
  if v_team.status <> 'draft' then raise exception 'team is not in draft status'; end if;
  if not public.is_super_admin() and not exists(select 1 from company_members cm where cm.company_id=v_team.company_id and cm.user_id=v_uid) and v_team.captain_id<>v_uid then raise exception 'forbidden'; end if;
  select count(*) filter(where role='member'), count(*) filter(where role='coach') into v_member_count,v_coach_count from team_members where team_id=p_team_id;
  select coalesce(registration_fee,0)+coalesce(captain_fee,0)+coalesce(member_fee,0)*v_member_count+coalesce(coach_fee,0)*v_coach_count into v_fee from leagues where id=v_team.league_id;
  select * into v_invoice from invoices where team_id=p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then update invoices set amount=v_fee,company_id=v_team.company_id,status=case when receipt_status='pending_review' then status else 'pending'::payment_status end where id=v_invoice.id returning * into v_invoice; return v_invoice; end if;
  insert into invoices(team_id,company_id,amount,status,invoice_number) values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number()) returning * into v_invoice;
  return v_invoice;
end $$;

alter table public.league_admins add column if not exists assignment_role text not null default 'judge';
alter table public.league_admins drop constraint if exists league_admins_assignment_role_check;
alter table public.league_admins add constraint league_admins_assignment_role_check check(assignment_role in ('judge','head_judge','operator'));

create table if not exists public.judge_scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  judge_id uuid not null references public.profiles(id) on delete restrict,
  season_year integer not null,
  score_payload jsonb not null default '{}'::jsonb,
  total_score numeric not null default 0,
  notes text,
  status text not null default 'draft' check(status in ('draft','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(team_id,judge_id,season_year)
);
delete from public.results a using public.results b
where a.team_id=b.team_id and a.season_year=b.season_year and a.id>b.id;
create unique index if not exists results_team_season_uidx on public.results(team_id,season_year);
alter table public.judge_scores enable row level security;
drop policy if exists judge_scores_read on public.judge_scores;
drop policy if exists judge_scores_write on public.judge_scores;
create policy judge_scores_read on public.judge_scores for select to authenticated using(public.is_super_admin() or judge_id=auth.uid() or exists(select 1 from league_admins la where la.league_id=judge_scores.league_id and la.user_id=auth.uid()));
create policy judge_scores_write on public.judge_scores for all to authenticated using(public.is_super_admin() or judge_id=auth.uid()) with check(public.is_super_admin() or (judge_id=auth.uid() and exists(select 1 from league_admins la where la.league_id=judge_scores.league_id and la.user_id=auth.uid() and la.assignment_role in ('judge','head_judge'))));

create or replace function public.aggregate_official_league_results(p_league_id uuid,p_season_year integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_required integer; v_formula text;
begin
  select coalesce(required_judge_count,(select count(*) from league_admins where league_id=p_league_id and assignment_role in ('judge','head_judge'))),result_formula into v_required,v_formula from leagues where id=p_league_id;
  if v_required < 1 then return; end if;
  insert into results(league_id,team_id,company_id,season_year,score,rank,notes,published_at)
  select p_league_id,t.id,t.company_id,p_season_year,
    case when v_formula='sum' then sum(js.total_score) else avg(js.total_score) end,null,
    'official_multi_judge_engine',null
  from teams t
  join judge_scores js on js.team_id=t.id and js.season_year=p_season_year and js.status='submitted'
  join league_admins assigned on assigned.league_id=p_league_id and assigned.user_id=js.judge_id and assigned.assignment_role in ('judge','head_judge')
  where t.league_id=p_league_id group by t.id,t.company_id
  having count(distinct js.judge_id)>=v_required
  on conflict(team_id,season_year) do update set score=excluded.score,notes=excluded.notes;
  with ranked as(select id,dense_rank() over(order by score desc nulls last)::integer as calculated_rank from results where league_id=p_league_id and season_year=p_season_year and notes='official_multi_judge_engine')
  update results r set rank=ranked.calculated_rank from ranked where r.id=ranked.id;
end $$;

create or replace function public.save_judge_score(p_team_id uuid,p_season_year integer,p_scores jsonb,p_notes text default null,p_submit boolean default false)
returns public.judge_scores language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_row judge_scores%rowtype; v_total numeric;
begin
  select * into v_team from teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not exists(select 1 from league_admins where league_id=v_team.league_id and user_id=auth.uid() and assignment_role in ('judge','head_judge')) and not public.is_super_admin() then raise exception 'forbidden'; end if;
  if exists(select 1 from judge_scores where team_id=p_team_id and judge_id=auth.uid() and season_year=p_season_year and status='submitted') then raise exception 'judge_score_already_submitted'; end if;
  select coalesce(sum(value::numeric),0) into v_total from jsonb_each_text(coalesce(p_scores,'{}'::jsonb)) where value ~ '^-?[0-9]+(\.[0-9]+)?$';
  insert into judge_scores(league_id,team_id,judge_id,season_year,score_payload,total_score,notes,status,submitted_at)
  values(v_team.league_id,p_team_id,auth.uid(),p_season_year,coalesce(p_scores,'{}'::jsonb),v_total,nullif(trim(p_notes),''),case when p_submit then 'submitted' else 'draft' end,case when p_submit then now() else null end)
  on conflict(team_id,judge_id,season_year) do update set score_payload=excluded.score_payload,total_score=excluded.total_score,notes=excluded.notes,status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now()
  returning * into v_row;
  perform aggregate_official_league_results(v_team.league_id,p_season_year);
  return v_row;
end $$;
revoke all on function public.save_judge_score(uuid,integer,jsonb,text,boolean) from public;
grant execute on function public.save_judge_score(uuid,integer,jsonb,text,boolean) to authenticated;

create or replace function public.publish_official_team_result(p_team_id uuid,p_season_year integer)
returns public.results language plpgsql security definer set search_path=public as $$
declare v_team teams%rowtype; v_result results%rowtype; v_required integer; v_submitted integer;
begin
  select * into v_team from teams where id=p_team_id; if not found then raise exception 'team_not_found'; end if;
  if not public.is_super_admin() and not exists(select 1 from league_admins where league_id=v_team.league_id and user_id=auth.uid() and assignment_role='head_judge') then raise exception 'head_judge_required'; end if;
  select coalesce(l.required_judge_count,count(distinct la.user_id) filter(where la.assignment_role in ('judge','head_judge'))),
    count(distinct js.judge_id) filter(where js.status='submitted') into v_required,v_submitted
  from leagues l left join league_admins la on la.league_id=l.id
  left join judge_scores js on js.team_id=p_team_id and js.season_year=p_season_year and js.judge_id=la.user_id
  where l.id=v_team.league_id group by l.required_judge_count;
  if v_required<1 or v_submitted<v_required then raise exception 'judge_scores_incomplete:%/%',v_submitted,v_required; end if;
  perform aggregate_official_league_results(v_team.league_id,p_season_year);
  update results set published_at=coalesce(published_at,now()) where team_id=p_team_id and season_year=p_season_year and notes='official_multi_judge_engine' returning * into v_result;
  if not found then raise exception 'official_result_not_ready'; end if;
  return v_result;
end $$;
revoke all on function public.publish_official_team_result(uuid,integer) from public;
grant execute on function public.publish_official_team_result(uuid,integer) to authenticated;
-- The legacy last-write-wins RPC must not bypass the official multi-judge engine.
revoke execute on function public.upsert_team_result(uuid,integer,integer,numeric,text,boolean) from authenticated;

create or replace view public.judge_submission_progress with(security_invoker=true) as
select t.id team_id,t.league_id,t.season_year,
  coalesce(l.required_judge_count,count(distinct la.user_id) filter(where la.assignment_role in ('judge','head_judge'))) required_count,
  count(distinct js.judge_id) filter(where js.status='submitted') submitted_count,
  array_agg(distinct p.full_name) filter(where la.assignment_role in ('judge','head_judge') and not exists(select 1 from judge_scores missing where missing.team_id=t.id and missing.judge_id=la.user_id and missing.season_year=t.season_year and missing.status='submitted')) missing_judges
from teams t join leagues l on l.id=t.league_id left join league_admins la on la.league_id=t.league_id left join profiles p on p.id=la.user_id left join judge_scores js on js.team_id=t.id and js.season_year=t.season_year and js.status='submitted' and js.judge_id=la.user_id
group by t.id,t.league_id,t.season_year,l.required_judge_count;
grant select on public.judge_submission_progress to authenticated;

create or replace view public.public_team_people with(security_invoker=false) as
select tm.id,tm.team_id,tm.full_name,tm.first_name_fa,tm.last_name_fa,tm.first_name_en,tm.last_name_en,tm.photo_url,tm.role
from public.team_members tm join public.teams t on t.id=tm.team_id
where t.status in ('submitted','under_review','approved','waitlisted');
grant select on public.public_team_people to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('profile-avatars','profile-avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('team-member-photos','team-member-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
drop policy if exists profile_avatars_manage on storage.objects;
drop policy if exists team_member_photos_manage on storage.objects;
create policy profile_avatars_manage on storage.objects for all to authenticated using(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_super_admin())) with check(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_super_admin()));
create policy team_member_photos_manage on storage.objects for all to authenticated
using(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[0] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))))
with check(bucket_id='team-member-photos' and (public.is_super_admin() or exists(select 1 from teams t where t.id::text=(storage.foldername(name))[0] and (t.captain_id=auth.uid() or exists(select 1 from company_members cm where cm.company_id=t.company_id and cm.user_id=auth.uid())))));

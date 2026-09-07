alter table public.home_events
  add column if not exists group_title_fa text,
  add column if not exists group_title_en text,
  add column if not exists icon_key text not null default 'calendar'
    check (icon_key in ('calendar','registration','payment','team_review','trophy'));

update public.home_events set
  group_title_fa=coalesce(group_title_fa,'تقویم پیش روی جام تبرستان'),
  group_title_en=coalesce(group_title_en,'Upcoming Tabarestan Cup calendar')
where group_title_fa is null or group_title_en is null;

-- Public team history deliberately excludes identity documents, photos,
-- national identifiers, birth dates and private contact information.
create or replace view public.public_company_team_history with (security_invoker=false) as
select t.id,t.company_id,t.name team_name,t.name_en team_name_en,t.season_year,
  coalesce(t.season_month,l.current_season_month) season_month,
  l.name league_name,l.name_en league_name_en,l.slug league_slug,
  coalesce(cap.country_code,'IR') country_code,
  concat_ws(' ',cap.first_name_fa,cap.last_name_fa) captain_name_fa,
  concat_ws(' ',cap.first_name_en,cap.last_name_en) captain_name_en,
  (select count(*)::integer from public.team_members member_count where member_count.team_id=t.id) member_count
from public.teams t
join public.leagues l on l.id=t.league_id
left join lateral (
  select m.first_name_fa,m.last_name_fa,m.first_name_en,m.last_name_en,m.country_code
  from public.team_members m where m.team_id=t.id and m.role='captain'
  order by m.id limit 1
) cap on true
where t.lifecycle_status='completed' or t.status='approved';
grant select on public.public_company_team_history to anon,authenticated;

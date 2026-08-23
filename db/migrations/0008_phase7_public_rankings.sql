-- Phase 7: public visibility for teams shown in rankings / company profiles

-- Anonymous visitors need to read team names joined from published results,
-- and approved teams on public company profiles.
create policy "teams_public_archive_select"
  on teams for select using (
    status = 'approved'
    or exists (
      select 1
      from results r
      where r.team_id = teams.id
        and r.published_at is not null
    )
  );

-- Helpful view for company championship rollup (optional consumption)
create or replace view public.company_podium_results
with (security_invoker = true)
as
select
  r.*,
  t.name as team_name,
  c.name as company_name,
  c.slug as company_slug,
  l.name as league_name
from results r
join teams t on t.id = r.team_id
join companies c on c.id = r.company_id
join leagues l on l.id = r.league_id
where r.published_at is not null
  and r.rank is not null
  and r.rank <= 3;

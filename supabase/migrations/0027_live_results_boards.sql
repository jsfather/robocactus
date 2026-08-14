-- Live / final results boards for public pages

alter table leagues
  add column if not exists results_status text not null default 'auto';

alter table leagues drop constraint if exists leagues_results_status_check;
alter table leagues
  add constraint leagues_results_status_check
  check (results_status in ('auto', 'hidden', 'live', 'final'));

comment on column leagues.results_status is
  'auto=derive from period; live=public live board; final=podium cups; hidden=off';

-- League admin or super admin can flip board mode
create or replace function public.set_league_results_status(
  p_league_id uuid,
  p_status text
)
returns leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row leagues%rowtype;
begin
  if p_status is null or p_status not in ('auto', 'hidden', 'live', 'final') then
    raise exception 'invalid_status';
  end if;

  if not (
    public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = p_league_id and la.user_id = auth.uid()
    )
  ) then
    raise exception 'forbidden';
  end if;

  update leagues
  set results_status = p_status
  where id = p_league_id
  returning * into v_row;

  if not found then
    raise exception 'not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_league_results_status from public;
grant execute on function public.set_league_results_status to authenticated;

-- Public can read live-board draft scores when league is live/final
drop policy if exists "results_public_select" on results;
create policy "results_public_select"
  on results for select using (
    published_at is not null
    or public.is_super_admin()
    or exists (
      select 1 from league_admins la
      where la.league_id = results.league_id and la.user_id = auth.uid()
    )
    or exists (
      select 1 from leagues l
      where l.id = results.league_id
        and l.results_status in ('live', 'final')
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table results;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table leagues;
  exception
    when duplicate_object then null;
  end;
end $$;

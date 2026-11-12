alter table public.announcements
  add column if not exists title_en text,
  add column if not exists body_en text,
  add column if not exists excerpt_en text,
  add column if not exists seo_title_en text,
  add column if not exists meta_description_en text,
  add column if not exists author_name_en text,
  add column if not exists cover_alt_en text;

drop trigger if exists app_realtime_capture on public.announcements;
create trigger app_realtime_capture after insert or update or delete on public.announcements
for each row execute function app_private.capture_realtime_event();

-- Return only the correspondence address required by authorized team reviewers,
-- without widening profile RLS or exposing a registrant's entire profile.
create or replace function public.get_team_review_location(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_team public.teams%rowtype; v_address text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_team from public.teams where id=p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if not (coalesce(public.is_super_admin(),false) or (
    coalesce(public.has_panel_permission('team_review'),false) and exists (
      select 1 from public.league_admins la where la.league_id=v_team.league_id and la.user_id=auth.uid()
    )
  )) then raise exception 'forbidden'; end if;
  select nullif(trim(address),'') into v_address from public.profiles where id=v_team.captain_id;
  return jsonb_build_object('team_id',v_team.id,'province',v_team.province,'city',v_team.city,'correspondence_address',v_address);
end;
$$;
revoke all on function public.get_team_review_location(uuid) from public;
grant execute on function public.get_team_review_location(uuid) to authenticated;

-- Some upgraded databases can still retain the pre-registration-flow trigger
-- that hard-coded portrait/document requirements and raises
-- incomplete_team_person. Reinstall the trigger against the canonical,
-- league-aware person validator.

create or replace function public.validate_team_people_before_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_person public.team_members%rowtype;
begin
  if new.lifecycle_status in (
       'awaiting_review',
       'awaiting_payment',
       'payment_pending',
       'payment_submitted',
       'registered'
     )
     and old.lifecycle_status is distinct from new.lifecycle_status then
    for v_person in
      select * from public.team_members where team_id = new.id
    loop
      if not public._team_person_complete_for_league(v_person, new.league_id) then
        raise exception 'team_dossier_incomplete:member_identity';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_team_people_before_payment on public.teams;
create trigger validate_team_people_before_payment
before update of lifecycle_status on public.teams
for each row execute function public.validate_team_people_before_payment();


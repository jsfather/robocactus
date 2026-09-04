-- Follow-up to 0070. Keep applied migrations immutable so checksum validation remains reliable.

-- Existing paid registrations must enter the same clearance flow as new payments.
do $$
declare
  v_team_id uuid;
begin
  for v_team_id in
    select distinct i.team_id
    from public.invoices i
    where i.team_id is not null
      and (i.status = 'paid' or i.amount <= 0)
  loop
    perform public.sync_team_attendance(v_team_id);
  end loop;
end $$;

-- A judge may only score a team after its attendance clearance is complete.
create or replace function public._guard_judge_score_clearance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.team_attendance_clearances c
    where c.team_id = new.team_id
      and c.stage = 'confirmed'
      and c.confirmed_at is not null
  ) then
    raise exception 'team_attendance_not_confirmed';
  end if;
  return new;
end
$$;

drop trigger if exists guard_judge_score_clearance on public.judge_scores;
create trigger guard_judge_score_clearance
before insert or update on public.judge_scores
for each row execute function public._guard_judge_score_clearance();

revoke all on function public._guard_judge_score_clearance() from public;

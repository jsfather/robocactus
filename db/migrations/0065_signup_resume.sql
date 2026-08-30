-- Resume account signup after abandonment; guard duplicate national IDs for individuals.
alter table public.profiles
  add column if not exists signup_step text,
  add column if not exists signup_completed_at timestamptz;

create unique index if not exists profiles_national_id_individual_uidx
  on public.profiles (national_id)
  where account_type = 'individual' and national_id is not null and length(trim(national_id)) > 0;

create or replace function public.guard_duplicate_profile_national_id()
returns trigger
language plpgsql
as $$
begin
  if new.account_type = 'individual'
    and new.national_id is not null
    and length(trim(new.national_id)) > 0
    and exists (
      select 1
      from public.profiles p
      where p.id <> new.id
        and p.account_type = 'individual'
        and p.national_id = new.national_id
      limit 1
    )
  then
    raise exception 'duplicate_national_id';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_duplicate_profile_national_id on public.profiles;
create trigger guard_duplicate_profile_national_id
  before insert or update of national_id, account_type on public.profiles
  for each row execute function public.guard_duplicate_profile_national_id();

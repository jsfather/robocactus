-- Participant account owns an organization ("majmooe") and organizations own teams.
-- Keep the existing companies table name for backward compatibility with APIs and reports.
alter table public.companies
  add column if not exists entity_type text not null default 'company';

alter table public.companies drop constraint if exists companies_entity_type_check;
alter table public.companies add constraint companies_entity_type_check check (
  entity_type in ('individual','company','institute','school','university','academy','club','other')
);

comment on table public.companies is 'Participant organizations/accounts. May represent an individual or an organization; teams are children through teams.company_id.';
comment on column public.companies.entity_type is 'individual, company, institute, school, university, academy, club, or other';

update public.companies c set entity_type = 'individual'
where exists (
  select 1 from public.company_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.company_id = c.id and cm.is_owner = true and p.account_type = 'individual'
);

create or replace view public.participant_organizations as
select c.*, cm.user_id as owner_user_id
from public.companies c
left join public.company_members cm on cm.company_id = c.id and cm.is_owner = true;

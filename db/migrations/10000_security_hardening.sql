-- Keep payment provider secrets out of the broad runtime table grants.
-- SECURITY DEFINER functions continue to read this table through their owner
-- privileges, while API roles can no longer query or mutate it directly.
alter table if exists public.payment_config enable row level security;
drop policy if exists payment_config_no_direct_access on public.payment_config;
create policy payment_config_no_direct_access on public.payment_config
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.payment_config from anon, authenticated;

-- An administrator deleting an account must be able to remove the complete
-- company dossier.  Teams belong to their company, so the FK must cascade;
-- the account deletion transaction still deletes teams explicitly first to
-- clean dependent operational rows and storage paths.
alter table public.teams drop constraint if exists teams_company_id_fkey;
alter table public.teams add constraint teams_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

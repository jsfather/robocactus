-- Repair installations whose older constraints/grants drifted from the current
-- account-deletion and ticket authorization model.

alter table public.teams drop constraint if exists teams_company_id_fkey;
alter table public.teams
  add constraint teams_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.invoices drop constraint if exists invoices_team_id_fkey;
alter table public.invoices
  add constraint invoices_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.invoices drop constraint if exists invoices_company_id_fkey;
alter table public.invoices
  add constraint invoices_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.results drop constraint if exists results_team_id_fkey;
alter table public.results
  add constraint results_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

alter table public.results drop constraint if exists results_company_id_fkey;
alter table public.results
  add constraint results_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.tickets drop constraint if exists tickets_team_id_fkey;
alter table public.tickets
  add constraint tickets_team_id_fkey
  foreign key (team_id) references public.teams(id) on delete cascade;

-- These SECURITY DEFINER functions still enforce visibility using auth.uid().
-- Re-granting execution restores access for authenticated users without making
-- ticket data public or bypassing the function-level authorization rules.
revoke all on function public.count_unread_tickets() from public;
revoke all on function public.list_unread_ticket_ids() from public;
grant execute on function public.count_unread_tickets() to authenticated;
grant execute on function public.list_unread_ticket_ids() to authenticated;


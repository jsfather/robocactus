-- Account deletion follows the participant domain: the account owns its teams.
-- Financial/result/ticket rows belonging to those teams are removed only when a
-- super administrator explicitly deletes the owning account.
alter table public.teams drop constraint if exists teams_captain_id_fkey;
alter table public.teams add constraint teams_captain_id_fkey foreign key (captain_id) references public.profiles(id) on delete cascade;

alter table public.teams drop constraint if exists teams_reviewed_by_fkey;
alter table public.teams add constraint teams_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_team_id_fkey;
alter table public.invoices add constraint invoices_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.invoices drop constraint if exists invoices_company_id_fkey;
alter table public.invoices add constraint invoices_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.results drop constraint if exists results_team_id_fkey;
alter table public.results add constraint results_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.results drop constraint if exists results_company_id_fkey;
alter table public.results add constraint results_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;

alter table public.tickets drop constraint if exists tickets_team_id_fkey;
alter table public.tickets add constraint tickets_team_id_fkey foreign key (team_id) references public.teams(id) on delete cascade;
alter table public.tickets drop constraint if exists tickets_assigned_to_fkey;
alter table public.tickets add constraint tickets_assigned_to_fkey foreign key (assigned_to) references public.profiles(id) on delete set null;

alter table public.notification_log drop constraint if exists notification_log_team_id_fkey;
alter table public.notification_log add constraint notification_log_team_id_fkey foreign key (team_id) references public.teams(id) on delete set null;

alter table public.announcements drop constraint if exists announcements_created_by_fkey;
alter table public.announcements add constraint announcements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.blog_posts drop constraint if exists blog_posts_author_id_fkey;
alter table public.blog_posts add constraint blog_posts_author_id_fkey foreign key (author_id) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_receipt_reviewed_by_fkey;
alter table public.invoices add constraint invoices_receipt_reviewed_by_fkey foreign key (receipt_reviewed_by) references public.profiles(id) on delete set null;

alter table public.account_issues drop constraint if exists account_issues_created_by_fkey;
alter table public.account_issues add constraint account_issues_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;
alter table public.system_notifications drop constraint if exists system_notifications_created_by_fkey;
alter table public.system_notifications add constraint system_notifications_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.captain_invites drop constraint if exists captain_invites_invited_by_fkey;
alter table public.captain_invites add constraint captain_invites_invited_by_fkey foreign key (invited_by) references public.profiles(id) on delete cascade;

alter table public.ticket_messages alter column sender_id drop not null;
alter table public.ticket_messages drop constraint if exists ticket_messages_sender_id_fkey;
alter table public.ticket_messages add constraint ticket_messages_sender_id_fkey foreign key (sender_id) references public.profiles(id) on delete set null;

alter table public.invoices drop constraint if exists invoices_registration_id_fkey;
alter table public.invoices add constraint invoices_registration_id_fkey foreign key (registration_id) references public.teams(id) on delete cascade;

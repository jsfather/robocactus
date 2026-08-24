-- Ticket support departments (queues) + optional FK on tickets

create table if not exists ticket_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table tickets
  add column if not exists department_id uuid references ticket_departments(id) on delete set null;

create index if not exists tickets_department_id_idx on tickets(department_id);

alter table ticket_departments enable row level security;

drop policy if exists "ticket_departments_select_auth" on ticket_departments;
create policy "ticket_departments_select_auth"
  on ticket_departments for select
  to authenticated
  using (true);

drop policy if exists "ticket_departments_sa_write" on ticket_departments;
create policy "ticket_departments_sa_write"
  on ticket_departments for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into ticket_departments (name, slug, description, sort_order)
values
  ('عمومی', 'general', 'صف پشتیبانی عمومی', 1),
  ('فنی', 'technical', 'مسائل فنی و پلتفرم', 2),
  ('مالی', 'finance', 'پرداخت و فاکتور', 3)
on conflict (slug) do nothing;

create or replace function public.ticket_status_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is null or v_role not in ('super_admin', 'staff', 'league_admin') then
    raise exception 'forbidden';
  end if;

  return (
    select jsonb_build_object(
      'open', count(*) filter (where status = 'open'),
      'answered', count(*) filter (where status = 'answered'),
      'closed', count(*) filter (where status = 'closed'),
      'total', count(*)
    )
    from tickets
  );
end;
$$;

revoke all on function public.ticket_status_counts from public;
grant execute on function public.ticket_status_counts to authenticated;

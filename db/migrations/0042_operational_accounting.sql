-- Operational accounting: invoice lifecycle and a real deposit ledger.

drop view if exists public.invoice_finance_view;

alter table public.invoices
  add column if not exists admin_note text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  transaction_type text not null default 'deposit' check (transaction_type in ('deposit', 'refund', 'adjustment')),
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  amount numeric not null check (amount >= 0),
  payment_method text not null check (payment_method in ('online', 'card_to_card', 'manual')),
  reference text,
  occurred_at timestamptz not null default now(),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, transaction_type)
);

create index if not exists finance_transactions_occurred_idx on public.finance_transactions (occurred_at desc);
create index if not exists finance_transactions_method_idx on public.finance_transactions (payment_method, status);
alter table public.finance_transactions enable row level security;
drop policy if exists finance_transactions_super_admin on public.finance_transactions;
create policy finance_transactions_super_admin on public.finance_transactions for select to authenticated
  using (public.is_super_admin());
revoke all on public.finance_transactions from anon;
grant select on public.finance_transactions to authenticated;

create or replace function public.sync_invoice_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' then
    insert into public.finance_transactions (
      invoice_id, transaction_type, status, amount, payment_method, reference, occurred_at, reversed_at
    ) values (
      new.id, 'deposit', 'posted', new.amount,
      case when new.payment_method = 'card_to_card' then 'card_to_card' else 'online' end,
      new.gateway_ref, coalesce(new.paid_at, now()), null
    )
    on conflict (invoice_id, transaction_type) do update set
      status = 'posted', amount = excluded.amount, payment_method = excluded.payment_method,
      reference = excluded.reference, occurred_at = excluded.occurred_at,
      reversed_at = null, updated_at = now();
  elsif old.status = 'paid' and new.status <> 'paid' then
    update public.finance_transactions set status = 'reversed', reversed_at = now(), updated_at = now()
    where invoice_id = new.id and transaction_type = 'deposit';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_sync_deposit on public.invoices;
create trigger invoices_sync_deposit after insert or update of status, amount, payment_method, gateway_ref, paid_at
on public.invoices for each row execute function public.sync_invoice_deposit();

insert into public.finance_transactions (invoice_id, transaction_type, status, amount, payment_method, reference, occurred_at)
select i.id, 'deposit', 'posted', i.amount,
  case when i.payment_method = 'card_to_card' then 'card_to_card' else 'online' end,
  i.gateway_ref, coalesce(i.paid_at, i.created_at, now())
from public.invoices i where i.status = 'paid'
on conflict (invoice_id, transaction_type) do update set
  status = 'posted', amount = excluded.amount, payment_method = excluded.payment_method,
  reference = excluded.reference, occurred_at = excluded.occurred_at, reversed_at = null, updated_at = now();

create or replace view public.invoice_finance_view with (security_invoker = true) as
select i.*, t.name as team_name, t.status as team_status, t.league_id,
  l.name as league_name, c.name as company_name, c.slug as company_slug
from public.invoices i
join public.teams t on t.id = i.team_id
join public.leagues l on l.id = t.league_id
join public.companies c on c.id = i.company_id;
grant select on public.invoice_finance_view to authenticated;

create or replace view public.finance_deposit_view with (security_invoker = true) as
select ft.*, i.invoice_number, i.status as invoice_status,
  t.name as team_name, t.league_id, l.name as league_name,
  c.id as company_id, c.name as company_name
from public.finance_transactions ft
join public.invoices i on i.id = ft.invoice_id
join public.teams t on t.id = i.team_id
join public.leagues l on l.id = t.league_id
join public.companies c on c.id = i.company_id;

grant select on public.finance_deposit_view to authenticated;

create or replace function public.admin_update_invoice(
  p_invoice_id uuid, p_amount numeric, p_status text, p_payment_method text, p_admin_note text default null
) returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_amount < 0 then raise exception 'invalid_amount'; end if;
  if p_status not in ('pending', 'paid', 'failed', 'refunded') then raise exception 'invalid_status'; end if;
  if p_payment_method not in ('online', 'card_to_card') then raise exception 'invalid_payment_method'; end if;
  update public.invoices set amount = p_amount, status = p_status::public.payment_status,
    payment_method = p_payment_method, admin_note = nullif(trim(coalesce(p_admin_note, '')), ''),
    paid_at = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
    updated_at = now()
  where id = p_invoice_id returning * into v_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  if p_status = 'paid' then
    update public.teams set status = 'submitted', submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id and status = 'draft';
  end if;
  return v_invoice;
end;
$$;

create or replace function public.admin_archive_invoice(p_invoice_id uuid, p_archived boolean default true)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  update public.invoices set archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then auth.uid() else null end, updated_at = now()
  where id = p_invoice_id returning * into v_invoice;
  if not found then raise exception 'invoice_not_found'; end if;
  return v_invoice;
end;
$$;

create or replace function public.admin_delete_invoice(p_invoice_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_invoice public.invoices%rowtype;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.status = 'paid' or v_invoice.receipt_status = 'approved' then
    raise exception 'paid_invoice_must_be_archived';
  end if;
  if v_invoice.receipt_path is not null then raise exception 'invoice_with_receipt_must_be_archived'; end if;
  delete from public.invoices where id = p_invoice_id;
  return true;
end;
$$;

revoke all on function public.admin_update_invoice(uuid, numeric, text, text, text) from public;
revoke all on function public.admin_archive_invoice(uuid, boolean) from public;
revoke all on function public.admin_delete_invoice(uuid) from public;
grant execute on function public.admin_update_invoice(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.admin_archive_invoice(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_invoice(uuid) to authenticated;

-- Durable ZarinPal attempts: an invoice can have multiple authorities and every
-- provider return remains recoverable even when the browser callback is lost.
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  provider text not null default 'zarinpal',
  authority text not null unique,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'requested' check (status in (
    'requested','verifying','paid','cancelled','failed','error','manual_review'
  )),
  provider_code integer,
  ref_id text,
  provider_message text,
  requested_at timestamptz not null default now(),
  returned_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists payment_attempts_invoice_requested_idx
  on public.payment_attempts(invoice_id, requested_at desc);
create index if not exists payment_attempts_open_idx
  on public.payment_attempts(status, requested_at desc)
  where status in ('requested','verifying','error','manual_review');

-- Preserve authorities issued by the previous single-column implementation so
-- an in-flight payment can still return safely during deployment.
insert into public.payment_attempts(invoice_id,user_id,authority,amount,status,requested_at)
select i.id,t.captain_id,i.gateway_ref,i.amount,'requested',i.created_at
from public.invoices i join public.teams t on t.id=i.team_id
where i.payment_method='online' and i.status in ('pending','failed')
  and nullif(trim(i.gateway_ref),'') is not null
on conflict(authority) do nothing;

alter table public.payment_attempts enable row level security;
drop policy if exists payment_attempts_owner_read on public.payment_attempts;
create policy payment_attempts_owner_read on public.payment_attempts for select to authenticated using (
  public.is_super_admin()
  or public.has_panel_permission('finance')
  or user_id = auth.uid()
  or exists (
    select 1 from public.invoices i
    join public.teams t on t.id=i.team_id
    where i.id=payment_attempts.invoice_id and t.captain_id=auth.uid()
  )
);

grant select on public.payment_attempts to authenticated;
comment on table public.payment_attempts is
  'Immutable-per-authority payment trail used for callback recovery and reconciliation.';

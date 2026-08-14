-- Phase 2: payments, invoices workflow, secure status transitions

create extension if not exists pgcrypto;

create table if not exists payment_config (
  key text primary key,
  value text not null
);

insert into payment_config (key, value) values
  ('payment_mode', 'mock'),
  ('mock_secret', encode(gen_random_bytes(16), 'hex')),
  ('currency', 'IRR')
on conflict (key) do nothing;

-- Readable by authenticated only for non-secret keys via RPC
create or replace function public.get_payment_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from payment_config where key = 'payment_mode'), 'mock');
$$;

revoke all on function public.get_payment_mode from public;
grant execute on function public.get_payment_mode to authenticated, anon;

create or replace function public._next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_date text := to_char(timezone('Asia/Tehran', now()), 'YYYYMMDD');
begin
  v_seq := (extract(epoch from now()) * 1000)::bigint % 1000000;
  return 'RC-' || v_date || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

-- Create (or reuse pending) invoice for a draft team
create or replace function public.create_invoice_for_team(p_team_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team teams%rowtype;
  v_fee numeric;
  v_invoice invoices%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_team from teams where id = p_team_id;
  if not found then
    raise exception 'team not found';
  end if;

  if v_team.status <> 'draft' then
    raise exception 'team is not in draft status';
  end if;

  if not public.is_super_admin()
     and not exists (
       select 1 from company_members cm
       where cm.company_id = v_team.company_id and cm.user_id = v_uid
     )
     and v_team.captain_id <> v_uid then
    raise exception 'forbidden';
  end if;

  select coalesce(registration_fee, 0) into v_fee
  from leagues where id = v_team.league_id;

  select * into v_invoice
  from invoices
  where team_id = p_team_id and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update invoices
    set amount = v_fee,
        company_id = v_team.company_id
    where id = v_invoice.id
    returning * into v_invoice;
    return v_invoice;
  end if;

  insert into invoices (
    team_id,
    company_id,
    amount,
    status,
    invoice_number
  ) values (
    v_team.id,
    v_team.company_id,
    v_fee,
    'pending',
    public._next_invoice_number()
  )
  returning * into v_invoice;

  return v_invoice;
end;
$$;

revoke all on function public.create_invoice_for_team from public;
grant execute on function public.create_invoice_for_team to authenticated;

-- Mark payment result. Production ZarinPal must call this from Edge Function (service role).
-- Mock mode allows company members with a valid mock authority token.
create or replace function public.apply_payment_result(
  p_invoice_id uuid,
  p_authority text,
  p_success boolean,
  p_gateway_ref text default null
)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice invoices%rowtype;
  v_mode text;
  v_secret text;
  v_expected text;
  v_ref text;
begin
  v_mode := public.get_payment_mode();

  select * into v_invoice from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found';
  end if;

  if v_invoice.status = 'paid' then
    return v_invoice; -- idempotent
  end if;

  if v_invoice.status <> 'pending' and v_invoice.status <> 'failed' then
    raise exception 'invoice not payable';
  end if;

  if v_mode = 'mock' then
    if v_uid is null then
      raise exception 'not authenticated';
    end if;

    if not public.is_super_admin()
       and not exists (
         select 1 from company_members cm
         where cm.company_id = v_invoice.company_id and cm.user_id = v_uid
       ) then
      raise exception 'forbidden';
    end if;

    select value into v_secret from payment_config where key = 'mock_secret';
    v_expected := 'MOCK-' || encode(
      digest(p_invoice_id::text || ':' || coalesce(v_secret, ''), 'sha256'),
      'hex'
    );

    if p_authority is distinct from v_expected then
      if starts_with(coalesce(p_authority, ''), 'MOCK-DEV-')
         and exists (
           select 1 from payment_config
           where key = 'allow_mock_dev' and value = 'true'
         ) then
        null; -- local UI simulation only
      else
        raise exception 'invalid mock authority';
      end if;
    end if;
  else
    -- zarinpal / other: only service_role (no JWT user) or super_admin
    if v_uid is not null and not public.is_super_admin() then
      raise exception 'use payment-verify edge function';
    end if;
  end if;

  v_ref := coalesce(p_gateway_ref, p_authority);

  if p_success then
    update invoices
    set status = 'paid',
        gateway_ref = v_ref,
        paid_at = now()
    where id = v_invoice.id
    returning * into v_invoice;

    update teams
    set status = 'submitted',
        submitted_at = coalesce(submitted_at, now())
    where id = v_invoice.team_id
      and status = 'draft';
  else
    update invoices
    set status = 'failed',
        gateway_ref = v_ref
    where id = v_invoice.id
    returning * into v_invoice;

    -- keep team in draft (explicit no-op if already draft)
    update teams
    set status = 'draft'
    where id = v_invoice.team_id
      and status = 'draft';
  end if;

  return v_invoice;
end;
$$;

revoke all on function public.apply_payment_result from public;
grant execute on function public.apply_payment_result to authenticated, service_role;

-- Issue mock authority for current invoice (mock mode only)
create or replace function public.issue_mock_payment_authority(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice invoices%rowtype;
  v_secret text;
begin
  if public.get_payment_mode() <> 'mock' then
    raise exception 'not in mock mode';
  end if;

  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invoice from invoices where id = p_invoice_id;
  if not found then
    raise exception 'invoice not found';
  end if;

  if not public.is_super_admin()
     and not exists (
       select 1 from company_members cm
       where cm.company_id = v_invoice.company_id and cm.user_id = v_uid
     ) then
    raise exception 'forbidden';
  end if;

  select value into v_secret from payment_config where key = 'mock_secret';
  return 'MOCK-' || encode(
    digest(p_invoice_id::text || ':' || coalesce(v_secret, ''), 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function public.issue_mock_payment_authority from public;
grant execute on function public.issue_mock_payment_authority to authenticated;

-- Enable mock-dev authorities for local callback simulation without reading secret
insert into payment_config (key, value) values ('allow_mock_dev', 'true')
on conflict (key) do nothing;

-- Finance listing helper for super admin (optional views)
create or replace view public.invoice_finance_view
with (security_invoker = true)
as
select
  i.*,
  t.name as team_name,
  t.status as team_status,
  t.league_id,
  l.name as league_name,
  c.name as company_name,
  c.slug as company_slug
from invoices i
join teams t on t.id = i.team_id
join leagues l on l.id = t.league_id
join companies c on c.id = i.company_id;

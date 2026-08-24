-- Phase 10: SMS OTP challenges + analytics + realtime for live dashboards

-- ============ OTP ============
create table if not exists auth_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_challenges_phone_created_idx
  on auth_otp_challenges (phone, created_at desc);

alter table auth_otp_challenges enable row level security;
-- no public policies: only service_role (bypass) / edge functions

-- ============ Analytics snapshot (super_admin only) ============
create or replace function public.analytics_snapshot()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select json_build_object(
    'generated_at', now(),
    'totals', json_build_object(
      'teams', (select count(*)::int from teams),
      'companies', (select count(*)::int from companies),
      'paid_invoices', (select count(*)::int from invoices where status = 'paid'),
      'paid_amount', (select coalesce(sum(amount), 0) from invoices where status = 'paid')
    ),
    'by_status', coalesce((
      select json_agg(json_build_object('key', status, 'count', cnt) order by cnt desc)
      from (
        select status::text as status, count(*)::int as cnt
        from teams
        group by status
      ) s
    ), '[]'::json),
    'by_league', coalesce((
      select json_agg(json_build_object('key', name, 'id', id, 'count', cnt) order by cnt desc)
      from (
        select l.id, l.name, count(t.id)::int as cnt
        from leagues l
        left join teams t on t.league_id = l.id
        where l.is_active = true
        group by l.id, l.name
      ) x
    ), '[]'::json),
    'by_province', coalesce((
      select json_agg(json_build_object('key', province, 'count', cnt) order by cnt desc)
      from (
        select coalesce(nullif(btrim(province), ''), '—') as province, count(*)::int as cnt
        from teams
        group by 1
        order by cnt desc
        limit 20
      ) p
    ), '[]'::json),
    'by_company', coalesce((
      select json_agg(json_build_object('key', name, 'id', id, 'slug', slug, 'count', cnt) order by cnt desc)
      from (
        select c.id, c.name, c.slug, count(t.id)::int as cnt
        from companies c
        left join teams t on t.company_id = c.id
        group by c.id, c.name, c.slug
        order by cnt desc
        limit 15
      ) c
    ), '[]'::json),
    'finance_by_status', coalesce((
      select json_agg(json_build_object('key', status, 'count', cnt, 'amount', amount) order by cnt desc)
      from (
        select status::text as status, count(*)::int as cnt, coalesce(sum(amount), 0) as amount
        from invoices
        group by status
      ) f
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.analytics_snapshot() from public;
grant execute on function public.analytics_snapshot() to authenticated;

-- Export rows for teams (+ finance) — super_admin
create or replace function public.analytics_export_teams()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  return coalesce((
    select json_agg(row_to_json(r) order by r.created_at desc)
    from (
      select
        t.id,
        t.name as team_name,
        t.status::text as status,
        t.province,
        t.city,
        t.member_count,
        t.created_at,
        t.submitted_at,
        l.name as league_name,
        l.slug as league_slug,
        c.name as company_name,
        c.slug as company_slug,
        p.full_name as captain_name,
        p.phone as captain_phone,
        i.invoice_number,
        i.amount as invoice_amount,
        i.status::text as invoice_status,
        i.paid_at
      from teams t
      join leagues l on l.id = t.league_id
      join companies c on c.id = t.company_id
      left join profiles p on p.id = t.captain_id
      left join lateral (
        select inv.*
        from invoices inv
        where inv.team_id = t.id
        order by inv.created_at desc
        limit 1
      ) i on true
    ) r
  ), '[]'::json);
end;
$$;

revoke all on function public.analytics_export_teams() from public;
grant execute on function public.analytics_export_teams() to authenticated;

-- Realtime for live analytics refresh
do $$
begin
  begin
    alter publication supabase_realtime add table teams;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table invoices;
  exception when duplicate_object then null;
  end;
end $$;

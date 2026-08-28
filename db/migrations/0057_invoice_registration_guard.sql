-- Invoice numbers must never collide, and invoices may only be generated after
-- team people and their required identity documents are complete.
create sequence if not exists public.invoice_number_seq;

create or replace function public._next_invoice_number()
returns text language sql security definer set search_path = public as $$
  select 'TC-' || to_char(timezone('Asia/Tehran', now()), 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text, 8, '0');
$$;

create or replace function public.create_invoice_for_team(p_team_id uuid)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team public.teams%rowtype;
  v_league public.leagues%rowtype;
  v_fee numeric;
  v_member_count integer;
  v_coach_count integer;
  v_total_count integer;
  v_captain_count integer;
  v_incomplete_count integer;
  v_invoice public.invoices%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found then raise exception 'team_not_found'; end if;
  if v_team.status <> 'draft' then raise exception 'team_not_payable'; end if;
  if not public.is_super_admin()
    and not exists (select 1 from public.company_members cm where cm.company_id = v_team.company_id and cm.user_id = v_uid)
    and v_team.captain_id <> v_uid then raise exception 'forbidden'; end if;

  select * into v_league from public.leagues where id = v_team.league_id;
  if not found then raise exception 'league_not_found'; end if;
  select count(*), count(*) filter (where role = 'captain'), count(*) filter (where role = 'member'),
    count(*) filter (where role = 'coach'),
    count(*) filter (where coalesce(first_name_fa,'') = '' or coalesce(last_name_fa,'') = '' or birth_date is null or coalesce(photo_url,'') = '' or coalesce(national_id_doc_path,'') = '')
  into v_total_count, v_captain_count, v_member_count, v_coach_count, v_incomplete_count
  from public.team_members where team_id = p_team_id;

  if v_captain_count < 1 then raise exception 'registration_incomplete:captain'; end if;
  if v_incomplete_count > 0 then raise exception 'registration_incomplete:people'; end if;
  if v_league.team_size_min is not null and v_total_count < v_league.team_size_min then raise exception 'registration_incomplete:min_members'; end if;
  if v_league.team_size_max is not null and v_total_count > v_league.team_size_max then raise exception 'registration_incomplete:max_members'; end if;
  if coalesce(v_team.registration_stage, '') not in ('invoice','payment','completed') and coalesce(v_team.lifecycle_status, '') <> 'awaiting_payment' then
    raise exception 'registration_incomplete:stage';
  end if;

  v_fee := coalesce(v_league.registration_fee,0) + coalesce(v_league.captain_fee,0)
    + coalesce(v_league.member_fee,0) * v_member_count + coalesce(v_league.coach_fee,0) * v_coach_count;
  select * into v_invoice from public.invoices where team_id = p_team_id and status in ('pending','failed') order by created_at desc limit 1;
  if found then
    update public.invoices set amount = v_fee, company_id = v_team.company_id,
      status = case when receipt_status = 'pending_review' then status else 'pending'::public.payment_status end,
      archived_at = null, updated_at = now()
    where id = v_invoice.id returning * into v_invoice;
    return v_invoice;
  end if;
  insert into public.invoices(team_id,company_id,amount,status,invoice_number)
  values(v_team.id,v_team.company_id,v_fee,'pending',public._next_invoice_number()) returning * into v_invoice;
  return v_invoice;
end;
$$;

revoke all on function public.create_invoice_for_team(uuid) from public;
grant execute on function public.create_invoice_for_team(uuid) to authenticated;

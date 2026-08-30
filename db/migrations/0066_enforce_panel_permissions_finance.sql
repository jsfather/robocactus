-- Enforce finance permissions at database level without broadening super-admin.
drop policy if exists finance_transactions_role_read on public.finance_transactions;
create policy finance_transactions_role_read on public.finance_transactions for select to authenticated
  using (public.has_panel_permission('finance'));

drop policy if exists invoices_finance_read on public.invoices;
create policy invoices_finance_read on public.invoices for select to authenticated
  using (public.has_panel_permission('finance'));
drop policy if exists invoices_finance_update on public.invoices;
create policy invoices_finance_update on public.invoices for update to authenticated
  using (public.has_panel_permission('finance')) with check (public.has_panel_permission('finance'));

drop policy if exists teams_finance_read on public.teams;
create policy teams_finance_read on public.teams for select to authenticated using (public.has_panel_permission('finance'));
drop policy if exists companies_finance_read on public.companies;
create policy companies_finance_read on public.companies for select to authenticated using (public.has_panel_permission('finance'));

do $$
declare v_name text; v_definition text;
begin
  foreach v_name in array array['admin_update_invoice','admin_archive_invoice','admin_delete_invoice','review_card_receipt'] loop
    select pg_get_functiondef(p.oid) into v_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name order by p.oid desc limit 1;
    if v_definition is not null then
      v_definition := replace(v_definition, 'public.is_super_admin()', 'public.has_panel_permission(''finance'')');
      execute v_definition;
    end if;
  end loop;
end $$;

do $$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='review_team' order by p.oid desc limit 1;
  if v_definition is not null and position('v_role = ''staff''' in v_definition) > 0 then
    v_definition := replace(v_definition, 'or v_role = ''staff''', 'or (v_role = ''staff'' and public.has_panel_permission(''triage''))');
    execute v_definition;
  end if;
end $$;

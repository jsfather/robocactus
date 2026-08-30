create or replace function public.admin_delete_team(p_team_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_team public.teams%rowtype;
  v_fk record;
begin
  if not public.is_super_admin() then
    raise exception 'forbidden';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'team_not_found';
  end if;

  if exists (select 1 from public.invoices where team_id = p_team_id and status = 'paid') then
    raise exception 'team_has_paid_invoice';
  end if;

  -- Remove direct dependants that were created by a registration.  This also
  -- covers extensions added by later migrations without hard-coding table names.
  for v_fk in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality as key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.teams'::regclass
      and array_length(con.conkey, 1) = 1
      and not (ns.nspname = 'public' and cls.relname = 'teams')
  loop
    execute format('delete from %I.%I where %I = $1', v_fk.schema_name, v_fk.table_name, v_fk.column_name)
      using p_team_id;
  end loop;

  delete from public.teams where id = p_team_id;
  return jsonb_build_object('id', p_team_id, 'deleted', true, 'name', v_team.name);
end;
$$;

revoke all on function public.admin_delete_team(uuid) from public;
grant execute on function public.admin_delete_team(uuid) to authenticated;

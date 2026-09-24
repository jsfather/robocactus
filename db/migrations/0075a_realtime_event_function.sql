-- Realtime triggers introduced in 0076 need this function on fresh databases.
-- Keep the definition idempotent because 9999_application_runtime also refreshes it.
create or replace function app_private.capture_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = app_private, public
as $$
begin
  insert into app_private.realtime_events(table_name, event, record, old_record)
  values (
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

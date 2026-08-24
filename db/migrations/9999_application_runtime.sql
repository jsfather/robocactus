-- Runtime privileges and database-backed realtime event capture.

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-documents', 'profile-documents', false, 5242880,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "profile_documents_storage_select" on storage.objects for select to authenticated
using (
  bucket_id = 'profile-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin())
);
create policy "profile_documents_storage_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "profile_documents_storage_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_super_admin())
);

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

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'teams', 'invoices', 'tickets', 'ticket_messages', 'ticket_reads',
    'results', 'leagues', 'live_chat_sessions', 'live_chat_messages',
    'system_notifications', 'account_issues'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists app_realtime_capture on public.%I', table_name);
      execute format(
        'create trigger app_realtime_capture after insert or update or delete on public.%I for each row execute function app_private.capture_realtime_event()',
        table_name
      );
    end if;
  end loop;
end
$$;

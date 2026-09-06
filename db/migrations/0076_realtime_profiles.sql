-- Realtime account approval events. The API still applies row visibility before delivery.
drop trigger if exists app_realtime_capture on public.profiles;
create trigger app_realtime_capture after insert or update or delete on public.profiles
for each row execute function app_private.capture_realtime_event();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'site_settings','home_banners','home_events','home_faqs','home_partners','home_sponsors',
    'home_stat_cards','home_why_cards','blog_posts','companies','team_attendance_clearances'
  ] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists app_realtime_capture on public.%I',table_name);
      execute format('create trigger app_realtime_capture after insert or update or delete on public.%I for each row execute function app_private.capture_realtime_event()',table_name);
    end if;
  end loop;
end $$;

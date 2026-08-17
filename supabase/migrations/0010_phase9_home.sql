-- Phase 9: home stats RPC + contact form inbox

create or replace function public.home_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'teams', (
      select count(*)::int
      from teams
      where status in ('submitted', 'under_review', 'approved', 'waitlisted')
    ),
    'cities', (
      select count(distinct city)::int
      from teams
      where city is not null and btrim(city) <> ''
    ),
    'leagues', (
      select count(*)::int from leagues where is_active = true
    ),
    'seasons', (
      select coalesce(count(distinct season_year), 0)::int
      from results
      where published_at is not null
    )
  );
$$;

revoke all on function public.home_stats() from public;
grant execute on function public.home_stats() to anon, authenticated;

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  subject text not null,
  body text not null,
  created_at timestamptz default now()
);

alter table contact_messages enable row level security;

drop policy if exists "contact_messages_insert_public" on contact_messages;
create policy "contact_messages_insert_public"
  on contact_messages for insert
  with check (true);

drop policy if exists "contact_messages_select_admin" on contact_messages;
create policy "contact_messages_select_admin"
  on contact_messages for select
  using (public.is_super_admin());

-- Sample active banners (gradient placeholders work without Storage)
insert into home_banners (title, subtitle, image_url, link_url, sort_order, is_active)
select * from (values
  (
    'روبوکاپ تبرستان',
    'رقابت رباتیک، یک پلتفرم',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1600&q=80',
    '/leagues',
    0,
    true
  ),
  (
    'ثبت‌نام تیم‌ها',
    'لیگ‌ها باز است — از همین‌جا شروع کنید',
    'https://images.unsplash.com/photo-1518314916381-77a37c2a49ae?auto=format&fit=crop&w=1600&q=80',
    '/signup',
    1,
    true
  )
) as v(title, subtitle, image_url, link_url, sort_order, is_active)
where not exists (select 1 from home_banners limit 1);

-- Global site settings (single-row)

create table if not exists site_settings (
  id int primary key default 1 check (id = 1),
  site_name_fa text not null default 'جام تبرستان',
  site_name_en text not null default 'Tabarestan Cup',
  tagline_fa text default 'پلتفرم مسابقات رباتیک',
  tagline_en text default 'Robotics competition platform',
  logo_url text,
  favicon_url text,
  color_primary text default '#2498d8',
  color_accent text default '#25d366',
  seo_title_fa text,
  seo_title_en text,
  seo_description_fa text,
  seo_description_en text,
  og_image_default text,
  footer_fa text,
  footer_en text,
  contact_blurb_fa text,
  contact_blurb_en text,
  nav_items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into site_settings (id) values (1)
on conflict (id) do nothing;

update site_settings
set nav_items = '[
  {"id":"home","href":"/","label_fa":"خانه","label_en":"Home","enabled":true,"order":1},
  {"id":"leagues","href":"/leagues","label_fa":"لیگ‌ها","label_en":"Leagues","enabled":true,"order":2},
  {"id":"rankings","href":"/rankings","label_fa":"رتبه‌بندی","label_en":"Rankings","enabled":true,"order":3},
  {"id":"companies","href":"/companies","label_fa":"شرکت‌ها","label_en":"Companies","enabled":true,"order":4},
  {"id":"blog","href":"/blog","label_fa":"بلاگ","label_en":"Blog","enabled":true,"order":5},
  {"id":"gallery","href":"/gallery","label_fa":"گالری","label_en":"Gallery","enabled":true,"order":6},
  {"id":"about","href":"/about","label_fa":"درباره","label_en":"About","enabled":true,"order":7}
]'::jsonb
where id = 1 and (nav_items is null or nav_items = '[]'::jsonb);

alter table site_settings enable row level security;

drop policy if exists "site_settings_public_select" on site_settings;
create policy "site_settings_public_select"
  on site_settings for select
  using (true);

drop policy if exists "site_settings_sa_write" on site_settings;
create policy "site_settings_sa_write"
  on site_settings for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

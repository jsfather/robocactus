-- Keep public rules metadata and the configurable rules notice in the same
-- source of truth as the records that render them.
alter table public.leagues
  add column if not exists rules_updated_at timestamptz not null default now();

update public.leagues
set rules_updated_at = coalesce(rules_updated_at, created_at, now())
where rules_updated_at is null;

create or replace function public.touch_league_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.rules_summary is distinct from old.rules_summary
     or new.rules_summary_en is distinct from old.rules_summary_en
     or new.rules_pdf_url is distinct from old.rules_pdf_url
  then
    new.rules_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists leagues_rules_updated_at on public.leagues;
create trigger leagues_rules_updated_at
before update of rules_summary, rules_summary_en, rules_pdf_url on public.leagues
for each row execute function public.touch_league_rules_updated_at();

alter table public.site_settings
  add column if not exists league_rules_notice_enabled boolean not null default true,
  add column if not exists league_rules_notice_fa text not null default 'توجه: قوانین لیگ ممکن است تا ۱۰ روز پیش از شروع مسابقات تغییر کند. لطفاً صفحه لیگ را تا زمان آغاز مسابقه بررسی کنید.',
  add column if not exists league_rules_notice_en text not null default 'Please note: league rules may change up to 10 days before the competition starts. Check the league page until the event begins.';

update public.site_settings
set league_rules_notice_fa = coalesce(nullif(trim(league_rules_notice_fa), ''), 'توجه: قوانین لیگ ممکن است تا ۱۰ روز پیش از شروع مسابقات تغییر کند. لطفاً صفحه لیگ را تا زمان آغاز مسابقه بررسی کنید.'),
    league_rules_notice_en = coalesce(nullif(trim(league_rules_notice_en), ''), 'Please note: league rules may change up to 10 days before the competition starts. Check the league page until the event begins.');

-- The first managed About page seed was intentionally short. Preserve it for
-- administrators who already edited it, but restore the original public copy
-- only when the row still contains that untouched seed.
update public.static_pages
set body = '<h2>جام تبرستان</h2><p>جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهایی است که در مرز رباتیک، مکاترونیک و هوش مصنوعی مسئله حل می‌کنند.</p><h2>ماموریت و چشم‌انداز</h2><p>ما مسابقات را یک تجربه آموزشی و صنعتی یکپارچه می‌دانیم؛ جایی که تیم‌ها ایده خود را به سامانه‌ای واقعی تبدیل می‌کنند، زیر فشار مسابقه تصمیم می‌گیرند و با داوری شفاف بازخورد می‌گیرند. هدف ما برگزاری رقابت‌های استاندارد و ساختن مسیر پایدار از نخستین تجربه تا فعالیت حرفه‌ای است.</p><h2>حوزه‌های فعالیت</h2><ul><li>رباتیک و مکاترونیک</li><li>هوش مصنوعی و سامانه‌های هوشمند</li><li>مسابقات حرفه‌ای و داوری تخصصی</li></ul>',
    body_en = '<h2>Tabarestan Cup</h2><p>Tabarestan Cup is a professional arena where emerging talent competes, learns and earns recognition across robotics, mechatronics and artificial intelligence.</p><h2>Mission and vision</h2><p>We see competition as a complete learning and engineering experience. Our goal is to create rigorous, transparent competitions and a sustainable path from a first experience to professional activity.</p><h2>What we work on</h2><ul><li>Robotics and mechatronics</li><li>Artificial intelligence and intelligent systems</li><li>Professional competitions and specialist judging</li></ul>'
where slug = 'about'
  and body = '<h2>جام تبرستان</h2><p>جام تبرستان بستری حرفه‌ای برای رقابت، یادگیری و دیده‌شدن استعدادهای رباتیک، مکاترونیک و هوش مصنوعی است.</p><h2>ماموریت و چشم‌انداز</h2><p>هدف ما برگزاری رقابت‌های شفاف و استاندارد، رشد مهارت‌های فنی و ساختن مسیر پایدار از تجربه نخست تا فعالیت حرفه‌ای است.</p><h2>حوزه‌های فعالیت</h2><ul><li>رباتیک و مکاترونیک</li><li>هوش مصنوعی و سامانه‌های هوشمند</li><li>مسابقات حرفه‌ای و داوری تخصصی</li></ul>';

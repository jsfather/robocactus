-- Complete the active competition catalog with fees, event date, officials and contact details.
update public.leagues
set registration_fee = case slug
      when 'indoor-rescue-u14' then 5000000
      when 'outdoor-rescue-open' then 7500000
      when 'space-race-open' then 10000000
      when 'firefighter-open' then 8500000
      when 'industrial-student-u19' then 6000000
      when 'industrial-university-open' then 9500000
      when 'sports-robots-u14' then 5500000
      when 'sports-robots-u19' then 7000000
      else registration_fee
    end,
    event_starts_at = timestamptz '2026-10-23 08:00:00+03:30', -- ۱ آبان ۱۴۰۵
    event_ends_at = timestamptz '2026-10-23 18:00:00+03:30',
    registration_close_at = timestamptz '2026-10-16 23:59:00+03:30',
    secretary_name = 'کمیته برگزاری روبوکاپ تبرستان',
    secretary_phone = coalesce((select support_phone from public.site_settings where id = 1), secretary_phone),
    contact_email = 'competitions@robocuptabarestan.ir',
    secretary_telegram = 'https://t.me/robocuptabarestan',
    technical_committee_notes = 'کمیته فنی مسئول نظارت بر اجرای آیین‌نامه، تأیید فنی ربات‌ها و پاسخ‌گویی تخصصی به تیم‌ها است.',
    day_schedule = '[{"time":"08:00","title":"پذیرش و کنترل فنی"},{"time":"10:00","title":"آغاز مسابقات"},{"time":"14:00","title":"مرحله نهایی"},{"time":"17:30","title":"اعلام نتایج و اختتامیه"}]'::jsonb
where slug in (
  'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
  'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
);

delete from public.league_people
where league_id in (
  select id from public.leagues where slug in (
    'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
    'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
  )
) and role_kind in ('judge', 'committee');

-- Two Iranian judges tailored to each league.
insert into public.league_people (league_id, full_name, specialty, bio, role_kind, sort_order)
select l.id, v.full_name, v.specialty, v.bio, 'judge', v.sort_order
from (values
  ('indoor-rescue-u14','دکتر مهدی رضایی','رباتیک امداد و ناوبری','داور تخصصی سامانه‌های خودران و مسیریابی ربات‌های امدادگر.',1),
  ('indoor-rescue-u14','مهندس الهام کریمی','بینایی ماشین','داور فنی تشخیص علائم و ارزیابی دقت مأموریت.',2),
  ('outdoor-rescue-open','دکتر امیرحسین کاظمی','ربات‌های میدانی','متخصص ربات‌های مقاوم و عملیات در محیط‌های ناهموار.',1),
  ('outdoor-rescue-open','مهندس سجاد موسوی','مکانیک و کنترل','داور سامانه حرکتی، ایمنی و کنترل ربات.',2),
  ('space-race-open','دکتر پویا احمدی','سامانه‌های خودران','داور ناوبری، برنامه‌ریزی مسیر و کنترل هوشمند.',1),
  ('space-race-open','مهندس نگار زمانی','مکاترونیک','داور طراحی فنی، پایداری و عملکرد مسابقه‌ای.',2),
  ('firefighter-open','دکتر محمدحسین اکبری','رباتیک آتش‌نشان','داور تخصصی تشخیص حریق و عملیات اطفای رباتیک.',1),
  ('firefighter-open','مهندس علی مرادی','ایمنی و کنترل','ناظر فنی الزامات ایمنی و کنترل سامانه اطفا.',2),
  ('industrial-student-u19','دکتر فرهاد جعفری','اتوماسیون صنعتی','داور مأموریت‌های تولید هوشمند و اتوماسیون.',1),
  ('industrial-student-u19','مهندس شیما صادقی','کنترل ربات صنعتی','داور برنامه‌ریزی حرکت و دقت اجرای عملیات.',2),
  ('industrial-university-open','دکتر آرمان توکلی','رباتیک صنعتی پیشرفته','داور ارشد اتوماسیون، ادراک و همکاری ربات‌ها.',1),
  ('industrial-university-open','مهندس نازنین رستمی','ساخت هوشمند','داور کیفیت اجرا، نوآوری و یکپارچگی سامانه.',2),
  ('sports-robots-u14','مهندس حسین محمدی','ربات‌های ورزشی','داور فنی ربات‌ها و اجرای قوانین زمین مسابقه.',1),
  ('sports-robots-u14','مهندس مریم قاسمی','کنترل و استراتژی بازی','داور بازی تیمی و عملکرد کنترلی ربات‌ها.',2),
  ('sports-robots-u19','دکتر سعید حیدری','هوش مصنوعی رباتیک','داور راهبرد بازی و تصمیم‌گیری چندرباته.',1),
  ('sports-robots-u19','مهندس کیان نوروزی','مکاترونیک ورزشی','داور طراحی مکانیکی و عملکرد مسابقه‌ای.',2)
) as v(slug, full_name, specialty, bio, sort_order)
join public.leagues l on l.slug = v.slug;

-- Exactly two technical committee members for every active competition league.
insert into public.league_people (league_id, full_name, specialty, bio, role_kind, sort_order)
select l.id, c.full_name, c.specialty, c.bio, 'committee', c.sort_order
from public.leagues l
cross join (values
  ('دکتر رضا ابراهیمی','رئیس کمیته فنی','مسئول نظارت عالی بر اجرای فنی، آیین‌نامه‌ها و استانداردهای مسابقات.',1),
  ('مهندس سارا نادری','هماهنگ‌کننده فنی','مسئول کنترل فنی، هماهنگی داوران و پاسخ‌گویی تخصصی به تیم‌ها.',2)
) as c(full_name, specialty, bio, sort_order)
where l.slug in (
  'indoor-rescue-u14','outdoor-rescue-open','space-race-open','firefighter-open',
  'industrial-student-u19','industrial-university-open','sports-robots-u14','sports-robots-u19'
);

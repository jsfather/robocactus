-- Cover image column + rich demo content for league public pages

alter table leagues
  add column if not exists cover_image_url text;

-- Demo content for Rescue (and others if empty)
update leagues
set
  name = case slug
    when 'rescue' then 'لیگ امدادگر پیشرفته جام تبرستان 2027'
    when 'soccer' then 'لیگ فوتبال رباتیک'
    when 'humanoid' then 'لیگ ربات انسان‌نما'
    else name
  end,
  short_description = coalesce(nullif(short_description, ''), case slug
    when 'rescue' then 'رقابت طراحی و برنامه‌نویسی ربات‌های امدادگر برای دانش‌آموزان و دانشجویان.'
    when 'soccer' then 'مسابقه فوتبال ربات‌های خودران در زمین استاندارد.'
    when 'humanoid' then 'ربات‌های انسان‌نما در چالش‌های تعادل، راه رفتن و تعامل.'
    else short_description
  end),
  full_description = coalesce(nullif(full_description, ''), case slug
    when 'rescue' then
      E'هدف لیگ امدادگر آماده‌سازی تیم‌ها برای طراحی ربات‌هایی است که در محیط‌های آسیب‌دیده عملیات نجات انجام دهند.\n\nمهارت‌های مورد نیاز: الکترونیک، برنامه‌نویسی، بینایی ماشین، کار تیمی.\n\nاین لیگ برای دانش‌آموزان متوسطه و دانشجویان علاقه‌مند به رباتیک خدمتی مناسب است.'
    when 'soccer' then
      E'هدف: توسعه الگوریتم‌های تصمیم‌گیری و کنترل چندرباته در زمین فوتبال.\n\nمناسب تیم‌های دانشگاهی و مدارس پیشرفته.'
    when 'humanoid' then
      E'تمرکز روی مکانیک، حسگرها و کنترل تعادل برای ربات‌های انسان‌نما.'
    else full_description
  end),
  cover_image_url = coalesce(
    cover_image_url,
    case slug
      when 'rescue' then 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80'
      when 'soccer' then 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=80'
      when 'humanoid' then 'https://images.unsplash.com/photo-1546776310-eef45dd6d63c?w=1200&q=80'
      else cover_image_url
    end
  ),
  hero_image_url = coalesce(
    hero_image_url,
    case slug
      when 'rescue' then 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=1600&q=80'
      when 'soccer' then 'https://images.unsplash.com/photo-1561557944-6f2c0ec21d84?w=1600&q=80'
      when 'humanoid' then 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1600&q=80'
      else hero_image_url
    end
  ),
  age_range = coalesce(age_range, '۱۵ تا ۲۸ سال'),
  participation_mode = coalesce(participation_mode, 'team'),
  team_size_min = coalesce(team_size_min, 2),
  team_size_max = coalesce(team_size_max, 5),
  venue_name = coalesce(venue_name, 'سالن اصلی جام تبرستان'),
  venue_address = coalesce(venue_address, 'تهران، مرکز همایش‌های بین‌المللی'),
  difficulty_level = coalesce(difficulty_level, case slug when 'rescue' then 'پیشرفته' when 'soccer' then 'متوسط' else 'پیشرفته' end),
  competition_language = coalesce(competition_language, 'فارسی / English'),
  rules_summary = coalesce(nullif(rules_summary, ''), 'رعایت ایمنی ربات، زمان‌بندی مسابقه و قوانین داوری الزامی است. استفاده از تجهیزات ممنوع منجر به حذف می‌شود.'),
  discount_info = coalesce(nullif(discount_info, ''), 'تخفیف ۲۰٪ برای ثبت‌نام زودهنگام تا پایان مهلت اول.'),
  refund_policy = coalesce(nullif(refund_policy, ''), 'تا ۷ روز قبل از مسابقه امکان استرداد ۵۰٪ وجود دارد؛ پس از آن غیرقابل استرداد است.'),
  secretary_name = coalesce(secretary_name, 'دبیر لیگ'),
  secretary_phone = coalesce(secretary_phone, '02191000000'),
  contact_email = coalesce(contact_email, 'league@tabarestancup.ir'),
  secretary_telegram = coalesce(secretary_telegram, 'https://t.me/tabarestancup'),
  registration_open_at = coalesce(registration_open_at, now() - interval '7 days'),
  registration_close_at = coalesce(registration_close_at, now() + interval '45 days'),
  event_starts_at = coalesce(event_starts_at, now() + interval '60 days'),
  event_ends_at = coalesce(event_ends_at, now() + interval '62 days'),
  scoring_rows = case
    when jsonb_array_length(coalesce(scoring_rows, '[]'::jsonb)) = 0 then
      '[{"label":"عملکرد مأموریت","points":"40"},{"label":"پایداری و ایمنی","points":"25"},{"label":"نوآوری فنی","points":"20"},{"label":"مستندات","points":"15"}]'::jsonb
    else scoring_rows
  end,
  timeline_steps = case
    when jsonb_array_length(coalesce(timeline_steps, '[]'::jsonb)) = 0 then
      '[{"title":"ثبت‌نام","description":"تکمیل فرم و مدارک"},{"title":"تایید مدارک","description":"بررسی توسط کمیته"},{"title":"اعلام تیم‌ها","description":"انتشار فهرست نهایی"},{"title":"مسابقه","description":"رقابت اصلی"},{"title":"اختتامیه","description":"اعلام نتایج و جوایز"}]'::jsonb
    else timeline_steps
  end,
  day_schedule = case
    when jsonb_array_length(coalesce(day_schedule, '[]'::jsonb)) = 0 then
      '[{"time":"08:00","title":"ورود و چک‌این"},{"time":"09:30","title":"جلسه توجیهی"},{"time":"11:00","title":"دور مقدماتی"},{"time":"15:00","title":"نیمه‌نهایی"},{"time":"18:00","title":"فینال و اختتامیه"}]'::jsonb
    else day_schedule
  end,
  allowed_equipment = case
    when jsonb_array_length(coalesce(allowed_equipment, '[]'::jsonb)) = 0 then
      '["Arduino","ESP32","Lego EV3","Raspberry Pi","سنسورهای فاصله و دوربین"]'::jsonb
    else allowed_equipment
  end,
  forbidden_equipment = case
    when jsonb_array_length(coalesce(forbidden_equipment, '[]'::jsonb)) = 0 then
      '["سلاح گرم یا آتش‌زا","مواد شیمیایی خطرناک","تجهیزات رادیویی غیرمجاز"]'::jsonb
    else forbidden_equipment
  end,
  show_registered_count = coalesce(show_registered_count, true),
  is_active = true
where slug in ('rescue', 'soccer', 'humanoid');

-- Related leagues: link rescue ↔ soccer ↔ humanoid
update leagues l
set related_league_ids = coalesce((
  select jsonb_agg(o.id)
  from leagues o
  where o.slug in ('rescue', 'soccer', 'humanoid')
    and o.id <> l.id
), '[]'::jsonb)
where l.slug in ('rescue', 'soccer', 'humanoid')
  and jsonb_array_length(coalesce(l.related_league_ids, '[]'::jsonb)) = 0;

-- Files / people / sponsors / faqs / results for rescue (idempotent-ish)
insert into league_files (league_id, title, file_url, file_kind, sort_order)
select l.id, x.title, x.file_url, x.file_kind, x.sort_order
from leagues l
cross join (values
  ('آیین‌نامه', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'regulation', 1),
  ('نقشه زمین', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'field_map', 2),
  ('نمونه کد', 'https://github.com/', 'sample_code', 3),
  ('فرم رضایت', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'consent', 4),
  ('فرم معرفی تیم', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'team_form', 5)
) as x(title, file_url, file_kind, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_files f where f.league_id = l.id);

insert into league_people (league_id, full_name, photo_url, specialty, bio, role_kind, sort_order)
select l.id, x.full_name, x.photo_url, x.specialty, x.bio, x.role_kind, x.sort_order
from leagues l
cross join (values
  ('دکتر سارا احمدی', 'https://i.pravatar.cc/150?u=judge1', 'رباتیک سیار', 'داور بین‌المللی لیگ امداد', 'judge', 1),
  ('مهندس رضا کرمی', 'https://i.pravatar.cc/150?u=judge2', 'بینایی ماشین', '۱۴ سال تجربه داوری مسابقات ملی', 'judge', 2),
  ('مهندس نازنین مرادی', 'https://i.pravatar.cc/150?u=committee1', 'کمیته فنی', 'مسئول استاندارد زمین و تجهیزات', 'committee', 1),
  ('علی جعفری', 'https://i.pravatar.cc/150?u=committee2', 'هماهنگی فنی', 'پشتیبانی تیم‌ها در روز مسابقه', 'committee', 2)
) as x(full_name, photo_url, specialty, bio, role_kind, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_people p where p.league_id = l.id);

insert into league_sponsors (league_id, name, logo_url, website_url, sort_order)
select l.id, x.name, x.logo_url, x.website_url, x.sort_order
from leagues l
cross join (values
  ('TechNova', 'https://placehold.co/160x48/png?text=TechNova', 'https://example.com', 1),
  ('TechParts', 'https://placehold.co/160x48/png?text=TechParts', 'https://example.com', 2),
  ('IranAI', 'https://placehold.co/160x48/png?text=IranAI', 'https://example.com', 3)
) as x(name, logo_url, website_url, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_sponsors s where s.league_id = l.id);

insert into league_faqs (league_id, question, answer, sort_order)
select l.id, x.question, x.answer, x.sort_order
from leagues l
cross join (values
  ('آیا نیاز به تجربه قبلی هست؟', 'تجربه پایه الکترونیک و برنامه‌نویسی پیشنهاد می‌شود؛ کارگاه‌های آنلاین قبل از مسابقه برگزار می‌گردد.', 1),
  ('هزینه ثبت‌نام؟', 'طبق اعلام در صفحه لیگ؛ تخفیف زودهنگام اعمال می‌شود.', 2),
  ('چند نفر در تیم؟', 'حداقل ۲ و حداکثر ۵ نفر.', 3),
  ('اگر ربات خراب شود؟', 'تعمیر در محدوده فنی مجاز است؛ تأخیر بیش از حد طبق قوانین امتیاز منفی دارد.', 4)
) as x(question, answer, sort_order)
where l.slug = 'rescue'
  and not exists (select 1 from league_faqs f where f.league_id = l.id);

insert into league_past_results (league_id, season_year, first_place, second_place, third_place)
select l.id, x.season_year, x.first_place, x.second_place, x.third_place
from leagues l
cross join (values
  (2025, 'کاکتوس نجات', 'آذر رباتیک', 'پالس تیم'),
  (2024, 'آتش‌نشان هوشمند', 'کاکتوس نجات', 'ماسه ربات')
) as x(season_year, first_place, second_place, third_place)
where l.slug = 'rescue'
on conflict (league_id, season_year) do nothing;

-- Sample gallery + announcement for rescue
insert into gallery_items (media_url, media_type, league_id, season_year, caption)
select x.media_url, 'image', l.id, x.season_year, x.caption
from leagues l
cross join (values
  ('https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&q=80', 2025, 'دوره ۱۴۰۳ — فینال'),
  ('https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&q=80', 2024, 'دوره ۱۴۰۲ — تمرین'),
  ('https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80', 2023, 'دوره ۱۴۰۱ — اختتامیه')
) as x(media_url, season_year, caption)
where l.slug = 'rescue'
  and not exists (
    select 1 from gallery_items g where g.league_id = l.id
  );

insert into announcements (title, body, league_id, status, published_at)
select
  'آغاز ثبت‌نام لیگ امدادگر',
  '<p>ثبت‌نام لیگ امدادگر پیشرفته از امروز باز است. آیین‌نامه را دانلود و مدارک را آماده کنید.</p>',
  l.id,
  'published',
  now()
from leagues l
where l.slug = 'rescue'
  and not exists (
    select 1 from announcements a where a.league_id = l.id and a.title = 'آغاز ثبت‌نام لیگ امدادگر'
  );

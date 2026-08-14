-- Fix mojibake Persian text inserted from a wrongly-encoded ALL_IN_ONE.sql
-- Run this once in Supabase SQL Editor if you already applied the corrupted file.

update leagues set description = 'لیگ امداد و نجات رباتیک' where slug = 'rescue';
update leagues set description = 'لیگ فوتبال رباتیک' where slug = 'soccer';
update leagues set description = 'لیگ ربات انسان‌نما' where slug = 'humanoid';

update static_pages set title = 'درباره ما', body = '<p>روبوکاکتوس پلتفرم مدیریت مسابقات رباتیک است.</p>' where slug = 'about';
update static_pages set title = 'تماس با ما', body = '<p>برای ارتباط با دبیرخانه رویداد از فرم تماس استفاده کنید.</p>' where slug = 'contact';
update static_pages set title = 'سوالات متداول', body = '<p>پاسخ پرسش‌های پرتکرار به‌زودی اینجا منتشر می‌شود.</p>' where slug = 'faq';
update static_pages set title = 'حریم خصوصی', body = '<p>سیاست حفظ حریم خصوصی کاربران روبوکاکتوس.</p>' where slug = 'privacy';

-- Also fix home_banners sample Persian titles if corrupted
update home_banners
set title = 'روبوکاکتوس',
    subtitle = 'رقابت رباتیک، یک پلتفرم'
where title like '%Ù%' or title = 'روبوکاکتوس';

update home_banners
set title = 'ثبت‌نام تیم‌ها',
    subtitle = 'لیگ‌ها باز است — از همین‌جا شروع کنید'
where link_url = '/signup' or subtitle like '%Ù%';

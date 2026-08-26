-- Seed static pages and a sample league for local/dev testing
insert into static_pages (slug, title, body) values
  ('about', 'درباره ما', '<p>جام تبرستان پلتفرم مدیریت مسابقات رباتیک است.</p>'),
  ('contact', 'تماس با ما', '<p>برای ارتباط با دبیرخانه رویداد از فرم تماس استفاده کنید.</p>'),
  ('faq', 'سوالات متداول', '<p>پاسخ پرسش‌های پرتکرار به‌زودی اینجا منتشر می‌شود.</p>'),
  ('privacy', 'حریم خصوصی', '<p>سیاست حفظ حریم خصوصی کاربران جام تبرستان.</p>')
on conflict (slug) do nothing;

insert into leagues (name, slug, description, category, capacity, registration_fee, is_active)
values
  ('Rescue', 'rescue', 'لیگ امداد و نجات رباتیک', 'rescue', 64, 2500000, true),
  ('Soccer', 'soccer', 'لیگ فوتبال رباتیک', 'soccer', 48, 2200000, true),
  ('Humanoid', 'humanoid', 'لیگ ربات انسان‌نما', 'humanoid', 32, 3000000, true)
on conflict (slug) do nothing;

-- Move homepage copy out of React components so editors can update it safely.
alter table public.site_settings
  add column if not exists homepage_content jsonb not null default '{}'::jsonb;

update public.site_settings
set homepage_content = jsonb_build_object(
  'hero', jsonb_build_object(
    'eyebrow_fa', 'از قلب مازندران، رو به آینده',
    'eyebrow_en', 'From Mazandaran to the future',
    'kicker_fa', 'جام تبرستان · آمل',
    'kicker_en', 'TABARESTAN CUP · AMOL',
    'primary_label_fa', 'ثبت‌نام در مسابقات',
    'primary_label_en', 'Register for competitions',
    'secondary_label_fa', 'مشاهده لیگ‌ها',
    'secondary_label_en', 'Explore leagues',
    'stats_fa', '[{"value":"آمل","label":"شهر علم و طبیعت"},{"value":"مازندران","label":"میزبان نوآوری"},{"value":"رویداد ملی","label":"فصل تازه رقابت"}]'::jsonb,
    'stats_en', '[{"value":"Amol","label":"City of science and nature"},{"value":"Mazandaran","label":"Home of innovation"},{"value":"National event","label":"A new competition season"}]'::jsonb
  ),
  'story', jsonb_build_object(
    'eyebrow_fa', 'ریشه در تبرستان، نگاه به جهان',
    'eyebrow_en', 'Rooted in Tabarestan, open to the world',
    'title_fa', 'میزبان رقابت‌های بزرگ رباتیک ایران و جهان',
    'title_en', 'Home to major robotics competitions in Iran and beyond',
    'body_fa', 'جام تبرستان برگزارکننده مسابقات حرفه‌ای در سطح ملی و بین‌المللی است؛ رویدادی برای حضور تیم‌های برتر، داوری استاندارد، رقابت جدی و معرفی قهرمانان از آمل و مازندران به ایران و جهان.',
    'body_en', 'Tabarestan Cup hosts professional national and international robotics competitions for leading teams, trusted judging and the next generation of champions.',
    'badges_fa', '["رقابت‌های کشوری","مسابقات بین‌المللی","داوری حرفه‌ای"]'::jsonb,
    'badges_en', '["National competitions","International events","Professional judging"]'::jsonb,
    'metric_label_fa', 'هویت رویداد',
    'metric_label_en', 'Event identity',
    'metric_value', '۳۶۰°',
    'metric_title_fa', 'از ثبت‌نام تیم‌ها تا سکوی قهرمانی',
    'metric_title_en', 'From team registration to the podium',
    'metric_body_fa', 'مدیریت یکپارچه ثبت‌نام، رقابت، داوری رسمی، نتایج زنده و رتبه‌بندی مسابقات ملی و بین‌المللی.',
    'metric_body_en', 'One connected experience for registration, competition, official judging, live results and rankings.'
  ),
  'cta', jsonb_build_object(
    'title_fa', 'آماده‌ای رباتت را وارد میدان کنی؟',
    'title_en', 'Ready to bring your robot to the arena?',
    'body_fa', 'تیم خودت را بساز، لیگ مناسب را انتخاب کن و بخشی از آینده فناوری مازندران باش.',
    'body_en', 'Build your team, choose the right league and help shape the future of technology in Mazandaran.',
    'primary_label_fa', 'شروع ثبت‌نام',
    'primary_label_en', 'Start registration',
    'secondary_label_fa', 'گفتگو با دبیرخانه',
    'secondary_label_en', 'Contact the secretariat'
  )
)
where id = 1 and (homepage_content is null or homepage_content = '{}'::jsonb);

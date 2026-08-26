-- Align existing CMS content with the competition organizer positioning.
update public.site_settings
set site_name_fa = 'جام تبرستان',
    site_name_en = 'Tabarestan Cup',
    tagline_fa = 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک',
    tagline_en = 'Organizer of national and international robotics competitions',
    footer_fa = replace(replace(replace(coalesce(footer_fa, ''), 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    footer_en = replace(coalesce(footer_en, ''), 'RoboCactus', 'Tabarestan Cup'),
    updated_at = now()
where id = 1;

update public.home_banners
set title = replace(replace(replace(title, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    subtitle = case when sort_order = 0 then 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک' else replace(replace(replace(subtitle, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup') end;

update public.static_pages
set title = replace(replace(replace(title, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    body = replace(replace(replace(body, 'روبو کاکتوس', 'جام تبرستان'), 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup');

-- Align existing CMS content with the competition organizer positioning.
update public.site_settings
set site_name_fa = 'روبوکاپ تبرستان',
    site_name_en = 'RoboCup Tabarestan',
    tagline_fa = 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک',
    tagline_en = 'Organizer of national and international robotics competitions',
    footer_fa = replace(replace(replace(coalesce(footer_fa, ''), 'روبو کاکتوس', 'روبوکاپ تبرستان'), 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan'),
    footer_en = replace(coalesce(footer_en, ''), 'RoboCactus', 'RoboCup Tabarestan'),
    updated_at = now()
where id = 1;

update public.home_banners
set title = replace(replace(replace(title, 'روبو کاکتوس', 'روبوکاپ تبرستان'), 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan'),
    subtitle = case when sort_order = 0 then 'برگزارکننده مسابقات ملی و بین‌المللی رباتیک' else replace(replace(replace(subtitle, 'روبو کاکتوس', 'روبوکاپ تبرستان'), 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan') end;

update public.static_pages
set title = replace(replace(replace(title, 'روبو کاکتوس', 'روبوکاپ تبرستان'), 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan'),
    body = replace(replace(replace(body, 'روبو کاکتوس', 'روبوکاپ تبرستان'), 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan');

-- Rebrand existing installations to RoboCup Tabarestan.
update public.site_settings
set site_name_fa = 'روبوکاپ تبرستان', site_name_en = 'RoboCup Tabarestan',
    tagline_fa = coalesce(nullif(tagline_fa, ''), 'از قلب مازندران، رو به آینده'),
    tagline_en = coalesce(nullif(tagline_en, ''), 'From Mazandaran to the future'),
    color_primary = '#2498d8', color_accent = '#25d366', updated_at = now()
where id = 1;

update public.static_pages
set body = replace(replace(body, 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan')
where body like '%روبوکاکتوس%' or body like '%RoboCactus%';

update public.blog_posts
set title = replace(replace(title, 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan'),
    excerpt = replace(replace(excerpt, 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan'),
    body = replace(replace(body, 'روبوکاکتوس', 'روبوکاپ تبرستان'), 'RoboCactus', 'RoboCup Tabarestan')
where title like '%روبوکاکتوس%' or title like '%RoboCactus%'
   or excerpt like '%روبوکاکتوس%' or excerpt like '%RoboCactus%'
   or body like '%روبوکاکتوس%' or body like '%RoboCactus%';

-- Rebrand existing installations to Tabarestan Cup.
update public.site_settings
set site_name_fa = 'جام تبرستان', site_name_en = 'Tabarestan Cup',
    tagline_fa = coalesce(nullif(tagline_fa, ''), 'از قلب مازندران، رو به آینده'),
    tagline_en = coalesce(nullif(tagline_en, ''), 'From Mazandaran to the future'),
    color_primary = '#2498d8', color_accent = '#25d366', updated_at = now()
where id = 1;

update public.static_pages
set body = replace(replace(body, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup')
where body like '%روبوکاکتوس%' or body like '%RoboCactus%';

update public.blog_posts
set title = replace(replace(title, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    excerpt = replace(replace(excerpt, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup'),
    body = replace(replace(body, 'روبوکاکتوس', 'جام تبرستان'), 'RoboCactus', 'Tabarestan Cup')
where title like '%روبوکاکتوس%' or title like '%RoboCactus%'
   or excerpt like '%روبوکاکتوس%' or excerpt like '%RoboCactus%'
   or body like '%روبوکاکتوس%' or body like '%RoboCactus%';

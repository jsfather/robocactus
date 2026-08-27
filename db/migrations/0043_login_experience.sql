-- Configurable public login experience.
alter table public.site_settings
  add column if not exists login_logo_url text,
  add column if not exists login_cover_url text,
  add column if not exists login_welcome_title_fa text default 'به جام تبرستان خوش آمدید',
  add column if not exists login_welcome_title_en text default 'Welcome to Tabarestan Cup',
  add column if not exists login_welcome_text_fa text default 'برای ادامه وارد حساب کاربری خود شوید.',
  add column if not exists login_welcome_text_en text default 'Sign in to continue to your account.';

update public.site_settings
set login_welcome_title_fa = coalesce(nullif(login_welcome_title_fa, ''), 'به جام تبرستان خوش آمدید'),
    login_welcome_title_en = coalesce(nullif(login_welcome_title_en, ''), 'Welcome to Tabarestan Cup'),
    login_welcome_text_fa = coalesce(nullif(login_welcome_text_fa, ''), 'برای ادامه وارد حساب کاربری خود شوید.'),
    login_welcome_text_en = coalesce(nullif(login_welcome_text_en, ''), 'Sign in to continue to your account.')
where id = 1;

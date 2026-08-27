alter table public.site_settings
  add column if not exists developer_credit_fa text default 'طراحی و توسعه',
  add column if not exists developer_credit_en text default 'Designed and developed by',
  add column if not exists developer_name text default 'فارینو',
  add column if not exists developer_url text default 'https://farino.ir';

update public.site_settings
set developer_credit_fa = coalesce(nullif(developer_credit_fa, ''), 'طراحی و توسعه'),
    developer_credit_en = coalesce(nullif(developer_credit_en, ''), 'Designed and developed by'),
    developer_name = coalesce(nullif(developer_name, ''), 'فارینو'),
    developer_url = coalesce(nullif(developer_url, ''), 'https://farino.ir');

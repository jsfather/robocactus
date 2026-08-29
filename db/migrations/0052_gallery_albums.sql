alter table public.gallery_categories
  add column if not exists description_fa text,
  add column if not exists description_en text;

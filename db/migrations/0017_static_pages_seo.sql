-- SEO + media fields for static pages

alter table static_pages
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists og_image text,
  add column if not exists cover_image text;

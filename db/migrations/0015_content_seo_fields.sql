-- SEO + excerpt fields for blog posts and announcements

alter table blog_posts
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists og_image text,
  add column if not exists updated_at timestamptz default now();

alter table announcements
  add column if not exists excerpt text,
  add column if not exists seo_title text,
  add column if not exists meta_description text,
  add column if not exists cover_image text,
  add column if not exists updated_at timestamptz default now();

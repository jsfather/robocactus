create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.blog_posts
  add column if not exists category_id uuid references public.content_categories(id) on delete set null,
  add column if not exists author_name text,
  add column if not exists cover_alt text;

alter table public.announcements
  add column if not exists slug text,
  add column if not exists category_id uuid references public.content_categories(id) on delete set null,
  add column if not exists author_name text,
  add column if not exists cover_alt text,
  add column if not exists og_image text;

update public.announcements
set slug = coalesce(nullif(slug, ''), 'announcement-' || id::text)
where slug is null or slug = '';

create unique index if not exists announcements_slug_unique on public.announcements(slug);

alter table public.content_categories enable row level security;
drop policy if exists content_categories_public_select on public.content_categories;
create policy content_categories_public_select on public.content_categories for select using (true);
drop policy if exists content_categories_admin_manage on public.content_categories;
create policy content_categories_admin_manage on public.content_categories for all using (public.is_super_admin()) with check (public.is_super_admin());

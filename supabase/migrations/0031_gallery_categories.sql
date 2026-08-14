-- Standalone gallery categories (CMS + public)

create table if not exists gallery_categories (
  id uuid primary key default gen_random_uuid(),
  name_fa text not null,
  name_en text not null,
  cover_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table gallery_items
  add column if not exists category_id uuid references gallery_categories(id) on delete set null;

create index if not exists gallery_items_category_id_idx on gallery_items (category_id);

alter table gallery_categories enable row level security;

drop policy if exists "gallery_categories_public" on gallery_categories;
create policy "gallery_categories_public"
  on gallery_categories for select
  using (is_active = true);

drop policy if exists "gallery_categories_sa" on gallery_categories;
create policy "gallery_categories_sa"
  on gallery_categories for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into gallery_categories (name_fa, name_en, sort_order)
select * from (values
  ('عمومی', 'General', 0),
  ('مراسم افتتاحیه', 'Opening ceremony', 1),
  ('لیگ‌ها', 'Leagues', 2),
  ('پشت صحنه', 'Behind the scenes', 3)
) as v(name_fa, name_en, sort_order)
where not exists (select 1 from gallery_categories limit 1);

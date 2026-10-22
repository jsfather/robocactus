-- Preserve the existing Persian names and add independently editable English names.
alter table public.home_sponsors add column if not exists name_en text;

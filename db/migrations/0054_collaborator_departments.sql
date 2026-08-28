alter table public.profiles
  add column if not exists staff_department text;

comment on column public.profiles.staff_department is
  'Internal organizational unit for collaborators, e.g. support, finance, operations or content.';

alter table public.registration_doc_types
  add column if not exists scope text not null default 'profile'
  check (scope in ('profile', 'team'));

insert into public.registration_doc_types
  (code, label_fa, label_en, account_type, is_required, is_active, sort_order, scope)
values ('team_logo', 'لوگوی تیم', 'Team logo', 'both', false, true, 10, 'team')
on conflict (code) do update set
  label_fa = excluded.label_fa,
  label_en = excluded.label_en,
  is_required = excluded.is_required,
  scope = excluded.scope;

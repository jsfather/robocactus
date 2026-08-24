-- PostgreSQL foundation replacing the managed Supabase platform schemas.
-- The application server owns authentication, files and realtime delivery; the
-- compatibility objects below let the established domain schema/functions keep
-- their RLS behavior unchanged.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists app_private;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  phone text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_private.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on app_private.sessions(user_id);

create table if not exists app_private.one_time_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  kind text not null,
  redirect_to text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists one_time_tokens_hash_idx on app_private.one_time_tokens(token_hash);

create table if not exists app_private.storage_objects (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  disk_path text not null,
  owner_id uuid references auth.users(id) on delete set null,
  mime_type text,
  size integer not null,
  is_public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(bucket, object_path)
);

create table if not exists app_private.realtime_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  event text not null,
  record jsonb,
  old_record jsonb,
  created_at timestamptz not null default now()
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  unique(bucket_id, name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when position('/' in name) = 0 then array[]::text[]
    else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;
end
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated, service_role;

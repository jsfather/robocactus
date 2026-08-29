-- Dokploy containers are replaceable. Keep the canonical file bytes in
-- PostgreSQL so uploads survive deployments; disk_path remains a read cache.
alter table app_private.storage_objects
  add column if not exists content bytea;

comment on column app_private.storage_objects.content is
  'Canonical persisted file bytes. disk_path is only a local cache/fallback.';

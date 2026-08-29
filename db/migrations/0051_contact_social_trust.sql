alter table public.site_settings
  add column if not exists contact_map_embed_url text,
  add column if not exists instagram_url text,
  add column if not exists telegram_url text,
  add column if not exists linkedin_url text,
  add column if not exists whatsapp_url text,
  add column if not exists trust_seal_html text;

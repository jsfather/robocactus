-- Configurable homepage hero countdown. Disabled by default until an admin
-- selects a target time, so existing homepage content keeps its appearance.
update public.site_settings
set homepage_content = jsonb_set(
  coalesce(homepage_content, '{}'::jsonb),
  '{hero}',
  coalesce(homepage_content->'hero', '{}'::jsonb) || jsonb_build_object(
    'countdown_enabled', false,
    'countdown_target', null,
    'countdown_label_fa', 'تا شروع مسابقات',
    'countdown_label_en', 'Until the competition'
  ),
  true
)
where id = 1;

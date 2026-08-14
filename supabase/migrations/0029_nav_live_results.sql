-- Ensure public nav includes Live Results (insert after Home)

update site_settings
set
  nav_items = (
    select coalesce(jsonb_agg(item order by ord), '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'id', 'home',
          'href', '/',
          'label_fa', coalesce(
            (select el->>'label_fa' from jsonb_array_elements(nav_items) el where el->>'href' in ('/', '') limit 1),
            'خانه'
          ),
          'label_en', coalesce(
            (select el->>'label_en' from jsonb_array_elements(nav_items) el where el->>'href' in ('/', '') limit 1),
            'Home'
          ),
          'enabled', true,
          'order', 1
        ) as item,
        1 as ord
      union all
      select
        jsonb_build_object(
          'id', 'live',
          'href', '/live',
          'label_fa', 'نتایج زنده',
          'label_en', 'Live results',
          'enabled', true,
          'order', 2
        ),
        2
      union all
      select
        jsonb_set(
          jsonb_set(el, '{order}', to_jsonb(2 + row_number() over (order by coalesce((el->>'order')::int, 99)))),
          '{id}',
          to_jsonb(coalesce(el->>'id', 'nav-' || row_number() over ()))
        ),
        2 + row_number() over (order by coalesce((el->>'order')::int, 99))
      from jsonb_array_elements(nav_items) el
      where el->>'href' not in ('/', '', '/live', '/live/')
    ) rebuilt
  ),
  updated_at = now()
where id = 1
  and not exists (
    select 1
    from jsonb_array_elements(nav_items) el
    where el->>'href' in ('/live', '/live/')
  );

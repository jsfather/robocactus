-- Phase 8: content media storage for blog covers & gallery

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do nothing;

create policy "content_media_public_select"
  on storage.objects for select using (bucket_id = 'content-media');

create policy "content_media_super_admin_insert"
  on storage.objects for insert with check (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

create policy "content_media_super_admin_update"
  on storage.objects for update using (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

create policy "content_media_super_admin_delete"
  on storage.objects for delete using (
    bucket_id = 'content-media'
    and public.is_super_admin()
  );

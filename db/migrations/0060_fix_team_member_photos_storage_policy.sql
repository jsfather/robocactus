drop policy if exists team_member_photos_manage
on storage.objects;

create policy team_member_photos_manage
on storage.objects
for all
to authenticated
using (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
)
with check (
  bucket_id = 'team-member-photos'
  and (
    public.is_super_admin()
    or exists (
      select 1
      from public.teams t
      where t.id::text = (storage.foldername(name))[1]
      and (
        t.captain_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = t.company_id
            and cm.user_id = auth.uid()
        )
      )
    )
  )
);
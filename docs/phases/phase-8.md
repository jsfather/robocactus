# RoboCactus — Phase 8 Acceptance

## Delivered

- Public blog: `/blog`, `/blog/:slug` (only `status = published`)
- Public announcements: `/news`
- Public gallery: `/gallery` (filter by year / league)
- Super-admin CMS: `/super-admin/content` (blog, announcements, gallery + `content-media` upload)
- Migration: `supabase/migrations/0009_phase8_content.sql` (public storage bucket)

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Draft posts invisible to public | Create a draft in CMS → open `/blog/{slug}` as anonymous / non–super-admin → not found. Publish → post appears on `/blog` |

## Setup

1. Run `0009_phase8_content.sql` (after `0001` … `0008`)
2. As super_admin: `/super-admin/content` → create draft vs published posts
3. Confirm RLS: `blog_posts` / `announcements` select requires `status = 'published'` OR `is_super_admin()`

## Notes

- Gallery is readable by everyone (select `true`); only super_admin can write.
- Cover/gallery uploads go to the `content-media` bucket (max 10 MB).

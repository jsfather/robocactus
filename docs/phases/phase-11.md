# RoboCactus — Phase 11 Acceptance

## Delivered

- Per-route SEO: `SeoManager` updates `title`, `description`, Open Graph, Twitter, canonical, hreflang, JSON-LD
- Blog / company pages can override title via `usePageSeo`
- `robots.txt` + `sitemap.xml` + default `og-default.svg`
- i18n `seo.*` keys (fa/en); language switch already persists route + localStorage

## Acceptance Criteria

| Criterion | Verify |
| --- | --- |
| Language switch keeps state | On `/leagues` with filters filled, toggle FA/EN — same URL, form state intact, `dir`/`lang` flip |
| Lighthouse SEO | Production/preview build → Lighthouse SEO; expect meta title/description/crawlable links |

## Notes

- Client-rendered SPA: crawlers that execute JS see updated meta; for perfect bot previews prefer SSR later.
- Replace sitemap host with absolute production domain when deploying.

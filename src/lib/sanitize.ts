import DOMPurify from 'isomorphic-dompurify'

/** Sanitize HTML before dangerouslySetInnerHTML. */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'blockquote',
      'hr',
      'img',
      'figure',
      'figcaption',
      'span',
      'div',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'id', 'title', 'width', 'height', 'referrerpolicy', 'loading'],
  })
}

/** Restricted sanitizer for third-party trust badges. Scripts and event handlers stay blocked. */
export function sanitizeTrustSealHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['a', 'img', 'div', 'span', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style', 'id', 'title', 'width', 'height', 'referrerpolicy', 'loading'],
  })
}

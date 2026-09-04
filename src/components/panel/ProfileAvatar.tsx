import { useEffect, useState } from 'react'

function initials(name?: string | null, fallback?: string | null): string {
  const value = (name || fallback || '?').trim()
  const parts = value.split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
    : value.slice(0, 2).toUpperCase()
}

export function ProfileAvatar({
  src,
  name,
  fallback,
  className = 'size-full object-cover',
}: {
  src?: string | null
  name?: string | null
  fallback?: string | null
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [src])

  if (!src || failed) return <>{initials(name, fallback)}</>

  return (
    <img
      src={src}
      alt={name ? `تصویر ${name}` : 'تصویر پروفایل'}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}

/** Gold / silver / bronze cup for podium ranks 1–3 */
export function PodiumCup({
  rank,
  size = 28,
  className = '',
}: {
  rank: number | null | undefined
  size?: number
  className?: string
}) {
  if (rank !== 1 && rank !== 2 && rank !== 3) return null

  const fill = rank === 1 ? '#E8C547' : rank === 2 ? '#C0C7D1' : '#C47A3A'
  const glow = rank === 1 ? 'drop-shadow(0 0 6px rgba(232,197,71,0.55))' : undefined

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      title={rank === 1 ? 'Gold' : rank === 2 ? 'Silver' : 'Bronze'}
      aria-label={rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        style={glow ? { filter: glow } : undefined}
        aria-hidden
      >
        <path
          d="M14 8h20v4c0 6.6-4.5 12-10 12S14 18.6 14 12V8Z"
          fill={fill}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="1.2"
        />
        <path d="M14 10H8c0 6 3.5 9 7 10" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M34 10h6c0 6-3.5 9-7 10" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />
        <rect x="20" y="28" width="8" height="4" rx="1" fill={fill} />
        <path d="M16 40h16l-2-8H18l-2 8Z" fill={fill} stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
        <circle cx="24" cy="16" r="3.2" fill="rgba(255,255,255,0.35)" />
      </svg>
    </span>
  )
}

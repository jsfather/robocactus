import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function BackToTopButton() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      type="button"
      aria-label={t('footer.backToTop')}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={[
        'fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] end-5 z-[55] flex size-12 items-center justify-center border border-rc-line bg-rc-navy/90 text-rc-blue shadow-lg backdrop-blur-md transition-all duration-300 ease-out hover:border-rc-blue/50 hover:bg-rc-blue hover:text-white md:bottom-5',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
        <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

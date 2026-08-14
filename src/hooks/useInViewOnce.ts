import { useCallback, useEffect, useState, type RefCallback } from 'react'

/** Becomes true once the element intersects the viewport (works if already visible on mount). */
export function useInViewOnce(amount = 0.25): [RefCallback<Element>, boolean] {
  const [node, setNode] = useState<Element | null>(null)
  const [inView, setInView] = useState(false)

  const ref = useCallback<RefCallback<Element>>((el) => {
    setNode(el)
  }, [])

  useEffect(() => {
    if (!node || inView) return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true)
          io.disconnect()
        }
      },
      { threshold: amount, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(node)

    // Catch elements already in view (some browsers delay the first IO callback).
    const rect = node.getBoundingClientRect()
    const vh = window.innerHeight || document.documentElement.clientHeight
    if (rect.top < vh - 40 && rect.bottom > 40) {
      setInView(true)
      io.disconnect()
    }

    return () => io.disconnect()
  }, [node, inView, amount])

  return [ref, inView]
}

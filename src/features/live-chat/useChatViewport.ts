import { useEffect, useState, type CSSProperties } from 'react'

export function chatViewportMetrics(height: number, offsetTop: number, layoutHeight=height+offsetTop) {
  return { '--chat-vv-height': `${Math.max(0,height)}px`, '--chat-vv-top': `${Math.max(0,offsetTop)}px`, '--chat-vv-bottom': `${Math.max(0,layoutHeight-offsetTop-height)}px` } as CSSProperties
}

/** Follow the visible viewport when the mobile keyboard or browser bars move. */
export function useChatViewport(open: boolean) {
  const [style,setStyle]=useState<CSSProperties>({})
  const [compact,setCompact]=useState(()=>typeof window!=='undefined' && (window.visualViewport?.height ?? window.innerHeight)<560)
  useEffect(()=>{
    if(!open) return
    const viewport=window.visualViewport
    const desktop=window.matchMedia('(min-width: 640px) and (min-height: 560px)')
    let frame=0
    let locked=false
    const previousOverflow=document.body.style.overflow
    const update=()=>{
      frame=0
      const height=viewport?.height ?? window.innerHeight
      const fullscreen=!desktop.matches || height<560
      setStyle(chatViewportMetrics(height,viewport?.offsetTop ?? 0,window.innerHeight))
      setCompact(height<560)
      if(fullscreen && !locked) {document.body.style.overflow='hidden';locked=true}
      else if(!fullscreen && locked){document.body.style.overflow=previousOverflow;locked=false}
    }
    const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(update)}
    update()
    viewport?.addEventListener('resize',schedule)
    viewport?.addEventListener('scroll',schedule)
    window.addEventListener('resize',schedule)
    desktop.addEventListener('change',schedule)
    return()=>{window.cancelAnimationFrame(frame);viewport?.removeEventListener('resize',schedule);viewport?.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);desktop.removeEventListener('change',schedule);if(locked)document.body.style.overflow=previousOverflow}
  },[open])
  return {style,compact}
}

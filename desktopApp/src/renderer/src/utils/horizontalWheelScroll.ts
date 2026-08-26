/**
 * Map vertical mouse-wheel to horizontal scroll when the pointer is over a
 * horizontally scrollable strip that does not also scroll vertically.
 * Shift+wheel and native trackpad horizontal gestures are left alone.
 */
function canScrollHorizontally(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  const ox = style.overflowX
  if (ox !== 'auto' && ox !== 'scroll') return false
  if (el.scrollWidth <= el.clientWidth + 1) return false
  const oy = style.overflowY
  const scrollsVertically =
    (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
    el.scrollHeight > el.clientHeight + 1
  return !scrollsVertically
}

function nearestHorizontalScroller(start: EventTarget | null): HTMLElement | null {
  let el =
    start instanceof Element
      ? (start as HTMLElement)
      : start instanceof Node
        ? start.parentElement
        : null
  while (el) {
    if (canScrollHorizontally(el)) return el
    el = el.parentElement
  }
  return null
}

export function installHorizontalWheelScroll(): () => void {
  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented) return
    if (e.ctrlKey || e.metaKey) return
    // Already a horizontal gesture (trackpad / Shift+wheel in some browsers).
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
    if (e.deltaY === 0) return

    const scroller = nearestHorizontalScroller(e.target)
    if (!scroller) return

    const before = scroller.scrollLeft
    const max = scroller.scrollWidth - scroller.clientWidth
    const next = Math.max(0, Math.min(max, before + e.deltaY))
    if (next === before) return

    e.preventDefault()
    scroller.scrollLeft = next
  }

  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => window.removeEventListener('wheel', onWheel, true)
}

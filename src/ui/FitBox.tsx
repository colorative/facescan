import { useEffect, useRef, useState } from 'react'

/**
 * Scales fixed-size content to fit the space available.
 *
 * Used for the badge, which is laid out at its true CR80 proportions with
 * fixed type and photo sizes. Letting it reflow instead would mean the badge
 * design rearranging itself per screen — and a badge is a print artefact, so
 * its proportions are the design. Scaling keeps them exact and simply makes
 * the whole thing smaller on a short viewport.
 *
 * The scaled child is absolutely positioned so its unscaled layout box cannot
 * push the surrounding flex column around.
 */
export function FitBox({
  width,
  height,
  maxScale = 1,
  className = '',
  children,
}: {
  width: number
  height: number
  /**
   * Allow growing past the intrinsic size, up to this factor. A badge at its
   * design size looks lost on a 1920-tall totem; scaling the whole thing keeps
   * every proportion exact where reflowing would not.
   */
  maxScale?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return
      setScale(Math.min(maxScale, w / width, h / height))
    }

    measure(el.clientWidth, el.clientHeight)
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      measure(w, h)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height, maxScale])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        className="badge-fit absolute top-1/2 left-1/2"
        style={{
          width,
          height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  )
}

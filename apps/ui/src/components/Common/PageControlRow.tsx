import clsx from 'clsx'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PageControlRowProps {
  actions?: ReactNode
  controls?: ReactNode
  /**
   * Pin the row under the search bar, so its actions stay reachable while the
   * page scrolls. Needs the row to be a direct child of the page container - a
   * sticky element only travels as far as its parent box.
   */
  sticky?: boolean
  /**
   * Two controls side by side: two across on a phone, where they share the
   * row with the actions and a stacked pair would eat the screen, and two
   * fixed cells right-aligned from `sm` up.
   */
  controlsLayout?: 'pair'
  className?: string
  actionsClassName?: string
  controlsClassName?: string
}

/** The search bar's height, below which a pinned row comes to rest. */
const SEARCH_BAR_HEIGHT = 64

const PageControlRow = ({
  actions,
  controls,
  sticky,
  controlsLayout,
  className,
  actionsClassName,
  controlsClassName,
}: PageControlRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const row = rowRef.current
    if (!sticky || !row) {
      return
    }

    // Pinned once the row's top passes under the search bar. It then takes the
    // glass over from that bar, so one backdrop filter covers both: two of them
    // meeting edge to edge each blur a truncated kernel and leave a seam.
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(entry.intersectionRatio < 1),
      { rootMargin: `-${SEARCH_BAR_HEIGHT + 1}px 0px 0px 0px`, threshold: 1 },
    )
    observer.observe(row)

    return () => observer.disconnect()
  }, [sticky])

  if (!actions && !controls) {
    return null
  }

  return (
    <div
      ref={rowRef}
      data-pinned={sticky && pinned ? '' : undefined}
      className={clsx(
        'mb-5 flex w-full flex-col gap-3 sm:flex-row sm:items-center',
        // Below the search bar's z-10, so its glass panel can reach up behind
        // that bar without covering the search field.
        sticky && 'sticky-under-searchbar z-5 transform-gpu py-2',
        className,
      )}
    >
      {actions ? (
        <div
          className={clsx(
            'flex flex-wrap items-center gap-2',
            actionsClassName,
          )}
        >
          {actions}
        </div>
      ) : null}

      {controls ? (
        <div
          className={clsx(
            'w-full sm:ml-auto',
            controlsLayout === 'pair' ? 'min-w-0 sm:w-auto' : 'sm:w-[18rem]',
            controlsClassName,
          )}
        >
          {controlsLayout === 'pair' ? (
            // Each control starts at 18rem and gives way before the row
            // overflows; a fixed width scrolled the page sideways on tablets.
            <div className="grid w-full grid-cols-2 gap-2 *:w-full *:min-w-0 sm:flex sm:items-center sm:justify-end sm:*:basis-[18rem]">
              {controls}
            </div>
          ) : (
            controls
          )}
        </div>
      ) : null}
    </div>
  )
}

export default PageControlRow

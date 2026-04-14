import clsx from 'clsx'
import type { ReactNode } from 'react'

interface PageControlRowProps {
  actions?: ReactNode
  controls?: ReactNode
  className?: string
  actionsClassName?: string
  controlsClassName?: string
}

const PageControlRow = ({
  actions,
  controls,
  className,
  actionsClassName,
  controlsClassName,
}: PageControlRowProps) => {
  if (!actions && !controls) {
    return null
  }

  return (
    <div
      className={clsx(
        'mb-5 flex w-full flex-col gap-3 sm:flex-row sm:items-center',
        className,
      )}
    >
      {actions ? (
        <div className={clsx('flex flex-wrap items-center gap-2', actionsClassName)}>
          {actions}
        </div>
      ) : null}

      {controls ? (
        <div
          className={clsx('w-full sm:ml-auto sm:w-[18rem]', controlsClassName)}
        >
          {controls}
        </div>
      ) : null}
    </div>
  )
}

export default PageControlRow
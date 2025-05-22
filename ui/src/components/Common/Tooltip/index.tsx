import React from 'react'
import { Tooltip } from 'react-tooltip'

interface TooltipWrapperProps {
  id: string
  content: React.ReactNode
  children: React.ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const Tooltipwrapper: React.FC<TooltipWrapperProps> = ({
  id,
  content,
  children,
  placement = 'top',
}) => {
  return (
    <>
      <span id={id} className="inline-block">
        {children}
      </span>
      <Tooltip
        anchorSelect={`#${id}`}
        place={placement}
        className="!z-50 !rounded-lg border-2 border-zinc-900 !bg-zinc-700/100 !px-2 !py-1 !text-sm !text-amber-500 !opacity-100 !shadow"
        render={() => <>{content}</>}
      />
    </>
  )
}

export default Tooltipwrapper

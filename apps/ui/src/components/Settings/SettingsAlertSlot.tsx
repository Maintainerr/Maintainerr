import type { ReactNode } from 'react'

const SettingsAlertSlot = ({
  children,
  reserveSpace = true,
}: {
  children?: ReactNode
  reserveSpace?: boolean
}) => {
  return (
    <div className={reserveSpace ? 'min-h-[68px]' : ''}>{children ?? null}</div>
  )
}

export default SettingsAlertSlot

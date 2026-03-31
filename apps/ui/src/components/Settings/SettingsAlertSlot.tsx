import type { ReactNode } from 'react'

const SettingsAlertSlot = ({ children }: { children?: ReactNode }) => {
  return <div className="min-h-[68px]">{children ?? null}</div>
}

export default SettingsAlertSlot
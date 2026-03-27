// components/ToggleItem.tsx
import React, { useState } from 'react'

interface ToggleItemProps {
  label: string
  toggled?: boolean
  onStateChange: (state: boolean) => void
}

const ToggleItem: React.FC<ToggleItemProps> = ({
  label,
  toggled,
  onStateChange,
}) => {
  const [internalToggled, setInternalToggled] = useState(Boolean(toggled))
  const isToggled = toggled ?? internalToggled

  const handleToggle = () => {
    const nextState = !isToggled
    onStateChange(nextState)
    if (toggled === undefined) {
      setInternalToggled(nextState)
    }
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-700 py-2">
      <div className="flex items-center">
        <input
          type="checkbox"
          className="border-zinc-600 hover:border-zinc-500 focus:border-zinc-500 focus:bg-opacity-100 focus:placeholder-zinc-400 focus:outline-none focus:ring-0"
          checked={isToggled}
          onChange={handleToggle}
        />
        <span className="toggle-label block h-6 cursor-pointer overflow-hidden rounded-full bg-gray-400"></span>
        <span className="ml-3 text-white">{label}</span>
      </div>
      {/* <a href="#" className="text-blue-400 hover:underline">Edit</a> */}
    </div>
  )
}

export default ToggleItem

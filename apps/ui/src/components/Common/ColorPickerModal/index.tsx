import { useState } from 'react'
import { Input } from '../../Forms/Input'
import Modal from '../Modal'
import SaveButton from '../SaveButton'

interface ColorPickerModalProps {
  title?: string
  initialValue: string
  onCancel: () => void
  onSave: (value: string) => void
}

const PRESET_COLORS = [
  '#ffffff',
  '#d4d4d8',
  '#a1a1aa',
  '#52525b',
  '#27272a',
  '#000000',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#78350f',
  '#991b1b',
  '#064e3b',
  '#1e3a8a',
  '#312e81',
]

const normalizeHex = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(withHash)) {
    return withHash.toLowerCase()
  }
  return null
}

const ColorPickerModal = ({
  title = 'Choose a color',
  initialValue,
  onCancel,
  onSave,
}: ColorPickerModalProps) => {
  const [value, setValue] = useState(initialValue || '#ffffff')
  const [hexInput, setHexInput] = useState(initialValue || '#ffffff')

  const handleHexChange = (next: string) => {
    setHexInput(next)
    const normalized = normalizeHex(next)
    if (normalized) setValue(normalized)
  }

  const handleSave = () => {
    const normalized = normalizeHex(hexInput) ?? value
    onSave(normalized)
  }

  return (
    <Modal
      title={title}
      size="md"
      backgroundClickable={false}
      onCancel={onCancel}
      cancelText="Cancel"
      footerActions={
        <SaveButton
          className="ml-3"
          type="button"
          onClick={handleSave}
          isPending={false}
        />
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 shrink-0 rounded-md border border-zinc-500 shadow-inner"
            style={{ backgroundColor: value }}
          />
          <div className="flex-1">
            <Input
              name="color-hex"
              type="text"
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="#ffffff"
            />
          </div>
          <input
            type="color"
            aria-label="Native color picker"
            className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-zinc-500 bg-zinc-700"
            value={value.slice(0, 7)}
            onChange={(e) => {
              setValue(e.target.value)
              setHexInput(e.target.value)
            }}
          />
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-400">
            Presets
          </p>
          <div className="grid grid-cols-7 gap-2">
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Select ${preset}`}
                className={`h-8 w-8 rounded-md border transition ${
                  value.toLowerCase() === preset
                    ? 'border-maintainerr-600 ring-2 ring-maintainerr-500'
                    : 'border-zinc-600 hover:border-zinc-400'
                }`}
                style={{ backgroundColor: preset }}
                onClick={() => {
                  setValue(preset)
                  setHexInput(preset)
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default ColorPickerModal

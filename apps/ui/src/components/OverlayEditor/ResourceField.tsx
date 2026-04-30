import { useRef } from 'react'
import { Select } from '../Forms/Select'
import Button from '../Common/Button'

export interface ResourceOption {
  name: string
  path: string
}

interface ResourceFieldProps {
  label: string
  value: string
  options: ResourceOption[]
  onSelect: (name: string) => void
  onUpload: (file: File) => Promise<ResourceOption | null>
  accept: string
  uploadTitle: string
  placeholder?: string
}

/**
 * Compact `[label] [Select] [Upload]` row used for editor-level resources
 * that live as files on disk and are picked into element fields by name —
 * fonts and image assets. The dropdown shows server-listed files, and the
 * upload button posts a new file and selects it on success.
 *
 * If `value` is not in `options`, the Select is rendered with an empty
 * value (showing the placeholder) instead of synthesising a "missing"
 * option — a stale reference is just an unselected state, not an error.
 */
export function ResourceField({
  label,
  value,
  options,
  onSelect,
  onUpload,
  accept,
  uploadTitle,
  placeholder = 'Select...',
}: ResourceFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const known = options.some((opt) => opt.name === value)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const uploaded = await onUpload(file)
    if (uploaded) onSelect(uploaded.name)
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-zinc-400">{label}</span>
      <Select
        name={`resource-${label}`}
        value={known ? value : ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled={known}>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.path} value={opt.name}>
            {opt.name}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        buttonType="primary"
        buttonSize="sm"
        className="shrink-0"
        onClick={() => fileRef.current?.click()}
        title={uploadTitle}
      >
        Upload
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleUpload}
      />
    </label>
  )
}

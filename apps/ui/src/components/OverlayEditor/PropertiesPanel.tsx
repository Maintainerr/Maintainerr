import type { OverlayElement, VariableSegment } from '@maintainerr/contracts'
import {
  IMAGE_UPLOAD_MAX_LABEL,
  OVERLAY_IMAGE_ACCEPT,
  OVERLAY_IMAGE_FORMAT_LABELS,
} from '@maintainerr/contracts'
import { useState } from 'react'
import ColorPickerModal from '../Common/ColorPickerModal'
import { Input } from '../Forms/Input'
import { Select } from '../Forms/Select'
import {
  findOverlayFont,
  getOverlayFontFamily,
  type OverlayEditorFont,
} from './editorFonts'
import { ResourceField, type ResourceOption } from './ResourceField'

function formatDisjunction(items: readonly string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} or ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`
}

interface PropertiesPanelProps {
  element: OverlayElement
  onChange: (el: OverlayElement) => void
  fonts: { name: string; path: string }[]
  onUploadFont: (file: File) => Promise<{ name: string; path: string } | null>
  images: { name: string; path: string }[]
  onUploadImage: (file: File) => Promise<{ name: string; path: string } | null>
}

export function PropertiesPanel({
  element: el,
  onChange,
  fonts,
  onUploadFont,
  images,
  onUploadImage,
}: PropertiesPanelProps) {
  const update = <K extends keyof OverlayElement>(
    key: K,
    value: OverlayElement[K],
  ) => {
    onChange({ ...el, [key]: value } as OverlayElement)
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <h3 className="font-medium uppercase tracking-wider text-zinc-400">
        Properties
      </h3>

      {/* Common: position & size */}
      <FieldGroup label="Position">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X"
            value={el.x}
            onChange={(v) => update('x', v)}
          />
          <NumberField
            label="Y"
            value={el.y}
            onChange={(v) => update('y', v)}
          />
          <NumberField
            label="W"
            value={el.width}
            onChange={(v) => update('width', v)}
            min={1}
          />
          <NumberField
            label="H"
            value={el.height}
            onChange={(v) => update('height', v)}
            min={1}
          />
        </div>
      </FieldGroup>

      <FieldGroup label="Transform">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Rotation"
            value={el.rotation}
            onChange={(v) => update('rotation', v)}
            min={-360}
            max={360}
          />
          <NumberField
            label="Opacity"
            value={el.opacity}
            onChange={(v) => update('opacity', v)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
      </FieldGroup>

      {/* Type-specific panels */}
      {el.type === 'text' && (
        <TextProperties
          el={el}
          onChange={onChange}
          fonts={fonts}
          onUploadFont={onUploadFont}
        />
      )}
      {el.type === 'variable' && (
        <VariableProperties
          el={el}
          onChange={onChange}
          fonts={fonts}
          onUploadFont={onUploadFont}
        />
      )}
      {el.type === 'shape' && <ShapeProperties el={el} onChange={onChange} />}
      {el.type === 'image' && (
        <ImageProperties
          el={el}
          onChange={onChange}
          images={images}
          onUploadImage={onUploadImage}
        />
      )}
    </div>
  )
}

// ── Type-specific sub-panels ────────────────────────────────────────────────

function TextProperties({
  el,
  onChange,
  fonts,
  onUploadFont,
}: {
  el: Extract<OverlayElement, { type: 'text' }>
  onChange: (el: OverlayElement) => void
  fonts: { name: string; path: string }[]
  onUploadFont: (file: File) => Promise<{ name: string; path: string } | null>
}) {
  const update = <K extends keyof typeof el>(key: K, value: (typeof el)[K]) =>
    onChange({ ...el, [key]: value })

  return (
    <>
      <FieldGroup label="Text">
        <textarea
          className="block w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 px-3 py-1.5 text-sm text-white shadow-sm transition duration-150 ease-in-out focus:border-maintainerr-600 focus:outline-none focus:ring-0 disabled:opacity-50"
          rows={2}
          value={el.text}
          onChange={(e) => update('text', e.target.value)}
        />
      </FieldGroup>
      <FontFields
        el={el}
        update={update}
        fonts={fonts}
        onUploadFont={onUploadFont}
      />
      <FieldGroup label="Background">
        <ColorField
          label="Color"
          value={el.backgroundColor ?? '#00000000'}
          onChange={(v) =>
            update('backgroundColor', v === '#00000000' ? null : v)
          }
        />
        <NumberField
          label="Radius"
          value={el.backgroundRadius}
          onChange={(v) => update('backgroundRadius', v)}
          min={0}
        />
        <NumberField
          label="Padding"
          value={el.backgroundPadding}
          onChange={(v) => update('backgroundPadding', v)}
          min={0}
        />
      </FieldGroup>
      <CheckboxField
        label="Shadow"
        checked={el.shadow}
        onChange={(v) => update('shadow', v)}
      />
      <CheckboxField
        label="Uppercase"
        checked={el.uppercase}
        onChange={(v) => update('uppercase', v)}
      />
    </>
  )
}

function VariableProperties({
  el,
  onChange,
  fonts,
  onUploadFont,
}: {
  el: Extract<OverlayElement, { type: 'variable' }>
  onChange: (el: OverlayElement) => void
  fonts: { name: string; path: string }[]
  onUploadFont: (file: File) => Promise<{ name: string; path: string } | null>
}) {
  const update = <K extends keyof typeof el>(key: K, value: (typeof el)[K]) =>
    onChange({ ...el, [key]: value })

  const updateSegment = (index: number, seg: VariableSegment) => {
    const newSegs = [...el.segments]
    newSegs[index] = seg
    update('segments', newSegs)
  }

  const addSegment = (type: 'text' | 'variable') => {
    const newSeg: VariableSegment =
      type === 'text'
        ? { type: 'text', value: '' }
        : { type: 'variable', field: 'date' }
    update('segments', [...el.segments, newSeg])
  }

  const removeSegment = (index: number) => {
    if (el.segments.length <= 1) return
    update(
      'segments',
      el.segments.filter((_, i) => i !== index),
    )
  }

  return (
    <>
      <FieldGroup label="Segments">
        {el.segments.map((seg, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            {seg.type === 'text' ? (
              <Input
                name={`segment-text-${i}`}
                type="text"
                value={seg.value}
                onChange={(e) =>
                  updateSegment(i, { type: 'text', value: e.target.value })
                }
                placeholder="Text..."
              />
            ) : (
              <Select
                name={`segment-variable-${i}`}
                value={seg.field}
                onChange={(e) =>
                  updateSegment(i, {
                    type: 'variable',
                    field: e.target.value as 'date' | 'days' | 'daysText',
                  })
                }
              >
                <option value="date">{'{date}'}</option>
                <option value="days">{'{days}'}</option>
                <option value="daysText">{'{daysText}'}</option>
              </Select>
            )}
            <button
              type="button"
              className="shrink-0 text-red-400 hover:text-red-300"
              onClick={() => removeSegment(i)}
              title="Remove"
            >
              ×
            </button>
          </div>
        ))}
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            className="rounded bg-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-600"
            onClick={() => addSegment('text')}
          >
            + Text
          </button>
          <button
            type="button"
            className="rounded bg-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-600"
            onClick={() => addSegment('variable')}
          >
            + Variable
          </button>
        </div>
      </FieldGroup>
      <FontFields
        el={el}
        update={update}
        fonts={fonts}
        onUploadFont={onUploadFont}
      />
      <FieldGroup label="Background">
        <ColorField
          label="Color"
          value={el.backgroundColor ?? '#00000000'}
          onChange={(v) =>
            update('backgroundColor', v === '#00000000' ? null : v)
          }
        />
        <NumberField
          label="Radius"
          value={el.backgroundRadius}
          onChange={(v) => update('backgroundRadius', v)}
          min={0}
        />
        <NumberField
          label="Padding"
          value={el.backgroundPadding}
          onChange={(v) => update('backgroundPadding', v)}
          min={0}
        />
      </FieldGroup>
      <FieldGroup label="Date / Days Config">
        <TextField
          label="Date Format"
          value={el.dateFormat}
          onChange={(v) => update('dateFormat', v)}
        />
        <TextField
          label="Language"
          value={el.language}
          onChange={(v) => update('language', v)}
        />
        <TextField
          label="Today text"
          value={el.textToday}
          onChange={(v) => update('textToday', v)}
        />
        <TextField
          label="1 day text"
          value={el.textDay}
          onChange={(v) => update('textDay', v)}
        />
        <TextField
          label="N days text"
          value={el.textDays}
          onChange={(v) => update('textDays', v)}
        />
        <CheckboxField
          label="Day Suffix"
          checked={el.enableDaySuffix}
          onChange={(v) => update('enableDaySuffix', v)}
        />
      </FieldGroup>
      <CheckboxField
        label="Shadow"
        checked={el.shadow}
        onChange={(v) => update('shadow', v)}
      />
      <CheckboxField
        label="Uppercase"
        checked={el.uppercase}
        onChange={(v) => update('uppercase', v)}
      />
    </>
  )
}

function ShapeProperties({
  el,
  onChange,
}: {
  el: Extract<OverlayElement, { type: 'shape' }>
  onChange: (el: OverlayElement) => void
}) {
  const update = <K extends keyof typeof el>(key: K, value: (typeof el)[K]) =>
    onChange({ ...el, [key]: value })

  return (
    <>
      <FieldGroup label="Shape">
        <Select
          name="shape-type"
          value={el.shapeType}
          onChange={(e) =>
            update('shapeType', e.target.value as 'rectangle' | 'ellipse')
          }
        >
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
        </Select>
      </FieldGroup>
      <FieldGroup label="Fill & Stroke">
        <ColorField
          label="Fill"
          value={el.fillColor}
          onChange={(v) => update('fillColor', v)}
        />
        <ColorField
          label="Stroke"
          value={el.strokeColor ?? '#00000000'}
          onChange={(v) => update('strokeColor', v === '#00000000' ? null : v)}
        />
        <NumberField
          label="Stroke Width"
          value={el.strokeWidth}
          onChange={(v) => update('strokeWidth', v)}
          min={0}
        />
      </FieldGroup>
      {el.shapeType === 'rectangle' && (
        <NumberField
          label="Corner Radius"
          value={el.cornerRadius}
          onChange={(v) => update('cornerRadius', v)}
          min={0}
        />
      )}
    </>
  )
}

function ImageProperties({
  el,
  onChange,
  images,
  onUploadImage,
}: {
  el: Extract<OverlayElement, { type: 'image' }>
  onChange: (el: OverlayElement) => void
  images: ResourceOption[]
  onUploadImage: (file: File) => Promise<ResourceOption | null>
}) {
  const formatList = formatDisjunction(OVERLAY_IMAGE_FORMAT_LABELS)

  return (
    <FieldGroup label="Image">
      <ResourceField
        label="Image"
        value={el.imagePath}
        options={images}
        onSelect={(name) => onChange({ ...el, imagePath: name })}
        onUpload={onUploadImage}
        accept={OVERLAY_IMAGE_ACCEPT}
        uploadTitle={`Upload image (${formatList} — up to ${IMAGE_UPLOAD_MAX_LABEL})`}
        placeholder="Select image..."
      />
      <p className="text-[10px] text-zinc-500">
        {formatList} — up to {IMAGE_UPLOAD_MAX_LABEL}.
      </p>
    </FieldGroup>
  )
}

// ── Shared field components ─────────────────────────────────────────────────

function FontFields<
  T extends {
    fontFamily: string
    fontPath: string
    fontSize: number
    fontColor: string
    fontWeight: 'normal' | 'bold'
    textAlign: 'left' | 'center' | 'right'
    verticalAlign: 'top' | 'middle' | 'bottom'
  },
>({
  el,
  update,
  fonts,
  onUploadFont,
}: {
  el: T
  update: <K extends keyof T>(key: K, value: T[K]) => void
  fonts: OverlayEditorFont[]
  onUploadFont: (file: File) => Promise<OverlayEditorFont | null>
}) {
  const currentFont = findOverlayFont(fonts, el.fontPath)
  const selectValue = currentFont ? currentFont.name : el.fontPath

  const applyFontByName = (fontName: string) => {
    const family = getOverlayFontFamily(fontName)
    update('fontFamily', family as T['fontFamily'])
    update('fontPath', fontName as T['fontPath'])
  }

  return (
    <FieldGroup label="Font">
      <ResourceField
        label="Font"
        value={selectValue}
        options={fonts}
        onSelect={applyFontByName}
        onUpload={onUploadFont}
        accept=".ttf,.otf,.woff"
        uploadTitle="Upload font (.ttf, .otf, .woff)"
        placeholder={el.fontPath || 'Select font...'}
      />
      <NumberField
        label="Size"
        value={el.fontSize}
        onChange={(v) => update('fontSize', v as T['fontSize'])}
        min={1}
      />
      <ColorField
        label="Color"
        value={el.fontColor}
        onChange={(v) => update('fontColor', v as T['fontColor'])}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Weight"
          value={el.fontWeight}
          options={['normal', 'bold']}
          onChange={(v) => update('fontWeight', v as T['fontWeight'])}
        />
        <SelectField
          label="Align"
          value={el.textAlign}
          options={['left', 'center', 'right']}
          onChange={(v) => update('textAlign', v as T['textAlign'])}
        />
      </div>
      <SelectField
        label="V-Align"
        value={el.verticalAlign}
        options={['top', 'middle', 'bottom']}
        onChange={(v) => update('verticalAlign', v as T['verticalAlign'])}
      />
    </FieldGroup>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-zinc-400">{label}</span>
      <Input
        name={`number-${label}`}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
      />
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-zinc-400">{label}</span>
      <Input
        name={`text-${label}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  return (
    <>
      <label className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-zinc-400">{label}</span>
        <button
          type="button"
          aria-label={`Pick ${label} color`}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-zinc-500 bg-zinc-700"
          style={{ backgroundColor: value }}
          onClick={() => setIsPickerOpen(true)}
        />
        <Input
          name={`color-${label}`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {isPickerOpen && (
        <ColorPickerModal
          title={`Choose ${label.toLowerCase()} color`}
          initialValue={value}
          onCancel={() => setIsPickerOpen(false)}
          onSave={(next) => {
            onChange(next)
            setIsPickerOpen(false)
          }}
        />
      )}
    </>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-zinc-400">{label}</span>
      <Select
        name={`select-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </label>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500"
      />
      {label}
    </label>
  )
}

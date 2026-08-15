import { Trans, useLingui } from '@lingui/react/macro'
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

/**
 * "PNG, JPG, or WebP" in the reader's language.
 *
 * `Intl.ListFormat` rather than a message: the items are file-format tokens
 * that are never translated, and only the joining is locale-dependent. Built
 * as messages this needed a `{leading}, or {last}` fragment - two words with no
 * context for a translator, and the surrounding sentence then carried the whole
 * list as one opaque placeholder.
 */
const formatDisjunction = (locale: string, items: readonly string[]): string =>
  new Intl.ListFormat(locale, { style: 'long', type: 'disjunction' }).format(
    items,
  )

// One source for the picker filter and its label, mirroring
// OVERLAY_IMAGE_ACCEPT, so no translation can make them disagree.
const FONT_UPLOAD_EXTENSIONS = ['.ttf', '.otf', '.woff']

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
  const { t } = useLingui()
  const update = <K extends keyof OverlayElement>(
    key: K,
    value: OverlayElement[K],
  ) => {
    onChange({ ...el, [key]: value } as OverlayElement)
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      <h3 className="font-medium tracking-wider text-zinc-400 uppercase">
        <Trans>Properties</Trans>
      </h3>

      {/* Common: position & size */}
      <FieldGroup label={t`Position`}>
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

      <FieldGroup label={t`Transform`}>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={t`Rotation`}
            value={el.rotation}
            onChange={(v) => update('rotation', v)}
            min={-360}
            max={360}
          />
          <NumberField
            label={t`Opacity`}
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
  const { t } = useLingui()
  const update = <K extends keyof typeof el>(key: K, value: (typeof el)[K]) =>
    onChange({ ...el, [key]: value })

  return (
    <>
      <FieldGroup label={t`Text`}>
        <textarea
          className="block field-sizing-content min-h-14 w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 px-3 py-1.5 text-sm text-white shadow-xs transition duration-150 ease-in-out focus:border-maintainerr-600 focus:ring-0 focus:outline-hidden disabled:opacity-50"
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
      <FieldGroup label={t`Background`}>
        <ColorField
          label={t`Color`}
          value={el.backgroundColor ?? '#00000000'}
          onChange={(v) =>
            update('backgroundColor', v === '#00000000' ? null : v)
          }
        />
        <NumberField
          label={t`Radius`}
          value={el.backgroundRadius}
          onChange={(v) => update('backgroundRadius', v)}
          min={0}
        />
        <NumberField
          label={t`Padding`}
          value={el.backgroundPadding}
          onChange={(v) => update('backgroundPadding', v)}
          min={0}
        />
      </FieldGroup>
      <CheckboxField
        label={t`Shadow`}
        checked={el.shadow}
        onChange={(v) => update('shadow', v)}
      />
      <CheckboxField
        label={t`Uppercase`}
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
  const { t } = useLingui()
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
      <FieldGroup label={t`Segments`}>
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
                placeholder={t`Text...`}
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
              title={t`Remove`}
            >
              ×
            </button>
          </div>
        ))}
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            className="rounded-sm bg-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-600"
            onClick={() => addSegment('text')}
          >
            <Trans>+ Text</Trans>
          </button>
          <button
            type="button"
            className="rounded-sm bg-zinc-700 px-2 py-0.5 text-zinc-300 hover:bg-zinc-600"
            onClick={() => addSegment('variable')}
          >
            <Trans>+ Variable</Trans>
          </button>
        </div>
      </FieldGroup>
      <FontFields
        el={el}
        update={update}
        fonts={fonts}
        onUploadFont={onUploadFont}
      />
      <FieldGroup label={t`Background`}>
        <ColorField
          label={t`Color`}
          value={el.backgroundColor ?? '#00000000'}
          onChange={(v) =>
            update('backgroundColor', v === '#00000000' ? null : v)
          }
        />
        <NumberField
          label={t`Radius`}
          value={el.backgroundRadius}
          onChange={(v) => update('backgroundRadius', v)}
          min={0}
        />
        <NumberField
          label={t`Padding`}
          value={el.backgroundPadding}
          onChange={(v) => update('backgroundPadding', v)}
          min={0}
        />
      </FieldGroup>
      <FieldGroup label={t`Date / Days Config`}>
        <TextField
          label={t`Date Format`}
          value={el.dateFormat}
          onChange={(v) => update('dateFormat', v)}
        />
        <TextField
          label={t`Language`}
          value={el.language}
          onChange={(v) => update('language', v)}
        />
        <TextField
          label={t`Today text`}
          value={el.textToday}
          onChange={(v) => update('textToday', v)}
        />
        <TextField
          label={t`1 day text`}
          value={el.textDay}
          onChange={(v) => update('textDay', v)}
        />
        <TextField
          label={t`N days text`}
          value={el.textDays}
          onChange={(v) => update('textDays', v)}
        />
        <CheckboxField
          label={t`Day Suffix`}
          checked={el.enableDaySuffix}
          onChange={(v) => update('enableDaySuffix', v)}
        />
      </FieldGroup>
      <CheckboxField
        label={t`Shadow`}
        checked={el.shadow}
        onChange={(v) => update('shadow', v)}
      />
      <CheckboxField
        label={t`Uppercase`}
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
  const { t } = useLingui()
  const update = <K extends keyof typeof el>(key: K, value: (typeof el)[K]) =>
    onChange({ ...el, [key]: value })

  return (
    <>
      <FieldGroup label={t`Shape`}>
        <Select
          name="shape-type"
          value={el.shapeType}
          onChange={(e) =>
            update('shapeType', e.target.value as 'rectangle' | 'ellipse')
          }
        >
          <option value="rectangle">{t`Rectangle`}</option>
          <option value="ellipse">{t`Ellipse`}</option>
        </Select>
      </FieldGroup>
      <FieldGroup label={t`Fill & Stroke`}>
        <ColorField
          label={t`Fill`}
          value={el.fillColor}
          onChange={(v) => update('fillColor', v)}
        />
        <ColorField
          label={t`Stroke`}
          value={el.strokeColor ?? '#00000000'}
          onChange={(v) => update('strokeColor', v === '#00000000' ? null : v)}
        />
        <NumberField
          label={t`Stroke Width`}
          value={el.strokeWidth}
          onChange={(v) => update('strokeWidth', v)}
          min={0}
        />
      </FieldGroup>
      {el.shapeType === 'rectangle' && (
        <NumberField
          label={t`Corner Radius`}
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
  const { t, i18n } = useLingui()
  const formatList = formatDisjunction(i18n.locale, OVERLAY_IMAGE_FORMAT_LABELS)
  const imageUploadMaxLabel = IMAGE_UPLOAD_MAX_LABEL

  return (
    <FieldGroup label={t`Image`}>
      <ResourceField
        label={t`Image`}
        value={el.imagePath}
        options={images}
        onSelect={(name) => onChange({ ...el, imagePath: name })}
        onUpload={onUploadImage}
        accept={OVERLAY_IMAGE_ACCEPT}
        uploadTitle={t`Upload image (${{ formatList }} - up to ${{ maxSize: IMAGE_UPLOAD_MAX_LABEL }})`}
        placeholder={t`Select image...`}
      />
      <p className="text-[10px] text-zinc-500">
        <Trans>
          {formatList} - up to {imageUploadMaxLabel}.
        </Trans>
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
  const { t } = useLingui()
  const currentFont = findOverlayFont(fonts, el.fontPath)
  const selectValue = currentFont ? currentFont.name : el.fontPath

  const applyFontByName = (fontName: string) => {
    const family = getOverlayFontFamily(fontName)
    update('fontFamily', family as T['fontFamily'])
    update('fontPath', fontName as T['fontPath'])
  }

  return (
    <FieldGroup label={t`Font`}>
      <ResourceField
        label={t`Font`}
        value={selectValue}
        options={fonts}
        onSelect={applyFontByName}
        onUpload={onUploadFont}
        accept={FONT_UPLOAD_EXTENSIONS.join(',')}
        uploadTitle={t`Upload font (${{ fontExtensions: FONT_UPLOAD_EXTENSIONS.join(', ') }})`}
        placeholder={el.fontPath || t`Select font...`}
      />
      <NumberField
        label={t`Size`}
        value={el.fontSize}
        onChange={(v) => update('fontSize', v as T['fontSize'])}
        min={1}
      />
      <ColorField
        label={t`Color`}
        value={el.fontColor}
        onChange={(v) => update('fontColor', v as T['fontColor'])}
      />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t`Weight`}
          value={el.fontWeight}
          options={[
            { value: 'normal', label: t`normal` },
            { value: 'bold', label: t`bold` },
          ]}
          onChange={(v) => update('fontWeight', v as T['fontWeight'])}
        />
        <SelectField
          label={t`Align`}
          value={el.textAlign}
          options={[
            { value: 'left', label: t`left` },
            { value: 'center', label: t`center` },
            { value: 'right', label: t`right` },
          ]}
          onChange={(v) => update('textAlign', v as T['textAlign'])}
        />
      </div>
      <SelectField
        label={t`V-Align`}
        value={el.verticalAlign}
        options={[
          { value: 'top', label: t`top` },
          { value: 'middle', label: t`middle` },
          { value: 'bottom', label: t`bottom` },
        ]}
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
      <label className="mb-1 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
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
  const { t } = useLingui()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  return (
    <>
      <label className="flex items-center gap-1.5">
        <span className="w-12 shrink-0 text-zinc-400">{label}</span>
        <button
          type="button"
          aria-label={t`Pick ${{ label }} color`}
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
          title={t`Choose ${{ fieldLabel: label.toLowerCase() }} color`}
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
  options: { value: string; label: string }[]
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
          <option key={opt.value} value={opt.value}>
            {opt.label}
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
        className="checkbox"
      />
      {label}
    </label>
  )
}

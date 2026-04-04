import { SaveIcon } from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import {
    overlaySettingsSchema,
    type OverlayExport,
    type OverlaySettings,
    type OverlaySettingsUpdate,
} from '@maintainerr/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import {
    exportOverlaySettings,
    fetchPreviewWithSettings,
    getOverlayFonts,
    getOverlaySections,
    getOverlaySettings,
    getRandomEpisode,
    getRandomItem,
    importOverlaySettings,
    processAllOverlays,
    resetAllOverlays,
    updateOverlaySettings,
} from '../../../api/overlays'
import Alert from '../../Common/Alert'
import PendingButton from '../../Common/PendingButton'
import { InputGroup } from '../../Forms/Input'
import { SelectGroup } from '../../Forms/Select'
import {
    SettingsFeedbackAlert,
    useSettingsFeedback,
} from '../useSettingsFeedback'

// ── Helpers ─────────────────────────────────────────────────────────────

function ColorField({
  value = '',
  onChange,
  name,
  label,
  error,
}: {
  value: string
  onChange: (v: string) => void
  name: string
  label: string
  error?: string
}) {
  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={name} className="sm:mt-2">
        {label}
      </label>
      <div className="px-3 py-2 sm:col-span-2">
        <div className="flex max-w-xl items-center gap-2">
          <input
            type="color"
            value={value.length >= 7 ? value.slice(0, 7) : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-zinc-500 bg-transparent"
          />
          <input
            type="text"
            id={name}
            name={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 text-white shadow-sm sm:text-sm sm:leading-5"
            placeholder="#RRGGBB or #RRGGBBAA"
          />
        </div>
        {error && <p className="mt-2 min-h-5 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  )
}

function NumberFieldGroup({
  name,
  label,
  value,
  onChange,
  min,
  max,
  step,
  error,
  helpText,
}: {
  name: string
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  error?: string
  helpText?: string
}) {
  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={name} className="sm:mt-2">
        {label}
        {helpText && <p className="text-xs font-normal">{helpText}</p>}
      </label>
      <div className="px-3 py-2 sm:col-span-2">
        <div className="max-w-xl">
          <input
            id={name}
            name={name}
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step ?? 0.5}
            className="block w-full min-w-0 flex-1 rounded-md border border-zinc-500 bg-zinc-700 text-white shadow-sm sm:text-sm sm:leading-5"
          />
          {error && (
            <p className="mt-2 min-h-5 text-sm text-red-500">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleField({
  name,
  label,
  checked,
  onChange,
  helpText,
}: {
  name: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  helpText?: string
}) {
  return (
    <div className="mt-6 max-w-6xl sm:mt-5 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4">
      <label htmlFor={name} className="sm:mt-2">
        {label}
        {helpText && <p className="text-xs font-normal">{helpText}</p>}
      </label>
      <div className="px-3 py-2 sm:col-span-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-amber-600 focus:ring-amber-500"
        />
      </div>
    </div>
  )
}

// ── Sub-tab selector ────────────────────────────────────────────────────

type OverlayTab = 'poster' | 'titlecard' | 'import-export'

function SubTabs({
  active,
  onChange,
}: {
  active: OverlayTab
  onChange: (t: OverlayTab) => void
}) {
  const tabs: { id: OverlayTab; label: string }[] = [
    { id: 'poster', label: 'Poster' },
    { id: 'titlecard', label: 'Title Card' },
    { id: 'import-export', label: 'Import / Export' },
  ]
  return (
    <div className="mb-6 flex gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`rounded-md px-3 py-2 text-sm font-medium transition ${
            active === t.id
              ? 'bg-amber-700 text-white'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Preview panel ───────────────────────────────────────────────────────

function PreviewPanel({
  mode,
  sections,
  onRefresh,
  previewSrc,
}: {
  mode: 'poster' | 'titlecard'
  sections: { key: string; title: string; type: string }[]
  onRefresh: (sectionId: string) => void
  previewSrc: string | null
}) {
  const [selectedSection, setSelectedSection] = useState(
    sections[0]?.key ?? '',
  )

  useEffect(() => {
    if (sections.length > 0 && !selectedSection) {
      setSelectedSection(sections[0].key)
    }
  }, [sections, selectedSection])

  return (
    <div className="flex flex-col items-center gap-4">
      <h4 className="text-sm font-medium text-zinc-300">Preview</h4>
      <div
        className={`relative overflow-hidden rounded-lg border border-zinc-600 bg-zinc-800 ${
          mode === 'titlecard' ? 'aspect-video w-full' : 'aspect-[2/3] w-56'
        }`}
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt="Overlay preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-500">
            Save settings then click refresh
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        <select
          value={selectedSection}
          onChange={(e) => setSelectedSection(e.target.value)}
          className="block w-full rounded-md border border-zinc-500 bg-zinc-700 text-sm text-white sm:leading-5"
        >
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.title} ({s.type})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onRefresh(selectedSection)}
          className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-white hover:bg-zinc-600"
        >
          Use different poster
        </button>
      </div>
    </div>
  )
}

// ── Text config section ─────────────────────────────────────────────────

function TextConfigSection({
  prefix,
  control,
  register,
  errors,
}: {
  prefix: string
  control: any
  register: any
  errors: any
}) {
  const useDays = useWatch({ control, name: `${prefix}.useDays` })

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-amber-500">
        Text Settings
      </legend>

      <Controller
        name={`${prefix}.useDays`}
        control={control}
        render={({ field }) => (
          <ToggleField
            name={field.name}
            label="Count-down mode"
            checked={field.value}
            onChange={field.onChange}
            helpText='Show "in X days" instead of a date'
          />
        )}
      />

      {useDays ? (
        <>
          <InputGroup
            label="Today text"
            {...register(`${prefix}.textToday`)}
            error={errors?.textToday?.message}
          />
          <InputGroup
            label="1 day text"
            {...register(`${prefix}.textDay`)}
            error={errors?.textDay?.message}
          />
          <InputGroup
            label="X days text"
            helpText="Use {0} for the number of days"
            {...register(`${prefix}.textDays`)}
            error={errors?.textDays?.message}
          />
        </>
      ) : (
        <>
          <InputGroup
            label="Label prefix"
            helpText='Text before the date, e.g. "Leaving"'
            {...register(`${prefix}.overlayText`)}
            error={errors?.overlayText?.message}
          />
          <InputGroup
            label="Date format"
            helpText="e.g. MMM d, MMMM dd, dd/MM/yyyy"
            {...register(`${prefix}.dateFormat`)}
            error={errors?.dateFormat?.message}
          />
          <InputGroup
            label="Language"
            helpText="BCP 47 locale, e.g. en-US, de, fr"
            {...register(`${prefix}.language`)}
            error={errors?.language?.message}
          />
          <Controller
            name={`${prefix}.enableDaySuffix`}
            control={control}
            render={({ field }) => (
              <ToggleField
                name={field.name}
                label="Day suffix (English)"
                checked={field.value}
                onChange={field.onChange}
                helpText='Append "st/nd/rd/th" to days'
              />
            )}
          />
        </>
      )}

      <Controller
        name={`${prefix}.enableUppercase`}
        control={control}
        render={({ field }) => (
          <ToggleField
            name={field.name}
            label="Uppercase"
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </fieldset>
  )
}

// ── Style config section ────────────────────────────────────────────────

function StyleConfigSection({
  prefix,
  control,
  errors,
  fonts,
}: {
  prefix: string
  control: any
  errors: any
  fonts: { name: string; path: string }[]
}) {
  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-amber-500">
        Style Settings
      </legend>

      <Controller
        name={`${prefix}.fontPath`}
        control={control}
        render={({ field }) => (
          <SelectGroup
            name={field.name}
            label="Font"
            value={field.value}
            onChange={field.onChange}
            error={errors?.fontPath?.message}
          >
            {fonts.map((f) => (
              <option key={f.path} value={f.path}>
                {f.name}
              </option>
            ))}
          </SelectGroup>
        )}
      />

      <Controller
        name={`${prefix}.fontColor`}
        control={control}
        render={({ field }) => (
          <ColorField
            name={field.name}
            label="Font color"
            value={field.value}
            onChange={field.onChange}
            error={errors?.fontColor?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.backColor`}
        control={control}
        render={({ field }) => (
          <ColorField
            name={field.name}
            label="Background color"
            value={field.value}
            onChange={field.onChange}
            error={errors?.backColor?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.fontSize`}
        control={control}
        render={({ field }) => (
          <NumberFieldGroup
            name={field.name}
            label="Font size (%)"
            value={field.value}
            onChange={field.onChange}
            min={1}
            max={20}
            error={errors?.fontSize?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.padding`}
        control={control}
        render={({ field }) => (
          <NumberFieldGroup
            name={field.name}
            label="Padding (%)"
            value={field.value}
            onChange={field.onChange}
            min={0}
            max={20}
            error={errors?.padding?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.backRadius`}
        control={control}
        render={({ field }) => (
          <NumberFieldGroup
            name={field.name}
            label="Corner radius (%)"
            value={field.value}
            onChange={field.onChange}
            min={0}
            max={50}
            error={errors?.backRadius?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.horizontalAlign`}
        control={control}
        render={({ field }) => (
          <SelectGroup
            name={field.name}
            label="Horizontal align"
            value={field.value}
            onChange={field.onChange}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </SelectGroup>
        )}
      />

      <Controller
        name={`${prefix}.horizontalOffset`}
        control={control}
        render={({ field }) => (
          <NumberFieldGroup
            name={field.name}
            label="Horizontal offset (%)"
            value={field.value}
            onChange={field.onChange}
            min={0}
            max={50}
            error={errors?.horizontalOffset?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.verticalAlign`}
        control={control}
        render={({ field }) => (
          <SelectGroup
            name={field.name}
            label="Vertical align"
            value={field.value}
            onChange={field.onChange}
          >
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </SelectGroup>
        )}
      />

      <Controller
        name={`${prefix}.verticalOffset`}
        control={control}
        render={({ field }) => (
          <NumberFieldGroup
            name={field.name}
            label="Vertical offset (%)"
            value={field.value}
            onChange={field.onChange}
            min={0}
            max={50}
            error={errors?.verticalOffset?.message}
          />
        )}
      />

      <Controller
        name={`${prefix}.overlayBottomCenter`}
        control={control}
        render={({ field }) => (
          <ToggleField
            name={field.name}
            label="Bottom-center dock"
            checked={field.value}
            onChange={field.onChange}
            helpText="Anchor the pill centred at the bottom edge"
          />
        )}
      />
    </fieldset>
  )
}

// ── Frame config section ────────────────────────────────────────────────

function FrameConfigSection({
  prefix,
  control,
  errors,
}: {
  prefix: string
  control: any
  errors: any
}) {
  const useFrame = useWatch({ control, name: `${prefix}.useFrame` })

  return (
    <fieldset className="rounded-lg border border-zinc-700 p-4">
      <legend className="px-2 text-sm font-medium text-amber-500">
        Frame Settings
      </legend>

      <Controller
        name={`${prefix}.useFrame`}
        control={control}
        render={({ field }) => (
          <ToggleField
            name={field.name}
            label="Enable frame"
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />

      {useFrame && (
        <>
          <Controller
            name={`${prefix}.frameColor`}
            control={control}
            render={({ field }) => (
              <ColorField
                name={field.name}
                label="Frame color"
                value={field.value}
                onChange={field.onChange}
                error={errors?.frameColor?.message}
              />
            )}
          />

          <Controller
            name={`${prefix}.frameWidth`}
            control={control}
            render={({ field }) => (
              <NumberFieldGroup
                name={field.name}
                label="Frame width (%)"
                value={field.value}
                onChange={field.onChange}
                min={0}
                max={20}
                error={errors?.frameWidth?.message}
              />
            )}
          />

          <Controller
            name={`${prefix}.frameRadius`}
            control={control}
            render={({ field }) => (
              <NumberFieldGroup
                name={field.name}
                label="Outer radius (%)"
                value={field.value}
                onChange={field.onChange}
                min={0}
                max={50}
                error={errors?.frameRadius?.message}
              />
            )}
          />

          <Controller
            name={`${prefix}.frameInnerRadius`}
            control={control}
            render={({ field }) => (
              <NumberFieldGroup
                name={field.name}
                label="Inner radius (%)"
                value={field.value}
                onChange={field.onChange}
                min={0}
                max={50}
                error={errors?.frameInnerRadius?.message}
              />
            )}
          />

          <Controller
            name={`${prefix}.frameInnerRadiusMode`}
            control={control}
            render={({ field }) => (
              <SelectGroup
                name={field.name}
                label="Inner radius mode"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="auto">Auto</option>
                <option value="absolute">Absolute</option>
              </SelectGroup>
            )}
          />

          <Controller
            name={`${prefix}.frameInset`}
            control={control}
            render={({ field }) => (
              <SelectGroup
                name={field.name}
                label="Frame inset"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="outside">Outside</option>
                <option value="inside">Inside</option>
                <option value="flush">Flush</option>
              </SelectGroup>
            )}
          />

          <Controller
            name={`${prefix}.dockStyle`}
            control={control}
            render={({ field }) => (
              <SelectGroup
                name={field.name}
                label="Dock style"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="pill">Pill</option>
                <option value="bar">Bar</option>
              </SelectGroup>
            )}
          />

          <Controller
            name={`${prefix}.dockPosition`}
            control={control}
            render={({ field }) => (
              <SelectGroup
                name={field.name}
                label="Dock position"
                value={field.value}
                onChange={field.onChange}
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </SelectGroup>
            )}
          />
        </>
      )}
    </fieldset>
  )
}

// ── Import / Export section ─────────────────────────────────────────────

function ImportExportSection() {
  const [importType, setImportType] = useState<'poster' | 'titlecard'>(
    'poster',
  )
  const [exportType, setExportType] = useState<'poster' | 'titlecard'>(
    'poster',
  )
  const [importData, setImportData] = useState<OverlayExport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      const data = await exportOverlaySettings(exportType)
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `overlay-${exportType}-settings.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImportSuccess(false)

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string) as OverlayExport
        if (!json.overlayText || !json.overlayStyle || !json.frame) {
          throw new Error('Missing required fields')
        }
        setImportData(json)
      } catch (err) {
        setImportError(`Invalid file: ${err}`)
        setImportData(null)
      }
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!importData) return
    try {
      await importOverlaySettings(importType, importData)
      setImportSuccess(true)
      setImportData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      setImportError('Failed to import settings')
    }
  }

  return (
    <div className="space-y-8">
      {/* Export */}
      <fieldset className="rounded-lg border border-zinc-700 p-4">
        <legend className="px-2 text-sm font-medium text-amber-500">
          Export
        </legend>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Type</label>
            <select
              value={exportType}
              onChange={(e) =>
                setExportType(e.target.value as 'poster' | 'titlecard')
              }
              className="rounded-md border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm text-white"
            >
              <option value="poster">Poster</option>
              <option value="titlecard">Title Card</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
          >
            Download JSON
          </button>
        </div>
      </fieldset>

      {/* Import */}
      <fieldset className="rounded-lg border border-zinc-700 p-4">
        <legend className="px-2 text-sm font-medium text-amber-500">
          Import
        </legend>
        {importError && <Alert type="error" title={importError} />}
        {importSuccess && (
          <Alert type="info" title="Settings imported successfully" />
        )}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Type</label>
            <select
              value={importType}
              onChange={(e) =>
                setImportType(e.target.value as 'poster' | 'titlecard')
              }
              className="rounded-md border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm text-white"
            >
              <option value="poster">Poster</option>
              <option value="titlecard">Title Card</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-300">File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="text-sm text-zinc-300"
            />
          </div>
          <button
            type="button"
            disabled={!importData}
            onClick={handleImport}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </fieldset>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────

const OverlaySettings = () => {
  const [tab, setTab] = useState<OverlayTab>('poster')
  const [sections, setSections] = useState<
    { key: string; title: string; type: string }[]
  >([])
  const [fonts, setFonts] = useState<{ name: string; path: string }[]>([])
  const [previewPlexId, setPreviewPlexId] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const previewBlobRef = useRef<string | null>(null)

  const { feedback, showUpdated, showUpdateError, showInfo, showError } =
    useSettingsFeedback('Overlay settings')

  const {
    register,
    handleSubmit,
    control,
    getValues,
    formState: { errors, isSubmitting, isLoading },
  } = useForm<OverlaySettings>({
    resolver: zodResolver(overlaySettingsSchema),
    defaultValues: async () => {
      const settings = await getOverlaySettings()
      return settings
    },
  })

  // Watch form values for live preview
  const watchedValues = useWatch({ control })

  // Load sections and fonts on mount
  useEffect(() => {
    getOverlaySections()
      .then(setSections)
      .catch(() => {})
    getOverlayFonts()
      .then(setFonts)
      .catch(() => {})
  }, [])

  // Clear preview when switching tabs
  useEffect(() => {
    setPreviewPlexId(null)
    setPreviewSrc(null)
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current)
      previewBlobRef.current = null
    }
  }, [tab])

  // Live preview: debounce form changes and re-render
  useEffect(() => {
    if (!previewPlexId) return

    const timer = setTimeout(() => {
      const values = getValues()
      const textCfg =
        tab === 'titlecard'
          ? values.titleCardOverlayText
          : values.posterOverlayText
      const styleCfg =
        tab === 'titlecard'
          ? values.titleCardOverlayStyle
          : values.posterOverlayStyle
      const frameCfg =
        tab === 'titlecard' ? values.titleCardFrame : values.posterFrame

      if (!textCfg || !styleCfg || !frameCfg) return

      fetchPreviewWithSettings(previewPlexId, textCfg, styleCfg, frameCfg)
        .then((blobUrl) => {
          if (previewBlobRef.current) {
            URL.revokeObjectURL(previewBlobRef.current)
          }
          previewBlobRef.current = blobUrl
          setPreviewSrc(blobUrl)
        })
        .catch(() => {})
    }, 600)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedValues, previewPlexId, tab])

  const refreshPreview = useCallback(
    (sectionId: string) => {
      const mode = tab === 'titlecard' ? 'titlecard' : 'poster'
      const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem

      fetcher(sectionId)
        .then((item) => {
          if (item) {
            setPreviewPlexId(item.plexId)
            // The live-preview useEffect will fire once previewPlexId is set
          }
        })
        .catch(() => {})
    },
    [tab],
  )

  // get a nested error object helper
  const getErrors = (path: string) => {
    return path
      .split('.')
      .reduce((obj: any, key) => obj?.[key], errors) as any
  }

  const onSubmit = async (data: OverlaySettings) => {
    try {
      await updateOverlaySettings(data as OverlaySettingsUpdate)
      showUpdated()
    } catch {
      showUpdateError()
    }
  }

  const handleProcessAll = async () => {
    setProcessing(true)
    try {
      const result = await processAllOverlays()
      showInfo(
        `Processed: ${result.processed}, Reverted: ${result.reverted}, Errors: ${result.errors}`,
      )
    } catch {
      showError('Failed to process overlays')
    } finally {
      setProcessing(false)
    }
  }

  const handleResetAll = async () => {
    if (!window.confirm('Reset all overlays? This will revert all posters.')) {
      return
    }
    setResetting(true)
    try {
      await resetAllOverlays()
      showInfo('All overlays have been reset')
    } catch {
      showError('Failed to reset overlays')
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <title>Overlay settings - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Overlay Settings</h3>
          <p className="description">
            Configure automatic poster and title card overlays for collections
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <div className="section">
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Global settings */}
            <fieldset className="mb-6 rounded-lg border border-zinc-700 p-4">
              <legend className="px-2 text-sm font-medium text-amber-500">
                General
              </legend>

              <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                  <ToggleField
                    name="enabled"
                    label="Enable overlays"
                    checked={field.value}
                    onChange={field.onChange}
                    helpText="Master switch for overlay processing"
                  />
                )}
              />

              <Controller
                name="applyOnAdd"
                control={control}
                render={({ field }) => (
                  <ToggleField
                    name="applyOnAdd"
                    label="Apply on collection add"
                    checked={field.value}
                    onChange={field.onChange}
                    helpText="Automatically apply overlays when media is added to a collection"
                  />
                )}
              />

              <InputGroup
                label="Cron schedule"
                helpText="e.g. 0 3 * * * (daily at 3am). Leave empty to disable scheduled runs."
                {...register('cronSchedule')}
                error={errors.cronSchedule?.message}
              />
            </fieldset>

            {/* Sub tabs */}
            <SubTabs active={tab} onChange={setTab} />

            {tab === 'import-export' ? (
              <ImportExportSection />
            ) : (
              <div className="flex flex-col gap-8 lg:flex-row">
                {/* Settings column */}
                <div className="flex-1 space-y-6">
                  <TextConfigSection
                    prefix={
                      tab === 'poster'
                        ? 'posterOverlayText'
                        : 'titleCardOverlayText'
                    }
                    control={control}
                    register={register}
                    errors={getErrors(
                      tab === 'poster'
                        ? 'posterOverlayText'
                        : 'titleCardOverlayText',
                    )}
                  />

                  <StyleConfigSection
                    prefix={
                      tab === 'poster'
                        ? 'posterOverlayStyle'
                        : 'titleCardOverlayStyle'
                    }
                    control={control}
                    errors={getErrors(
                      tab === 'poster'
                        ? 'posterOverlayStyle'
                        : 'titleCardOverlayStyle',
                    )}
                    fonts={fonts}
                  />

                  <FrameConfigSection
                    prefix={tab === 'poster' ? 'posterFrame' : 'titleCardFrame'}
                    control={control}
                    errors={getErrors(
                      tab === 'poster' ? 'posterFrame' : 'titleCardFrame',
                    )}
                  />
                </div>

                {/* Preview column */}
                <div className="w-full shrink-0 lg:w-72">
                  <PreviewPanel
                    mode={tab === 'titlecard' ? 'titlecard' : 'poster'}
                    sections={sections}
                    onRefresh={refreshPreview}
                    previewSrc={previewSrc}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="actions mt-8 flex flex-wrap gap-3">
              <PendingButton
                buttonType="primary"
                type="submit"
                disabled={isSubmitting || isLoading}
                idleLabel="Save Changes"
                pendingLabel="Saving..."
                isPending={isSubmitting}
                idleIcon={<SaveIcon />}
                reserveLabel="Save Changes"
              />

              <button
                type="button"
                onClick={handleProcessAll}
                disabled={processing}
                className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
              >
                {processing ? 'Processing...' : 'Run Now'}
              </button>

              <button
                type="button"
                onClick={handleResetAll}
                disabled={resetting}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset All Overlays'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}

export default OverlaySettings

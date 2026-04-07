import {
  ChevronDownIcon,
  ChevronUpIcon,
  CogIcon,
  DownloadIcon,
  DuplicateIcon,
  PencilAltIcon,
  PlusIcon,
  SaveIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from '@heroicons/react/solid'
import { zodResolver } from '@hookform/resolvers/zod'
import type {
  OverlaySettings,
  OverlaySettingsUpdate,
  OverlayTemplate,
  OverlayTemplateExport,
} from '@maintainerr/contracts'
import { overlaySettingsSchema } from '@maintainerr/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  deleteOverlayTemplate,
  duplicateOverlayTemplate,
  exportOverlayTemplate,
  getOverlaySettings,
  getOverlayTemplates,
  importOverlayTemplate,
  processAllOverlays,
  resetAllOverlays,
  setDefaultOverlayTemplate,
  updateOverlaySettings,
} from '../api/overlays'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import PendingButton from '../components/Common/PendingButton'
import { InputGroup } from '../components/Forms/Input'

const OverlayTemplateListPage = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<OverlayTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    control,
    reset: resetForm,
    formState: { errors, isSubmitting, isLoading: isFormLoading },
  } = useForm<OverlaySettings>({
    resolver: zodResolver(overlaySettingsSchema),
    defaultValues: async () => {
      const settings = await getOverlaySettings()
      return settings
    },
  })

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await getOverlayTemplates()
      if (data) setTemplates(data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  const onSettingsSubmit = async (data: OverlaySettings) => {
    try {
      const updated = await updateOverlaySettings(data as OverlaySettingsUpdate)
      resetForm(updated)
      toast.success('Overlay settings saved')
    } catch {
      toast.error('Failed to save overlay settings')
    }
  }

  const handleProcessAll = async () => {
    setProcessing(true)
    try {
      const result = await processAllOverlays()
      toast.info(
        `Processed: ${result.processed}, Reverted: ${result.reverted}, Errors: ${result.errors}`,
      )
    } catch {
      toast.error('Failed to process overlays')
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
      toast.info('All overlays have been reset')
    } catch {
      toast.error('Failed to reset overlays')
    } finally {
      setResetting(false)
    }
  }

  const handleCreate = () => {
    navigate('/settings/overlays/templates/new')
  }

  const handleEdit = (id: number) => {
    navigate(`/settings/overlays/templates/${id}`)
  }

  const handleDuplicate = async (id: number) => {
    const result = await duplicateOverlayTemplate(id)
    if (result) {
      toast.success('Template duplicated')
      void fetchTemplates()
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Delete template "${name}"?`)) return
    const result = await deleteOverlayTemplate(id)
    if (result?.success) {
      toast.success('Template deleted')
      void fetchTemplates()
    } else {
      toast.error('Cannot delete preset templates')
    }
  }

  const handleSetDefault = async (id: number) => {
    const result = await setDefaultOverlayTemplate(id)
    if (result) {
      toast.success(`"${result.name}" set as default for ${result.mode}`)
      void fetchTemplates()
    }
  }

  const handleExport = async (id: number) => {
    const data = await exportOverlayTemplate(id)
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `overlay-template-${data.name.replace(/\s+/g, '-').toLowerCase()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text) as OverlayTemplateExport
      const result = await importOverlayTemplate(data)
      if (result) {
        toast.success(`Imported template "${result.name}"`)
        void fetchTemplates()
      }
    } catch {
      toast.error('Invalid template file')
    }
    // Reset input so the same file can be re-imported
    if (importInputRef.current) importInputRef.current.value = ''
  }

  if (isLoading) return <LoadingSpinner />

  const posterTemplates = templates.filter((t) => t.mode === 'poster')
  const titleCardTemplates = templates.filter((t) => t.mode === 'titlecard')

  return (
    <>
      <title>Overlay Templates - Maintainerr</title>
      <div className="w-full">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-200">
            Overlay Templates
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-600"
              onClick={() => setSettingsOpen((v) => !v)}
              title="Overlay settings"
            >
              <CogIcon className="h-4 w-4" />
              Settings
              {settingsOpen ? (
                <ChevronUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              type="button"
              className="flex items-center gap-1.5 rounded bg-zinc-700 px-3 py-1.5 text-sm text-zinc-200 transition hover:bg-zinc-600"
              onClick={() => importInputRef.current?.click()}
            >
              <UploadIcon className="h-4 w-4" />
              Import
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-500"
              onClick={handleCreate}
            >
              <PlusIcon className="h-4 w-4" />
              New Template
            </button>
          </div>
        </div>

        {/* Collapsible settings panel */}
        {settingsOpen && (
          <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <form onSubmit={handleSubmit(onSettingsSubmit)}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Controller
                  name="enabled"
                  control={control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-amber-600 focus:ring-amber-500"
                      />
                      Enable overlays
                    </label>
                  )}
                />
                <Controller
                  name="applyOnAdd"
                  control={control}
                  render={({ field }) => (
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-amber-600 focus:ring-amber-500"
                      />
                      Apply on collection add
                    </label>
                  )}
                />
                <InputGroup
                  label="Cron schedule"
                  {...register('cronSchedule')}
                  error={errors.cronSchedule?.message}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <PendingButton
                  buttonType="primary"
                  type="submit"
                  disabled={isSubmitting || isFormLoading}
                  idleLabel="Save Settings"
                  pendingLabel="Saving..."
                  isPending={isSubmitting}
                  idleIcon={<SaveIcon />}
                  reserveLabel="Save Settings"
                />
                <button
                  type="button"
                  onClick={handleProcessAll}
                  disabled={processing}
                  className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Run Now'}
                </button>
                <button
                  type="button"
                  onClick={handleResetAll}
                  disabled={resetting}
                  className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {resetting ? 'Resetting...' : 'Reset All'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Poster templates */}
        <TemplateSection
          title="Poster Templates"
          templates={posterTemplates}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onSetDefault={handleSetDefault}
          onExport={handleExport}
        />

        {/* Title card templates */}
        <TemplateSection
          title="Title Card Templates"
          templates={titleCardTemplates}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onSetDefault={handleSetDefault}
          onExport={handleExport}
        />
      </div>
    </>
  )
}

function TemplateSection({
  title,
  templates,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
  onExport,
}: {
  title: string
  templates: OverlayTemplate[]
  onEdit: (id: number) => void
  onDuplicate: (id: number) => void
  onDelete: (id: number, name: string) => void
  onSetDefault: (id: number) => void
  onExport: (id: number) => void
}) {
  if (templates.length === 0) return null

  return (
    <div className="mb-8">
      <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-zinc-400">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onSetDefault={onSetDefault}
            onExport={onExport}
          />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({
  template: t,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
  onExport,
}: {
  template: OverlayTemplate
  onEdit: (id: number) => void
  onDuplicate: (id: number) => void
  onDelete: (id: number, name: string) => void
  onSetDefault: (id: number) => void
  onExport: (id: number) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 transition hover:border-zinc-500">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-100">{t.name}</span>
            {t.isDefault && (
              <span className="rounded bg-amber-700/40 px-1.5 py-0.5 text-xs text-amber-300">
                Default
              </span>
            )}
            {t.isPreset && (
              <span className="rounded bg-zinc-600/50 px-1.5 py-0.5 text-xs text-zinc-400">
                Preset
              </span>
            )}
          </div>
          {t.description && (
            <p className="mt-0.5 text-xs text-zinc-400">{t.description}</p>
          )}
        </div>
        <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
          {t.elements.length} element{t.elements.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Canvas info */}
      <p className="mb-3 text-xs text-zinc-500">
        {t.canvasWidth}&times;{t.canvasHeight}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onEdit(t.id)}
          title={t.isPreset ? 'Duplicate to edit' : 'Edit'}
        >
          <PencilAltIcon className="h-3.5 w-3.5" />
          {t.isPreset ? 'View' : 'Edit'}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onDuplicate(t.id)}
          title="Duplicate"
        >
          <DuplicateIcon className="h-3.5 w-3.5" />
        </button>
        {!t.isDefault && (
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-amber-600/30 hover:text-amber-300"
            onClick={() => onSetDefault(t.id)}
            title="Set as default"
          >
            <StarIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onExport(t.id)}
          title="Export"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
        </button>
        {!t.isPreset && (
          <button
            type="button"
            className="flex items-center gap-1 rounded bg-zinc-700 px-2 py-1 text-xs text-red-400 transition hover:bg-red-600/20"
            onClick={() => onDelete(t.id, t.name)}
            title="Delete"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default OverlayTemplateListPage

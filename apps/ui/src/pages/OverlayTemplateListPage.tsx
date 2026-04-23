import {
  DownloadIcon,
  DuplicateIcon,
  PencilAltIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from '@heroicons/react/solid'
import type {
  OverlayTemplate,
  OverlayTemplateExport,
} from '@maintainerr/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteOverlayTemplate,
  duplicateOverlayTemplate,
  exportOverlayTemplate,
  getOverlayTemplates,
  importOverlayTemplate,
  setDefaultOverlayTemplate,
} from '../api/overlays'
import Button from '../components/Common/Button'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import Modal from '../components/Common/Modal'
import PageControlRow from '../components/Common/PageControlRow'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../components/Settings/useSettingsFeedback'

const OverlayTemplateListPage = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<OverlayTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [templateToDelete, setTemplateToDelete] = useState<{
    id: number
    name: string
  } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const { feedback, showSuccess, showError } =
    useSettingsFeedback('Overlay templates')

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await getOverlayTemplates()
      if (data) setTemplates(data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Surface load failures through the shared feedback hook so the user
    // gets the same inline alert style used for follow-up actions on this
    // page, instead of a silent empty state. Keeping the .catch at the
    // call site (rather than inside fetchTemplates) avoids adding a
    // setState branch that react-hooks/set-state-in-effect flags.
    fetchTemplates().catch(() => {
      showError('Failed to load overlay templates')
    })
  }, [fetchTemplates, showError])

  const handleEdit = (id: number) => {
    navigate(`/overlays/templates/${id}`)
  }

  const handleDuplicate = async (id: number) => {
    const result = await duplicateOverlayTemplate(id)
    if (result) {
      showSuccess('Template duplicated')
      void fetchTemplates()
    } else {
      showError('Failed to duplicate template')
    }
  }

  const handleDelete = (id: number, name: string) => {
    setTemplateToDelete({ id, name })
  }

  const handleDeleteConfirm = async () => {
    if (!templateToDelete) return
    const { id } = templateToDelete
    setTemplateToDelete(null)
    const result = await deleteOverlayTemplate(id)
    if (result?.success) {
      showSuccess('Template deleted')
      void fetchTemplates()
    } else {
      showError('Cannot delete preset templates')
    }
  }

  const handleSetDefault = async (id: number) => {
    const result = await setDefaultOverlayTemplate(id)
    if (result) {
      showSuccess(`"${result.name}" set as default for ${result.mode}`)
      void fetchTemplates()
    } else {
      showError('Failed to set default template')
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
        showSuccess(`Imported template "${result.name}"`)
        void fetchTemplates()
      } else {
        showError('Failed to import template')
      }
    } catch {
      showError('Invalid template file')
    }
    // Reset input so the same file can be re-imported
    if (importInputRef.current) importInputRef.current.value = ''
  }

  const posterTemplates = templates.filter((t) => t.mode === 'poster')
  const titleCardTemplates = templates.filter((t) => t.mode === 'titlecard')

  return (
    <>
      <title>Overlay Templates - Maintainerr</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">Overlay Templates</h3>
          <p className="description">
            Manage the templates used by overlay-enabled collections.
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
        <PageControlRow
          actions={
            <Button
              buttonType="default"
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              <UploadIcon />
              <span>Import</span>
            </Button>
          }
        />

        {isLoading ? (
          <div className="min-h-[16rem] rounded-lg border border-zinc-700 bg-zinc-900/20">
            <LoadingSpinner containerClassName="min-h-[16rem]" />
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>

      {templateToDelete && (
        <Modal
          title="Delete template?"
          size="sm"
          onCancel={() => setTemplateToDelete(null)}
          footerActions={
            <Button
              buttonType="danger"
              className="ml-3"
              onClick={() => void handleDeleteConfirm()}
            >
              Delete
            </Button>
          }
        >
          <p>
            Delete template{' '}
            <span className="font-semibold">
              &ldquo;{templateToDelete.name}&rdquo;
            </span>
            ? This action cannot be undone.
          </p>
        </Modal>
      )}
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
              <span className="rounded bg-amber-600 px-1.5 py-0.5 text-xs text-white">
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

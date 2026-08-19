import { t as globalT } from '@lingui/core/macro'
import { Plural, Trans, useLingui } from '@lingui/react/macro'
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
  const { t } = useLingui()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<OverlayTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [templateToDelete, setTemplateToDelete] = useState<{
    id: number
    name: string
  } | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const { feedback, showSuccess, showError } = useSettingsFeedback()

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
      showError(globalT`Failed to load overlay templates`)
    })
  }, [fetchTemplates, showError])

  const handleEdit = (id: number) => {
    navigate(`/overlays/templates/${id}`)
  }

  const handleDuplicate = async (id: number) => {
    const result = await duplicateOverlayTemplate(id)
    if (result) {
      showSuccess(t`Template duplicated`)
      void fetchTemplates()
    } else {
      showError(t`Failed to duplicate template`)
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
      showSuccess(t`Template deleted`)
      void fetchTemplates()
    } else {
      showError(t`Cannot delete preset templates`)
    }
  }

  const handleSetDefault = async (id: number) => {
    const result = await setDefaultOverlayTemplate(id)
    if (result) {
      showSuccess(
        result.mode === 'titlecard'
          ? t`"${{ templateName: result.name }}" set as the default title card template`
          : t`"${{ templateName: result.name }}" set as the default poster template`,
      )
      void fetchTemplates()
    } else {
      showError(t`Failed to set default template`)
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
        showSuccess(t`Imported template "${{ templateName: result.name }}"`)
        void fetchTemplates()
      } else {
        showError(t`Failed to import template`)
      }
    } catch {
      showError(t`Invalid template file`)
    }
    // Reset input so the same file can be re-imported
    if (importInputRef.current) importInputRef.current.value = ''
  }

  const templateName = templateToDelete?.name
  const posterTemplates = templates.filter(
    (template) => template.mode === 'poster',
  )
  const titleCardTemplates = templates.filter(
    (template) => template.mode === 'titlecard',
  )

  return (
    <>
      <title>{t`Overlay Templates - Maintainerr`}</title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            <Trans>Overlay Templates</Trans>
          </h3>
          <p className="description">
            <Trans>
              Manage the templates used by overlay-enabled collections. Each
              mode keeps its own default.
            </Trans>
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
              <span>
                <Trans>Import</Trans>
              </span>
            </Button>
          }
        />

        {isLoading ? (
          <div className="min-h-64 rounded-lg border border-zinc-700 bg-zinc-900/20">
            <LoadingSpinner containerClassName="min-h-64" />
          </div>
        ) : (
          <>
            {/* Poster templates */}
            <TemplateSection
              title={t`Poster Templates`}
              description={t`Drawn on movies, shows and seasons.`}
              templates={posterTemplates}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
              onExport={handleExport}
            />

            {/* Title card templates */}
            <TemplateSection
              title={t`Title Card Templates`}
              description={t`Drawn on episodes.`}
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
          title={t`Delete template?`}
          size="sm"
          onCancel={() => setTemplateToDelete(null)}
          footerActions={
            <Button
              buttonType="danger"
              className="ml-3"
              onClick={() => void handleDeleteConfirm()}
            >
              <Trans>Delete</Trans>
            </Button>
          }
        >
          <p>
            <Trans>
              Delete template{' '}
              <span className="font-semibold">
                &ldquo;{templateName}&rdquo;
              </span>
              ? This action cannot be undone.
            </Trans>
          </p>
        </Modal>
      )}
    </>
  )
}

function TemplateSection({
  title,
  description,
  templates,
  onEdit,
  onDuplicate,
  onDelete,
  onSetDefault,
  onExport,
}: {
  title: string
  description: string
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
      <h3 className="text-sm font-medium tracking-wider text-zinc-400 uppercase">
        {title}
      </h3>
      <p className="mb-3 text-xs text-zinc-500">{description}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
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
  template,
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
  const { t } = useLingui()
  const elementCount = template.elements.length

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-4 transition hover:border-zinc-500">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-zinc-100">{template.name}</span>
            {template.isDefault && (
              <span className="rounded-sm bg-amber-600 px-1.5 py-0.5 text-xs whitespace-nowrap text-white">
                <Trans>Default</Trans>
              </span>
            )}
            {template.isPreset && (
              <span className="rounded-sm bg-zinc-600/50 px-1.5 py-0.5 text-xs whitespace-nowrap text-zinc-400">
                <Trans>Preset</Trans>
              </span>
            )}
          </div>
          {template.description && (
            <p className="mt-0.5 text-xs text-zinc-400">
              {template.description}
            </p>
          )}
        </div>
        <span className="shrink-0 rounded-sm bg-zinc-700 px-1.5 py-0.5 text-xs whitespace-nowrap text-zinc-300">
          <Plural value={elementCount} one="# element" other="# elements" />
        </span>
      </div>

      {/* Canvas info */}
      <p className="mb-3 text-xs text-zinc-500">
        {template.canvasWidth}&times;{template.canvasHeight}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onEdit(template.id)}
          title={
            template.isPreset ? t`Editing a preset will save a copy` : t`Edit`
          }
        >
          <PencilAltIcon className="h-3.5 w-3.5" />
          <Trans>Edit</Trans>
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onDuplicate(template.id)}
          title={t`Duplicate`}
        >
          <DuplicateIcon className="h-3.5 w-3.5" />
        </button>
        {!template.isDefault && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-amber-600/30 hover:text-amber-300"
            onClick={() => onSetDefault(template.id)}
            title={t`Set as default`}
          >
            <StarIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          className="flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition hover:bg-zinc-600"
          onClick={() => onExport(template.id)}
          title={t`Export`}
        >
          <DownloadIcon className="h-3.5 w-3.5" />
        </button>
        {!template.isPreset && (
          <button
            type="button"
            className="flex items-center gap-1 rounded-sm bg-zinc-700 px-2 py-1 text-xs text-red-400 transition hover:bg-red-600/20"
            onClick={() => onDelete(template.id, template.name)}
            title={t`Delete`}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default OverlayTemplateListPage

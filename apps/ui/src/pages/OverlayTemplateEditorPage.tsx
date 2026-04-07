import { PhotographIcon, RefreshIcon, ReplyIcon } from '@heroicons/react/solid'
import type {
  OverlayElement,
  OverlayTemplateCreate,
  OverlayTemplateMode,
  OverlayTemplateUpdate,
} from '@maintainerr/contracts'
import { POSTER_CANVAS, TITLECARD_CANVAS } from '@maintainerr/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import {
  buildPosterUrl,
  createOverlayTemplate,
  getOverlaySections,
  getOverlayTemplate,
  getRandomEpisode,
  getRandomItem,
  updateOverlayTemplate,
} from '../api/overlays'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import { ElementToolbox } from '../components/OverlayEditor/ElementToolbox'
import { LayerPanel } from '../components/OverlayEditor/LayerPanel'
import { OverlayCanvas } from '../components/OverlayEditor/OverlayCanvas'
import { PropertiesPanel } from '../components/OverlayEditor/PropertiesPanel'
import { useUndoRedo } from '../hooks/useUndoRedo'

const defaults = (mode: OverlayTemplateMode) =>
  mode === 'poster' ? POSTER_CANVAS : TITLECARD_CANVAS

const OverlayTemplateEditorPage = () => {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(!isNew)
  const [name, setName] = useState('Untitled Template')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<OverlayTemplateMode>('poster')
  const [isPreset, setIsPreset] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [sections, setSections] = useState<
    { key: string; title: string; type: string }[]
  >([])
  const [selectedSection, setSelectedSection] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)

  const canvasDefaults = defaults(mode)
  const {
    current: elements,
    set: setElements,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetElements,
  } = useUndoRedo<OverlayElement[]>([])

  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedId) ?? null,
    [elements, selectedId],
  )

  // Load existing template
  useEffect(() => {
    if (isNew) return
    const templateId = Number(id)
    if (Number.isNaN(templateId)) {
      navigate('/settings/overlays')
      return
    }
    void getOverlayTemplate(templateId).then((t) => {
      if (!t) {
        toast.error('Template not found')
        navigate('/settings/overlays')
        return
      }
      setName(t.name)
      setDescription(t.description)
      setMode(t.mode)
      setIsPreset(t.isPreset)
      resetElements(t.elements)
      setIsLoading(false)
    })
  }, [id, isNew, navigate, resetElements])

  // Load Plex library sections for poster background
  useEffect(() => {
    void getOverlaySections().then((s) => {
      if (s) setSections(s)
    })
  }, [])

  const loadRandomPoster = useCallback(async () => {
    if (!selectedSection) return
    const section = sections.find((s) => s.key === selectedSection)
    const fetcher = section?.type === 'show' ? getRandomEpisode : getRandomItem
    const item = await fetcher(selectedSection)
    if (item) {
      setBackgroundUrl(buildPosterUrl(item.plexId))
    }
  }, [selectedSection, sections])

  const handleSectionChange = useCallback(
    (sectionKey: string) => {
      setSelectedSection(sectionKey)
      if (!sectionKey) {
        setBackgroundUrl(null)
        return
      }
      // Auto-fetch a random poster when selecting a section
      const section = sections.find((s) => s.key === sectionKey)
      const fetcher =
        section?.type === 'show' ? getRandomEpisode : getRandomItem
      void fetcher(sectionKey).then((item) => {
        if (item) setBackgroundUrl(buildPosterUrl(item.plexId))
      })
    },
    [sections],
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        redo()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && document.activeElement === document.body) {
          e.preventDefault()
          setElements((prev) => prev.filter((el) => el.id !== selectedId))
          setSelectedId(null)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedId, setElements])

  const handleSave = async () => {
    if (isPreset) {
      toast.error('Preset templates cannot be edited. Duplicate first.')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const created = await createOverlayTemplate({
          name,
          description,
          mode,
          canvasWidth: canvasDefaults.width,
          canvasHeight: canvasDefaults.height,
          elements,
          isDefault: false,
        } satisfies OverlayTemplateCreate)
        if (created) {
          toast.success('Template created')
          navigate(`/settings/overlays/templates/${created.id}`, {
            replace: true,
          })
        }
      } else {
        const updated = await updateOverlayTemplate(Number(id), {
          name,
          description,
          elements,
        } satisfies OverlayTemplateUpdate)
        if (updated) toast.success('Template saved')
        else toast.error('Failed to save template')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAddElement = useCallback(
    (el: OverlayElement) => {
      setElements((prev) => [...prev, el])
      setSelectedId(el.id)
    },
    [setElements],
  )

  const handleUpdateElement = useCallback(
    (updated: OverlayElement) => {
      setElements((prev) =>
        prev.map((el) => (el.id === updated.id ? updated : el)),
      )
    },
    [setElements],
  )

  const handleDeleteElement = useCallback(
    (elId: string) => {
      setElements((prev) => prev.filter((el) => el.id !== elId))
      if (selectedId === elId) setSelectedId(null)
    },
    [setElements, selectedId],
  )

  const handleReorder = useCallback(
    (reordered: OverlayElement[]) => {
      setElements(reordered)
    },
    [setElements],
  )

  if (isLoading) return <LoadingSpinner />

  return (
    <>
      <title>
        {isNew ? 'New Template' : name} - Overlay Editor - Maintainerr
      </title>
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm text-zinc-400 transition hover:text-zinc-200"
              onClick={() => navigate('/settings/overlays')}
            >
              &larr; Templates
            </button>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none"
              disabled={isPreset}
            />
            {isNew && (
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as OverlayTemplateMode)}
                className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-300"
              >
                <option value="poster">Poster</option>
                <option value="titlecard">Title Card</option>
              </select>
            )}

            {/* Poster background picker */}
            <div className="flex items-center gap-1.5 border-l border-zinc-600 pl-3">
              <PhotographIcon className="h-4 w-4 text-zinc-400" />
              <select
                value={selectedSection}
                onChange={(e) => handleSectionChange(e.target.value)}
                className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
              >
                <option value="">No background</option>
                {sections.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
              </select>
              {selectedSection && (
                <button
                  type="button"
                  className="rounded p-1 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200"
                  onClick={loadRandomPoster}
                  title="Load different poster"
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              <ReplyIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded p-1.5 text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-30"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <ReplyIcon className="h-4 w-4 -scale-x-100" />
            </button>
            <button
              type="button"
              className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white transition hover:bg-amber-500 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || isPreset}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex min-h-0 flex-1">
          {/* Left: Toolbox */}
          <div className="w-48 shrink-0 overflow-y-auto border-r border-zinc-700 p-3">
            <ElementToolbox
              mode={mode}
              onAdd={handleAddElement}
              nextLayerOrder={elements.length}
            />
          </div>

          {/* Center: Canvas */}
          <div className="flex flex-1 items-center justify-center overflow-auto bg-zinc-900/50 p-4">
            <OverlayCanvas
              elements={elements}
              canvasWidth={canvasDefaults.width}
              canvasHeight={canvasDefaults.height}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdate={handleUpdateElement}
              backgroundUrl={backgroundUrl}
            />
          </div>

          {/* Right: Properties + Layers */}
          <div className="w-72 shrink-0 overflow-y-auto border-l border-zinc-700">
            <div className="border-b border-zinc-700 p-3">
              <LayerPanel
                elements={elements}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onReorder={handleReorder}
                onDelete={handleDeleteElement}
              />
            </div>
            <div className="p-3">
              {selectedElement ? (
                <PropertiesPanel
                  element={selectedElement}
                  onChange={handleUpdateElement}
                />
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  Select an element to edit its properties
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default OverlayTemplateEditorPage

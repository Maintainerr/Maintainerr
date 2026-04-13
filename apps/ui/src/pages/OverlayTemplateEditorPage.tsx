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
  getOverlayFonts,
  getOverlaySections,
  getOverlayTemplate,
  getRandomEpisode,
  getRandomItem,
  updateOverlayTemplate,
  uploadFont,
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
  const [fonts, setFonts] = useState<{ name: string; path: string }[]>([])
  const [mobileTab, setMobileTab] = useState<'tools' | 'layers' | 'properties'>(
    'layers',
  )

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
      navigate('/settings/overlays/templates')
      return
    }
    void getOverlayTemplate(templateId).then((t) => {
      if (!t) {
        toast.error('Template not found')
        navigate('/settings/overlays/templates')
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

  // Load available fonts
  useEffect(() => {
    void getOverlayFonts().then((f) => {
      if (f) setFonts(f)
    })
  }, [])

  const handleUploadFont = useCallback(async (file: File) => {
    try {
      const result = await uploadFont(file)
      if (result) {
        const updated = await getOverlayFonts()
        if (updated) setFonts(updated)
        toast.success(`Font "${result.name}" uploaded`)
        return result
      }
    } catch {
      toast.error('Failed to upload font')
    }
    return null
  }, [])

  const loadRandomPoster = useCallback(async () => {
    if (!selectedSection) return
    const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem
    const item = await fetcher(selectedSection)
    if (item) {
      setBackgroundUrl(buildPosterUrl(item.plexId))
    }
  }, [mode, selectedSection])

  const handleSectionChange = useCallback((sectionKey: string) => {
    setSelectedSection(sectionKey)
    if (!sectionKey) {
      setBackgroundUrl(null)
    }
  }, [])

  useEffect(() => {
    if (!selectedSection) {
      return
    }

    void loadRandomPoster()
  }, [loadRandomPoster, selectedSection])

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
      <div className="flex h-[calc(100vh-5rem)] flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-700 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-sm text-zinc-400 transition hover:text-zinc-200"
              onClick={() => navigate('/settings/overlays/templates')}
            >
              &larr; Templates
            </button>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-36 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 focus:border-amber-500 focus:outline-none sm:w-auto"
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
            <div className="flex items-center gap-1.5 border-l border-zinc-600 pl-2">
              <PhotographIcon className="h-4 w-4 shrink-0 text-zinc-400" />
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

        {/* Main editor area — desktop: 3 columns, mobile: stacked */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Left: Toolbox — desktop sidebar */}
          <div className="hidden w-48 shrink-0 overflow-y-auto border-r border-zinc-700 p-3 lg:block">
            <ElementToolbox
              mode={mode}
              onAdd={handleAddElement}
              nextLayerOrder={elements.length}
            />
          </div>

          {/* Center: Canvas */}
          <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-auto bg-zinc-900/50 p-4">
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

          {/* Right: Properties + Layers — desktop sidebar */}
          <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-700 lg:block">
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
                  fonts={fonts}
                  onUploadFont={handleUploadFont}
                />
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  Select an element to edit its properties
                </p>
              )}
            </div>
          </div>

          {/* Mobile bottom panels */}
          <div className="flex shrink-0 flex-col border-t border-zinc-700 lg:hidden">
            {/* Tab bar */}
            <div className="flex">
              {(['tools', 'layers', 'properties'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition ${
                    mobileTab === tab
                      ? 'border-b-2 border-amber-500 text-amber-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  onClick={() => setMobileTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            {/* Tab content */}
            <div className="max-h-56 overflow-y-auto p-3">
              {mobileTab === 'tools' && (
                <ElementToolbox
                  mode={mode}
                  onAdd={handleAddElement}
                  nextLayerOrder={elements.length}
                />
              )}
              {mobileTab === 'layers' && (
                <LayerPanel
                  elements={elements}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onReorder={handleReorder}
                  onDelete={handleDeleteElement}
                />
              )}
              {mobileTab === 'properties' &&
                (selectedElement ? (
                  <PropertiesPanel
                    element={selectedElement}
                    onChange={handleUpdateElement}
                    fonts={fonts}
                    onUploadFont={handleUploadFont}
                  />
                ) : (
                  <p className="text-center text-xs text-zinc-500">
                    Select an element to edit its properties
                  </p>
                ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default OverlayTemplateEditorPage

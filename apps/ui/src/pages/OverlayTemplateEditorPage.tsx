import { RefreshIcon } from '@heroicons/react/solid'
import type {
  OverlayElement,
  OverlayTemplateCreate,
  OverlayTemplateMode,
  OverlayTemplateUpdate,
} from '@maintainerr/contracts'
import { POSTER_CANVAS, TITLECARD_CANVAS } from '@maintainerr/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildItemImageUrl,
  createOverlayTemplate,
  getOverlayFonts,
  getOverlaySections,
  getOverlayTemplate,
  getRandomEpisode,
  getRandomItem,
  updateOverlayTemplate,
  uploadFont,
} from '../api/overlays'
import Button from '../components/Common/Button'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import PageControlRow from '../components/Common/PageControlRow'
import SaveButton from '../components/Common/SaveButton'
import { Input } from '../components/Forms/Input'
import { Select } from '../components/Forms/Select'
import { ElementToolbox } from '../components/OverlayEditor/ElementToolbox'
import { LayerPanel } from '../components/OverlayEditor/LayerPanel'
import { OverlayCanvas } from '../components/OverlayEditor/OverlayCanvas'
import { PropertiesPanel } from '../components/OverlayEditor/PropertiesPanel'
import {
  invalidateOverlayEditorFont,
  loadOverlayEditorFonts,
} from '../components/OverlayEditor/editorFonts'
import {
  SettingsFeedbackAlert,
  useSettingsFeedback,
} from '../components/Settings/useSettingsFeedback'
import { useUndoRedo } from '../hooks/useUndoRedo'
import { getApiErrorMessage } from '../utils/ApiError'

const defaults = (mode: OverlayTemplateMode) =>
  mode === 'poster' ? POSTER_CANVAS : TITLECARD_CANVAS

const OverlayTemplateEditorPage = () => {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(!isNew)
  const [name, setName] = useState('')
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
  const [fontLoadVersion, setFontLoadVersion] = useState(0)
  const [mobileTab, setMobileTab] = useState<'tools' | 'layers' | 'properties'>(
    'layers',
  )
  const { feedback, showSuccess, showError, showWarning } =
    useSettingsFeedback('Overlay template')

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
      navigate('/overlays/templates')
      return
    }
    void getOverlayTemplate(templateId).then((t) => {
      if (!t) {
        showError('Template not found')
        navigate('/overlays/templates')
        return
      }
      setName(t.name)
      setDescription(t.description)
      setMode(t.mode)
      setIsPreset(t.isPreset)
      resetElements(t.elements)
      setIsLoading(false)
    })
  }, [id, isNew, navigate, resetElements, showError])

  // Load media server library sections for poster background. A failure
  // here makes the background picker look inert (no options to choose
  // from), so surface it through the shared feedback hook instead of
  // silently degrading.
  useEffect(() => {
    void getOverlaySections()
      .then((s) => {
        if (s) setSections(s)
      })
      .catch(() => {
        showWarning(
          'Could not load library sections. The preview background picker will be empty.',
        )
      })
  }, [showWarning])

  // Load available fonts. A failure here leaves the font dropdown empty
  // and text elements fall back to the editor default; surface it so the
  // user knows why the font list isn't populating.
  useEffect(() => {
    void getOverlayFonts()
      .then((f) => {
        if (f) setFonts(f)
      })
      .catch(() => {
        showWarning(
          'Could not load font list. Text elements will fall back to the default font.',
        )
      })
  }, [showWarning])

  useEffect(() => {
    if (fonts.length === 0) return

    let cancelled = false

    void loadOverlayEditorFonts(fonts)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) {
          setFontLoadVersion((current) => current + 1)
        }
      })

    return () => {
      cancelled = true
    }
  }, [fonts])

  const handleUploadFont = useCallback(
    async (file: File) => {
      try {
        const result = await uploadFont(file)
        if (result) {
          invalidateOverlayEditorFont(result.name)
          const updated = await getOverlayFonts()
          if (updated) setFonts(updated)
          showSuccess(`Font "${result.name}" uploaded`)
          return result
        }
      } catch {
        showError('Failed to upload font')
      }
      return null
    },
    [showError, showSuccess],
  )

  const loadRandomPoster = useCallback(async () => {
    if (!selectedSection) return
    const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem
    const item = await fetcher(selectedSection)
    if (item) {
      setBackgroundUrl(buildItemImageUrl(item.itemId, mode))
    }
  }, [mode, selectedSection])

  const handleSectionChange = useCallback((sectionKey: string) => {
    setSelectedSection(sectionKey)
    if (!sectionKey) {
      setBackgroundUrl(null)
    }
  }, [])

  // Fetch a random poster only when section or mode actually changes — not
  // on every render that would create a new loadRandomPoster identity.
  useEffect(() => {
    if (!selectedSection) return
    const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem
    let cancelled = false
    void fetcher(selectedSection).then((item) => {
      if (cancelled || !item) return
      setBackgroundUrl(buildItemImageUrl(item.itemId, mode))
    })
    return () => {
      cancelled = true
    }
  }, [selectedSection, mode])

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
      showError('Preset templates cannot be edited. Duplicate first.')
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName) {
      showError('Template name is required')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const created = await createOverlayTemplate({
          name: trimmedName,
          description,
          mode,
          canvasWidth: canvasDefaults.width,
          canvasHeight: canvasDefaults.height,
          elements,
          isDefault: false,
        } satisfies OverlayTemplateCreate)
        if (created) {
          showSuccess('Template created')
          navigate(`/overlays/templates/${created.id}`, {
            replace: true,
          })
        } else {
          showError('Failed to create template')
        }
      } else {
        const updated = await updateOverlayTemplate(Number(id), {
          name: trimmedName,
          description,
          elements,
        } satisfies OverlayTemplateUpdate)
        if (updated) showSuccess('Template saved')
        else showError('Failed to save template')
      }
    } catch (err) {
      showError(getApiErrorMessage(err, 'Failed to save template'))
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

  return (
    <>
      <title>
        {isNew ? 'New Template' : name} - Overlay Editor - Maintainerr
      </title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            {isNew ? 'New Template' : 'Edit Template'}
          </h3>
          <p className="description">
            Design overlay elements on the canvas. Enter a valid template name
            in the Template Name field before saving your changes.
          </p>
        </div>

        <SettingsFeedbackAlert feedback={feedback} />

        <PageControlRow
          actions={
            <>
              <Button
                className="h-10 px-3"
                type="button"
                onClick={undo}
                disabled={isLoading || !canUndo}
              >
                Prev
              </Button>
              <SaveButton
                type="button"
                onClick={handleSave}
                disabled={isLoading || saving || isPreset || !name.trim()}
                isPending={saving}
              />
              <Button
                className="h-10 px-3"
                type="button"
                onClick={redo}
                disabled={isLoading || !canRedo}
              >
                Next
              </Button>
              <div className="w-48">
                <Input
                  name="template-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading || isPreset}
                  placeholder="Template Name"
                />
              </div>
              {isNew && (
                <div className="w-36">
                  <Select
                    name="template-mode"
                    value={mode}
                    disabled={isLoading}
                    onChange={(e) =>
                      setMode(e.target.value as OverlayTemplateMode)
                    }
                  >
                    <option value="poster">Poster</option>
                    <option value="titlecard">Title Card</option>
                  </Select>
                </div>
              )}
              <div className="flex w-56 items-center gap-2">
                <Select
                  name="background-section"
                  value={selectedSection}
                  disabled={isLoading}
                  onChange={(e) => handleSectionChange(e.target.value)}
                >
                  <option value="">No background</option>
                  {sections.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                {selectedSection && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-zinc-400 transition hover:text-zinc-200"
                    onClick={loadRandomPoster}
                    title="Load different poster"
                  >
                    <RefreshIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          }
          controlsClassName="sm:w-auto"
        />

        {/* Main editor area — desktop: 3 columns, mobile: stacked.
            Uses h-[60vh] with a hard min so it stays stable regardless of
            header/tab/control-row height changes above it. */}
        <div className="mt-4 flex h-[60vh] min-h-[24rem] flex-col border-t border-zinc-700 lg:flex-row">
          {isLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-900/50 p-4">
              <LoadingSpinner containerClassName="min-h-[20rem] w-full" />
            </div>
          ) : (
            <>
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
                  fontLoadVersion={fontLoadVersion}
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
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default OverlayTemplateEditorPage

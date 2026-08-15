import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
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
  getOverlayImages,
  getOverlaySections,
  getOverlayTemplate,
  getRandomEpisode,
  getRandomItem,
  updateOverlayTemplate,
  uploadFont,
  uploadOverlayImage,
} from '../api/overlays'
import Button from '../components/Common/Button'
import LoadingSpinner from '../components/Common/LoadingSpinner'
import Modal from '../components/Common/Modal'
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

// Outer component remounts the inner editor whenever `id` changes. This keeps
// useState initial values fresh on transitions (e.g. preset → /new) so we
// don't need a reset effect - which the lint rule
// `react-hooks/set-state-in-effect` correctly flags as cascading-render bait.
const OverlayTemplateEditorPage = () => {
  const { id } = useParams<{ id: string }>()
  return <OverlayTemplateEditor routeId={id ?? 'new'} key={id ?? 'new'} />
}

const OverlayTemplateEditor = ({ routeId }: { routeId: string }) => {
  const { t } = useLingui()
  const id = routeId
  const isNew = id === 'new'
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(!isNew)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<OverlayTemplateMode>('poster')
  const [isPreset, setIsPreset] = useState(false)
  const [sourcePresetName, setSourcePresetName] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [sections, setSections] = useState<
    { key: string; title: string; type: string }[]
  >([])
  const [selectedSection, setSelectedSection] = useState('')
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [fonts, setFonts] = useState<{ name: string; path: string }[]>([])
  const [images, setImages] = useState<{ name: string; path: string }[]>([])
  const [fontLoadVersion, setFontLoadVersion] = useState(0)
  const [imageLoadVersion, setImageLoadVersion] = useState(0)
  const [mobileTab, setMobileTab] = useState<'tools' | 'layers' | 'properties'>(
    'layers',
  )
  const { feedback, showSuccess, showError, showWarning } =
    useSettingsFeedback()

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

  // Load existing template. The wrapper remounts this component when `id`
  // changes (see OverlayTemplateEditorPage above), so the new-template
  // branch needs no manual state reset - useState initial values handle it.
  useEffect(() => {
    if (isNew) return
    const templateId = Number(id)
    if (Number.isNaN(templateId)) {
      navigate('/overlays/templates')
      return
    }
    // Failures here use the core macro rather than the hook's `t`: a
    // render-scoped `t` belongs in this effect's dependencies, and re-running
    // it on a language switch would reload the template and discard unsaved
    // edits.
    // Named `template` rather than `t`, which the translation macro takes.
    void getOverlayTemplate(templateId).then((template) => {
      if (!template) {
        showError(globalT`Template not found`)
        navigate('/overlays/templates')
        return
      }
      setName(template.name)
      setDescription(template.description)
      setMode(template.mode)
      setIsPreset(template.isPreset)
      setSourcePresetName(template.isPreset ? template.name : '')
      resetElements(template.elements)
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
          globalT`Could not load library sections. The preview background picker will be empty.`,
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
          globalT`Could not load font list. Text elements will fall back to the default font.`,
        )
      })
  }, [showWarning])

  useEffect(() => {
    void getOverlayImages()
      .then((i) => {
        if (i) setImages(i)
      })
      .catch(() => {
        showWarning(
          globalT`Could not load overlay image list. Image elements will only render if the filename exists on disk.`,
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
          showSuccess(t`Font "${{ fontName: result.name }}" uploaded`)
          return result
        }
      } catch {
        showError(t`Failed to upload font`)
      }
      return null
    },
    [showError, showSuccess, t],
  )

  const handleUploadImage = useCallback(
    async (file: File) => {
      // The upload itself is the success boundary - once the server has
      // accepted and stored the file, refreshing the list is a separate,
      // non-fatal concern. A transient list-fetch failure must not roll
      // back the success message or prevent selecting the new asset.
      let result: { name: string; path: string } | null
      try {
        result = await uploadOverlayImage(file)
      } catch (err) {
        showError(getApiErrorMessage(err, t`Failed to upload image`))
        return null
      }
      if (!result) return null

      // Bust the canvas image cache so an in-place replacement of the
      // same filename actually shows the new bytes.
      setImageLoadVersion((v) => v + 1)
      showSuccess(t`Image "${{ imageName: result.name }}" uploaded`)

      // Best-effort list refresh. If it fails, the picker may not show the
      // newly uploaded option until the editor is reopened, but the upload
      // itself stands and the caller still gets a valid result so the
      // current element can be wired to it immediately.
      try {
        const updated = await getOverlayImages()
        if (updated) setImages(updated)
      } catch {
        // Intentionally swallowed.
      }

      return result
    },
    [showError, showSuccess, t],
  )

  const loadRandomPoster = useCallback(async () => {
    if (!selectedSection) return
    const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem
    const item = await fetcher(selectedSection)
    if (item) {
      setBackgroundUrl(buildItemImageUrl(item.itemId))
    }
  }, [mode, selectedSection])

  const handleSectionChange = useCallback((sectionKey: string) => {
    setSelectedSection(sectionKey)
    if (!sectionKey) {
      setBackgroundUrl(null)
    }
  }, [])

  // Fetch a random poster only when section or mode actually changes - not
  // on every render that would create a new loadRandomPoster identity.
  useEffect(() => {
    if (!selectedSection) return
    const fetcher = mode === 'titlecard' ? getRandomEpisode : getRandomItem
    let cancelled = false
    void fetcher(selectedSection).then((item) => {
      if (cancelled || !item) return
      setBackgroundUrl(buildItemImageUrl(item.itemId))
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

  // Saving a preset must not mutate it - the server rejects it and the
  // shared presets are seeded once, so any "edit" of a preset is really
  // a fork. We open the copy modal pre-filled with a sensible default,
  // then create a fresh user-owned template on confirm.
  const openCopyModal = () => {
    setCopyName(`${sourcePresetName || name} (copy)`)
    setCopyModalOpen(true)
  }

  const createTemplateFromCurrent = async (newName: string) => {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      showError(t`Template name is required`)
      return false
    }
    setSaving(true)
    try {
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
        // No success alert here - the navigation to the new template's URL
        // (with its name visible in the title field) is the confirmation.
        // Showing an inline alert just before unmount would flash visibly
        // for one frame and then disappear, which reads as a flicker.
        navigate(`/overlays/templates/${created.id}`, { replace: true })
        return true
      }
      showError(t`Failed to create template`)
      return false
    } catch (err) {
      showError(getApiErrorMessage(err, t`Failed to save template`))
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    if (isPreset) {
      openCopyModal()
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName) {
      showError(t`Template name is required`)
      return
    }
    if (isNew) {
      await createTemplateFromCurrent(trimmedName)
      return
    }
    setSaving(true)
    try {
      const updated = await updateOverlayTemplate(Number(id), {
        name: trimmedName,
        description,
        elements,
      } satisfies OverlayTemplateUpdate)
      if (updated) showSuccess(t`Template saved`)
      else showError(t`Failed to save template`)
    } catch (err) {
      showError(getApiErrorMessage(err, t`Failed to save template`))
    } finally {
      setSaving(false)
    }
  }

  const confirmSaveAsCopy = async () => {
    const ok = await createTemplateFromCurrent(copyName)
    if (ok) setCopyModalOpen(false)
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
        {isNew
          ? t`New Template - Overlay Editor - Maintainerr`
          : t`${{ templateName: name }} - Overlay Editor - Maintainerr`}
      </title>
      <div className="h-full w-full">
        <div className="section h-full w-full">
          <h3 className="heading">
            {isNew ? <Trans>New Template</Trans> : <Trans>Edit Template</Trans>}
          </h3>
          <p className="description">
            {isPreset
              ? t`You’re editing a preset. Saving will create your own copy - the original preset is left unchanged.`
              : t`Design overlay elements on the canvas. Enter a valid template name in the Template Name field before saving your changes.`}
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
                <Trans>Prev</Trans>
              </Button>
              <SaveButton
                type="button"
                onClick={handleSave}
                disabled={isLoading || saving || (!isPreset && !name.trim())}
                isPending={saving}
                label={isPreset ? t`Save as copy` : t`Save Changes`}
                pendingLabel={isPreset ? t`Copying...` : t`Saving...`}
              />
              <Button
                className="h-10 px-3"
                type="button"
                onClick={redo}
                disabled={isLoading || !canRedo}
              >
                <Trans>Next</Trans>
              </Button>
              <div className="w-48">
                <Input
                  name="template-name"
                  type="text"
                  value={isPreset ? sourcePresetName : name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading || isPreset}
                  placeholder={t`Template Name`}
                />
              </div>
              {/* Fixed once created, but still shown: two templates can share
                  a name across modes, and nothing else on this page says
                  which artwork is being designed. */}
              <div className="w-36">
                <Select
                  name="template-mode"
                  value={mode}
                  disabled={isLoading || !isNew}
                  onChange={(e) =>
                    setMode(e.target.value as OverlayTemplateMode)
                  }
                >
                  <option value="poster">{t`Poster`}</option>
                  <option value="titlecard">{t`Title Card`}</option>
                </Select>
              </div>
              <div className="flex w-56 items-center gap-2">
                <Select
                  name="background-section"
                  value={selectedSection}
                  disabled={isLoading}
                  onChange={(e) => handleSectionChange(e.target.value)}
                >
                  <option value="">{t`No background`}</option>
                  {sections.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </Select>
                {selectedSection && (
                  <button
                    type="button"
                    className="shrink-0 rounded-sm p-1 text-zinc-400 transition hover:text-zinc-200"
                    onClick={loadRandomPoster}
                    title={t`Load different poster`}
                  >
                    <RefreshIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          }
          controlsClassName="sm:w-auto"
        />

        {/* Main editor area - desktop: 3 columns, mobile: stacked.
            Uses h-[60vh] with a hard min so it stays stable regardless of
            header/tab/control-row height changes above it. */}
        <div className="mt-4 flex h-[60vh] min-h-96 flex-col border-t border-zinc-700 lg:flex-row">
          {isLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-900/50 p-4">
              <LoadingSpinner containerClassName="min-h-80 w-full" />
            </div>
          ) : (
            <>
              {/* Left: Toolbox - desktop sidebar */}
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
                  imageLoadVersion={imageLoadVersion}
                />
              </div>

              {/* Right: Properties + Layers - desktop sidebar */}
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
                      images={images}
                      onUploadImage={handleUploadImage}
                    />
                  ) : (
                    <p className="text-center text-xs text-zinc-500">
                      <Trans>Select an element to edit its properties</Trans>
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
                      className={`flex-1 px-3 py-2 text-xs font-medium tracking-wider uppercase transition ${
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
                        images={images}
                        onUploadImage={handleUploadImage}
                      />
                    ) : (
                      <p className="text-center text-xs text-zinc-500">
                        <Trans>Select an element to edit its properties</Trans>
                      </p>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {copyModalOpen && (
        <Modal
          title={t`Save preset as a copy`}
          size="sm"
          onCancel={saving ? undefined : () => setCopyModalOpen(false)}
          footerActions={
            <Button
              buttonType="primary"
              className="ml-3"
              type="button"
              disabled={saving || !copyName.trim()}
              onClick={() => void confirmSaveAsCopy()}
            >
              {saving ? t`Saving...` : t`Save copy`}
            </Button>
          }
        >
          <p className="mb-3">
            <Trans>
              Presets can&rsquo;t be modified. Enter a name for your copy - it
              will start from the current canvas and become editable.
            </Trans>
          </p>
          <Input
            name="copy-template-name"
            type="text"
            value={copyName}
            onChange={(e) => setCopyName(e.target.value)}
            placeholder={t`Template Name`}
            autoFocus
          />
        </Modal>
      )}
    </>
  )
}

export default OverlayTemplateEditorPage

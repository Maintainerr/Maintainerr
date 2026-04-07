import { EyeIcon, EyeOffIcon, TrashIcon } from '@heroicons/react/solid'
import type { OverlayElement } from '@maintainerr/contracts'

interface LayerPanelProps {
  elements: OverlayElement[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onReorder: (reordered: OverlayElement[]) => void
  onDelete: (id: string) => void
}

export function LayerPanel({
  elements,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
}: LayerPanelProps) {
  // Display in reverse order (top-most layer first)
  const sorted = [...elements].sort((a, b) => b.layerOrder - a.layerOrder)

  const toggleVisibility = (id: string) => {
    const updated = elements.map((el) =>
      el.id === id ? { ...el, visible: !el.visible } : el,
    )
    onReorder(updated)
  }

  const moveUp = (id: string) => {
    const idx = sorted.findIndex((el) => el.id === id)
    if (idx <= 0) return
    // Swap layerOrder with the element above
    const current = sorted[idx]
    const above = sorted[idx - 1]
    const updated = elements.map((el) => {
      if (el.id === current.id) return { ...el, layerOrder: above.layerOrder }
      if (el.id === above.id) return { ...el, layerOrder: current.layerOrder }
      return el
    })
    onReorder(updated)
  }

  const moveDown = (id: string) => {
    const idx = sorted.findIndex((el) => el.id === id)
    if (idx < 0 || idx >= sorted.length - 1) return
    const current = sorted[idx]
    const below = sorted[idx + 1]
    const updated = elements.map((el) => {
      if (el.id === current.id) return { ...el, layerOrder: below.layerOrder }
      if (el.id === below.id) return { ...el, layerOrder: current.layerOrder }
      return el
    })
    onReorder(updated)
  }

  const getLabel = (el: OverlayElement): string => {
    switch (el.type) {
      case 'text':
        return el.text.slice(0, 20) || 'Text'
      case 'variable':
        return (
          el.segments
            .map((s) => (s.type === 'text' ? s.value : `{${s.field}}`))
            .join('')
            .slice(0, 20) || 'Variable'
        )
      case 'shape':
        return el.shapeType === 'ellipse' ? 'Ellipse' : 'Rectangle'
      case 'image':
        return 'Image'
      default:
        return 'Element'
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
        Layers
      </h3>
      {sorted.length === 0 && (
        <p className="text-xs text-zinc-500">No elements yet</p>
      )}
      <div className="flex flex-col gap-0.5">
        {sorted.map((el, idx) => (
          <div
            key={el.id}
            className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm transition ${
              el.id === selectedId
                ? 'bg-amber-600/20 text-amber-200'
                : 'text-zinc-300 hover:bg-zinc-700'
            }`}
            onClick={() => onSelect(el.id)}
          >
            <span
              className={`shrink-0 text-[10px] uppercase ${
                el.type === 'shape'
                  ? 'text-blue-400'
                  : el.type === 'text'
                    ? 'text-green-400'
                    : el.type === 'variable'
                      ? 'text-purple-400'
                      : 'text-zinc-500'
              }`}
            >
              {el.type.slice(0, 3)}
            </span>
            <span className="flex-1 truncate text-xs">{getLabel(el)}</span>

            {/* Move controls */}
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-20"
              onClick={(e) => {
                e.stopPropagation()
                moveUp(el.id)
              }}
              disabled={idx === 0}
              title="Move up"
            >
              ▲
            </button>
            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-300 disabled:opacity-20"
              onClick={(e) => {
                e.stopPropagation()
                moveDown(el.id)
              }}
              disabled={idx === sorted.length - 1}
              title="Move down"
            >
              ▼
            </button>

            <button
              type="button"
              className="text-zinc-500 hover:text-zinc-300"
              onClick={(e) => {
                e.stopPropagation()
                toggleVisibility(el.id)
              }}
              title={el.visible ? 'Hide' : 'Show'}
            >
              {el.visible ? (
                <EyeIcon className="h-3.5 w-3.5" />
              ) : (
                <EyeOffIcon className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              className="text-zinc-500 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(el.id)
              }}
              title="Delete"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

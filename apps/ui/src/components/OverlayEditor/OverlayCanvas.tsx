import type { OverlayElement } from '@maintainerr/contracts'
import Konva from 'konva'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva'
import { getOverlayPreviewFontFamily } from './editorFonts'

interface OverlayCanvasProps {
  elements: OverlayElement[]
  canvasWidth: number
  canvasHeight: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (el: OverlayElement) => void
  backgroundUrl?: string | null
  fontLoadVersion?: number
}

const MAX_DISPLAY_HEIGHT = 600
const MIN_DISPLAY_HEIGHT = 240
// Cap how far past the canvas the user can grow an element via the
// transformer. Touch resize on iOS can yield runaway coordinates if the
// underlying touch event reports unexpected positions (e.g. multi-touch,
// pinch-zoom, address-bar collapse mid-drag); clamping the box keeps a
// glitchy gesture from saving million-pixel widths into the template.
const MAX_RESIZE_FACTOR = 4

export function OverlayCanvas({
  elements,
  canvasWidth,
  canvasHeight,
  selectedId,
  onSelect,
  onUpdate,
  backgroundUrl,
  fontLoadVersion = 0,
}: OverlayCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  // Mirror the latest scale into a ref so transformend reads the value that
  // was in effect when the gesture finished — not whichever scale the
  // useCallback closure happened to capture. This matters when a layout
  // shift (e.g. iOS address bar) recomputes scale during the drag.
  const scaleRef = useRef(1)
  const [loadedBackground, setLoadedBackground] = useState<{
    image: HTMLImageElement
    url: string
  } | null>(null)
  const [containerSize, setContainerSize] = useState<{
    width: number
    height: number
  }>({ width: 0, height: 0 })

  // Observe container dimensions
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => {
      setContainerSize({
        width: node.clientWidth,
        height: node.clientHeight,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // Scale to fit available container while preserving aspect ratio
  const availableHeight =
    containerSize.height > 0
      ? Math.min(
          MAX_DISPLAY_HEIGHT,
          Math.max(MIN_DISPLAY_HEIGHT, containerSize.height),
        )
      : MAX_DISPLAY_HEIGHT
  const availableWidth =
    containerSize.width > 0 ? containerSize.width : canvasWidth
  const scaleByHeight = availableHeight / canvasHeight
  const scaleByWidth = availableWidth / canvasWidth
  const scale = Math.min(1, scaleByHeight, scaleByWidth)
  const displayW = Math.max(1, Math.round(canvasWidth * scale))
  const displayH = Math.max(1, Math.round(canvasHeight * scale))

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // Load background image when URL changes
  useEffect(() => {
    if (!backgroundUrl) {
      return
    }

    let cancelled = false
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (!cancelled) {
        setLoadedBackground({ image: img, url: backgroundUrl })
      }
    }
    img.onerror = () => undefined
    img.src = backgroundUrl

    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
    }
  }, [backgroundUrl])

  // Attach transformer to selected shape
  useEffect(() => {
    if (!trRef.current || !stageRef.current) return
    const stage = stageRef.current
    if (selectedId) {
      const node = stage.findOne(`#${selectedId}`)
      if (node) {
        trRef.current.nodes([node])
        trRef.current.getLayer()?.batchDraw()
        return
      }
    }
    trRef.current.nodes([])
    trRef.current.getLayer()?.batchDraw()
  }, [selectedId, elements])

  useEffect(() => {
    stageRef.current?.batchDraw()
  }, [fontLoadVersion])

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target === e.target.getStage()) {
        onSelect(null)
      }
    },
    [onSelect],
  )

  const handleDragEnd = useCallback(
    (el: OverlayElement, e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target
      const currentScale = scaleRef.current || 1
      onUpdate({
        ...el,
        x: Math.round(node.x() / currentScale),
        y: Math.round(node.y() / currentScale),
      })
    },
    [onUpdate],
  )

  const handleTransformEnd = useCallback(
    (el: OverlayElement, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleXNode = node.scaleX()
      const scaleYNode = node.scaleY()
      const currentScale = scaleRef.current || 1

      // Reset scale and apply to width/height
      node.scaleX(1)
      node.scaleY(1)

      const maxWidth = canvasWidth * MAX_RESIZE_FACTOR
      const maxHeight = canvasHeight * MAX_RESIZE_FACTOR

      onUpdate({
        ...el,
        x: Math.round(node.x() / currentScale),
        y: Math.round(node.y() / currentScale),
        width: Math.min(
          maxWidth,
          Math.max(1, Math.round((node.width() * scaleXNode) / currentScale)),
        ),
        height: Math.min(
          maxHeight,
          Math.max(1, Math.round((node.height() * scaleYNode) / currentScale)),
        ),
        rotation: Math.round(node.rotation()),
      })
    },
    [onUpdate, canvasWidth, canvasHeight],
  )

  const sorted = [...elements]
    .filter((el) => el.visible)
    .sort((a, b) => a.layerOrder - b.layerOrder)

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
    >
      <div
        className="overflow-hidden rounded-lg shadow-xl"
        style={{ width: displayW, height: displayH }}
      >
        <Stage
          ref={stageRef}
          width={displayW}
          height={displayH}
          onClick={handleStageClick}
          onTap={
            handleStageClick as unknown as (
              evt: Konva.KonvaEventObject<TouchEvent>,
            ) => void
          }
        >
          {/* Background */}
          <Layer>
            <Rect
              width={displayW}
              height={displayH}
              fill="#1a1a2e"
              listening={false}
            />
            {backgroundUrl && loadedBackground?.url === backgroundUrl ? (
              <KonvaImage
                image={loadedBackground.image}
                width={displayW}
                height={displayH}
                listening={false}
              />
            ) : (
              <Rect
                width={displayW}
                height={displayH}
                stroke="#333"
                strokeWidth={1}
                listening={false}
              />
            )}
          </Layer>

          {/* Elements */}
          <Layer>
            {sorted.map((el) => (
              <ElementRenderer
                key={el.id}
                element={el}
                scale={scale}
                onSelect={() => onSelect(el.id)}
                onDragEnd={(e) => handleDragEnd(el, e)}
                onTransformEnd={(e) => handleTransformEnd(el, e)}
              />
            ))}
          </Layer>

          {/* Transformer layer */}
          <Layer>
            <Transformer
              ref={trRef as React.RefObject<Konva.Transformer>}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 5 || newBox.height < 5) return oldBox
                const maxW = displayW * MAX_RESIZE_FACTOR
                const maxH = displayH * MAX_RESIZE_FACTOR
                if (
                  Math.abs(newBox.width) > maxW ||
                  Math.abs(newBox.height) > maxH ||
                  !Number.isFinite(newBox.width) ||
                  !Number.isFinite(newBox.height) ||
                  !Number.isFinite(newBox.x) ||
                  !Number.isFinite(newBox.y)
                ) {
                  return oldBox
                }
                return newBox
              }}
              anchorSize={8}
              borderStroke="#f59e0b"
              anchorStroke="#f59e0b"
              anchorFill="#27272a"
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}

function ElementRenderer({
  element: el,
  scale,
  onSelect,
  onDragEnd,
  onTransformEnd,
}: {
  element: OverlayElement
  scale: number
  onSelect: () => void
  onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => void
  onTransformEnd: (e: Konva.KonvaEventObject<Event>) => void
}) {
  const x = el.x * scale
  const y = el.y * scale
  const w = el.width * scale
  const h = el.height * scale

  const commonProps = {
    id: el.id,
    x,
    y,
    width: w,
    height: h,
    rotation: el.rotation,
    opacity: el.opacity,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd,
    onTransformEnd,
  }

  switch (el.type) {
    case 'text': {
      const textValue = el.uppercase ? el.text.toUpperCase() : el.text
      const previewFontFamily = getOverlayPreviewFontFamily(
        el.fontPath,
        el.fontFamily,
      )
      return (
        <Group {...commonProps}>
          {el.backgroundColor && (
            <Rect
              width={w}
              height={h}
              fill={el.backgroundColor}
              cornerRadius={el.backgroundRadius * scale}
            />
          )}
          <Text
            width={w}
            height={h}
            text={textValue}
            fontSize={el.fontSize * scale}
            fontFamily={previewFontFamily}
            fontStyle={el.fontWeight}
            fill={el.fontColor}
            align={el.textAlign}
            verticalAlign={el.verticalAlign}
            padding={el.backgroundPadding * scale}
            shadowEnabled={el.shadow}
            shadowBlur={el.shadow ? 6 * scale : 0}
            shadowColor="rgba(0, 0, 0, 0.55)"
            shadowOffsetX={el.shadow ? Math.max(1, 2 * scale) : 0}
            shadowOffsetY={el.shadow ? Math.max(1, 2 * scale) : 0}
          />
        </Group>
      )
    }

    case 'variable': {
      const placeholder = el.segments
        .map((s) => (s.type === 'text' ? s.value : `{${s.field}}`))
        .join('')
      const variableValue = el.uppercase
        ? placeholder.toUpperCase()
        : placeholder
      const previewFontFamily = getOverlayPreviewFontFamily(
        el.fontPath,
        el.fontFamily,
      )
      return (
        <Group {...commonProps}>
          {el.backgroundColor && (
            <Rect
              width={w}
              height={h}
              fill={el.backgroundColor}
              cornerRadius={el.backgroundRadius * scale}
            />
          )}
          <Text
            width={w}
            height={h}
            text={variableValue}
            fontSize={el.fontSize * scale}
            fontFamily={previewFontFamily}
            fontStyle={el.fontWeight}
            fill={el.fontColor}
            align={el.textAlign}
            verticalAlign={el.verticalAlign}
            padding={el.backgroundPadding * scale}
            shadowEnabled={el.shadow}
            shadowBlur={el.shadow ? 6 * scale : 0}
            shadowColor="rgba(0, 0, 0, 0.55)"
            shadowOffsetX={el.shadow ? Math.max(1, 2 * scale) : 0}
            shadowOffsetY={el.shadow ? Math.max(1, 2 * scale) : 0}
          />
        </Group>
      )
    }

    case 'shape':
      if (el.shapeType === 'ellipse') {
        return (
          <Ellipse
            {...commonProps}
            // Konva Ellipse uses center offset and radii
            x={x + w / 2}
            y={y + h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            fill={el.fillColor}
            stroke={el.strokeColor ?? undefined}
            strokeWidth={el.strokeWidth * scale}
          />
        )
      }
      return (
        <Rect
          {...commonProps}
          fill={el.fillColor}
          stroke={el.strokeColor ?? undefined}
          strokeWidth={el.strokeWidth * scale}
          cornerRadius={el.cornerRadius * scale}
        />
      )

    case 'image':
      // Placeholder rectangle for image elements
      return (
        <Group {...commonProps}>
          <Rect
            width={w}
            height={h}
            fill="#333"
            stroke="#555"
            strokeWidth={1}
          />
          <Text
            width={w}
            height={h}
            text="[Image]"
            fontSize={14 * scale}
            fill="#888"
            align="center"
            verticalAlign="middle"
          />
        </Group>
      )

    default:
      return null
  }
}

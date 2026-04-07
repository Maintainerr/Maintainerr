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

interface OverlayCanvasProps {
  elements: OverlayElement[]
  canvasWidth: number
  canvasHeight: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (el: OverlayElement) => void
  backgroundUrl?: string | null
}

const MAX_DISPLAY_HEIGHT = 600

export function OverlayCanvas({
  elements,
  canvasWidth,
  canvasHeight,
  selectedId,
  onSelect,
  onUpdate,
  backgroundUrl,
}: OverlayCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)

  // Scale to fit display area
  const scale = Math.min(1, MAX_DISPLAY_HEIGHT / canvasHeight)
  const displayW = Math.round(canvasWidth * scale)
  const displayH = Math.round(canvasHeight * scale)

  // Load background image when URL changes
  useEffect(() => {
    if (!backgroundUrl) {
      setBgImage(null)
      return
    }
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setBgImage(img)
    img.onerror = () => setBgImage(null)
    img.src = backgroundUrl
    return () => {
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
      onUpdate({
        ...el,
        x: Math.round(node.x() / scale),
        y: Math.round(node.y() / scale),
      })
    },
    [onUpdate, scale],
  )

  const handleTransformEnd = useCallback(
    (el: OverlayElement, e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleXNode = node.scaleX()
      const scaleYNode = node.scaleY()

      // Reset scale and apply to width/height
      node.scaleX(1)
      node.scaleY(1)

      onUpdate({
        ...el,
        x: Math.round(node.x() / scale),
        y: Math.round(node.y() / scale),
        width: Math.max(1, Math.round((node.width() * scaleXNode) / scale)),
        height: Math.max(1, Math.round((node.height() * scaleYNode) / scale)),
        rotation: Math.round(node.rotation()),
      })
    },
    [onUpdate, scale],
  )

  const sorted = [...elements]
    .filter((el) => el.visible)
    .sort((a, b) => a.layerOrder - b.layerOrder)

  return (
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
          {bgImage ? (
            <KonvaImage
              image={bgImage}
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
    case 'text':
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
            text={el.text}
            fontSize={el.fontSize * scale}
            fontFamily={el.fontFamily}
            fontStyle={el.fontWeight}
            fill={el.fontColor}
            align={el.textAlign}
            verticalAlign={el.verticalAlign}
            padding={el.backgroundPadding * scale}
          />
        </Group>
      )

    case 'variable':
      // Show placeholder text in editor
      const placeholder = el.segments
        .map((s) => (s.type === 'text' ? s.value : `{${s.field}}`))
        .join('')
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
            text={placeholder}
            fontSize={el.fontSize * scale}
            fontFamily={el.fontFamily}
            fontStyle={el.fontWeight}
            fill={el.fontColor}
            align={el.textAlign}
            verticalAlign={el.verticalAlign}
            padding={el.backgroundPadding * scale}
          />
        </Group>
      )

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
            strokeWidth={el.strokeWidth}
          />
        )
      }
      return (
        <Rect
          {...commonProps}
          fill={el.fillColor}
          stroke={el.strokeColor ?? undefined}
          strokeWidth={el.strokeWidth}
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

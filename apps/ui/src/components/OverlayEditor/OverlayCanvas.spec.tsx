import type { OverlayElement } from '@maintainerr/contracts'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayCanvas } from './OverlayCanvas'

const { buildOverlayImageUrlMock } = vi.hoisted(() => ({
  buildOverlayImageUrlMock: vi.fn(
    (imageName: string, cacheBust?: number) =>
      `/api/overlays/images/${imageName}?v=${cacheBust ?? 0}`,
  ),
}))

vi.mock('../../api/overlays', () => ({
  buildOverlayImageUrl: buildOverlayImageUrlMock,
}))

vi.mock('react-konva', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  interface KonvaNodeProps {
    children?: React.ReactNode
    fill?: string
    height?: number
    id?: string
    cornerRadius?: number
    radiusX?: number
    radiusY?: number
    strokeWidth?: number
    width?: number
    x?: number
    y?: number
  }

  type StageHandle = {
    batchDraw: () => void
    findOne: () => null
  }

  type TransformerHandle = {
    getLayer: () => { batchDraw: () => void }
    nodes: () => void
  }

  const numericAttribute = (value: number | undefined) =>
    value === undefined ? undefined : String(value)

  const node = (name: string) =>
    function KonvaNode({ children, ...props }: KonvaNodeProps) {
      return React.createElement(
        'div',
        {
          'data-konva': name,
          'data-id': props.id,
          'data-fill': props.fill,
          'data-height': numericAttribute(props.height),
          'data-stroke-width': numericAttribute(props.strokeWidth),
          'data-corner-radius': numericAttribute(props.cornerRadius),
          'data-radius-x': numericAttribute(props.radiusX),
          'data-radius-y': numericAttribute(props.radiusY),
          'data-width': numericAttribute(props.width),
          'data-x': numericAttribute(props.x),
          'data-y': numericAttribute(props.y),
        },
        children,
      )
    }

  const Stage = React.forwardRef<StageHandle, KonvaNodeProps>(
    function MockStage({ children, ...props }, ref) {
      React.useImperativeHandle(ref, () => ({
        batchDraw: () => undefined,
        findOne: () => null,
      }))

      return React.createElement(
        'div',
        {
          'data-konva': 'Stage',
          'data-width': numericAttribute(props.width),
          'data-height': numericAttribute(props.height),
        },
        children,
      )
    },
  )

  const Transformer = React.forwardRef<TransformerHandle, KonvaNodeProps>(
    function MockTransformer(_props, ref) {
      React.useImperativeHandle(ref, () => ({
        getLayer: () => ({ batchDraw: () => undefined }),
        nodes: () => undefined,
      }))

      return React.createElement('div', { 'data-konva': 'Transformer' })
    },
  )

  return {
    Ellipse: node('Ellipse'),
    Group: node('Group'),
    Image: node('Image'),
    Layer: node('Layer'),
    Rect: node('Rect'),
    Stage,
    Text: node('Text'),
    Transformer,
  }
})

class MockResizeObserver {
  observe() {
    return undefined
  }

  disconnect() {
    return undefined
  }
}

const originalResizeObserver = globalThis.ResizeObserver
const originalImage = window.Image
const mockImageInstances: MockImageElement[] = []

class MockImageElement {
  crossOrigin = ''
  naturalHeight = 200
  naturalWidth = 400
  onerror: (() => void) | null = null
  onload: (() => void) | null = null
  private srcValue = ''

  constructor() {
    mockImageInstances.push(this)
  }

  get src() {
    return this.srcValue
  }

  set src(value: string) {
    this.srcValue = value
    queueMicrotask(() => this.onload?.())
  }
}

const imageElement: OverlayElement = {
  id: 'image-element',
  type: 'image',
  x: 50,
  y: 50,
  width: 200,
  height: 200,
  rotation: 0,
  layerOrder: 0,
  opacity: 1,
  visible: true,
  imagePath: 'logo.png',
}

const textElement: OverlayElement = {
  id: 'text-element',
  type: 'text',
  x: 10,
  y: 10,
  width: 300,
  height: 80,
  rotation: 0,
  layerOrder: 1,
  opacity: 1,
  visible: true,
  text: 'Before',
  fontFamily: 'Roboto',
  fontPath: 'Roboto-Regular.ttf',
  fontSize: 32,
  fontColor: '#ffffff',
  fontWeight: 'bold',
  textAlign: 'left',
  verticalAlign: 'middle',
  backgroundColor: null,
  backgroundRadius: 0,
  backgroundPadding: 0,
  shadow: false,
  uppercase: false,
}

describe('OverlayCanvas', () => {
  beforeEach(() => {
    buildOverlayImageUrlMock.mockClear()
    mockImageInstances.length = 0
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
      writable: true,
    })
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: MockImageElement,
      writable: true,
    })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'Image', {
      configurable: true,
      value: originalImage,
      writable: true,
    })
    if (originalResizeObserver) {
      Object.defineProperty(globalThis, 'ResizeObserver', {
        configurable: true,
        value: originalResizeObserver,
        writable: true,
      })
      return
    }

    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  })

  it('scales shape stroke widths with the displayed canvas size', () => {
    const elements: OverlayElement[] = [
      {
        id: 'rect-shape',
        type: 'shape',
        x: 50,
        y: 50,
        width: 200,
        height: 60,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        shapeType: 'rectangle',
        fillColor: '#B20710',
        strokeColor: '#FFFFFF',
        strokeWidth: 4,
        cornerRadius: 12,
      },
      {
        id: 'ellipse-shape',
        type: 'shape',
        x: 100,
        y: 100,
        width: 120,
        height: 120,
        rotation: 0,
        layerOrder: 1,
        opacity: 1,
        visible: true,
        shapeType: 'ellipse',
        fillColor: '#B20710',
        strokeColor: '#FFFFFF',
        strokeWidth: 6,
        cornerRadius: 0,
      },
    ]

    const { container } = render(
      <OverlayCanvas
        elements={elements}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    const rect = container.querySelector(
      '[data-konva="Rect"][data-id="rect-shape"]',
    )
    const ellipse = container.querySelector(
      '[data-konva="Ellipse"][data-id="ellipse-shape"]',
    )

    // Stroke and cornerRadius must scale by the same factor as element width.
    const rectWidth = Number(rect?.getAttribute('data-width'))
    const rectStroke = Number(rect?.getAttribute('data-stroke-width'))
    const rectCorner = Number(rect?.getAttribute('data-corner-radius'))
    expect(rectStroke / rectWidth).toBeCloseTo(4 / 200)
    expect(rectCorner / rectWidth).toBeCloseTo(12 / 200)

    const ellipseRadiusX = Number(ellipse?.getAttribute('data-radius-x'))
    const ellipseStroke = Number(ellipse?.getAttribute('data-stroke-width'))
    expect(ellipseStroke / (ellipseRadiusX * 2)).toBeCloseTo(6 / 120)
  })

  it('keeps full image element bounds when rendering fitted assets', async () => {
    const { container } = render(
      <OverlayCanvas
        elements={[imageElement]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(
        container.querySelector(
          '[data-konva="Group"][data-id="image-element"] [data-konva="Image"]',
        ),
      ).not.toBeNull()
    })

    const group = container.querySelector(
      '[data-konva="Group"][data-id="image-element"]',
    )
    const bounds = group?.querySelector('[data-konva="Rect"]')
    const image = group?.querySelector('[data-konva="Image"]')

    expect(bounds?.getAttribute('data-width')).toBe('80')
    expect(bounds?.getAttribute('data-height')).toBe('80')
    expect(bounds?.getAttribute('data-fill')).toBe('rgba(0,0,0,0)')
    expect(image?.getAttribute('data-width')).toBe('80')
    expect(image?.getAttribute('data-height')).toBe('40')
    expect(image?.getAttribute('data-y')).toBe('20')
  })

  it('does not reload image assets when unrelated elements change', async () => {
    const { rerender } = render(
      <OverlayCanvas
        elements={[imageElement, textElement]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(buildOverlayImageUrlMock).toHaveBeenCalledTimes(1)
    })
    expect(buildOverlayImageUrlMock).toHaveBeenLastCalledWith('logo.png', 0)

    rerender(
      <OverlayCanvas
        elements={[
          imageElement,
          { ...textElement, text: 'After', x: textElement.x + 20 },
        ]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    expect(buildOverlayImageUrlMock).toHaveBeenCalledTimes(1)

    rerender(
      <OverlayCanvas
        elements={[
          imageElement,
          { ...textElement, text: 'After', x: textElement.x + 20 },
        ]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
        imageLoadVersion={1}
      />,
    )

    await waitFor(() => {
      expect(buildOverlayImageUrlMock).toHaveBeenCalledTimes(2)
    })
    expect(buildOverlayImageUrlMock).toHaveBeenLastCalledWith('logo.png', 1)
  })
})

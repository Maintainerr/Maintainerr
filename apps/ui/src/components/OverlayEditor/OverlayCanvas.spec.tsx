import type { OverlayElement } from '@maintainerr/contracts'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayCanvas } from './OverlayCanvas'

type BoundBoxFunc = (
  oldBox: { x: number; y: number; width: number; height: number },
  newBox: { x: number; y: number; width: number; height: number },
) => { x: number; y: number; width: number; height: number }

interface CapturedTransformEnd {
  handler?: (e: { target: unknown }) => void
}

const capturedTransformEnd: CapturedTransformEnd = {}
const capturedBoundBoxFunc: { fn?: BoundBoxFunc } = {}

vi.mock('react-konva', async () => {
  const React = await vi.importActual<typeof import('react')>('react')

  interface KonvaNodeProps {
    children?: React.ReactNode
    id?: string
    strokeWidth?: number
    cornerRadius?: number
    radiusX?: number
    radiusY?: number
    width?: number
    height?: number
    onTransformEnd?: (e: { target: unknown }) => void
    boundBoxFunc?: BoundBoxFunc
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
      // Capture the transform handler from the first id'd Group so tests can
      // exercise the resize math without simulating a full Konva drag.
      if (
        name === 'Group' &&
        props.id &&
        props.onTransformEnd &&
        !capturedTransformEnd.handler
      ) {
        capturedTransformEnd.handler = props.onTransformEnd
      }
      return React.createElement(
        'div',
        {
          'data-konva': name,
          'data-id': props.id,
          'data-stroke-width': numericAttribute(props.strokeWidth),
          'data-corner-radius': numericAttribute(props.cornerRadius),
          'data-radius-x': numericAttribute(props.radiusX),
          'data-radius-y': numericAttribute(props.radiusY),
          'data-width': numericAttribute(props.width),
          'data-height': numericAttribute(props.height),
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
    function MockTransformer(props, ref) {
      React.useImperativeHandle(ref, () => ({
        getLayer: () => ({ batchDraw: () => undefined }),
        nodes: () => undefined,
      }))
      if (props.boundBoxFunc) {
        capturedBoundBoxFunc.fn = props.boundBoxFunc
      }

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

describe('OverlayCanvas', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
      writable: true,
    })
    capturedTransformEnd.handler = undefined
    capturedBoundBoxFunc.fn = undefined
  })

  afterEach(() => {
    cleanup()
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

  it('clamps transformend results to MAX_RESIZE_FACTOR × canvas dimensions', () => {
    const onUpdate = vi.fn()
    const imageEl: OverlayElement = {
      id: 'img-1',
      type: 'image',
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      layerOrder: 0,
      opacity: 1,
      visible: true,
      imagePath: 'poster.png',
    }

    render(
      <OverlayCanvas
        elements={[imageEl]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={'img-1'}
        onSelect={vi.fn()}
        onUpdate={onUpdate}
      />,
    )

    expect(capturedTransformEnd.handler).toBeDefined()

    // Simulate a runaway iOS-style resize: scaleX wildly inflated. The node
    // mock mirrors Konva's get/set width/scale getters so `node.scaleX(1)`
    // (the handler's reset call) accepts an argument.
    let scaleXVal = 5000
    let scaleYVal = 5000
    const liveNode = {
      x: () => 8,
      y: () => 8,
      width: () => 32,
      height: () => 32,
      rotation: () => 0,
      scaleX: (v?: number) => {
        if (v !== undefined) scaleXVal = v
        return scaleXVal
      },
      scaleY: (v?: number) => {
        if (v !== undefined) scaleYVal = v
        return scaleYVal
      },
    }

    capturedTransformEnd.handler!({ target: liveNode })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const updated = onUpdate.mock.calls[0][0]
    // Without clamping the math gives 32 * 5000 / 1 = 160000. With the cap
    // of 4× canvas, width should land at 1000 × 4 = 4000.
    expect(updated.width).toBe(4000)
    expect(updated.height).toBe(6000) // 1500 × 4
  })

  it('boundBoxFunc rejects boxes that exceed MAX_RESIZE_FACTOR or are non-finite', () => {
    render(
      <OverlayCanvas
        elements={[]}
        canvasWidth={1000}
        canvasHeight={1500}
        selectedId={null}
        onSelect={vi.fn()}
        onUpdate={vi.fn()}
      />,
    )

    expect(capturedBoundBoxFunc.fn).toBeDefined()
    const fn = capturedBoundBoxFunc.fn!
    const oldBox = { x: 0, y: 0, width: 100, height: 100 }

    // ResizeObserver is mocked, so containerSize stays 0 and the scale falls
    // back to fitting MAX_DISPLAY_HEIGHT (600) inside canvasHeight (1500),
    // yielding scale=0.4 → displayW=400. The cap is MAX_RESIZE_FACTOR × 400
    // = 1600. Boxes inside that range pass through; anything beyond reverts.
    const acceptable = fn(oldBox, { x: 0, y: 0, width: 1500, height: 1000 })
    expect(acceptable.width).toBe(1500)

    const tooWide = fn(oldBox, { x: 0, y: 0, width: 5000, height: 1000 })
    expect(tooWide).toBe(oldBox)

    const nonFinite = fn(oldBox, { x: 0, y: 0, width: Infinity, height: 100 })
    expect(nonFinite).toBe(oldBox)

    const tooSmall = fn(oldBox, { x: 0, y: 0, width: 4, height: 100 })
    expect(tooSmall).toBe(oldBox)
  })
})

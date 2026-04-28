import type { OverlayElement } from '@maintainerr/contracts'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OverlayCanvas } from './OverlayCanvas'

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

describe('OverlayCanvas', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: MockResizeObserver,
      writable: true,
    })
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

    expect(Number(rect?.getAttribute('data-stroke-width'))).toBeCloseTo(1.6)
    expect(Number(rect?.getAttribute('data-corner-radius'))).toBeCloseTo(4.8)
    expect(Number(ellipse?.getAttribute('data-stroke-width'))).toBeCloseTo(2.4)
  })
})

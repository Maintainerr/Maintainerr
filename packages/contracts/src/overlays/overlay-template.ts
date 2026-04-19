import z from 'zod'
import { overlayElementSchema, type OverlayElement } from './overlay-element'

// ── Template mode ─────────────────────────────────────────────────────────

export const overlayTemplateModeValues = ['poster', 'titlecard'] as const
export type OverlayTemplateMode = (typeof overlayTemplateModeValues)[number]

// ── Canvas dimension defaults ─────────────────────────────────────────────

export const POSTER_CANVAS = { width: 1000, height: 1500 } as const
export const TITLECARD_CANVAS = { width: 1920, height: 1080 } as const

// ── Schema ────────────────────────────────────────────────────────────────

export const overlayTemplateSchema = z.object({
  id: z.number().int().positive().optional(), // absent on create
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(''),
  mode: z.enum(overlayTemplateModeValues),
  canvasWidth: z.number().int().positive(),
  canvasHeight: z.number().int().positive(),
  elements: z.array(overlayElementSchema),
  isDefault: z.boolean().default(false),
  isPreset: z.boolean().default(false),
})

export const overlayTemplateCreateSchema = overlayTemplateSchema.omit({
  id: true,
  isPreset: true,
})

// For updates: make isDefault and description optional (without applying defaults).
// This allows the service to distinguish between "not provided" (undefined) and "explicitly set to false".
export const overlayTemplateUpdateSchema = overlayTemplateCreateSchema
  .partial()
  .extend({
    isDefault: z.boolean().optional(), // override: no default
    description: z.string().max(500).optional(), // override: no default
  })

export type OverlayTemplate = z.infer<typeof overlayTemplateSchema> & {
  id: number
  createdAt: Date
  updatedAt: Date
}
export type OverlayTemplateCreate = z.infer<typeof overlayTemplateCreateSchema>
export type OverlayTemplateUpdate = z.infer<typeof overlayTemplateUpdateSchema>

// ── Export / Import (template sharing) ────────────────────────────────────

export const overlayTemplateExportSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  mode: z.enum(overlayTemplateModeValues),
  canvasWidth: z.number().int().positive(),
  canvasHeight: z.number().int().positive(),
  elements: z.array(overlayElementSchema),
})

export type OverlayTemplateExport = z.infer<typeof overlayTemplateExportSchema>

// ── Preset template helpers ───────────────────────────────────────────────

export interface PresetTemplate {
  name: string
  description: string
  mode: OverlayTemplateMode
  canvasWidth: number
  canvasHeight: number
  elements: OverlayElement[]
}

/** Built-in preset definitions. Seeded on first run. */
export const PRESET_TEMPLATES: PresetTemplate[] = [
  // 1. Classic Pill — poster, top-left
  {
    name: 'Classic Pill',
    description: 'Rounded pill in the top-left corner showing "Leaving <date>"',
    mode: 'poster',
    canvasWidth: POSTER_CANVAS.width,
    canvasHeight: POSTER_CANVAS.height,
    elements: [
      {
        id: 'pill-bg',
        type: 'shape',
        x: 30,
        y: 60,
        width: 400,
        height: 70,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        shapeType: 'rectangle',
        fillColor: '#B20710',
        strokeColor: null,
        strokeWidth: 0,
        cornerRadius: 35,
      },
      {
        id: 'pill-text',
        type: 'variable',
        x: 30,
        y: 60,
        width: 400,
        height: 70,
        rotation: 0,
        layerOrder: 1,
        opacity: 1,
        visible: true,
        segments: [
          { type: 'text', value: 'Leaving ' },
          { type: 'variable', field: 'date' },
        ],
        fontFamily: 'Inter',
        fontPath: 'Inter-Bold.ttf',
        fontSize: 42,
        fontColor: '#FFFFFF',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        backgroundColor: null,
        backgroundRadius: 0,
        backgroundPadding: 0,
        shadow: true,
        uppercase: false,
        dateFormat: 'MMM d',
        language: 'en-US',
        enableDaySuffix: false,
        textToday: 'today',
        textDay: 'in 1 day',
        textDays: 'in {0} days',
      },
    ],
  },

  // 2. Countdown Bar — poster, full-width bar at bottom
  {
    name: 'Countdown Bar',
    description: 'Full-width bar at the bottom with a countdown in days',
    mode: 'poster',
    canvasWidth: POSTER_CANVAS.width,
    canvasHeight: POSTER_CANVAS.height,
    elements: [
      {
        id: 'bar-bg',
        type: 'shape',
        x: 0,
        y: 1430,
        width: 1000,
        height: 70,
        rotation: 0,
        layerOrder: 0,
        opacity: 0.85,
        visible: true,
        shapeType: 'rectangle',
        fillColor: '#000000',
        strokeColor: null,
        strokeWidth: 0,
        cornerRadius: 0,
      },
      {
        id: 'bar-text',
        type: 'variable',
        x: 0,
        y: 1430,
        width: 1000,
        height: 70,
        rotation: 0,
        layerOrder: 1,
        opacity: 1,
        visible: true,
        segments: [{ type: 'variable', field: 'daysText' }],
        fontFamily: 'Inter',
        fontPath: 'Inter-Bold.ttf',
        fontSize: 38,
        fontColor: '#FFFFFF',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        backgroundColor: null,
        backgroundRadius: 0,
        backgroundPadding: 0,
        shadow: false,
        uppercase: true,
        dateFormat: 'MMM d',
        language: 'en-US',
        enableDaySuffix: false,
        textToday: 'TODAY',
        textDay: 'LEAVING IN 1 DAY',
        textDays: 'LEAVING IN {0} DAYS',
      },
    ],
  },

  // 3. Corner Badge — poster, small circle in top-right
  {
    name: 'Corner Badge',
    description: 'Small circular badge in the top-right with days remaining',
    mode: 'poster',
    canvasWidth: POSTER_CANVAS.width,
    canvasHeight: POSTER_CANVAS.height,
    elements: [
      {
        id: 'badge-bg',
        type: 'shape',
        x: 890,
        y: 30,
        width: 80,
        height: 80,
        rotation: 0,
        layerOrder: 0,
        opacity: 0.9,
        visible: true,
        shapeType: 'ellipse',
        fillColor: '#B20710',
        strokeColor: '#FFFFFF',
        strokeWidth: 3,
        cornerRadius: 0,
      },
      {
        id: 'badge-text',
        type: 'variable',
        x: 890,
        y: 30,
        width: 80,
        height: 80,
        rotation: 0,
        layerOrder: 1,
        opacity: 1,
        visible: true,
        segments: [{ type: 'variable', field: 'days' }],
        fontFamily: 'Inter',
        fontPath: 'Inter-Bold.ttf',
        fontSize: 36,
        fontColor: '#FFFFFF',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        backgroundColor: null,
        backgroundRadius: 0,
        backgroundPadding: 0,
        shadow: false,
        uppercase: false,
        dateFormat: 'MMM d',
        language: 'en-US',
        enableDaySuffix: false,
        textToday: '0',
        textDay: '1',
        textDays: '{0}',
      },
    ],
  },

  // 4. Title Card Pill — titlecard, same concept as Classic Pill
  {
    name: 'Title Card Pill',
    description:
      'Rounded pill overlay for title cards (episodes) showing "Leaving <date>"',
    mode: 'titlecard',
    canvasWidth: TITLECARD_CANVAS.width,
    canvasHeight: TITLECARD_CANVAS.height,
    elements: [
      {
        id: 'tc-pill-bg',
        type: 'shape',
        x: 40,
        y: 40,
        width: 480,
        height: 70,
        rotation: 0,
        layerOrder: 0,
        opacity: 1,
        visible: true,
        shapeType: 'rectangle',
        fillColor: '#B20710',
        strokeColor: null,
        strokeWidth: 0,
        cornerRadius: 35,
      },
      {
        id: 'tc-pill-text',
        type: 'variable',
        x: 40,
        y: 40,
        width: 480,
        height: 70,
        rotation: 0,
        layerOrder: 1,
        opacity: 1,
        visible: true,
        segments: [
          { type: 'text', value: 'Leaving ' },
          { type: 'variable', field: 'date' },
        ],
        fontFamily: 'Inter',
        fontPath: 'Inter-Bold.ttf',
        fontSize: 38,
        fontColor: '#FFFFFF',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        backgroundColor: null,
        backgroundRadius: 0,
        backgroundPadding: 0,
        shadow: true,
        uppercase: false,
        dateFormat: 'MMM d',
        language: 'en-US',
        enableDaySuffix: false,
        textToday: 'today',
        textDay: 'in 1 day',
        textDays: 'in {0} days',
      },
    ],
  },
]

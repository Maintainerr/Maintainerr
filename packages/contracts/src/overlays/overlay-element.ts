import z from 'zod'

/**
 * Replace any character outside the safe filename charset (alphanumerics,
 * dot, dash, underscore) with an underscore. Shared by the font upload
 * endpoint and the `fontPath` / `imagePath` validation below so there is
 * one source of truth for what "safe" means.
 */
export function sanitizeFilenameChars(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** True when `value` is already a safe filename (no sanitization needed). */
export function isSafeFilename(value: string): boolean {
  if (value.length === 0 || value.length > 255) return false
  if (value === '.' || value === '..') return false
  return sanitizeFilenameChars(value) === value
}

const safeFilenameMessage =
  'Must be a filename containing only letters, numbers, dot, dash, or underscore'

export const safeFilenameField = () =>
  z.string().refine(isSafeFilename, { message: safeFilenameMessage })

/**
 * Like `safeFilenameField`, but also accepts an empty string (meaning
 * "not set"). Used for `imagePath` where the element can exist on the
 * canvas before the user picks a source file.
 */
export const optionalSafeFilenameField = () =>
  z.string().refine((v) => v === '' || isSafeFilename(v), {
    message: safeFilenameMessage,
  })

// ── Enums ─────────────────────────────────────────────────────────────────

export const overlayElementTypes = [
  'text',
  'variable',
  'shape',
  'image',
] as const

export type OverlayElementType = (typeof overlayElementTypes)[number]

export const horizontalTextAlignValues = ['left', 'center', 'right'] as const
export const verticalTextAlignValues = ['top', 'middle', 'bottom'] as const
export const shapeTypeValues = ['rectangle', 'ellipse'] as const

// ── Variable segment ──────────────────────────────────────────────────────

/**
 * A single segment inside a variable-text element.
 * Segments are concatenated at render time.
 *
 * - `type: 'text'`     → literal string
 * - `type: 'variable'` → substituted at render time
 *
 * Supported variable fields:
 *   {date}      – formatted deletion date
 *   {days}      – integer days remaining
 *   {daysText}  – localised "today" / "in 1 day" / "in X days"
 */
export const variableSegmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), value: z.string() }),
  z.object({
    type: z.literal('variable'),
    field: z.enum(['date', 'days', 'daysText']),
  }),
])

export type VariableSegment = z.infer<typeof variableSegmentSchema>

// ── Base element fields ───────────────────────────────────────────────────

const baseElementFields = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number().min(-360).max(360).default(0),
  layerOrder: z.number().int().min(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
}

// ── Text element ──────────────────────────────────────────────────────────

export const textElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('text'),
  text: z.string(),
  fontFamily: z.string().min(1),
  fontPath: safeFilenameField(),
  fontSize: z.number().min(1),
  fontColor: z.string().min(4),
  fontWeight: z.enum(['normal', 'bold']).default('bold'),
  textAlign: z.enum(horizontalTextAlignValues).default('left'),
  verticalAlign: z.enum(verticalTextAlignValues).default('middle'),
  backgroundColor: z.string().nullable().default(null),
  backgroundRadius: z.number().min(0).default(0),
  backgroundPadding: z.number().min(0).default(0),
  shadow: z.boolean().default(false),
  uppercase: z.boolean().default(false),
})

export type TextElement = z.infer<typeof textElementSchema>

// ── Variable element ──────────────────────────────────────────────────────

export const variableElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('variable'),
  segments: z.array(variableSegmentSchema).min(1),
  fontFamily: z.string().min(1),
  fontPath: safeFilenameField(),
  fontSize: z.number().min(1),
  fontColor: z.string().min(4),
  fontWeight: z.enum(['normal', 'bold']).default('bold'),
  textAlign: z.enum(horizontalTextAlignValues).default('left'),
  verticalAlign: z.enum(verticalTextAlignValues).default('middle'),
  backgroundColor: z.string().nullable().default(null),
  backgroundRadius: z.number().min(0).default(0),
  backgroundPadding: z.number().min(0).default(0),
  shadow: z.boolean().default(false),
  uppercase: z.boolean().default(false),
  // Date / locale config used when resolving {date} and {daysText}
  dateFormat: z.string().default('MMM d'),
  language: z.string().default('en-US'),
  enableDaySuffix: z.boolean().default(false),
  textToday: z.string().default('today'),
  textDay: z.string().default('in 1 day'),
  textDays: z.string().default('in {0} days'),
})

export type VariableElement = z.infer<typeof variableElementSchema>

// ── Shape element ─────────────────────────────────────────────────────────

export const shapeElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('shape'),
  shapeType: z.enum(shapeTypeValues).default('rectangle'),
  fillColor: z.string().min(4),
  strokeColor: z.string().nullable().default(null),
  strokeWidth: z.number().min(0).default(0),
  cornerRadius: z.number().min(0).default(0),
})

export type ShapeElement = z.infer<typeof shapeElementSchema>

// ── Image element ─────────────────────────────────────────────────────────

export const imageElementSchema = z.object({
  ...baseElementFields,
  type: z.literal('image'),
  /** Filename within `data/overlays/images/` (no path separators). Empty
   *  string means the user hasn't picked a source yet. */
  imagePath: optionalSafeFilenameField(),
})

export type ImageElement = z.infer<typeof imageElementSchema>

// ── Discriminated union ───────────────────────────────────────────────────

export const overlayElementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  variableElementSchema,
  shapeElementSchema,
  imageElementSchema,
])

export type OverlayElement = z.infer<typeof overlayElementSchema>

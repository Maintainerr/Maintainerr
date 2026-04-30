/**
 * Shared cap for user-uploaded image assets across the app — collection
 * posters and overlay image elements both share this ceiling. 500 KB is a
 * pragmatic limit: real cover artwork at typical poster dimensions
 * (~1000×1500 JPEG) lands well under this, while anything larger is almost
 * certainly not what a user means to upload.
 */
export const IMAGE_UPLOAD_MAX_BYTES = 500 * 1024
export const IMAGE_UPLOAD_MAX_LABEL = '500 KB'

/**
 * Accepted file types for the overlay-image upload pipeline. Single source
 * of truth — the server uses these to validate uploads and populate the
 * Content-Type header on GET, the UI uses them to populate the file
 * picker's `accept` attribute and to render the helper text under the
 * picker. Add a new entry here and both sides pick it up.
 *
 * `label` is omitted on alias extensions (e.g. `.jpeg` is folded under
 * "JPG") so the helper-text rendering doesn't show duplicates.
 */
export interface OverlayImageFormat {
  extension: string
  mime: string
  label?: string
}

export const OVERLAY_IMAGE_FORMATS: ReadonlyArray<OverlayImageFormat> = [
  { extension: '.png', mime: 'image/png', label: 'PNG' },
  { extension: '.jpg', mime: 'image/jpeg', label: 'JPG' },
  { extension: '.jpeg', mime: 'image/jpeg' },
  { extension: '.webp', mime: 'image/webp', label: 'WebP' },
]

export const OVERLAY_IMAGE_ACCEPT = Array.from(
  new Set(OVERLAY_IMAGE_FORMATS.map((f) => f.mime)),
).join(',')

export const OVERLAY_IMAGE_FORMAT_LABELS = OVERLAY_IMAGE_FORMATS.filter(
  (f): f is Required<OverlayImageFormat> => f.label !== undefined,
).map((f) => f.label)

export const OVERLAY_IMAGE_EXTENSIONS = OVERLAY_IMAGE_FORMATS.map(
  (f) => f.extension,
)

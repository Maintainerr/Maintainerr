import { useEffect, useRef, useState } from 'react'
import {
  buildCollectionPosterUrl,
  deleteCollectionPoster,
  uploadCollectionPoster,
} from '../../../../api/collections'
import { logClientError } from '../../../../utils/ClientLogger'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'

interface Props {
  collectionId: number
  collectionTerm: string
  mediaServerName: string
}

type Status = {
  type: 'success' | 'warning' | 'error' | 'info'
  title: string
} | null

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_BYTES = 10 * 1024 * 1024

/**
 * In-modal control for managing the user-uploaded poster on a Maintainerr
 * collection. Lifecycle is independent from the rule-group save: uploads are
 * applied immediately, so the user gets feedback without first dismissing
 * the modal.
 */
export const CollectionPosterPicker = ({
  collectionId,
  collectionTerm,
  mediaServerName,
}: Props) => {
  // cacheBust seeds at mount and is bumped on upload/clear so the rendered
  // URL is always unique enough to bypass cached 404s from prior sessions.
  const [cacheBust, setCacheBust] = useState<number>(() => Date.now())
  const [hasPoster, setHasPoster] = useState<boolean>(false)
  const [posterStateCollectionId, setPosterStateCollectionId] = useState<
    number | null
  >(collectionId)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const probeTokenRef = useRef(0)

  const previewUrl = buildCollectionPosterUrl(collectionId, cacheBust)
  const hasPosterForCurrentCollection =
    hasPoster && posterStateCollectionId === collectionId

  // Probe once per mounted collection using a HEAD request without cache so
  // the preview slot reflects the stored poster state without 404 caching.
  // Upload/clear update hasPoster directly from the mutation response, so
  // the effect intentionally doesn't depend on cacheBust.
  useEffect(() => {
    const probeToken = ++probeTokenRef.current
    const controller = new AbortController()
    const probeUrl = buildCollectionPosterUrl(collectionId, Date.now())

    void fetch(probeUrl, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (probeTokenRef.current === probeToken) {
          setPosterStateCollectionId(collectionId)
          setHasPoster(response.ok)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        if (probeTokenRef.current === probeToken) {
          setPosterStateCollectionId(collectionId)
          setHasPoster(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [collectionId])

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_BYTES) {
      setStatus({
        type: 'error',
        title: 'File is larger than 10 MB',
      })
      return
    }

    setBusy(true)
    setStatus(null)
    try {
      const result = await uploadCollectionPoster(collectionId, file)
      probeTokenRef.current += 1
      setPosterStateCollectionId(collectionId)
      setCacheBust(Date.now())
      setHasPoster(true)
      if (result.pushed) {
        setStatus({
          type: 'success',
          title: `Poster saved and pushed to ${mediaServerName}`,
        })
      } else if (result.attempted) {
        setStatus({
          type: 'warning',
          title: `Saved locally. Maintainerr couldn't push to ${mediaServerName} right now; it'll re-apply automatically next time the ${collectionTerm} is recreated there.`,
        })
      } else {
        setStatus({
          type: 'info',
          title: `Poster saved locally. Maintainerr could not apply it to ${mediaServerName} yet.`,
        })
      }
    } catch (error) {
      void logClientError(
        'Failed to upload collection poster',
        error,
        'CollectionPosterPicker.handleFileChange',
      )
      setStatus({
        type: 'error',
        title: 'Could not upload poster — check that the file is a valid image',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await deleteCollectionPoster(collectionId)
      probeTokenRef.current += 1
      setPosterStateCollectionId(collectionId)
      setHasPoster(false)
      setCacheBust(Date.now())
      setStatus({
        type: 'info',
        title: `Custom poster cleared. The artwork on ${mediaServerName} is unchanged — refresh metadata there if you want the original back.`,
      })
    } catch (error) {
      void logClientError(
        'Failed to clear collection poster',
        error,
        'CollectionPosterPicker.handleClear',
      )
      setStatus({
        type: 'error',
        title: 'Could not clear the stored poster',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-row items-start gap-4">
        <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-700 ring-1 ring-zinc-600">
          {hasPosterForCurrentCollection && (
            <img
              alt={`Custom ${collectionTerm} poster`}
              src={previewUrl}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
          {!hasPosterForCurrentCollection && (
            <div className="absolute inset-0 flex items-center justify-center text-center text-xs text-zinc-400">
              No custom poster
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-xs text-zinc-400">
            Upload a JPEG, PNG, or WebP. The image is re-encoded to JPEG and
            stored locally; Maintainerr pushes it to {mediaServerName} as a
            one-shot write. Other tools that manage{' '}
            {mediaServerName.toLowerCase()} collection artwork (e.g. Kometa,
            Posterizarr) may overwrite it.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
              className="hidden"
              data-testid="collection-poster-input"
            />
            <Button
              buttonType="primary"
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {hasPosterForCurrentCollection ? 'Replace poster' : 'Upload poster'}
            </Button>
            {hasPosterForCurrentCollection && (
              <Button
                buttonType="warning"
                type="button"
                disabled={busy}
                onClick={handleClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
      {status && <Alert type={status.type} title={status.title} />}
    </div>
  )
}

export default CollectionPosterPicker

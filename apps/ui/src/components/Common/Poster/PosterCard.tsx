import { type MediaProviderIds } from '@maintainerr/contracts'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import GetApiHandler from '../../../utils/ApiHandler'
import {
  buildMetadataImagePath,
  isAbsoluteUrl,
} from '../../../utils/mediaTypeUtils'

// Each entry is a request path key + resolved URL string (~200 bytes).
// 500 entries ≈ 100KB — covers several pages of browsing before eviction.
const POSTER_CACHE_MAX_SIZE = 500
const resolvedPosterImageCache = new Map<string, string>()
const pendingPosterImageRequests = new Map<string, Promise<string | null>>()

type PosterCardProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  imagePath?: string | null
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  providerIds?: MediaProviderIds
  itemId?: string | number
  imageClassName?: string
  children: (image: string | null) => ReactNode
}

interface PosterImageState {
  requestKey?: string
  path: string | null
}

async function resolvePosterImage(requestPath: string): Promise<string | null> {
  const cachedImage = resolvedPosterImageCache.get(requestPath)
  if (cachedImage) {
    return cachedImage
  }

  const pendingRequest = pendingPosterImageRequests.get(requestPath)
  if (pendingRequest) {
    return pendingRequest
  }

  const request = GetApiHandler<{ url: string } | undefined>(requestPath)
    .then((response) => {
      const nextPath = response?.url ?? null

      if (nextPath) {
        if (resolvedPosterImageCache.size >= POSTER_CACHE_MAX_SIZE) {
          const firstKey = resolvedPosterImageCache.keys().next().value
          if (firstKey !== undefined) {
            resolvedPosterImageCache.delete(firstKey)
          }
        }
        resolvedPosterImageCache.set(requestPath, nextPath)
      }

      return nextPath
    })
    .catch(() => null)
    .finally(() => {
      pendingPosterImageRequests.delete(requestPath)
    })

  pendingPosterImageRequests.set(requestPath, request)

  return request
}

export function resetPosterImageCache(): void {
  resolvedPosterImageCache.clear()
  pendingPosterImageRequests.clear()
}

const PosterCard = ({
  imagePath,
  mediaType,
  providerIds,
  itemId,
  className,
  imageClassName,
  children,
  ...props
}: PosterCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const isDirectImage = isAbsoluteUrl(imagePath)
  const imageRequestPath = buildMetadataImagePath(
    'image',
    mediaType,
    providerIds,
    itemId,
  )
  const cachedImage = imageRequestPath
    ? resolvedPosterImageCache.get(imageRequestPath)
    : undefined
  const [imageResult, setImageResult] = useState<PosterImageState>({
    requestKey: undefined,
    path: null,
  })
  const [shouldLoadImage, setShouldLoadImage] = useState(
    isDirectImage || !imageRequestPath || cachedImage !== undefined,
  )
  const canLoadImage =
    shouldLoadImage || typeof IntersectionObserver === 'undefined'

  useEffect(() => {
    if (
      isDirectImage ||
      !imageRequestPath ||
      cachedImage !== undefined ||
      shouldLoadImage ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return
        }

        setShouldLoadImage(true)
        observer.disconnect()
      },
      { rootMargin: '400px 0px' },
    )

    if (cardRef.current) {
      observer.observe(cardRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [cachedImage, imageRequestPath, isDirectImage, shouldLoadImage])

  useEffect(() => {
    if (
      isDirectImage ||
      !imageRequestPath ||
      cachedImage !== undefined ||
      !canLoadImage
    ) {
      return
    }

    let isActive = true

    resolvePosterImage(imageRequestPath)
      .then((path) => {
        if (isActive) {
          setImageResult({
            requestKey: imageRequestPath,
            path,
          })
        }
      })
      .catch(() => {
        if (isActive) {
          setImageResult({
            requestKey: imageRequestPath,
            path: null,
          })
        }
      })

    return () => {
      isActive = false
    }
  }, [cachedImage, canLoadImage, imageRequestPath, isDirectImage])

  const image = isDirectImage
    ? imagePath
    : !imageRequestPath
      ? null
      : (cachedImage ??
        (imageResult.requestKey === imageRequestPath ? imageResult.path : null))

  return (
    <div
      ref={cardRef}
      className={
        className ??
        'relative transform-gpu overflow-hidden rounded-xl bg-zinc-800 bg-cover pb-[150%] outline-none ring-1 transition duration-300'
      }
      {...props}
    >
      <div className="absolute inset-0 h-full w-full overflow-hidden">
        {image ? (
          <img
            className={
              imageClassName ?? 'absolute inset-0 h-full w-full object-cover'
            }
            alt=""
            src={image}
            loading="lazy"
            decoding="async"
          />
        ) : undefined}
        {children(image)}
      </div>
    </div>
  )
}

export default PosterCard

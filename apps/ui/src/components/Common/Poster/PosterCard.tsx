import { type MediaProviderIds } from '@maintainerr/contracts'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import GetApiHandler from '../../../utils/ApiHandler'
import {
  buildMetadataImagePath,
  isAbsoluteUrl,
} from '../../../utils/mediaTypeUtils'

type PosterCardProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  imagePath?: string | null
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  providerIds?: MediaProviderIds
  imageClassName?: string
  children: (image: string | null) => ReactNode
}

interface PosterImageState {
  requestKey?: string
  path: string | null
}

const PosterCard = ({
  imagePath,
  mediaType,
  providerIds,
  className,
  imageClassName,
  children,
  ...props
}: PosterCardProps) => {
  const isDirectImage = isAbsoluteUrl(imagePath)
  const imageRequestPath = buildMetadataImagePath(
    'image',
    mediaType,
    providerIds,
  )
  const [imageResult, setImageResult] = useState<PosterImageState>({
    requestKey: undefined,
    path: null,
  })

  useEffect(() => {
    if (isDirectImage || !imageRequestPath) {
      return
    }

    let isActive = true

    GetApiHandler<{ url: string } | undefined>(imageRequestPath)
      .then((response) => {
        if (isActive) {
          setImageResult({
            requestKey: imageRequestPath,
            path: response?.url ?? null,
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
  }, [imageRequestPath, isDirectImage])

  const image = isDirectImage
    ? imagePath
    : !imageRequestPath
      ? null
      : imageResult.requestKey === imageRequestPath
        ? imageResult.path
        : null

  return (
    <div
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

import { type MediaProviderIds } from '@maintainerr/contracts'
import { type ReactNode, useEffect, useState } from 'react'
import GetApiHandler from '../../../utils/ApiHandler'
import {
  buildMetadataImagePath,
  isAbsoluteUrl,
} from '../../../utils/mediaTypeUtils'

interface PosterImageProps {
  imagePath?: string | null
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  providerIds?: MediaProviderIds
  children: (image: string | null) => ReactNode
}

interface PosterImageState {
  requestKey?: string
  path: string | null
}

const PosterImage = ({
  imagePath,
  mediaType,
  providerIds,
  children,
}: PosterImageProps) => {
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

  if (isDirectImage) {
    return children(imagePath)
  }

  if (!imageRequestPath) {
    return children(null)
  }

  return children(
    imageResult.requestKey === imageRequestPath ? imageResult.path : null,
  )
}

export default PosterImage

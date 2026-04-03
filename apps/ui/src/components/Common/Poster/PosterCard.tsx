import { type MediaProviderIds } from '@maintainerr/contracts'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import PosterImage from './PosterImage'

type PosterCardProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  imagePath?: string | null
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  providerIds?: MediaProviderIds
  imageClassName?: string
  children: (image: string | null) => ReactNode
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
  return (
    <PosterImage
      imagePath={imagePath}
      mediaType={mediaType}
      providerIds={providerIds}
    >
      {(image) => (
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
                  imageClassName ??
                  'absolute inset-0 h-full w-full object-cover'
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
      )}
    </PosterImage>
  )
}

export default PosterCard

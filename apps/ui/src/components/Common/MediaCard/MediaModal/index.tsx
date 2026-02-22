import { MediaItem } from '@maintainerr/contracts'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { useMediaServerType } from '../../../../hooks/useMediaServerType'
import GetApiHandler from '../../../../utils/ApiHandler'

interface ModalContentProps {
  onClose: () => void
  id: number | string
  image?: string
  userScore?: number
  backdrop?: string
  summary?: string
  year?: string
  mediaType: 'movie' | 'show' | 'season' | 'episode'
  title: string
  canExpand?: boolean
  inProgress?: boolean
  tmdbid?: string
  libraryId?: string
  type?: 1 | 2 | 3 | 4
  daysLeft?: number
  exclusionId?: number
  exclusionType?: 'global' | 'specific' | undefined
  collectionId?: number
  isManual?: boolean
}

const basePath = import.meta.env.VITE_BASE_PATH ?? ''
const ratingIcons: Record<string, string> = {
  audience: `${basePath}/icons_logos/tmdb_icon.svg`,
  critic: `${basePath}/icons_logos/rt_critic.svg`,
}

const MediaModalContent: React.FC<ModalContentProps> = memo(
  ({ onClose, mediaType, id, summary, year, title, tmdbid }) => {
    const { isPlex, isJellyfin } = useMediaServerType()
    const [loading, setLoading] = useState<boolean>(true)
    const [backdrop, setBackdrop] = useState<string | null>(null)
    const [machineId, setMachineId] = useState<string | null>(null)
    const [serverUrl, setServerUrl] = useState<string | null>(null)
    const [tautulliModalUrl, setTautulliModalUrl] = useState<string | null>(
      null,
    )
    const [metadata, setMetadata] = useState<MediaItem | null>(null)

    const mediaTypeOf = useMemo(
      () =>
        ['show', 'season', 'episode'].includes(mediaType) ? 'tv' : mediaType,
      [mediaType],
    )

    const basePath = import.meta.env.VITE_BASE_PATH ?? ''

    useEffect(() => {
      GetApiHandler('/media-server').then((resp) => {
        setMachineId(resp?.machineId)
        // For Jellyfin, we need the server URL to construct links
        if (resp?.url) {
          setServerUrl(resp.url)
        }
      })
      GetApiHandler('/settings').then((resp) =>
        setTautulliModalUrl(resp?.tautulli_url || null),
      )
      GetApiHandler<MediaItem>(`/media-server/meta/${id}`).then((data) => {
        setMetadata(data)
        setLoading(false)
      })
      // Only fetch backdrop if tmdbid is available
      if (tmdbid) {
        const backdropType = ['season', 'episode'].includes(mediaType)
          ? 'show'
          : mediaType
        GetApiHandler(`/moviedb/backdrop/${backdropType}/${tmdbid}`)
          .then((resp) => setBackdrop(resp))
          .catch((error) => {
            console.error(
              'Error fetching backdrop image. Check your media server metadata',
              error,
            )
            setBackdrop(null)
          })
      } else {
        console.warn(
          `No TMDB ID found for "${title}" (id: ${id}). Backdrop image unavailable. ` +
            'Please check your media server metadata - the item may not be matched correctly.',
        )
        setBackdrop(null)
      }
    }, [id, mediaType, tmdbid, title])

    useEffect(() => {
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = ''
      }
    }, [])
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 px-3"
        onClick={onClose} // Close modal when clicking outside
      >
        <div
          className="relative max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl bg-zinc-800 shadow-lg"
          onClick={(e) => e.stopPropagation()} // Prevent modal close on content click
        >
          {/* Top Half with Background Image */}
          <div className="relative h-72 w-full overflow-hidden p-2 xl:h-96">
            <div
              className="h-full w-full rounded-xl bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: backdrop
                  ? `url(https://image.tmdb.org/t/p/w1280${backdrop})`
                  : 'linear-gradient(to bottom, #1e293b, #1e293b)',
              }}
            ></div>
            {loading && (
              <div className="absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-black bg-opacity-50">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-4 border-sky-600 border-t-sky-200"></div>
              </div>
            )}

            <div className="absolute left-0 top-0 z-10 flex h-full w-full gap-x-4 p-4">
              <div className="flex grow flex-col">
                <div className="max-w-fit grow">
                  <div
                    className={`pointer-events-none flex justify-center rounded-lg bg-opacity-70 p-2 text-xs font-medium uppercase text-zinc-200 ${
                      mediaType === 'movie'
                        ? 'bg-black'
                        : mediaType === 'show'
                          ? 'bg-amber-900'
                          : mediaType === 'season'
                            ? 'bg-yellow-700'
                            : 'bg-rose-900'
                    }`}
                  >
                    {mediaType}
                  </div>
                  {metadata?.contentRating && (
                    <div className="pointer-events-none mt-1 rounded-lg bg-black bg-opacity-70 p-2 text-xs font-medium uppercase text-zinc-200">
                      {`Rated: ${metadata.contentRating}`}
                    </div>
                  )}
                </div>
                {metadata?.ratings && metadata.ratings.length > 0 ? (
                  <div className="flex flex-wrap-reverse gap-1">
                    {metadata.ratings.map((rating, index) => {
                      const icon = rating.type
                        ? ratingIcons[rating.type]
                        : undefined
                      return (
                        <div
                          key={index}
                          className="flex items-center justify-center space-x-1.5 rounded-lg bg-black bg-opacity-70 px-3 py-1 text-white shadow-lg"
                        >
                          {icon && (
                            <img
                              src={icon}
                              alt={`${rating.type} rating`}
                              width={24}
                              height={24}
                              className="h-6 w-6"
                            />
                          )}
                          <span className="cursor-default text-sm font-medium">
                            {rating.value.toFixed(1)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  ''
                )}
              </div>
              <div className="flex flex-col items-end">
                <div className="max-w-fit grow">
                  {tmdbid && (
                    <div>
                      <a
                        href={`https://themoviedb.org/${mediaTypeOf}/${tmdbid}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/tmdb_logo.svg`}
                          alt="TMDB Logo"
                          width={128}
                          height={32}
                          className="h-8 w-32 rounded-lg bg-black bg-opacity-70 p-2 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                  {isPlex && (
                    <div>
                      <a
                        href={`https://app.plex.tv/desktop#!/server/${machineId}/details?key=%2Flibrary%2Fmetadata%2F${id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/plex_logo.svg`}
                          alt="Plex Logo"
                          width={128}
                          height={32}
                          className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                  {isJellyfin && serverUrl && (
                    <div>
                      <a
                        href={`${serverUrl}/web/#/details?id=${id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/jellyfin.svg`}
                          alt="Jellyfin Logo"
                          width={128}
                          height={32}
                          className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                  {isPlex && tautulliModalUrl && (
                    <div>
                      <a
                        href={`${tautulliModalUrl}/info?rating_key=${id}&source=history`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={`${basePath}/icons_logos/tautulli_logo.svg`}
                          alt="Tautulli Logo"
                          width={128}
                          height={32}
                          className="mt-1 h-8 w-32 rounded-lg bg-black bg-opacity-70 p-1.5 shadow-lg"
                        />
                      </a>
                    </div>
                  )}
                </div>
                {metadata?.genres && metadata.genres.length > 0 ? (
                  <div className="pointer-events-none flex flex-wrap-reverse items-end justify-end gap-1">
                    {metadata.genres.map((genre, index) => (
                      <span
                        key={index}
                        className="flex items-center rounded-lg bg-black bg-opacity-70 p-2 text-xs font-medium text-white shadow-lg"
                      >
                        {genre.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  ''
                )}
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-100">
                  {title}
                  {year ? ` (${year})` : ''}
                </h2>
              </div>
            </div>

            <div className="mt-2 text-gray-300">
              <p>{summary || 'No summary available.'}</p>
            </div>

            <div className="mr-0.5 mt-6 flex flex-row items-center justify-between gap-4">
              {metadata?.providerIds &&
                ['movie', 'show'].includes(mediaType) &&
                (metadata.providerIds.tmdb?.length ||
                  metadata.providerIds.imdb?.length ||
                  metadata.providerIds.tvdb?.length) && (
                  <div className="flex flex-wrap items-center gap-1 text-xs text-zinc-400">
                    {metadata.providerIds.tmdb?.map((id) => (
                      <span
                        key={`tmdb-${id}`}
                        className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                      >
                        tmdb://{id}
                      </span>
                    ))}
                    {metadata.providerIds.imdb?.map((id) => (
                      <span
                        key={`imdb-${id}`}
                        className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                      >
                        imdb://{id}
                      </span>
                    ))}
                    {metadata.providerIds.tvdb?.map((id) => (
                      <span
                        key={`tvdb-${id}`}
                        className="flex items-center justify-center rounded-lg bg-zinc-700 p-2 text-xs text-white shadow-lg"
                      >
                        tvdb://{id}
                      </span>
                    ))}
                  </div>
                )}
              <div className="ml-auto flex space-x-3">
                <button
                  onClick={onClose}
                  className="rounded bg-amber-600 px-4 py-2 hover:bg-amber-500 focus:outline-none"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  },
)

MediaModalContent.displayName = 'MediaModalContent'

export default MediaModalContent

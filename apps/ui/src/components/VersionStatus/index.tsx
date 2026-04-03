import {
  ArrowCircleUpIcon,
  BeakerIcon,
  CodeIcon,
  ServerIcon,
} from '@heroicons/react/outline'
import { type VersionResponse } from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import GetApiHandler from '../../utils/ApiHandler'
import { startsWithDigit } from '../../utils/version'

enum messages {
  LOCAL = 'Keep it up! 👍',
  LATEST = 'Maintainerr',
  PRE_RELEASE = 'Maintainerr Pre-Release',
  OUT_OF_DATE = 'Out of Date',
}

interface VersionStatusProps {
  onClick?: () => void
}

const VersionStatus = ({ onClick }: VersionStatusProps) => {
  const [version, setVersion] = useState<string>('0.0.1')
  const [commitTag, setCommitTag] = useState<string>('')
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [loadFailed, setLoadFailed] = useState<boolean>(false)

  const containerClassName =
    'mx-2 flex min-h-[56px] items-center rounded-lg p-2 text-xs ring-1 ring-zinc-700 transition duration-300'

  useEffect(() => {
    GetApiHandler('/app/status')
      .then((resp: VersionResponse) => {
        if (resp.status) {
          setVersion(resp.version)
          setCommitTag(resp.commitTag)
          setUpdateAvailable(resp.updateAvailable)
          setLoadFailed(false)
          return
        }

        setLoadFailed(true)
      })
      .catch(() => {
        setLoadFailed(true)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const tag = version?.split('-')[0] ?? ''
  const isRelease = startsWithDigit(tag)

  const versionStream =
    commitTag === 'local'
      ? messages.LOCAL
      : isRelease
        ? messages.LATEST
        : tag === 'main'
          ? messages.PRE_RELEASE
          : `Maintainerr ${tag.charAt(0).toUpperCase() + tag.slice(1)}`

  if (loading) {
    return (
      <div
        aria-hidden="true"
        className={`${containerClassName} bg-zinc-900 text-zinc-300`}
      >
        <div className="h-6 w-6 rounded bg-zinc-800" />
        <div className="flex min-w-0 flex-1 flex-col gap-1 px-2 last:pr-0">
          <div className="h-3 w-28 rounded bg-zinc-800" />
          <div className="h-3 w-20 rounded bg-zinc-800" />
        </div>
      </div>
    )
  }

  if (loadFailed) {
    return (
      <Link
        to="/settings/about"
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onClick) {
            onClick()
          }
        }}
        role="button"
        tabIndex={0}
        className={`${containerClassName} bg-zinc-900 text-zinc-300 hover:bg-zinc-800`}
      >
        <ServerIcon className="h-6 w-6" />
        <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pr-0">
          <span className="font-bold">Maintainerr</span>
          <span className="truncate">Version unavailable</span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to="/settings/about"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) {
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      className={`${containerClassName} ${
        updateAvailable
          ? 'bg-amber-800 text-white hover:bg-amber-600'
          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {commitTag === 'local' ? (
        <CodeIcon className="h-6 w-6" />
      ) : isRelease || tag === 'main' ? (
        <ServerIcon className="h-6 w-6" />
      ) : (
        <BeakerIcon className="h-6 w-6" />
      )}
      <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pr-0">
        <span className="font-bold">{versionStream}</span>
        <span className="truncate">
          {commitTag === 'local' ? (
            ''
          ) : updateAvailable ? (
            messages.OUT_OF_DATE
          ) : (
            <code className="bg-transparent p-0">{version}</code>
          )}
        </span>
      </div>
      {updateAvailable && <ArrowCircleUpIcon className="h-6 w-6" />}
    </Link>
  )
}

export default VersionStatus

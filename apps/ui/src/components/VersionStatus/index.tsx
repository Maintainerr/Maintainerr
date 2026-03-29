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

  useEffect(() => {
    GetApiHandler('/app/status').then((resp: VersionResponse) => {
      if (resp.status) {
        setVersion(resp.version)
        setCommitTag(resp.commitTag)
        setUpdateAvailable(resp.updateAvailable)
        setLoading(false)
      }
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

  return (
    <>
      {!loading ? (
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
          className={`mx-2 flex items-center rounded-lg p-2 text-xs ring-1 ring-zinc-700 transition duration-300 ${
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
      ) : undefined}
    </>
  )
}

export default VersionStatus

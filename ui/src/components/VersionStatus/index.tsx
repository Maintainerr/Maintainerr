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

enum messages {
  DEVELOP = 'Maintainerr Develop',
  STABLE = 'Maintainerr Stable',
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

  const versionStream =
    commitTag === 'local'
      ? 'Keep it up! 👍'
      : version?.startsWith('develop-')
        ? messages.DEVELOP
        : messages.STABLE

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
          ) : version.startsWith('develop-') ? (
            <BeakerIcon className="h-6 w-6" />
          ) : (
            <ServerIcon className="h-6 w-6" />
          )}
          <div className="flex min-w-0 flex-1 flex-col truncate px-2 last:pr-0">
            <span className="font-bold">{versionStream}</span>
            <span className="truncate">
              {commitTag === 'local' ? (
                ''
              ) : updateAvailable ? (
                messages.OUT_OF_DATE
              ) : (
                <code className="bg-transparent p-0">
                  {version ? version.replace('develop-', '') : ''}
                </code>
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

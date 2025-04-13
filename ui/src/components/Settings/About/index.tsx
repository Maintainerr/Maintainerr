import { InformationCircleIcon } from '@heroicons/react/solid'
import { type VersionResponse } from '@maintainerr/contracts'
import { useEffect, useState } from 'react'
import GetApiHandler from '../../../utils/ApiHandler'
import Releases from './Releases'

interface ConfigResponse {
  timezone: string
  dataDirectory: string
}

const AboutSettings = () => {
  useEffect(() => {
    document.title = 'Maintainerr - Settings - About'
  }, [])

  // Maintainerr Config
  const [config, setConfig] = useState<ConfigResponse>()
  useEffect(() => {
    GetApiHandler<ConfigResponse>('/app/config').then((resp) => {
      setConfig(resp)
    })
  }, [])
  // End Maintainerr Config

  // Maintainerr Version
  const [version, setVersion] = useState<string>('')
  const [commitTag, setCommitTag] = useState<string>('')
  useEffect(() => {
    GetApiHandler('/app/status').then((resp: VersionResponse) => {
      if (resp.status) {
        setVersion(resp.version)
        setCommitTag(resp.commitTag)
      }
    })
  }, [])
  // End Maintainerr Version

  // Maintainerr Rules Count
  const [ruleCount, setRuleCount] = useState<number>()
  useEffect(() => {
    GetApiHandler<number>('/rules/count/').then((resp) => {
      setRuleCount(resp)
    })
  }, [])
  // End Maintainerr Rules Count

  // Maintainerr Collection Items
  const [itemCount, setItemCount] = useState<number>()
  useEffect(() => {
    GetApiHandler<number>('/collections/media/count').then((resp) => {
      setItemCount(resp)
    })
  }, [])
  // End Maintainerr Collection Items

  // Maintainerr Community Rules Count
  const [communityCount, setCommunityCount] = useState<number>()
  useEffect(() => {
    GetApiHandler<number>('/rules/community/count').then((resp) => {
      setCommunityCount(resp)
    })
  }, [])
  // End Maintainerr Community Rules Count

  return (
    <div className="h-full w-full">
      <div className="mt-6 rounded-md border border-amber-600 bg-amber-500 bg-opacity-20 p-4 backdrop-blur">
        <div className="flex">
          <div className="flex-shrink-0">
            <InformationCircleIcon className="h-5 w-5 text-gray-100" />
          </div>
          <div className="ml-3 flex-1 md:flex md:justify-between">
            <p className="text-sm leading-5 text-gray-100">
              This is BETA software. Features may be broken and/or unstable.
              Please report any issues on GitHub!
            </p>
            <p className="mt-3 text-sm leading-5 md:ml-6 md:mt-0">
              <a
                href="https://github.com/Maintainerr/Maintainerr"
                className="whitespace-nowrap font-medium text-gray-100 transition duration-150 ease-in-out hover:text-white"
                target="_blank"
                rel="noreferrer"
              >
                GitHub &rarr;
              </a>
            </p>
          </div>
        </div>
      </div>
      {/* Maintainerr Portion */}
      <div className="section mb-2 h-full w-full">
        <h3 className="heading">About Maintainerr</h3>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Version
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{commitTag === 'local' ? 'local' : <>{version}</>}</code>
              </span>
            </div>
          </div>
        </div>
        <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Container Config Path
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{config?.dataDirectory}</code>
              </span>
            </div>
          </div>
        </div>
        <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Time Zone
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{config?.timezone}</code>
              </span>
            </div>
          </div>
        </div>
        <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Number Of Rules
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{ruleCount}</code>
              </span>
            </div>
          </div>
        </div>
        <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Total Media in Collections
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{itemCount}</code>
              </span>
            </div>
          </div>
        </div>
        <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
        <div className="form-row my-2">
          <label htmlFor="name" className="text-label">
            Community Rules
          </label>
          <div className="form-input">
            <div className="form-input-field">
              <span className="">
                <code>{communityCount}</code>
              </span>
            </div>
          </div>
        </div>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      {/* End Maintainerr Portion */}
      {/* Useful Links */}
      <div className="section mb-2 h-full w-full">
        <h3 className="heading">Useful Links</h3>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label className="text-label"> Documentation </label>
          <div className="form-input">
            <div className="form-input-field font-bold text-amber-600 underline">
              <a
                className="hover:text-amber-800"
                href="https://docs.maintainerr.info"
                target="_blank"
              >
                https://docs.maintainerr.info
              </a>
            </div>
          </div>
        </div>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label className="text-label"> Discord </label>
          <div className="form-input">
            <div className="form-input-field font-bold text-amber-600 underline">
              <a
                className="hover:text-amber-800"
                href="https://discord.gg/WP4ZW2QYwk"
                target="_blank"
              >
                https://discord.gg/WP4ZW2QYwk
              </a>
            </div>
          </div>
        </div>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label className="text-label"> Feature Requests </label>
          <div className="form-input">
            <div className="form-input-field font-bold text-amber-600 underline">
              <a
                className="hover:text-amber-800"
                href="https://features.maintainerr.info"
                target="_blank"
              >
                https://features.maintainerr.info
              </a>
            </div>
          </div>
        </div>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label className="text-label"> Services Status </label>
          <div className="form-input">
            <div className="form-input-field font-bold text-amber-600 underline">
              <a
                className="hover:text-amber-800"
                href="https://status.maintainerr.info"
                target="_blank"
              >
                https://status.maintainerr.info
              </a>
            </div>
          </div>
        </div>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section mb-2 h-full w-full">
        <h3 className="heading">Loving Maintainerr?</h3>
      </div>
      <hr className="my-2 h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      <div className="section my-2">
        <div className="form-row my-2">
          <label className="text-label">Donations Welcome</label>
          <div className="form-input">
            <div className="form-input-field font-bold text-amber-600">
              <a
                className="pr-2 underline hover:text-amber-800"
                href="https://github.com/sponsors/jorenn92"
                target="_blank"
              >
                GitHub Sponsors
              </a>
              <p className="pr-2 !no-underline">or</p>
              <a
                className="pr-2 underline hover:text-amber-800"
                href="https://ko-fi.com/maintainerr_app"
                target="_blank"
              >
                Ko-fi
              </a>
            </div>
          </div>
        </div>
      </div>
      <hr className="h-px border-0 bg-gray-200 dark:bg-gray-700"></hr>
      {/* End Userful Links */}
      {/* Show Releases */}
      <div className="section">
        <Releases currentVersion={version} />
      </div>
      {/* End Showing Releases */}
    </div>
  )
}
export default AboutSettings

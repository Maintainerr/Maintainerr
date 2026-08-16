import {
  FilterIcon,
  SearchIcon,
  SortAscendingIcon,
  SortDescendingIcon,
} from '@heroicons/react/outline'
import { plural } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  CollectionLogMetaMediaAddedByRule,
  CollectionLogMetaMediaRemovedByRule,
  ECollectionLogType,
} from '@maintainerr/contracts'
import { useRef, useState } from 'react'
import YAML from 'yaml'
import { ICollection } from '../..'
import { collectionLogTypeLabels } from './collectionLogLabels'
import CollectionLogsTable from './CollectionLogsTable'
import useDebouncedState from '../../../..//hooks/useDebouncedState'
import Alert from '../../../Common/Alert'
import Button from '../../../Common/Button'
import LazyMonacoEditor from '../../../Common/LazyMonacoEditor'
import Modal from '../../../Common/Modal'
import { FieldJoin, Input, InputAdornment } from '../../../Forms/Input'
import { Select, SelectAdornment } from '../../../Forms/Select'

interface ICollectionInfo {
  collection: ICollection
}

const CollectionInfo = (props: ICollectionInfo) => {
  const { t } = useLingui()
  const [searchFilter, debouncedSearchFilter, setSearchFilter] =
    useDebouncedState('')
  const [currentSort, setCurrentSort] = useState<'ASC' | 'DESC'>('DESC')
  const [currentFilter, setCurrentFilter] = useState<ECollectionLogType | -1>(
    -1,
  )
  const [showMeta, setShowMeta] =
    useState<Pick<LogMetaModalProps, 'meta' | 'title'>>()

  return (
    <>
      <div className="w-full">
        <ul className="collection-info">
          <li key={`collection-info-added`}>
            <span>
              <Trans>Date Added</Trans>
            </span>
            <p className="collection-info-item">
              {props.collection.addDate
                ? new Date(props.collection.addDate).toLocaleDateString()
                : '-'}
            </p>
          </li>
          <li key={`collection-info-handled`}>
            <span>
              <Trans>Handled media items</Trans>
            </span>
            <p className="collection-info-item">
              {props.collection.handledMediaAmount}
            </p>
          </li>
          <li key={`collection-info-duration`}>
            <span>
              <Trans>Last duration</Trans>
            </span>
            <p className="collection-info-item">
              {props.collection.lastDurationInSeconds
                ? formatDuration(props.collection.lastDurationInSeconds)
                : '-'}
            </p>
          </li>
        </ul>

        <div className="heading mt-5 font-bold text-zinc-300">
          <h2>
            <Trans>Logs</Trans>
          </h2>
        </div>

        <div className="w-full pr-2 pl-2">
          {/* full container */}
          <div className="mb-2 flex grow flex-col sm:grow-0 sm:flex-row sm:justify-end">
            {/* search */}
            <div className="mt-4 mr-2 flex w-full grow sm:w-1/2">
              <FieldJoin>
                <InputAdornment>
                  <SearchIcon className="h-6 w-6" />
                </InputAdornment>
                <Input
                  type="text"
                  name="log-search"
                  join="right"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value as string)}
                />
              </FieldJoin>
            </div>

            {/* sort/filter container */}
            <div className="mb-2 flex flex-1 flex-row justify-between sm:mb-0 sm:flex-none">
              {/* sort */}
              <div className="mt-4 mr-2 flex grow sm:w-auto">
                <FieldJoin>
                  <SelectAdornment>
                    {currentSort === 'DESC' ? (
                      <SortDescendingIcon className="h-6 w-6" />
                    ) : (
                      <SortAscendingIcon className="h-6 w-6" />
                    )}
                  </SelectAdornment>
                  <div className="min-w-0 flex-1">
                    <Select
                      id="sort"
                      name="sort"
                      onChange={(e) => {
                        setCurrentSort(e.target.value as 'ASC' | 'DESC')
                      }}
                      value={currentSort}
                      join="right"
                    >
                      <option value="DESC">{t`Descending`}</option>
                      <option value="ASC">{t`Ascending`}</option>
                    </Select>
                  </div>
                </FieldJoin>
              </div>

              {/* filter */}
              <div className="mt-4 flex grow sm:w-auto">
                <FieldJoin>
                  <SelectAdornment>
                    <FilterIcon className="h-6 w-6" />
                  </SelectAdornment>
                  <div className="min-w-0 flex-1">
                    <Select
                      id="filter"
                      name="filter"
                      onChange={(e) => {
                        setCurrentFilter(+e.target.value as ECollectionLogType)
                      }}
                      value={currentFilter}
                      join="right"
                    >
                      <option
                        key={`filter-option-all`}
                        value={-1}
                        aria-label={t`No filter`}
                      />

                      {Object.values(ECollectionLogType)
                        .filter((value) => typeof value === 'number')
                        .map((value, index) => {
                          return (
                            <option
                              key={`filter-option-${index}`}
                              value={+value}
                            >
                              {t(
                                collectionLogTypeLabels[
                                  +value as ECollectionLogType
                                ],
                              )}
                            </option>
                          )
                        })}
                    </Select>
                  </div>
                </FieldJoin>
              </div>
            </div>
          </div>

          {/* data */}
          <CollectionLogsTable
            key={`${props.collection.id}:${currentSort}:${currentFilter}:${debouncedSearchFilter}`}
            collection={props.collection}
            searchFilter={debouncedSearchFilter}
            currentSort={currentSort}
            currentFilter={currentFilter}
            onShowMeta={setShowMeta}
          />
        </div>
      </div>
      {showMeta ? (
        <LogMetaModal onClose={() => setShowMeta(undefined)} {...showMeta} />
      ) : undefined}
    </>
  )
}

// Each unit is its own plural message: languages pluralise "2 minutes"
// differently, and a suffixed "s" only works in English.
const durationUnits = [
  {
    seconds: 31536000,
    format: (count: number) =>
      plural(count, { one: '# year', other: '# years' }),
  },
  {
    seconds: 2592000,
    format: (count: number) =>
      plural(count, { one: '# month', other: '# months' }),
  },
  {
    seconds: 86400,
    format: (count: number) => plural(count, { one: '# day', other: '# days' }),
  },
  {
    seconds: 3600,
    format: (count: number) =>
      plural(count, { one: '# hour', other: '# hours' }),
  },
  {
    seconds: 60,
    format: (count: number) =>
      plural(count, { one: '# minute', other: '# minutes' }),
  },
  {
    seconds: 1,
    format: (count: number) =>
      plural(count, { one: '# second', other: '# seconds' }),
  },
]

const formatDuration = (seconds: number) => {
  const parts = []

  for (const unit of durationUnits) {
    const value = Math.floor(seconds / unit.seconds)

    if (value > 0) {
      parts.push(unit.format(value))
      seconds -= value * unit.seconds
    }
  }

  if (parts.length > 0) {
    return parts.join(', ')
  }

  // Named `count` so this extracts to the same message the unit formatter
  // above produces, rather than a second copy keyed on a bare {0}.
  const count = 0
  return plural(count, { one: '# second', other: '# seconds' })
}

export default CollectionInfo

interface LogMetaModalProps {
  onClose: () => void
  title: string
  meta: CollectionLogMetaMediaAddedByRule | CollectionLogMetaMediaRemovedByRule
}

const LogMetaModal = (props: LogMetaModalProps) => {
  const { t } = useLingui()
  const editorRef = useRef(undefined)

  function handleEditorDidMount(editor: any) {
    editorRef.current = editor
  }

  return (
    <div className={'h-full w-full'}>
      <Modal
        loading={false}
        backgroundClickable={false}
        title={t`Metadata`}
        footerActions={
          <Button buttonType="primary" className="ml-3" onClick={props.onClose}>
            <Trans>Close</Trans>
          </Button>
        }
      >
        <div className="h-[80vh] overflow-hidden">
          <div className="mt-1">
            <Alert type="info">
              <Trans>
                Below are the rule evaluation results that triggered this
                action. The output follows the same format as Test Media. Refer
                to the documentation for guidance on interpreting this output.
              </Trans>
            </Alert>
          </div>
          {/* Not a <label htmlFor>: the output is a Monaco editor, not a
              labelable control, so the association is made with
              aria-labelledby on the editor container instead. */}
          <span id="collection-info-output-label" className="text-label mb-3">
            <Trans>Output</Trans>
          </span>
          <div
            className="editor-container h-full"
            role="group"
            aria-labelledby="collection-info-output-label"
          >
            <LazyMonacoEditor
              options={{ readOnly: true, minimap: { enabled: false } }}
              defaultLanguage="yaml"
              theme="vs-dark"
              value={YAML.stringify(props.meta.data)}
              onMount={handleEditorDidMount}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

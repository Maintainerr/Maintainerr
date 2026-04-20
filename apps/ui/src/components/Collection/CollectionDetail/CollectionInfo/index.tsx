import {
  FilterIcon,
  SearchIcon,
  SortAscendingIcon,
  SortDescendingIcon,
} from '@heroicons/react/outline'
import { DocumentTextIcon } from '@heroicons/react/solid'
import {
  CollectionLogDto,
  CollectionLogMetaMediaAddedByRule,
  CollectionLogMetaMediaRemovedByRule,
  ECollectionLogType,
  isMetaActionedByRule,
} from '@maintainerr/contracts'
import { useRef, useState } from 'react'
import YAML from 'yaml'
import { ICollection } from '../..'
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
            <span>Date Added</span>
            <p className="collection-info-item">
              {props.collection.addDate
                ? new Date(props.collection.addDate).toLocaleDateString()
                : '-'}
            </p>
          </li>
          <li key={`collection-info-handled`}>
            <span>Handled media items</span>
            <p className="collection-info-item">
              {props.collection.handledMediaAmount}
            </p>
          </li>
          <li key={`collection-info-duration`}>
            <span>Last duration</span>
            <p className="collection-info-item">
              {props.collection.lastDurationInSeconds
                ? formatDuration(props.collection.lastDurationInSeconds)
                : '-'}
            </p>
          </li>
        </ul>

        <div className="heading mt-5 font-bold text-zinc-300">
          <h2>{'Logs'}</h2>
        </div>

        <div className="w-full pl-2 pr-2">
          {/* full container */}
          <div className="mb-2 flex flex-grow flex-col sm:flex-grow-0 sm:flex-row sm:justify-end">
            {/* search */}
            <div className="mr-2 mt-4 flex w-full flex-grow sm:w-1/2">
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
              <div className="mr-2 mt-4 flex flex-grow sm:w-auto">
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
                      <option value="DESC">{'Descending'}</option>
                      <option value="ASC">{'Ascending'}</option>
                    </Select>
                  </div>
                </FieldJoin>
              </div>

              {/* filter */}
              <div className="mt-4 flex flex-grow sm:w-auto">
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
                      <option key={`filter-option-all`} value={-1}>
                        -
                      </option>
                      {Object.values(ECollectionLogType)
                        .filter((value) => typeof value === 'number')
                        .map((value, index) => {
                          return (
                            <option
                              key={`filter-option-${index}`}
                              value={+value}
                            >
                              {ECollectionLogType[+value]
                                .charAt(0)
                                .toUpperCase() +
                                ECollectionLogType[+value]
                                  .slice(1)
                                  .toLowerCase()}
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

const formatDuration = (seconds: number) => {
  const intervals = [
    { label: 'year', seconds: 31536000 },
    { label: 'month', seconds: 2592000 },
    { label: 'day', seconds: 86400 },
    { label: 'hour', seconds: 3600 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 },
  ]

  const parts = []

  for (const interval of intervals) {
    const value = Math.floor(seconds / interval.seconds)

    if (value > 0) {
      parts.push(`${value} ${interval.label}${value !== 1 ? 's' : ''}`)
      seconds -= value * interval.seconds
    }
  }

  return parts.length > 0 ? parts.join(', ') : '0 seconds'
}

export default CollectionInfo

interface LogMetaModalProps {
  onClose: () => void
  title: string
  meta: CollectionLogMetaMediaAddedByRule | CollectionLogMetaMediaRemovedByRule
}

const LogMetaModal = (props: LogMetaModalProps) => {
  const editorRef = useRef(undefined)

  function handleEditorDidMount(editor: any) {
    editorRef.current = editor
  }

  return (
    <div className={'h-full w-full'}>
      <Modal
        loading={false}
        backgroundClickable={false}
        title={'Metadata'}
        footerActions={
          <Button buttonType="primary" className="ml-3" onClick={props.onClose}>
            Close
          </Button>
        }
      >
        <div className="h-[80vh] overflow-hidden">
          <div className="mt-1">
            <Alert type="info">
              Below are the rule evaluation results that triggered this action.
              The output follows the same format as Test Media. Refer to the
              documentation for guidance on interpreting this output.
            </Alert>
          </div>
          <label htmlFor={`editor-field`} className="text-label mb-3">
            Output
          </label>
          <div className="editor-container h-full">
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

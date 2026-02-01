import { ClipboardCopyIcon } from '@heroicons/react/solid'
import { MediaItemType } from '@maintainerr/contracts'
import { Editor } from '@monaco-editor/react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import YAML from 'yaml'
import { useRuleGroupForCollection } from '../../../../api/rules'
import GetApiHandler, { PostApiHandler } from '../../../../utils/ApiHandler'
import Alert from '../../../Common/Alert'
import FormItem from '../../../Common/FormItem'
import Modal from '../../../Common/Modal'
import SearchMediaItem, { IMediaOptions } from '../../../Common/SearchMediaITem'

interface ITestMediaItem {
  onCancel: () => void
  onSubmit: () => void
  collectionId: number
}

interface IOptions {
  id: number | string
  title: string
}

interface IComparisonResult {
  code: 1 | 0
  result: any
}

const emptyOption: IOptions = {
  id: -1,
  title: '-',
}

const TestMediaItem = (props: ITestMediaItem) => {
  const [mediaItem, setMediaItem] = useState<IMediaOptions>()
  const [selectedSeasons, setSelectedSeasons] = useState<number | string>(-1)
  const [selectedEpisodes, setSelectedEpisodes] = useState<number | string>(-1)
  const [seasonOptions, setSeasonOptions] = useState<IOptions[]>([emptyOption])
  const [episodeOptions, setEpisodeOptions] = useState<IOptions[]>([
    emptyOption,
  ])
  const [comparisonResult, setComparisonResult] = useState<IComparisonResult>()
  const editorRef = useRef(undefined)

  const ruleGroupQuery = useRuleGroupForCollection(props.collectionId)
  const ruleGroup = ruleGroupQuery.data

  const clearEditor = () => {
    if (editorRef.current) {
      ;(editorRef.current as any).setValue('')
      setComparisonResult(undefined)
    }
  }

  const testable = useMemo(() => {
    if (!mediaItem || !ruleGroup) return false

    // if movies or shows is selected
    if (ruleGroup.dataType === 'movie' || ruleGroup.dataType === 'show') {
      return true
    }

    // if seasons & season is selected
    else if (ruleGroup.dataType === 'season' && selectedSeasons !== -1) {
      return true
    }
    // if episodes mediaitem, season & episode is selected
    else if (
      ruleGroup.dataType === 'episode' &&
      selectedSeasons !== -1 &&
      selectedEpisodes !== -1
    ) {
      return true
    }

    return false
  }, [mediaItem, selectedSeasons, selectedEpisodes])

  function handleEditorDidMount(editor: any) {
    editorRef.current = editor
  }

  const updateMediaItem = (item: IMediaOptions) => {
    setMediaItem(item)
    updateSelectedSeasons(-1)
    setSeasonOptions([emptyOption])
    clearEditor()

    if (item?.type === 'show') {
      // get seasons
      GetApiHandler(`/media-server/meta/${item.id}/children`).then(
        (resp: { id: string; title: string }[]) => {
          setSeasonOptions([
            emptyOption,
            ...resp.map((el) => {
              return {
                id: el.id,
                title: el.title,
              } as IOptions
            }),
          ])
        },
      )
    }
  }

  const updateSelectedSeasons = (seasons: number | string) => {
    setSelectedSeasons(seasons)
    setSelectedEpisodes(-1)
    setEpisodeOptions([emptyOption])
    clearEditor()

    if (seasons !== -1) {
      // get episodes
      GetApiHandler(`/media-server/meta/${seasons}/children`).then(
        (resp: { id: string; index: number }[]) => {
          setEpisodeOptions([
            emptyOption,
            ...resp.map((el) => {
              return {
                id: el.id,
                title: `Episode ${el.index}`,
              } as IOptions
            }),
          ])
        },
      )
    }
  }

  const updateSelectedEpisodes = (episodes: number | string) => {
    setSelectedEpisodes(episodes)
    clearEditor()
  }

  const onSubmit = async () => {
    setComparisonResult(undefined)

    if (!ruleGroup) return

    const result = await PostApiHandler(`/rules/test`, {
      rulegroupId: ruleGroup.id,
      mediaId: selectedMediaId,
    })

    setComparisonResult(result)
  }

  const selectedMediaId = useMemo(() => {
    if (mediaItem) {
      return selectedEpisodes !== -1
        ? selectedEpisodes
        : selectedSeasons !== -1
          ? selectedSeasons
          : mediaItem?.id
    }
  }, [selectedSeasons, selectedEpisodes, mediaItem])

  if (ruleGroupQuery.isLoading || !ruleGroup) {
    return null
  }

  const copyToClipboard = async () => {
    const value = (editorRef.current as any)?.getValue?.()
    if (!value?.trim()) return

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        throw new Error('Clipboard not available')
      }
      toast.success('Copied to clipboard')
    } catch {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        toast.success('Copied to clipboard')
      } catch {
        toast.error('Failed to copy to clipboard')
      }
    }
  }

  return (
    <div className={'h-full w-full'}>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={props.onCancel}
        cancelText="Close"
        okDisabled={!testable}
        onOk={onSubmit}
        okText={'Test'}
        okButtonType={'primary'}
        title={'Test Media'}
        iconSvg={''}
      >
        <div className="h-[80vh] overflow-hidden">
          <div className="mt-1">
            <Alert type="info">
              {`Search for media items and validate them against the specified rule. The result will be a YAML document containing the validated steps.
            `}
              <br />
              <br />
              {`The rule group is of type ${
                ruleGroup.dataType === 'movie'
                  ? 'movies'
                  : ruleGroup.dataType === 'season'
                    ? 'seasons'
                    : ruleGroup.dataType === 'episode'
                      ? 'episodes'
                      : 'series'
              }, as a result only media of type ${
                ruleGroup.dataType === 'movie' ? 'movies' : 'series'
              } will be displayed in the search bar.`}
            </Alert>
          </div>
          <FormItem label="Media">
            <SearchMediaItem
              mediatype={ruleGroup.dataType}
              libraryId={ruleGroup.libraryId}
              onChange={(el) => {
                updateMediaItem(el as unknown as IMediaOptions)
              }}
            />
          </FormItem>

          {/* seasons */}
          <div className="w-full">
            {ruleGroup.dataType === 'season' ||
            ruleGroup.dataType === 'episode' ? (
              <FormItem label="Season">
                <select
                  name={`Seasons-field`}
                  id={`Seasons-field`}
                  value={selectedSeasons}
                  onChange={(e: { target: { value: string } }) => {
                    const value = e.target.value
                    updateSelectedSeasons(value === '-1' ? -1 : value)
                  }}
                >
                  {seasonOptions.map((e: IOptions) => {
                    return (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    )
                  })}
                </select>
              </FormItem>
            ) : undefined}

            {ruleGroup.dataType === 'episode' ? (
              // episodes
              <FormItem label="Episode">
                <select
                  name={`episode-field`}
                  id={`episode-field`}
                  value={selectedEpisodes}
                  onChange={(e: { target: { value: string } }) => {
                    const value = e.target.value
                    updateSelectedEpisodes(value === '-1' ? -1 : value)
                  }}
                >
                  {episodeOptions.map((e: IOptions) => {
                    return (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    )
                  })}
                </select>
              </FormItem>
            ) : undefined}
          </div>
          <div className="mb-2 flex justify-between">
            <label htmlFor="editor-field" className="text-label">
              Output
            </label>
            {comparisonResult && (
              <button
                onClick={copyToClipboard}
                title="Copy to clipboard"
                aria-label="Copy to clipboard"
              >
                <ClipboardCopyIcon className="h-5 w-5 text-amber-600 hover:text-amber-500" />
              </button>
            )}
          </div>
          <div className="editor-container h-full">
            <Editor
              options={{ readOnly: true, minimap: { enabled: false } }}
              defaultLanguage="yaml"
              theme="vs-dark"
              value={
                comparisonResult ? YAML.stringify(comparisonResult.result) : ''
              }
              onMount={handleEditorDidMount}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default TestMediaItem

import { ClipboardCopyIcon } from '@heroicons/react/solid'
import { Editor } from '@monaco-editor/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import YAML from 'yaml'
import GetApiHandler, { PostApiHandler } from '../../../../utils/ApiHandler'
import { EPlexDataType } from '../../../../utils/PlexDataType-enum'
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
  id: number
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
  const [loading, setLoading] = useState(true)
  const [ruleGroup, setRuleGroup] = useState<{
    dataType: EPlexDataType
    libraryId: number
    id: string
  }>()

  const [mediaItem, setMediaItem] = useState<IMediaOptions>()
  const [selectedSeasons, setSelectedSeasons] = useState<number>(-1)
  const [selectedEpisodes, setSelectedEpisodes] = useState<number>(-1)
  const [seasonOptions, setSeasonOptions] = useState<IOptions[]>([emptyOption])
  const [episodeOptions, setEpisodeOptions] = useState<IOptions[]>([
    emptyOption,
  ])
  const [comparisonResult, setComparisonResult] = useState<IComparisonResult>()
  const editorRef = useRef(undefined)

  useEffect(() => {
    GetApiHandler(`/rules/collection/${props.collectionId}`).then((resp) => {
      setRuleGroup(resp)
      setLoading(false)
    })
  }, [])

  const testable = useMemo(() => {
    if (!mediaItem || !ruleGroup) return false

    // if movies or shows is selected
    if (
      ruleGroup.dataType === EPlexDataType.MOVIES ||
      ruleGroup.dataType === EPlexDataType.SHOWS
    ) {
      return true
    }

    // if seasons & season is selected
    else if (
      ruleGroup.dataType === EPlexDataType.SEASONS &&
      selectedSeasons !== -1
    ) {
      return true
    }
    // if episodes mediaitem, season & episode is selected
    else if (
      ruleGroup.dataType === EPlexDataType.EPISODES &&
      selectedSeasons !== -1 &&
      selectedEpisodes !== -1
    ) {
      return true
    }

    return false
  }, [mediaItem, selectedSeasons, selectedEpisodes])

  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current = editor
  }

  const updateMediaItem = (item: IMediaOptions) => {
    setMediaItem(item)
    updateSelectedSeasons(-1)
    setSeasonOptions([emptyOption])

    if (item?.type == EPlexDataType.SHOWS) {
      // get seasons
      GetApiHandler(`/plex/meta/${item.id}/children`).then(
        (resp: [{ ratingKey: number; title: string }]) => {
          setSeasonOptions([
            emptyOption,
            ...resp.map((el) => {
              return {
                id: el.ratingKey,
                title: el.title,
              }
            }),
          ])
        },
      )
    }
  }

  const updateSelectedSeasons = (seasons: number) => {
    setSelectedSeasons(seasons)
    setSelectedEpisodes(-1)
    setEpisodeOptions([emptyOption])

    if (seasons !== -1) {
      // get episodes
      GetApiHandler(`/plex/meta/${seasons}/children`).then(
        (resp: [{ ratingKey: number; index: number }]) => {
          setEpisodeOptions([
            emptyOption,
            ...resp.map((el) => {
              return {
                id: el.ratingKey,
                title: `Episode ${el.index}`,
              }
            }),
          ])
        },
      )
    }
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

  useEffect(() => {
    if (editorRef.current) {
      ;(editorRef.current as any).setValue('')
      setComparisonResult(undefined)
    }
  }, [selectedSeasons, selectedEpisodes, mediaItem])

  if (loading || !ruleGroup) {
    return
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
                ruleGroup.dataType === EPlexDataType.MOVIES
                  ? 'movies'
                  : ruleGroup.dataType === EPlexDataType.SEASONS
                    ? 'seasons'
                    : ruleGroup.dataType === EPlexDataType.EPISODES
                      ? 'episodes'
                      : 'series'
              }, as a result only media of type ${
                ruleGroup.dataType === EPlexDataType.MOVIES
                  ? 'movies'
                  : 'series'
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
            {ruleGroup.dataType === EPlexDataType.SEASONS ||
            ruleGroup.dataType === EPlexDataType.EPISODES ? (
              <FormItem label="Season">
                <select
                  name={`Seasons-field`}
                  id={`Seasons-field`}
                  value={selectedSeasons}
                  onChange={(e: { target: { value: string } }) => {
                    updateSelectedSeasons(+e.target.value)
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

            {ruleGroup.dataType === EPlexDataType.EPISODES ? (
              // episodes
              <FormItem label="Episode">
                <select
                  name={`episode-field`}
                  id={`episode-field`}
                  value={selectedEpisodes}
                  onChange={(e: { target: { value: string } }) => {
                    setSelectedEpisodes(+e.target.value)
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

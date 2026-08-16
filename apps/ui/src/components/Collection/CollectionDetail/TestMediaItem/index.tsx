import { t as globalT } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import { BeakerIcon, ClipboardCopyIcon } from '@heroicons/react/solid'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import YAML from 'yaml'
import { useRuleGroupForCollection } from '../../../../api/rules'
import GetApiHandler, { PostApiHandler } from '../../../../utils/ApiHandler'
import Alert from '../../../Common/Alert'
import FormItem from '../../../Common/FormItem'
import LazyMonacoEditor from '../../../Common/LazyMonacoEditor'
import Modal from '../../../Common/Modal'
import PendingButton from '../../../Common/PendingButton'
import SearchMediaItem, { IMediaOptions } from '../../../Common/SearchMediaITem'
import { Select } from '../../../Forms/Select'

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
  const { t } = useLingui()
  const [mediaItem, setMediaItem] = useState<IMediaOptions>()
  const [selectedSeasons, setSelectedSeasons] = useState<number | string>(-1)
  const [selectedEpisodes, setSelectedEpisodes] = useState<number | string>(-1)
  const [seasonOptions, setSeasonOptions] = useState<IOptions[]>([emptyOption])
  const [episodeOptions, setEpisodeOptions] = useState<IOptions[]>([
    emptyOption,
  ])
  const [comparisonResult, setComparisonResult] = useState<IComparisonResult>()
  const [testing, setTesting] = useState(false)
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
  }, [mediaItem, ruleGroup, selectedSeasons, selectedEpisodes])

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
                title: globalT`Episode ${{ index: el.index }}`,
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

  const selectedMediaId = useMemo(() => {
    if (mediaItem) {
      return selectedEpisodes !== -1
        ? selectedEpisodes
        : selectedSeasons !== -1
          ? selectedSeasons
          : mediaItem?.id
    }
  }, [selectedSeasons, selectedEpisodes, mediaItem])

  const onSubmit = async () => {
    setComparisonResult(undefined)

    if (!ruleGroup) return

    setTesting(true)
    try {
      const result = await PostApiHandler(`/rules/test`, {
        rulegroupId: ruleGroup.id,
        mediaId: selectedMediaId,
      })

      setComparisonResult(result)
    } catch {
      toast.error(t`Failed to test media`)
    } finally {
      setTesting(false)
    }
  }

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
      toast.success(t`Copied to clipboard`)
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
        toast.success(t`Copied to clipboard`)
      } catch {
        toast.error(t`Failed to copy to clipboard`)
      }
    }
  }

  return (
    <div className={'h-full w-full'}>
      <Modal
        loading={false}
        backgroundClickable={false}
        onCancel={props.onCancel}
        cancelText={t`Close`}
        title={t`Test Media`}
        iconSvg={''}
        footerActions={
          <PendingButton
            buttonType="primary"
            className="ml-3"
            type="button"
            disabled={!testable || testing}
            isPending={testing}
            idleLabel={t`Test`}
            pendingLabel={t`Testing...`}
            idleIcon={<BeakerIcon />}
            onClick={() => void onSubmit()}
          />
        }
      >
        <div className="h-[80vh] overflow-hidden">
          <div className="mt-1">
            <Alert type="info">
              <Trans>
                Search for media items and validate them against the specified
                rule. The result will be a YAML document containing the
                validated steps.
              </Trans>
              <br />
              <br />
              {ruleGroup.dataType === 'movie'
                ? t`The rule group is of type movies, as a result only media of type movies will be displayed in the search bar.`
                : ruleGroup.dataType === 'season'
                  ? t`The rule group is of type seasons, as a result only media of type series will be displayed in the search bar.`
                  : ruleGroup.dataType === 'episode'
                    ? t`The rule group is of type episodes, as a result only media of type series will be displayed in the search bar.`
                    : t`The rule group is of type series, as a result only media of type series will be displayed in the search bar.`}
            </Alert>
          </div>
          <FormItem label={t`Media`} htmlField="media">
            <SearchMediaItem
              inputId="media-field"
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
              <FormItem label={t`Season`} htmlField="Seasons">
                <Select
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
                </Select>
              </FormItem>
            ) : undefined}

            {ruleGroup.dataType === 'episode' ? (
              // episodes
              <FormItem label={t`Episode`} htmlField="episode">
                <Select
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
                </Select>
              </FormItem>
            ) : undefined}
          </div>
          <div className="mb-2 flex justify-between">
            {/* Not a <label htmlFor>: the output is a Monaco editor, not a
                labelable control, so the association is made with
                aria-labelledby on the editor container instead. */}
            <span id="test-media-output-label" className="text-label">
              <Trans>Output</Trans>
            </span>
            {comparisonResult && (
              <button
                onClick={copyToClipboard}
                title={t`Copy to clipboard`}
                aria-label={t`Copy to clipboard`}
              >
                <ClipboardCopyIcon className="h-5 w-5 text-maintainerr-600 hover:text-maintainerr" />
              </button>
            )}
          </div>
          <div
            className="editor-container h-full"
            role="group"
            aria-labelledby="test-media-output-label"
          >
            <LazyMonacoEditor
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

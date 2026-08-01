import { BasicResponseDto, MediaItemType } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { invalidateCollectionQueries } from '../../api/collections'
import { getApiErrorMessage } from '../../utils/ApiError'
import GetApiHandler, { PostApiHandler } from '../../utils/ApiHandler'
import Alert from '../Common/Alert'
import {
  clearMaintainerrStatusDetailsCache,
  fetchMaintainerrStatusDetails,
} from '../Common/MediaCard/maintainerrStatus'
import Button from '../Common/Button'
import FormItem from '../Common/FormItem'
import Modal from '../Common/Modal'
import { Select } from '../Forms/Select'
import { IAddModal, IAlterableMediaDto, ICollectionMedia } from './interfaces'

const AddModal = (props: IAddModal) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [selectedCollection, setSelectedCollection] = useState<
    number | string
  >()
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [forceRemovalCheck, setForceRemovalCheck] = useState(false)
  const [globalWarning, setGlobalWarning] = useState(false)
  const [affectedExclusions, setAffectedExclusions] = useState<
    { title: string; label: string; targetPath: string }[]
  >([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedAction, setSelectedAction] = useState<number>(0)
  // For show only. Undefined is "all", so the picker never carries a value the
  // media server would have to interpret.
  const [selectedSeasons, setSelectedSeasons] = useState<string>()
  const [selectedEpisodes, setSelectedEpisodes] = useState<string>()

  const [collectionOptions, setCollectionOptions] = useState<
    ICollectionMedia[]
  >([])
  const [seasonOptions, setSeasonOptions] = useState<ICollectionMedia[]>([
    {
      id: '',
      title: 'All seasons',
    },
  ])
  const [episodeOptions, setEpisodeOptions] = useState<ICollectionMedia[]>([
    {
      id: '',
      title: 'All episodes',
    },
  ])

  const origCollectionOptions = useMemo(
    () =>
      props.modalType === 'exclude'
        ? [
            {
              id: -1,
              title: 'All collections',
            },
          ]
        : [],
    [props.modalType],
  )

  // The context is the narrowest thing picked; with no season or episode
  // selected that is the item itself. Same shape as TestMediaItem.
  const selectedMediaId = useMemo(
    () => selectedEpisodes ?? selectedSeasons ?? props.mediaServerId,
    [selectedSeasons, selectedEpisodes, props.mediaServerId],
  )

  // Only a show narrows through the season and episode pickers; every other
  // item is its own context. Reporting a season or episode as a movie offered
  // it movie collections, which no media server accepts it into.
  const selectedContext = useMemo((): MediaItemType => {
    if (props.type !== 'show') {
      return props.type ?? 'movie'
    }

    if (selectedEpisodes) return 'episode'
    if (selectedSeasons) return 'season'
    return 'show'
  }, [selectedSeasons, selectedEpisodes, props.type])

  // A context resolves down the hierarchy but never up, so offer exactly the
  // collection types the current selection can produce.
  const collectionTypes = useMemo((): MediaItemType[] => {
    switch (selectedContext) {
      case 'show':
        return ['show', 'season', 'episode']
      case 'season':
        return ['season', 'episode']
      case 'episode':
        return ['episode']
      default:
        return ['movie']
    }
  }, [selectedContext])

  const currentCollectionId = selectedCollection ?? collectionOptions[0]?.id
  // Nothing in this library holds what the current selection resolves to, so
  // there is no choice to make and submitting cannot do anything.
  const noCollectionsAvailable = !loading && collectionOptions.length === 0

  const handleCancel = () => {
    props.onCancel()
  }

  const submitMedia = async () => {
    if (submitting) return
    setSubmitting(true)
    const mediaDto: IAlterableMediaDto = {
      id: selectedMediaId,
      type: selectedContext,
    }

    try {
      if (props.modalType === 'add') {
        await PostApiHandler(`/collections/media/add`, {
          mediaId: props.mediaServerId,
          context: mediaDto,
          collectionId: currentCollectionId,
          action: selectedAction,
        })

        await invalidateCollectionQueries(queryClient)
      } else {
        // The exclusion endpoint reports its own failures in the body rather
        // than the status code, so a rejected exclusion looked successful.
        const result = await PostApiHandler<BasicResponseDto>(
          '/rules/exclusion',
          {
            mediaId: props.mediaServerId,
            context: mediaDto,
            collectionId:
              currentCollectionId !== -1 ? currentCollectionId : undefined,
            action: selectedAction,
          },
        )

        if (result?.code !== 1) {
          throw new Error(result?.message ?? 'The exclusion could not be saved')
        }
      }

      props.onSubmit()
    } catch (error) {
      setSubmitting(false)
      setErrorMessage(
        getApiErrorMessage(
          error,
          props.modalType === 'add'
            ? 'The collection could not be updated'
            : 'The exclusion could not be updated',
        ),
      )
    }
  }

  const handleOk = async () => {
    if (submitting || noCollectionsAvailable) return

    // Only ADDING a global exclusion clears the item's rule-group exclusions.
    // If it has any, warn and list each as "item - rule group", reusing the
    // backdrop's status data (no-cache fetch) so labels/links match and stay
    // fresh. (selectedAction 0 = Add, 1 = Remove.)
    if (
      props.modalType === 'exclude' &&
      selectedAction === 0 &&
      currentCollectionId === -1
    ) {
      // Best-effort: if either read fails we can't build the warning, so fall
      // through and submit rather than blocking the exclusion the user asked for.
      try {
        const [meta, status] = await Promise.all([
          GetApiHandler<{ title?: string }>(
            `/media-server/meta/${props.mediaServerId}`,
          ),
          fetchMaintainerrStatusDetails({
            id: props.mediaServerId,
            getApiHandler: GetApiHandler,
          }),
        ])
        const scoped = status.excludedFrom.filter((e) => e.targetPath)

        if (scoped.length > 0) {
          const title = meta?.title ?? String(props.mediaServerId)
          setAffectedExclusions(
            scoped.map((e) => ({
              title,
              label: e.label,
              targetPath: e.targetPath as string,
            })),
          )
          setGlobalWarning(true)
          return
        }
      } catch {
        // Warning data unavailable - proceed without it.
      }
    }

    await submitMedia()
  }

  const handleForceRemoval = async () => {
    if (submitting) return
    setSubmitting(true)
    setForceRemovalCheck(false)
    try {
      if (props.modalType === 'add') {
        await PostApiHandler(`/collections/media/add`, {
          mediaId: props.mediaServerId,
          context: { id: props.mediaServerId, type: props.type },
          collectionId: undefined,
          action: 1,
        })

        await invalidateCollectionQueries(queryClient)
      }
      props.onSubmit()
    } catch (error) {
      setSubmitting(false)
      setErrorMessage(
        getApiErrorMessage(
          error,
          'The media could not be removed from all collections',
        ),
      )
    }
  }

  useEffect(() => {
    if (props.type && props.type === 'show') {
      GetApiHandler(`/media-server/meta/${props.mediaServerId}/children`)
        .then((resp: { id: string; title: string }[]) => {
          setSeasonOptions([
            {
              id: '',
              title: 'All seasons',
            },
            ...resp.map((el) => {
              return {
                id: el.id,
                title: el.title,
              } as ICollectionMedia
            }),
          ])
        })
        .catch((error) =>
          setErrorMessage(
            getApiErrorMessage(error, 'Could not load the seasons'),
          ),
        )
        .finally(() => setLoading(false))
    }
  }, [props.mediaServerId, props.type])

  useEffect(() => {
    if (!selectedSeasons) return

    // A slower read for the season the user just moved off would otherwise
    // land last and list the wrong season's episodes.
    let current = true

    GetApiHandler(`/media-server/meta/${selectedSeasons}/children`)
      .then((resp: { id: string; index: number }[]) => {
        if (!current) return
        setEpisodeOptions([
          {
            id: '',
            title: 'All episodes',
          },
          ...resp.map((el) => {
            return {
              id: el.id,
              title: `Episode ${el.index}`,
            } as ICollectionMedia
          }),
        ])
      })
      .catch((error) => {
        if (current)
          setErrorMessage(
            getApiErrorMessage(error, 'Could not load the episodes'),
          )
      })
      .finally(() => {
        if (current) setLoading(false)
      })

    return () => {
      current = false
    }
  }, [selectedSeasons])

  useEffect(() => {
    // A collection only accepts items from its own library, so offering the
    // other libraries' collections only produces a rejected add.
    const libraryQuery = props.libraryId
      ? `&libraryId=${encodeURIComponent(props.libraryId)}`
      : ''

    // A slower read for the wider selection the user just moved off would
    // otherwise land last and re-offer collection types this one cannot fill.
    let current = true

    Promise.all(
      collectionTypes.map((type) =>
        GetApiHandler<ICollectionMedia[]>(
          `/collections?typeId=${type}${libraryQuery}`,
        ),
      ),
    )
      .then((responses) => {
        if (!current) return
        const options = [...origCollectionOptions, ...responses.flat()]
        setCollectionOptions(options)
        // Narrowing to a season or episode drops the wider collection types,
        // so a selection made before that can no longer be submitted.
        setSelectedCollection((selected) =>
          options.some((option) => option.id === selected)
            ? selected
            : undefined,
        )
      })
      .catch((error) => {
        if (current)
          setErrorMessage(
            getApiErrorMessage(error, 'Could not load the collections'),
          )
      })
      .finally(() => {
        if (current) setLoading(false)
      })

    return () => {
      current = false
    }
  }, [origCollectionOptions, collectionTypes, props.libraryId])

  return (
    <>
      <Modal
        loading={loading}
        backgroundClickable={false}
        onCancel={handleCancel}
        title={
          props.modalType === 'add' ? 'Add / Remove Media' : 'Exclude Media'
        }
        footerActions={
          <Button
            buttonType="primary"
            className="ml-3"
            disabled={submitting || noCollectionsAvailable}
            onClick={handleOk}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        }
        iconSvg={''}
      >
        {forceRemovalCheck ? (
          <Modal
            loading={loading}
            backgroundClickable={false}
            onCancel={() => setForceRemovalCheck(false)}
            title={'Confirmation Required'}
            footerActions={
              <Button
                buttonType="primary"
                className="ml-3"
                onClick={handleForceRemoval}
              >
                Submit
              </Button>
            }
          >
            Are you certain you want to proceed? This action will remove the{' '}
            {props.modalType === 'add' ? 'media ' : 'exclusion '}
            from all collections. For shows, this entails removing all
            associated {props.modalType === 'add' ? '' : 'exclusions for '}
            seasons and episodes as well.
          </Modal>
        ) : undefined}

        {globalWarning ? (
          <Modal
            loading={loading}
            backgroundClickable={false}
            onCancel={() => setGlobalWarning(false)}
            title={'Confirmation Required'}
            footerActions={
              <Button
                buttonType="primary"
                className="ml-3"
                onClick={() => {
                  setGlobalWarning(false)
                  submitMedia()
                }}
              >
                Proceed
              </Button>
            }
          >
            Making this a global exclusion removes the following rule-group
            exclusions, and they will not return if you later remove the global
            exclusion:
            <ul className="mt-2 list-disc pl-5">
              {affectedExclusions.map((e) => (
                <li key={`${e.title}-${e.targetPath}`}>
                  {e.title} -{' '}
                  <button
                    type="button"
                    className="text-maintainerr underline transition hover:text-maintainerr-400"
                    onClick={() => {
                      // SPA nav (honours router basename); clear caches so the
                      // destination refetches fresh, as the old reload did.
                      props.onCancel()
                      clearMaintainerrStatusDetailsCache()
                      queryClient.invalidateQueries({
                        queryKey: ['collections'],
                      })
                      navigate(e.targetPath)
                    }}
                  >
                    {e.label}
                  </button>
                </li>
              ))}
            </ul>
          </Modal>
        ) : undefined}

        {noCollectionsAvailable ? (
          <Alert
            title="No collection in this library can take this item. Create one from a rule first."
            type="warning"
          />
        ) : undefined}

        {errorMessage ? <Alert title={errorMessage} type="error" /> : undefined}

        <div className="mt-6">
          <FormItem label="Action">
            <Select
              name={`Action-field`}
              id={`Action-field`}
              value={selectedAction}
              onChange={(e: { target: { value: string } }) => {
                setSelectedAction(+e.target.value)
              }}
            >
              <option value={0}>
                {props.modalType === 'add'
                  ? 'Add to collection'
                  : 'Add exclusion'}
              </option>
              <option value={1}>
                {props.modalType === 'add'
                  ? 'Remove from collection'
                  : 'Remove exclusion'}
              </option>
            </Select>
          </FormItem>

          {/* For shows */}
          {props.type === 'show' ? (
            <FormItem label="Seasons">
              <Select
                name={`Seasons-field`}
                id={`Seasons-field`}
                value={selectedSeasons ?? ''}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
                  setLoading(true)
                  setSelectedEpisodes(undefined)
                  setEpisodeOptions([
                    {
                      id: '',
                      title: 'All episodes',
                    },
                  ])
                  setSelectedSeasons(value || undefined)
                }}
              >
                {seasonOptions.map((e: ICollectionMedia) => {
                  return (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  )
                })}
              </Select>
            </FormItem>
          ) : undefined}
          {/* For shows and specific seasons */}
          {props.type === 'show' && selectedSeasons ? (
            <FormItem label="Episodes">
              <Select
                name={`Episodes-field`}
                id={`Episodes-field`}
                value={selectedEpisodes ?? ''}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
                  setLoading(true)
                  setSelectedEpisodes(value || undefined)
                }}
              >
                {episodeOptions.map((e: ICollectionMedia) => {
                  return (
                    <option key={e.id} value={e.id}>
                      {e.title}
                    </option>
                  )
                })}
              </Select>
            </FormItem>
          ) : undefined}

          <FormItem label="Collection">
            <Select
              name={`Collection-field`}
              id={`Collection-field`}
              value={currentCollectionId}
              onChange={(e: { target: { value: string } }) => {
                setSelectedCollection(+e.target.value)
              }}
            >
              {collectionOptions?.map((e: ICollectionMedia) => {
                return (
                  <option key={e?.id} value={e?.id}>
                    {e?.title}
                  </option>
                )
              })}
            </Select>
          </FormItem>
        </div>

        {props.modalType === 'add' ? (
          <div className="mt-4 flex justify-center sm:justify-end">
            <Button
              buttonType="warning"
              className="ml-3"
              onClick={() => setForceRemovalCheck(true)}
            >
              Remove from all collections
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
export default AddModal

import { MediaItemType } from '@maintainerr/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [alert, setAlert] = useState(false)
  const [forceRemovalcheck, setForceRemovalCheck] = useState(false)
  const [globalWarning, setGlobalWarning] = useState(false)
  const [affectedExclusions, setAffectedExclusions] = useState<
    { title: string; label: string; targetPath: string }[]
  >([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedAction, setSelectedAction] = useState<number>(0)
  // For show only
  const [selectedSeasons, setSelectedSeasons] = useState<number | string>(-1)
  const [selectedEpisodes, setSelectedEpisodes] = useState<number | string>(-1)

  const [collectionOptions, setCollectionOptions] = useState<
    ICollectionMedia[]
  >([])
  const [seasonOptions, setSeasonOptions] = useState<ICollectionMedia[]>([
    {
      id: -1,
      title: 'All seasons',
    },
  ])
  const [episodeOptions, setEpisodeOptions] = useState<ICollectionMedia[]>([
    {
      id: -1,
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

  const selectedMediaId = useMemo(() => {
    return props.type === 'movie'
      ? -1
      : selectedEpisodes !== -1
        ? selectedEpisodes
        : selectedSeasons
  }, [selectedSeasons, selectedEpisodes, props.type])

  const selectedContext = useMemo((): MediaItemType => {
    return props.type === 'show'
      ? selectedEpisodes !== -1
        ? 'episode'
        : selectedSeasons !== -1
          ? 'season'
          : 'show'
      : 'movie'
  }, [selectedSeasons, selectedEpisodes, props.type])

  const currentCollectionId = selectedCollection ?? collectionOptions[0]?.id

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

        await queryClient.invalidateQueries({
          queryKey: ['calendar', 'collections', 'overlay-data'],
        })
      } else {
        await PostApiHandler('/rules/exclusion', {
          mediaId: props.mediaServerId,
          context: mediaDto,
          collectionId:
            currentCollectionId !== -1 ? currentCollectionId : undefined,
          action: selectedAction,
        })
      }

      props.onSubmit()
    } catch {
      setSubmitting(false)
    }
  }

  const handleOk = async () => {
    if (submitting) return
    if (currentCollectionId === undefined) {
      setAlert(true)
      return
    }

    // Only ADDING a global exclusion clears the item's rule-group exclusions.
    // If it has any, warn and list each as "item — rule group", reusing the
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
        // Warning data unavailable — proceed without it.
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
          context: { id: -1, type: props.type },
          collectionId: undefined,
          action: 1,
        })

        await queryClient.invalidateQueries({
          queryKey: ['calendar', 'collections', 'overlay-data'],
        })
      }
      props.onSubmit()
    } catch {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (props.type && props.type === 'show') {
      GetApiHandler(`/media-server/meta/${props.mediaServerId}/children`).then(
        (resp: { id: string; title: string }[]) => {
          setSeasonOptions([
            {
              id: -1,
              title: 'All seasons',
            },
            ...resp.map((el) => {
              return {
                id: el.id,
                title: el.title,
              } as ICollectionMedia
            }),
          ])
          setLoading(false)
        },
      )
    }
  }, [props.mediaServerId, props.type])

  useEffect(() => {
    if (selectedSeasons !== -1) {
      GetApiHandler(`/media-server/meta/${selectedSeasons}/children`).then(
        (resp: { id: string; index: number }[]) => {
          setEpisodeOptions([
            {
              id: -1,
              title: 'All episodes',
            },
            ...resp.map((el) => {
              return {
                id: el.id,
                title: `Episode ${el.index}`,
              } as ICollectionMedia
            }),
          ])
          setLoading(false)
        },
      )
    }
  }, [selectedSeasons])

  useEffect(() => {
    if (props.type === 'show') {
      if (selectedEpisodes !== -1) {
        GetApiHandler(`/collections?typeId=episode`).then((resp) => {
          setCollectionOptions([...origCollectionOptions, ...resp])
          setLoading(false)
        })
      } else if (selectedSeasons !== -1) {
        GetApiHandler(`/collections?typeId=season`).then((resp) => {
          GetApiHandler(`/collections?typeId=episode`).then((resp2) => {
            setCollectionOptions([...origCollectionOptions, ...resp, ...resp2])
            setLoading(false)
          })
        })
      } else {
        GetApiHandler(`/collections?typeId=show`).then((resp) => {
          GetApiHandler(`/collections?typeId=season`).then((resp2) => {
            GetApiHandler(`/collections?typeId=episode`).then((resp3) => {
              setCollectionOptions([
                ...origCollectionOptions,
                ...resp,
                ...resp2,
                ...resp3,
              ])
              setLoading(false)
            })
          })
        })
      }
    } else {
      GetApiHandler(`/collections?typeId=movie`).then((resp) => {
        setCollectionOptions([...origCollectionOptions, ...resp])
        setLoading(false)
      })
    }
  }, [origCollectionOptions, props.type, selectedEpisodes, selectedSeasons])

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
            disabled={submitting}
            onClick={handleOk}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        }
        iconSvg={''}
      >
        {forceRemovalcheck ? (
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
                  {e.title} —{' '}
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

        {alert ? (
          <Alert title="Please select a collection" type="warning" />
        ) : undefined}

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
                value={selectedSeasons}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
                  setLoading(true)
                  setSelectedEpisodes(-1)
                  setEpisodeOptions([
                    {
                      id: -1,
                      title: 'All episodes',
                    },
                  ])
                  setSelectedSeasons(value === '-1' ? -1 : value)
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
          {props.type === 'show' && selectedSeasons !== -1 ? (
            <FormItem label="Episodes">
              <Select
                name={`Episodes-field`}
                id={`Episodes-field`}
                value={selectedEpisodes}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
                  setLoading(true)
                  setSelectedEpisodes(value === '-1' ? -1 : value)
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

import { MediaItemType } from '@maintainerr/contracts'
import { useEffect, useMemo, useState } from 'react'
import GetApiHandler, { PostApiHandler } from '../../utils/ApiHandler'
import Alert from '../Common/Alert'
import FormItem from '../Common/FormItem'
import Modal from '../Common/Modal'
import { IAddModal, IAlterableMediaDto, ICollectionMedia } from './interfaces'

const AddModal = (props: IAddModal) => {
  const [selectedCollection, setSelectedCollection] = useState<
    number | string
  >()
  const [loading, setLoading] = useState(true)
  const [alert, setAlert] = useState(false)
  const [forceRemovalcheck, setForceRemovalCheck] = useState(false)
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
  }, [selectedSeasons, selectedEpisodes])

  const selectedContext = useMemo((): MediaItemType => {
    return props.type === 'show'
      ? selectedEpisodes !== -1
        ? 'episode'
        : selectedSeasons !== -1
          ? 'season'
          : 'show'
      : 'movie'
  }, [selectedSeasons, selectedEpisodes, props.type])

  const handleCancel = () => {
    props.onCancel()
  }

  const handleOk = () => {
    if (selectedCollection !== undefined) {
      const mediaDto: IAlterableMediaDto = {
        id: selectedMediaId,
        type: selectedContext,
      }

      if (props.modalType === 'add') {
        PostApiHandler(`/collections/media/add`, {
          mediaId: props.mediaServerId,
          context: mediaDto,
          collectionId: selectedCollection,
          action: selectedAction,
        })
      } else {
        PostApiHandler('/rules/exclusion', {
          mediaId: props.mediaServerId,
          context: mediaDto,
          collectionId:
            selectedCollection !== -1 ? selectedCollection : undefined,
          action: selectedAction,
        })
      }

      props.onSubmit()
    } else {
      setAlert(true)
    }
  }

  const handleForceRemoval = () => {
    setForceRemovalCheck(false)
    if (props.modalType === 'add') {
      PostApiHandler(`/collections/media/add`, {
        mediaId: props.mediaServerId,
        context: { id: -1, type: props.type },
        collectionId: undefined,
        action: 1,
      })
    }
    props.onSubmit()
  }

  useEffect(() => {
    setSelectedSeasons(-1)
    setSelectedEpisodes(-1)

    if (props.type && props.type === 'show') {
      // get seasons
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
  }, [])

  useEffect(() => {
    setSelectedCollection(collectionOptions[0]?.id)
  }, [collectionOptions])

  useEffect(() => {
    if (selectedSeasons !== -1) {
      setLoading(true)

      // get episodes
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
    } else {
      setSelectedEpisodes(-1)
    }
  }, [selectedSeasons])

  // fetch correct collections based on selected type
  useEffect(() => {
    setLoading(true)

    if (props.type === 'show') {
      if (selectedEpisodes !== -1) {
        GetApiHandler(`/collections?typeId=episode`).then((resp) => {
          // get collections for episodes
          setCollectionOptions([...origCollectionOptions, ...resp])
          setLoading(false)
        })
      } else if (selectedSeasons !== -1) {
        GetApiHandler(`/collections?typeId=season`).then((resp) => {
          // get collections for episodes and seasons
          GetApiHandler(`/collections?typeId=episode`).then((resp2) => {
            setCollectionOptions([...origCollectionOptions, ...resp, ...resp2])
            setLoading(false)
          })
        })
      } else {
        GetApiHandler(`/collections?typeId=show`).then((resp) => {
          // get collections for episodes, seasons and shows
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
        // get collections for movies
        setCollectionOptions([...origCollectionOptions, ...resp])
        setLoading(false)
      })
    }
  }, [selectedSeasons, selectedEpisodes, props.type])

  return (
    <>
      <Modal
        loading={loading}
        backgroundClickable={false}
        onCancel={handleCancel}
        onOk={handleOk}
        okDisabled={false}
        title={
          props.modalType === 'add' ? 'Add / Remove Media' : 'Exclude Media'
        }
        okText={'Submit'}
        okButtonType={'primary'}
        onSecondary={() => {}}
        specialButtonType="warning"
        specialDisabled={props.modalType !== 'add'}
        specialText={'Remove from all collections'}
        onSpecial={
          props.modalType === 'add'
            ? () => {
                setForceRemovalCheck(true)
              }
            : undefined
        }
        iconSvg={''}
      >
        {forceRemovalcheck ? (
          <Modal
            loading={loading}
            backgroundClickable={false}
            onCancel={() => setForceRemovalCheck(false)}
            onOk={handleForceRemoval}
            okDisabled={false}
            title={'Confirmation Required'}
            okText={'Submit'}
          >
            Are you certain you want to proceed? This action will remove the{' '}
            {props.modalType === 'add' ? 'media ' : 'exclusion '}
            from all collections. For shows, this entails removing all
            associated {props.modalType === 'add' ? '' : 'exclusions for '}
            seasons and episodes as well.
          </Modal>
        ) : undefined}

        {alert ? (
          <Alert title="Please select a collection" type="warning" />
        ) : undefined}

        <div className="mt-6">
          <FormItem label="Action">
            <select
              name={`Action-field`}
              id={`Action-field`}
              value={selectedAction}
              onChange={(e: { target: { value: string } }) => {
                setSelectedAction(+e.target.value)
              }}
            >
              <option value={0}>Add</option>
              <option value={1}>Remove</option>
            </select>
          </FormItem>

          {/* For shows */}
          {props.type === 'show' ? (
            <FormItem label="Seasons">
              <select
                name={`Seasons-field`}
                id={`Seasons-field`}
                value={selectedSeasons}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
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
              </select>
            </FormItem>
          ) : undefined}
          {/* For shows and specific seasons */}
          {props.type === 'show' && selectedSeasons !== -1 ? (
            <FormItem label="Episodes">
              <select
                name={`Episodes-field`}
                id={`Episodes-field`}
                value={selectedEpisodes}
                onChange={(e: { target: { value: string } }) => {
                  const value = e.target.value
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
              </select>
            </FormItem>
          ) : undefined}

          <FormItem label="Collection">
            <select
              name={`Collection-field`}
              id={`Collection-field`}
              value={selectedCollection}
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
            </select>
          </FormItem>
        </div>
      </Modal>
    </>
  )
}
export default AddModal

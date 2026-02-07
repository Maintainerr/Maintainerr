import { SingleValue } from 'react-select'
import AsyncSelect from 'react-select/async'
import GetApiHandler from '../../../utils/ApiHandler'
import { EPlexDataType } from '../../../utils/PlexDataType-enum'
import { IPlexMetadata } from '../../Overview/Content'

export interface IMediaOptions {
  id: string
  name: string
  type: EPlexDataType
}

interface ISearchMediaItem {
  onChange: (item: SingleValue<IMediaOptions>) => void
  mediatype?: EPlexDataType
  libraryId?: number
}

const SearchMediaItem = (props: ISearchMediaItem) => {
  const loadData = async (query: string): Promise<IMediaOptions[]> => {
    // load your data using query

    const resp: IPlexMetadata[] = await GetApiHandler(
      `/plex/library/${props.libraryId}/content/search/${query}?type=${props.mediatype == EPlexDataType.MOVIES ? EPlexDataType.MOVIES : EPlexDataType.SHOWS}`,
    )
    //const resp: IPlexMetadata[] = await GetApiHandler(`/plex//search/${query}`)
    const output = resp.map((el) => {
      return {
        id: el.ratingKey,
        name: el.title,
        type: el.type == 'movie' ? EPlexDataType.MOVIES : EPlexDataType.SHOWS,
      } as unknown as IMediaOptions
    })

    return output
  }

  return (
    <>
      <AsyncSelect
        className="react-select-container"
        classNamePrefix="react-select"
        isClearable
        getOptionLabel={(option: IMediaOptions) => option.name}
        getOptionValue={(option: IMediaOptions) => option.id}
        defaultValue={[]}
        defaultOptions={undefined}
        loadOptions={loadData}
        placeholder="Start typing... "
        onChange={(selectedItem) => {
          props.onChange(selectedItem)
        }}
      />
    </>
  )
}

export default SearchMediaItem

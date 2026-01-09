import { type MediaItem, type MediaItemType } from '@maintainerr/contracts'
import { SingleValue } from 'react-select'
import AsyncSelect from 'react-select/async'
import GetApiHandler from '../../../utils/ApiHandler'

export interface IMediaOptions {
  id: string
  name: string
  type: MediaItemType
}

interface ISearchMediaITem {
  onChange: (item: SingleValue<IMediaOptions>) => void
  mediatype?: MediaItemType
  libraryId?: string
}

const SearchMediaItem = (props: ISearchMediaITem) => {
  const loadData = async (query: string): Promise<IMediaOptions[]> => {
    // Validate libraryId before making API call
    if (!props.libraryId) {
      console.warn(
        'SearchMediaItem: libraryId is required but was not provided',
      )
      return []
    }

    const searchType = props.mediatype === 'movie' ? 'movie' : 'show'
    const resp: MediaItem[] = await GetApiHandler(
      `/media-server/library/${props.libraryId}/content/search/${query}?type=${searchType}`,
    )
    const output = resp.map((el) => {
      return {
        id: el.id,
        name: el.title,
        type: el.type,
      } as IMediaOptions
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

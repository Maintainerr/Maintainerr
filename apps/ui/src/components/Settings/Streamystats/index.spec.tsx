import { render, waitFor } from '../../../test-utils/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StreamystatsSettings from './index'

const getApiHandler = vi.fn()

vi.mock('../../../utils/ApiHandler', () => ({
  default: (url: string) => getApiHandler(url),
  PostApiHandler: vi.fn(),
  DeleteApiHandler: vi.fn(),
}))

vi.mock('../../Common/DocsButton', () => ({
  default: () => <button type="button">Docs</button>,
}))

describe('StreamystatsSettings', () => {
  beforeEach(() => {
    getApiHandler.mockReset()
  })

  it('loads the saved Streamystats settings', async () => {
    getApiHandler.mockResolvedValue({ url: '' })

    render(<StreamystatsSettings />)

    await waitFor(() => {
      expect(getApiHandler).toHaveBeenCalledWith('/settings/streamystats')
    })
  })
})

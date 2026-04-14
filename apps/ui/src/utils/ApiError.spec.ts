import axios from 'axios'
import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './ApiError'

describe('getApiErrorMessage', () => {
  it('formats Zod validation issues with field paths', () => {
    const error = new axios.AxiosError('Request failed with status code 400')

    error.response = {
      data: {
        message: 'Validation failed',
        errors: [
          {
            path: ['elements', 3, 'imagePath'],
            message:
              'Must be a filename containing only letters, numbers, dot, dash, or underscore',
          },
        ],
      },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as any,
    }

    expect(getApiErrorMessage(error, 'Failed to save template')).toBe(
      'Validation failed: elements[3].imagePath: Must be a filename containing only letters, numbers, dot, dash, or underscore',
    )
  })
})

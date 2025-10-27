import { NextResponse } from 'next/server'

const apiPort = process.env.API_PORT

export const config = {
  runtime: 'edge',
}

export default async function handler() {
  try {
    const res = await fetch(`http://localhost:${apiPort}/api/logs/stream`, {
      cache: 'no-cache',
    })

    if (!res.ok) {
      throw new Error('Failed to fetch events stream')
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    console.warn('Error fetching logs stream from the API, is it down?')
    return new NextResponse(undefined, {
      status: 500,
    })
  }
}

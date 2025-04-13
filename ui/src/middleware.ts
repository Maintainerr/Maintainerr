import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const apiPort = process.env.API_PORT

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/api/') &&
    !request.nextUrl.pathname.startsWith('/api/logs/stream') &&
    !request.nextUrl.pathname.startsWith('/api/events/stream')
  ) {
    const url = request.nextUrl.clone()
    const destination = new URL(`http://localhost:${apiPort}`)
    url.host = destination.host
    url.port = destination.port
    url.protocol = destination.protocol
    url.basePath = ''
    return NextResponse.rewrite(url)
  }
}

import axios from 'axios'
import Bowser from 'bowser'

interface PlexHeaders extends Record<string, string> {
  Accept: string
  'X-Plex-Product': string
  'X-Plex-Version': string
  'X-Plex-Client-Identifier': string
  'X-Plex-Model': string
  'X-Plex-Platform': string
  'X-Plex-Platform-Version': string
  'X-Plex-Device': string
  'X-Plex-Device-Name': string
  'X-Plex-Device-Screen-Resolution': string
  'X-Plex-Language': string
}

export interface PlexPin {
  id: number
  code: string
}

class PlexOAuth {
  private plexHeaders?: PlexHeaders

  private pin?: PlexPin
  private popup?: Window

  private authToken?: string

  public initializeHeaders(): void {
    if (!window) {
      throw new Error(
        'Window is not defined. Are you calling this in the browser?',
      )
    }
    const browser = Bowser.getParser(window.navigator.userAgent)
    this.plexHeaders = {
      Accept: 'application/json',
      'X-Plex-Product': 'Maintainerr',
      'X-Plex-Version': '2.0',
      'X-Plex-Client-Identifier': '695b47f5-3c61-4cbd-8eb3-bcc3d6d06ac5',
      'X-Plex-Model': 'Plex OAuth',
      'X-Plex-Platform': browser.getOSName() ?? 'Unknown',
      'X-Plex-Platform-Version': browser.getOSVersion() ?? 'Unknown',
      'X-Plex-Device': browser.getBrowserName() ?? 'Unknown',
      'X-Plex-Device-Name': `${browser.getBrowserVersion() ?? 'Unknown'} (Maintainerr)`,
      'X-Plex-Device-Screen-Resolution':
        window.screen.width + 'x' + window.screen.height,
      'X-Plex-Language': 'en',
    }
  }

  public async getPin(): Promise<PlexPin> {
    if (!this.plexHeaders) {
      throw new Error(
        'You must initialize the plex headers clientside to login',
      )
    }
    const response = await axios.post(
      'https://plex.tv/api/v2/pins?strong=true',
      undefined,
      { headers: this.plexHeaders },
    )

    this.pin = { id: response.data.id, code: response.data.code }

    return this.pin
  }

  public preparePopup(): void {
    this.openPopup({ title: 'Plex Auth', w: 600, h: 700 })
  }

  public async login(): Promise<string> {
    this.initializeHeaders()
    await this.getPin()

    if (!this.plexHeaders || !this.pin) {
      throw new Error('Unable to call login if class is not initialized.')
    }

    const params = {
      clientID: this.plexHeaders['X-Plex-Client-Identifier'],
      'context[device][product]': this.plexHeaders['X-Plex-Product'],
      'context[device][version]': this.plexHeaders['X-Plex-Version'],
      'context[device][platform]': this.plexHeaders['X-Plex-Platform'],
      'context[device][platformVersion]':
        this.plexHeaders['X-Plex-Platform-Version'],
      'context[device][device]': this.plexHeaders['X-Plex-Device'],
      'context[device][deviceName]': this.plexHeaders['X-Plex-Device-Name'],
      'context[device][model]': this.plexHeaders['X-Plex-Model'],
      'context[device][screenResolution]':
        this.plexHeaders['X-Plex-Device-Screen-Resolution'],
      'context[device][layout]': 'desktop',
      code: this.pin.code,
    }

    if (this.popup) {
      this.popup.location.href = `https://app.plex.tv/auth/#!?${this.encodeData(
        params as Record<string, string>,
      )}`
    }

    return this.pinPoll()
  }

  private async pinPoll(): Promise<string> {
    const executePoll = async (
      resolve: (authToken: string) => void,
      reject: (e: unknown) => void,
    ) => {
      try {
        if (!this.pin) {
          throw new Error('Unable to poll when pin is not initialized.')
        }

        const response = await axios.get(
          `https://plex.tv/api/v2/pins/${this.pin.id}`,
          { headers: this.plexHeaders },
        )

        if (response.data?.authToken) {
          this.authToken = response.data.authToken as string
          this.closePopup()
          resolve(this.authToken)
        } else if (!response.data?.authToken && !this.popup?.closed) {
          setTimeout(executePoll, 1000, resolve, reject)
        } else {
          reject(new Error('Popup closed without completing login'))
        }
      } catch (e) {
        this.closePopup()
        reject(e)
      }
    }

    return new Promise(executePoll)
  }

  private closePopup(): void {
    this.popup?.close()
    this.popup = undefined
  }

  private openPopup({
    title,
    w,
    h,
  }: {
    title: string
    w: number
    h: number
  }): Window | void {
    if (!window) {
      throw new Error(
        'Window is undefined. Are you running this in the browser?',
      )
    }

    const dualScreenLeft =
      window.screenLeft != undefined ? window.screenLeft : window.screenX
    const dualScreenTop =
      window.screenTop != undefined ? window.screenTop : window.screenY

    const width = window.innerWidth
      ? window.innerWidth
      : document.documentElement.clientWidth
        ? document.documentElement.clientWidth
        : screen.width

    const height = window.innerHeight
      ? window.innerHeight
      : document.documentElement.clientHeight
        ? document.documentElement.clientHeight
        : screen.height

    const left = width / 2 - w / 2 + dualScreenLeft
    const top = height / 2 - h / 2 + dualScreenTop

    const newWindow = window.open(
      '',
      title,
      'scrollbars=yes, width=' +
        w +
        ', height=' +
        h +
        ', top=' +
        top +
        ', left=' +
        left,
    )

    if (newWindow) {
      try {
        newWindow.document.open()
        newWindow.document.write(`
          <!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Opening Plex…</title>
              <style>
                html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
                body { display:flex; align-items:center; justify-content:center; background:#09090b; color:#f4f4f5; }
                .card { background:#18181b; padding:20px 22px; border-radius:12px; box-shadow: 0 10px 30px rgba(0,0,0,.45); width: fit-content; max-width: 360px; }
                .muted { color:#a1a1aa; margin-top:8px; font-size:14px; line-height:1.3; }
                .spinner {
                  width:18px; height:18px; border-radius:50%;
                  border:2px solid rgba(244,244,245,.25);
                  border-top-color: #f4f4f5;
                  display:inline-block;
                  animation: spin 700ms linear infinite;
                  margin-right:10px;
                  vertical-align:middle;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
              </style>
            </head>
            <body>
              <div class="card">
                <div><span class="spinner"></span><strong>Opening Plex sign-in…</strong></div>
                <div class="muted">Please finish signing in in this window.</div>
              </div>
            </body>
          </html>
        `)
        newWindow.document.close()
      } catch {
        // If writing fails for any reason, it's not fatal.
      }

      newWindow.focus()
      this.popup = newWindow
      return this.popup
    }
  }

  private encodeData(data: Record<string, string>): string {
    return Object.keys(data)
      .map((key) => [key, data[key]].map(encodeURIComponent).join('='))
      .join('&')
  }
}

export default PlexOAuth

import { PlexSettingsForm } from '../../../Settings/Plex/PlexSettingsForm'

type PlexStepProps = {
  settings: any
  onBack: () => void
  onNext: () => void
}

export default function PlexStep({ settings, onBack, onNext }: PlexStepProps) {
  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-zinc-100">Plex setup</h2>

        <button
          type="button"
          onClick={onBack}
          className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600"
        >
          Back
        </button>
      </div>

      <p className="mt-2 text-zinc-300">
        Authenticate with Plex, pick your server, save, then run the test.
      </p>

      <div className="mt-4">
        <PlexSettingsForm settings={settings} variant="setup" />
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onNext} className="plex-button">
          Next
        </button>
      </div>
    </div>
  )
}

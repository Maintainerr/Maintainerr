type WelcomeStepProps = {
  onNext: () => void
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="px-4 pb-6">
      <h2 className="text-2xl font-semibold text-zinc-100">
        Welcome to Maintainerr
      </h2>

      <p className="mt-3 text-zinc-300">
        Before anything else, we need to connect Plex. Once Plex is set up, the
        rest of the app will come alive.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
        <div className="text-sm font-semibold text-zinc-200">
          What you’ll do next
        </div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Authenticate with Plex</li>
          <li>Refresh and pick your Plex server</li>
          <li>Save your settings</li>
          <li>Run a test to confirm everything works</li>
        </ul>
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onNext} className="plex-button">
          Let’s do this
        </button>
      </div>
    </div>
  )
}

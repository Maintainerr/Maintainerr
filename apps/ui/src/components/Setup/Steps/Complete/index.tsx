type CompleteStepProps = {
  onBack: () => void
  onFinish: () => void
}

export default function CompleteStep({ onBack, onFinish }: CompleteStepProps) {
  return (
    <div className="px-4 pb-6">
      <h2 className="text-2xl font-semibold text-zinc-100">Setup complete</h2>

      <p className="mt-3 text-zinc-300">
        You’re good to go. You can always adjust Plex and add other services
        later from Settings.
      </p>

      <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/40 p-4">
        <div className="text-sm font-semibold text-zinc-200">Next steps</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
          <li>Pick a library</li>
          <li>Create your first collection</li>
          <li>Build rules and let Maintainerr do the cleanup work</li>
        </ul>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded bg-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-600"
        >
          Back
        </button>

        <button type="button" onClick={onFinish} className="plex-button">
          Finish setup
        </button>
      </div>
    </div>
  )
}

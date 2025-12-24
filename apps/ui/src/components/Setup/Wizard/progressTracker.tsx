type ProgressTrackerProps = {
  steps: string[]
  currentStep: number
}

export default function ProgressTracker({
  steps,
  currentStep,
}: ProgressTrackerProps) {
  return (
    <div className="mb-4 flex justify-center gap-2 text-sm text-zinc-400">
      {steps.map((step, index) => (
        <span
          key={step}
          className={
            index === currentStep ? 'font-semibold text-zinc-100' : undefined
          }
        >
          {step}
        </span>
      ))}
    </div>
  )
}

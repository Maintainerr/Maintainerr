import { useState } from 'react'
import CompleteStep from '../Steps/Complete'
import PlexStep from '../Steps/Plex'
import WelcomeStep from '../Steps/Welcome'

type SetupWizardProps = {
  basePath: string
  settings: any
  onDone: () => void
}

export default function SetupWizard({
  basePath,
  settings,
  onDone,
}: SetupWizardProps) {
  const steps = ['Welcome', 'Plex', 'Complete'] as const
  const [currentStep, setCurrentStep] = useState(0)

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, steps.length - 1))
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0))

  return (
    <div className="flex min-h-screen min-w-0 items-center justify-center bg-zinc-900 px-4 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-zinc-800 p-4">
        <div className="section flex h-full w-full items-center justify-center pb-4">
          <img
            style={{ width: '300px', height: 'auto' }}
            src={`${basePath}/logo.svg`}
            alt="Maintainerr"
          />
        </div>

        {/* Optional: simple inline progress text for now */}
        <div className="mb-4 flex justify-center text-sm text-zinc-400">
          <span className="font-semibold text-zinc-100">
            {steps[currentStep]}
          </span>
          <span className="mx-2">•</span>
          <span>
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>

        {currentStep === 0 && <WelcomeStep onNext={goNext} />}
        {currentStep === 1 && (
          <PlexStep settings={settings} onBack={goBack} onNext={goNext} />
        )}
        {currentStep === 2 && (
          <CompleteStep onBack={goBack} onFinish={onDone} />
        )}
      </div>
    </div>
  )
}

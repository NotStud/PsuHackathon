const STEPS = [1, 2, 4, 8]

/**
 * Zoom presets, like a phone camera's. Pinching sets anything in between; the preset it's
 * past shows the exact value.
 */
export function ZoomControl({ zoom, onChange }: { zoom: number; onChange: (zoom: number) => void }) {
  const current = STEPS.filter((step) => step <= zoom).at(-1)
  return (
    <div className="zoom-control" role="group" aria-label="Zoom">
      {STEPS.map((step) => (
        <button key={step} className={step === current ? 'zoom-step active' : 'zoom-step'}
          aria-pressed={zoom === step} aria-label={`Zoom ${step}×`} onClick={() => onChange(step)}>
          {step === current && zoom !== step ? zoom.toFixed(1) : step}×
        </button>
      ))}
    </div>
  )
}

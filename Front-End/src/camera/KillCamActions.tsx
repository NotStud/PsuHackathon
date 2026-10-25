import { useMemo, useState } from 'react'

/** Save the kill cam to the device, or send it through the phone's share sheet where supported. */
export function KillCamActions({ clip }: { clip: Blob }) {
  const [error, setError] = useState<string | null>(null)
  const ext = clip.type.includes('mp4') ? 'mp4' : 'webm'
  // Named when saved or shared, e.g. snipe-killcam-2026-10-25-14-03-07.mp4
  const toFile = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return new File([clip], `snipe-killcam-${stamp}.${ext}`, { type: clip.type || `video/${ext}` })
  }
  const canShare = useMemo(
    () => typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([clip], `killcam.${ext}`, { type: clip.type || `video/${ext}` })] }),
    [clip, ext],
  )

  function download() {
    const file = toFile()
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function share() {
    setError(null)
    try {
      await navigator.share({ files: [toFile()], title: 'Snipe kill cam' })
    } catch (err) {
      // Closing the share sheet isn't an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Sharing failed. Try Download instead.')
    }
  }

  return (
    <div className="killcam-actions">
      <button type="button" className="button" onClick={download}>
        Download kill cam
      </button>
      {canShare && (
        <button type="button" className="button" onClick={() => void share()}>
          Share
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

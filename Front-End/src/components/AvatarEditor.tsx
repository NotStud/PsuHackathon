import { useRef, useState, type ChangeEvent } from 'react'
import { setAvatar } from '../api'
import type { User } from '../types'
import { Avatar } from './Avatar'

const SIZE = 256

/** Center-crops the picked image to a square and shrinks it to a small JPEG data URL. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = SIZE
      canvas.getContext('2d')?.drawImage(
        image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE,
      )
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not an image this browser can read.'))
    }
    image.src = url
  })
}

export function AvatarEditor({ user, onChange }: { user: User; onChange: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(dataUrl: string | null) {
    setBusy(true)
    setError(null)
    try {
      await setAvatar(dataUrl)
      onChange()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await save(await shrink(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="avatar-editor">
      <Avatar user={user} size={96} />
      <div className="avatar-editor-buttons">
        <button type="button" className="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Saving…' : user.avatarUrl ? 'Change photo' : 'Add profile photo'}
        </button>
        {user.avatarUrl && (
          <button type="button" className="button" disabled={busy} onClick={() => void save(null)}>
            Remove
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e)} />
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

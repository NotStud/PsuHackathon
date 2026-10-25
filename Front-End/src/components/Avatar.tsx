import type { CSSProperties } from 'react'
import type { Rim } from '../rims'
import type { User } from '../types'
import { CrownIcon } from './Icons'

export function Avatar({ user, size = 40, rim }: { user: User; size?: number; rim?: Rim }) {
  const face = user.avatarUrl ? (
    <img className="avatar" src={user.avatarUrl} width={size} height={size} alt="" />
  ) : (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.avatarColor, fontSize: size * 0.42 }}
      aria-hidden
    >
      {user.displayName.charAt(0).toUpperCase()}
    </span>
  )
  if (!rim) return face

  // The rim is drawn around the face without changing its size, so rows stay aligned.
  return (
    <span className={`avatar-frame avatar-frame-${rim}`} title={rim === 'king' ? 'King: first place' : 'Easy Target: last place'}
      style={{ width: size, height: size, '--rim': `${Math.max(2, Math.round(size * 0.07))}px` } as CSSProperties}>
      {face}
      {rim === 'king' && (
        <CrownIcon className="avatar-crown" width={size * 0.55} height={size * 0.55}
          style={{ top: -size * 0.38 }} fill="currentColor" strokeWidth={1.5} aria-hidden />
      )}
      {rim === 'easy-target' && (
        // An "L" sits on top, where the king's crown would be.
        <span className="avatar-loss" style={{ top: -size * 0.3, fontSize: size * 0.36, minWidth: size * 0.42 }} aria-hidden>
          L
        </span>
      )}
    </span>
  )
}

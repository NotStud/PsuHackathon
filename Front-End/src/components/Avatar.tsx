import type { User } from '../types'

export function Avatar({ user, size = 40 }: { user: User; size?: number }) {
  if (user.avatarUrl) {
    return <img className="avatar" src={user.avatarUrl} width={size} height={size} alt="" />
  }
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: user.avatarColor, fontSize: size * 0.42 }}
      aria-hidden
    >
      {user.displayName.charAt(0).toUpperCase()}
    </span>
  )
}

import type { ReactNode } from 'react'
import { createPreference } from './preferences'

/**
 * Crosshair shapes, drawn in a 24×24 box centered on (12, 12) — the aim point.
 * `hidden` ones can't be picked; the game assigns them (see LAST_PLACE).
 */
export const CROSSHAIRS: { id: string; name: string; shape: ReactNode; hidden?: boolean }[] = [
  {
    id: 'classic', name: 'Classic', shape: <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>,
  },
  {
    id: 'dot', name: 'Red Dot', shape: <>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      <circle cx="12" cy="12" r="5" strokeWidth="0.75" opacity="0.6" />
    </>,
  },
  {
    id: 'cross', name: 'Cross', shape: <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />,
  },
  {
    id: 'scope', name: 'Scope', shape: <>
      <circle cx="12" cy="12" r="10" strokeWidth="1" />
      <path d="M12 2v8M12 14v8M2 12h8M14 12h8" strokeWidth="1" />
      <path d="M12 6v.01M12 18v.01M6 12h.01M18 12h.01" strokeWidth="2.5" />
    </>,
  },
  {
    id: 'chevron', name: 'Chevron', shape: <>
      <path d="M6.5 17.5 12 12l5.5 5.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>,
  },
  {
    id: 'brackets', name: 'Brackets', shape: <>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>,
  },
  {
    id: 't', name: 'T', shape: <>
      <path d="M12 14v7M3 12h7M14 12h7" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>,
  },
]

export const CROSSHAIR_COLORS = [
  { id: 'red', name: 'Red', value: '#ef4444' },
  { id: 'white', name: 'White', value: '#ffffff' },
  { id: 'green', name: 'Green', value: '#22c55e' },
  { id: 'cyan', name: 'Cyan', value: '#22d3ee' },
  { id: 'yellow', name: 'Yellow', value: '#facc15' },
  { id: 'pink', name: 'Pink', value: '#ec4899' },
]

export interface CrosshairChoice { style: string; color: string }

// Last place's crosshair: the classic one, cracked. Every crack stays out on the ring
// and beyond (5.5+ units from the center), so the dot and the area around it, where
// the player actually aims, stay clean.
CROSSHAIRS.push({
  id: 'cracked', name: 'Cracked', hidden: true, shape: <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <path strokeWidth="0.75" d="M17.7 6.3l1.2-.5.5-1.3 1-.5M17.7 6.3l-.9 1 .2 1.1M18.9 5.8l.2-1.4
      M6.3 17.7l-.6 1.2-1.3.4-.3 1.2M6.3 17.7l1-.3.6-1M5.4 18.9l-1.2-.1
      M19.6 14.6l1.1.9.4 1.3M8.1 4.9l-.7-1.1-1.3-.3" />
  </>,
})

/** What last place is stuck with, overriding the player's own crosshair and sound. */
export const LAST_PLACE = { style: 'cracked', color: 'white', sound: 'dud' } as const

const crosshairPref = createPreference<CrosshairChoice>('snipe:crosshair', (saved) => {
  const s = saved as Partial<CrosshairChoice> | null
  return {
    style: CROSSHAIRS.some((c) => c.id === s?.style && !c.hidden) ? s!.style! : 'classic',
    color: CROSSHAIR_COLORS.some((c) => c.id === s?.color) ? s!.color! : 'red',
  }
})

/** The player's crosshair, saved on this device and shared by every screen that shows it. */
export const useCrosshair = crosshairPref.use

import type { ReactNode } from 'react'
import { createPreference } from './preferences'

/**
 * Crosshair shapes, drawn in a 24×24 box centered on (12, 12) — the aim point.
 * `hidden` ones can't be picked; the game assigns them (see LAST_PLACE).
 * `limited` ones can only be picked, and only fire, while you're in first place.
 */
export const CROSSHAIRS: { id: string; name: string; shape: ReactNode; hidden?: boolean; limited?: boolean }[] = [
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

// Last place's crosshair: the classic one with its ring shattered into four shards,
// each with jagged, broken-glass ends, wide gaps, and knocked out of place. The
// shards stay out on the ring (6.2+ units from the center), so the dot and the area
// around it, where the player actually aims, stay clean.
CROSSHAIRS.push({
  id: 'cracked', name: 'Cracked', hidden: true, shape: <>
    <path fill="currentColor" stroke="none" d={[
      'M17.39 16.77L18.23 16.36L17.85 17.46L18.96 16.7L18.74 17.66A8.8 8.8 0 0 1 5.56 18L5.31 16.95L6.4 17.6L6.03 16.58L6.82 17A7.2 7.2 0 0 0 17.39 16.77Z',
      'M3.55 12.96L3.33 14L2.74 12.81L2.59 14.35L2 13.41A10.1 10.1 0 0 1 6.65 3.43L7.86 3.32L6.84 4.36L8.06 4.11L7.37 4.87A8.5 8.5 0 0 0 3.55 12.96Z',
      'M9.14 5.72L8.24 5.74L8.99 4.91L7.71 5.13L8.27 4.36A8.5 8.5 0 0 1 16.38 4.71L16.88 5.64L15.69 5.34L16.29 6.2L15.45 6.02A6.9 6.9 0 0 0 9.14 5.72Z',
      'M16.98 8.31L16.83 7.5L17.73 7.98L17.32 6.86L18.15 7.2A7.8 7.8 0 0 1 19.68 13.35L19.02 14.08L18.85 12.96L18.28 13.74L18.12 12.97A6.2 6.2 0 0 0 16.98 8.31Z',
    ].join('')} />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </>,
})

/** A filled four-point star (a sparkle) centered on (x, y), `r` from its center to each tip. */
const star = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`

// First place's limited crosshair: the classic one with gold sparkles twinkling
// around the ring, clear of the aim point.
CROSSHAIRS.push({
  id: 'sparkle', name: 'Sparkle', limited: true, shape: <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <g fill="#facc15" stroke="none">
      <path className="sparkle" d={star(19.4, 4.6, 2.8)} />
      <path className="sparkle" d={star(4.4, 18.8, 2)} style={{ animationDelay: '0.5s' }} />
      <path className="sparkle" d={star(20, 18.4, 1.4)} style={{ animationDelay: '0.9s' }} />
      <path className="sparkle" d={star(4.2, 5.2, 1.3)} style={{ animationDelay: '1.3s' }} />
    </g>
  </>,
})

/** What last place is stuck with, overriding the player's own crosshair and sound. */
export const LAST_PLACE = { style: 'cracked', color: 'white', sound: 'fart' } as const

const crosshairPref = createPreference<CrosshairChoice>('snipe:crosshair', (saved) => {
  const s = saved as Partial<CrosshairChoice> | null
  return {
    style: CROSSHAIRS.some((c) => c.id === s?.style && !c.hidden) ? s!.style! : 'classic',
    color: CROSSHAIR_COLORS.some((c) => c.id === s?.color) ? s!.color! : 'red',
  }
})

/** The player's crosshair, saved on this device and shared by every screen that shows it. */
export const useCrosshair = crosshairPref.use

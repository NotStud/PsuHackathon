# Snipe — UI

Mobile-first web front end for the Snipe app. Built with React + TypeScript + Vite and React Router.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (add --host to open it on your phone over Wi-Fi)
npm run build      # type-check + production build
```

## Screens

| Route | File | What it does |
| --- | --- | --- |
| `/login` | `src/pages/LoginPage.tsx` | Placeholder sign-in |
| `/leagues` | `src/pages/LeaguesPage.tsx` | Your leagues, join with code, create league |
| `/leagues/:id` | `src/pages/LeaguePage.tsx` | Leaderboard + recent snipes feed |
| `/snipe` | `src/pages/SnipePage.tsx` | Full-screen camera: shoot first, then tap who you got → confirm. The app opens here. |
| `/profile` | `src/pages/ProfilePage.tsx` | Totals and per-league rank/cooldown |

## Hooking up the backend

All data goes through `src/api/index.ts`, which currently uses in-memory mock data
(`src/api/mockData.ts`). Every function is already `async`, so swapping in real
`fetch()` calls shouldn't require changes to the pages. The data shapes live in
`src/types.ts`; agree on these with the backend team.

Things the UI expects the backend to enforce:
- A player on cooldown can't be sniped (`Member.cooldownUntil`).
- You can't snipe yourself.
- Points per snipe and cooldown length are per-league settings.

## Hooking up the camera

The camera is being built on a separate branch. `src/camera/CameraView.tsx` is a
stand-in that does not touch the camera; it returns a placeholder image so the rest
of the snipe flow can be used. Replace that file when merging. The snipe screen
only relies on this contract:

```tsx
<CameraView ref={cameraRef} />            // fills its parent with a live preview
await cameraRef.current.capture()         // → media URL string, or null if cancelled
```

The snipe screen draws the shutter, reticle, league picker and target sheet on top,
so the camera component should render only the preview.

## Styling

Plain CSS in `src/index.css`. Colors and sizes are CSS variables at the top of the file,
with light and dark mode automatically following the device.

# Snipe — UI

Mobile-first web front end for the Snipe app. Built with React + TypeScript + Vite and React Router.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173 (add --host to open it on your phone over Wi-Fi)
npm run build      # type-check + production build
```

## Screens

| Route | File | What it does |
| --- | --- | --- |
| `/login` | `src/pages/LoginPage.tsx` | Display name registration |
| `/leagues` | `src/pages/LeaguesPage.tsx` | Your leagues, join with code, create league |
| `/leagues/:id` | `src/pages/LeaguePage.tsx` | Leaderboard + recent snipes feed |
| `/snipe` | `src/pages/SnipePage.tsx` | Full-screen camera: shoot first, then tap who you got → confirm. The app opens here. |
| `/profile` | `src/pages/ProfilePage.tsx` | Totals and per-league rank/cooldown |

## Backend connection

`src/api/index.ts` calls the FastAPI `/api` endpoints. Start the API on port 8000;
Vite proxies requests there during development. FastAPI serves `ui/dist` after
`npm run build`.

From the repository root, configure `DATABASE_URL` in `.env` using the Supabase
PostgreSQL session pooler connection string, then start the API:

```bash
.venv/bin/python -m uvicorn main:app --reload
```

The API creates its tables on startup. Database credentials stay on the server.

The login page registers a display name and remembers a private browser session.
League data, membership, snipes, scores and cooldowns persist in PostgreSQL.
There is no sample-data fallback; new players start with an empty league list.

## Camera

`src/camera/CameraView.tsx` uses the device camera and captures real JPEG images.
Allow camera access in the browser. Use HTTPS when opening the app on a phone;
localhost also supports camera access for desktop development. Photos are sent
to the backend as image data URLs and stored with the snipe. Camera tracks stop
when leaving the screen. No generated proof images are used.

## Styling

Plain CSS in `src/index.css`. Colors and sizes are CSS variables at the top of the file,
with light and dark mode automatically following the device.

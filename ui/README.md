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

From the repository root, configure `DATABASE_URL` in `Backend/.env` using the Supabase
PostgreSQL session pooler connection string, then start the API:

```bash
.venv/bin/python -m uvicorn main:app --app-dir Backend --reload
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

## Seeing frontend changes locally

For automatic updates, keep the API running on port 8000, run `npm run dev`
inside `ui`, and open **http://localhost:5173**. API requests are proxied to 8000.

**http://127.0.0.1:8000** serves the compiled files in `ui/dist`. After editing
React files, run `npm run build` inside `ui` and refresh that page. Uvicorn's
`--reload` restarts Python; it does not compile React changes.

The create-league form defaults to 1 hour. Select 15 minutes explicitly before
creating a league. Existing leagues retain their saved cooldown; changing the
available dropdown options does not update an existing league.

## Integration checks

From the repository root, install the HTTP test dependency and run:

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
PYTHONPATH=Backend .venv/bin/python -m unittest discover -s tests -v
```

Tests exercise authentication, league creation and joining, snipe submissions,
scores, cooldown enforcement, and serving the built UI and assets. They use an
isolated database and do not write to Supabase. Build the UI before running them.

## Flick trigger

On the Snipe camera screen, tap **Enable flick trigger** and allow motion access.
Aim and flick the phone up or down to capture, then choose the target and confirm.
The trigger pauses during photo review and rearms after Retake or Snipe again.
Use the sensitivity slider to adjust the threshold; a lower value fires more easily.
The strength meter shows detected motion. The shutter button still works without
motion access. Keyboard Space/Enter also fires when no form control is focused.

This uses `trigger_camera/trigger.js` with a short buffer of preview frames for a
sharp image before the flick. It submits the photo through the existing league
API. The standalone module's video recording and kill-cam replay are not part of
this integration. Use HTTPS on your phone (including the forwarded Codespaces
URL); motion and camera access may be unavailable in embedded previews.

Run the trigger check with `node --test trigger_camera/trigger.test.mjs`.

## Open on a phone through Codespaces

Keep the backend on port 8000 and Vite on port 5173 running. In the Codespaces
Ports tab, forward 5173 and copy its HTTPS address. Open that address directly in
Safari or Chrome on your phone, signing into GitHub if the port is private.
Keep port 8000 private; Vite proxies the API on the same frontend address.
Vite allows this Codespace's forwarded hostname automatically.

Allow camera access, register a player, and join or create a league. On the Snipe
screen, tap Enable flick trigger and allow motion access. Aim and flick, choose
the target, then confirm. Invite another player with the league code to test a
snipe; browser sessions are separate on the phone and desktop. Use the shutter
button if motion sensors are unavailable. The Codespace must stay awake.

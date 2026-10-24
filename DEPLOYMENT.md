# Server deployment

The root Dockerfile builds the React app and runs FastAPI as one service. The
server serves the UI and `/api` on the same origin; no separate Vite server is
needed. All shared game data stays in the existing Supabase PostgreSQL database.

## Container hosting

1. Choose a hosting provider that runs Docker web services, or use a Docker server.
2. Build from the repository root using `Dockerfile`.
3. Set `DATABASE_URL` as a secret environment variable in the host dashboard.
   Use the Supabase Session pooler URI shown in `Backend/.env.example`. Do not
   put the database password in Git or frontend environment variables.
4. Expose the service using the host's `PORT` variable (defaults to 8000).
5. Enable HTTPS on its public address. Camera and phone motion require HTTPS.
6. Open the public address, register, create a league, and share its join code.

Startup creates missing tables and enables RLS. The database connection must have
permission to create the tables and access them with RLS enabled, as in local use.
An existing league keeps its saved cooldown when deploying new frontend options.

## Docker server commands

Run these from the repository root:

```bash
docker build -t snipe .
docker run -d --name snipe --restart unless-stopped \
  --env-file Backend/.env -p 127.0.0.1:8000:8000 snipe
```

Place an HTTPS reverse proxy in front of port 8000. Share that proxy's domain.
This binds the application to loopback so the proxy handles public access.

## Verify after deployment

Open `/docs` and the home page. On two separate browsers, register players and
join the same league. Submit a snipe, verify the shared leaderboard and cooldown,
and reload to confirm persistence. Check camera and motion permission on a phone.

Player registration currently uses a display name and a private browser token;
it does not verify school email. A new device starts a separate player session.

## Render setup

A `render.yaml` Blueprint is included for a free Docker web service.

1. Commit and push the app and deployment files to your GitHub repository.
2. Create a Render account and connect that repository.
3. Choose New > Blueprint and select the repository containing `render.yaml`.
4. Enter `DATABASE_URL` in Render when prompted, using your existing Supabase URI.
5. Deploy and open the HTTPS `onrender.com` address shown in the service dashboard.
6. Share that URL and the league join code with friends.

Alternatively choose New > Web Service, select Docker and the repository root,
choose Free, and add the same `DATABASE_URL` secret. The Dockerfile handles the
build and start commands. Render's free web service sleeps after 15 minutes
without traffic; the next request wakes it. No extra database is needed.

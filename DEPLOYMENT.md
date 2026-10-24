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

Players sign up with a display name, email, and password (4–128 characters).
Signing in with the same credentials restores the same leagues and scores on
another device. Passwords are stored as salted PBKDF2-SHA256 hashes, using
600,000 iterations, and session tokens are stored as hashes. Sessions expire
after 30 days; logout revokes the current session. Five failed password attempts
lock that account for 15 minutes. Email verification and password-reset emails
are not implemented yet.

Existing players should open the same site in the browser they used before this
update and create an account when prompted. The old browser token proves
ownership and attaches the account to that player, preserving leagues and scores.
Without that token, an old display-name player cannot be claimed by name alone.
The original site hostname must be used because browser storage is per origin.

The new `accounts` and `account_sessions` tables are created at startup alongside
the existing tables. No existing player or score tables are replaced. Do not
remove the legacy `player_sessions` table until existing players have upgraded.

Password storage reference: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html

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

## Custom domain: sniped.photo

Use the existing Render service and the same DATABASE_URL. Adding a hostname does
not require copying or replacing the database. API requests use relative `/api`
paths, so the frontend automatically calls the backend through the new domain.

1. Deploy the email/password account changes first. Existing players should
   create their account on the old Render address, in their original browser,
   before moving to the new domain. Browser tokens do not cross domains.
2. Open the existing Render service > Settings > Custom Domains, add
   `sniped.photo`, and save. Render also adds the matching `www` hostname.
3. At the DNS provider, configure the root and `www` records shown by Render.
   Use its provider-specific instructions, especially for Cloudflare.
   Change only the web-host records; keep email and verification records.
4. Return to Render and verify the domains. Wait for HTTPS certificate issuance.
5. Test https://sniped.photo/ on desktop and phone. Sign in with an existing
   account and confirm its leagues and scores are present.
6. Share the new address. Keep the old Render hostname available while players
   finish attaching accounts to their old browser sessions.

Official instructions: https://render.com/docs/custom-domains


The merged league rules use the same plural-named Supabase tables as accounts.
Startup adds the shooter cooldown, bonus settings, round timestamp, and request
ID columns to existing tables using additive `ADD COLUMN IF NOT EXISTS`
statements. Existing leagues default to no extra shooter cooldown or bonuses;
new league requests can configure them. Challenges use `snipe_challenges`.

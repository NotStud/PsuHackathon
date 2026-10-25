# Sniped

A camera-based assassin game built for the PSU Hackathon. Create a league, invite friends with a join code, and compete by capturing photo snipes.

## Features

- Accounts, profile photos, and private leagues joined by code
- Phone camera with a motion-triggered shot and automatic hit/headshot detection
- Leaderboards, bounty and first-place bonuses, immunity, and shooter cooldowns
- Photo proof, kill-cam clips, and challenges settled by league votes
- Custom crosshairs and gunshot sounds

## Stack

React, TypeScript, and Vite on the frontend; FastAPI, SQLModel, and PostgreSQL/Supabase on the backend. SQLite is available for local development.

## Run locally

Use Python 3.10+ and Node.js 22.12+ (Node.js 24 recommended). Run these commands from the repository root in a Bash terminal.

**Backend**

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL='' python -m uvicorn main:app --app-dir Backend --host 0.0.0.0 --port 8000 --reload
```

The empty `DATABASE_URL` uses `Backend/local.db`, keeping local test data separate from Supabase. Tables are created automatically on startup.

**Frontend — in a second terminal**

```bash
cd Front-End
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Vite forwards `/api` requests to the backend on port 8000. API documentation is at [localhost:8000/docs](http://localhost:8000/docs).

Create an account, create a league, and share its code from the league details page. Friends can use **Join with code** to enter it.

Phone camera and motion controls need HTTPS and browser permissions. In Codespaces, forward port **5173** and open its HTTPS URL on your phone. Localhost works for testing the UI on your computer; shooting needs a device with motion sensors.

## Use Supabase

Copy `Backend/.env.example` to `Backend/.env` and enter your PostgreSQL connection URL. Start the backend without the `DATABASE_URL=''` override to use that database. Keep credentials out of Git.

## Build and test

```bash
# Production frontend
cd Front-End
npm run build
cd ..

# Backend tests
source .venv/bin/activate
pip install -r requirements-dev.txt
PYTHONPATH=Backend python -m unittest discover -s tests
```

FastAPI serves the built frontend from `Front-End/dist`. See [DEPLOYMENT.md](DEPLOYMENT.md) for Docker, Render, and domain setup.

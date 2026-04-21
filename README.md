# The Living Planner

Tasks, goals, habits, budget, and projects — all in one place.

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Add Supabase credentials
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Start dev server
npm run dev
# Opens at http://localhost:5173
```

**No Supabase?** The app runs in Demo Mode automatically using localStorage. All features work — data stays in your browser.

## Deploy to Vercel

1. Push this folder to a new GitHub repo
2. Go to vercel.com → Add New Project → Import the repo
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Vite

The `vercel.json` file handles React Router rewrites automatically.

## Supabase Setup

1. Create a new project at supabase.com
2. Go to SQL Editor and run the entire contents of `sql/schema.sql`
3. Go to Project Settings → API to get your URL and anon key
4. Add them to Vercel environment variables and redeploy

## Features

- **Tasks** — with priority, recurrence, goal/project linking
- **Calendar** — day and month views with drag-reschedule
- **Projects** — linked to goals with progress tracking
- **Growth** — habits, scoring, and life scorecard
- **Budget** — expense tracking with weekly targets
- **Notes** — linked to any item type
- **Smart Insights** — suggestions based on your actual data

## Modes

- **Demo Mode** — localStorage, instant, no account needed
- **Supabase Mode** — real-time sync, multi-device, persistent

## Tech Stack

- React 18 + Vite 5
- React Router 6
- Supabase (auth + postgres)
- Zero UI library dependencies

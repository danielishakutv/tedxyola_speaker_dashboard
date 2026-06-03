# Updating the TEDx Speaker Dashboard

How to pull the latest code from GitHub and redeploy on the server.

| | |
|---|---|
| **App location** | `/opt/tedxyola-speaker` |
| **pm2 process** | `tedx-speaker` |
| **Port** | `5000` (Apache reverse-proxies `speaker.tedxyola.com` → `127.0.0.1:5000`) |
| **Branch** | `main` |

Run everything as **root**.

> **Why the steps differ:** the backend (`server/`) runs live under pm2, so changes
> there need `pm2 restart`. The frontend (`frontend/`) is compiled to `frontend/dist`
> and served as static files by the backend, so changes there need `npm run build` —
> but **not** a pm2 restart (the running process serves whatever is in `dist`).

---

## First, pull the latest code

Every update starts by syncing the working copy to GitHub:

```bash
cd /opt/tedxyola-speaker
git fetch origin
git reset --hard origin/main
```

`git reset --hard origin/main` makes the server **exactly match GitHub**, discarding any
uncommitted local edits on the box. That is what you want on a deploy server. (If you
ever intentionally edit files on the server, commit them instead — otherwise they're lost.)

Then run the section that matches what changed. If you're not sure, use **Full update** —
it's always safe.

---

## Frontend only

Use when the change was purely UI (`frontend/**`) — e.g. a page, styling, or component.

```bash
cd /opt/tedxyola-speaker/frontend
npm install        # only strictly needed if package.json changed, but safe to run
npm run build
```

No pm2 restart needed — the backend immediately serves the new `dist/`.
Hard-refresh the browser (Ctrl/Cmd+Shift+R) to bypass cached assets.

---

## Backend only

Use when the change was server-side (`server/**`) — e.g. an API route or `server.js`.

```bash
cd /opt/tedxyola-speaker/server
npm install              # safe to run; installs anything new in package.json
npx prisma generate      # regenerates the DB client (needed if the Prisma schema changed)
pm2 restart tedx-speaker
```

If the change included a **database schema** edit (`server/prisma/schema.prisma`), also
push it before the restart — see [Database schema changes](#database-schema-changes).

---

## Frontend + backend

Use when a feature touched both sides (the common case for a new feature).

```bash
cd /opt/tedxyola-speaker
git fetch origin && git reset --hard origin/main

# backend
cd server
npm install
npx prisma generate
cd ..

# frontend
cd frontend
npm install
npm run build
cd ..

# restart
pm2 restart tedx-speaker
```

---

## Full update (always safe)

Does everything regardless of what changed. Use this when in doubt, or paste it as a
single block. It's the recommended default for deploying a new feature.

```bash
cd /opt/tedxyola-speaker

# 1. Pull latest (force-sync to GitHub)
git fetch origin
git reset --hard origin/main

# 2. Backend: deps + Prisma client + schema
cd server
npm install
npx prisma generate
npx prisma db push          # applies schema changes; no-op when nothing changed
cd ..

# 3. Frontend: deps + production build
cd frontend
npm install
npm run build
cd ..

# 4. Restart + verify
pm2 restart tedx-speaker
pm2 logs tedx-speaker --lines 20
```

### One-liner version

```bash
cd /opt/tedxyola-speaker && git fetch origin && git reset --hard origin/main && (cd server && npm install && npx prisma generate && npx prisma db push) && (cd frontend && npm install && npm run build) && pm2 restart tedx-speaker && pm2 logs tedx-speaker --lines 20
```

---

## Deploying a new feature

When you add a feature locally, push it, then deploy on the server. The safe default is
just the **[Full update](#full-update-always-safe)** above. Extra things to check
depending on what the feature introduced:

**1. New environment variable / secret?**
`server/.env` is gitignored, so it is **never** overwritten by `git reset`/`pull` — but a
new feature that reads a new variable needs it added by hand once:

```bash
cd /opt/tedxyola-speaker/server
nano .env                 # add the new KEY="value" line
pm2 restart tedx-speaker  # restart so the process picks it up
```

Check whether a needed key is present (example — the link shortener's `API_KEY`):

```bash
grep -q '^API_KEY=' /opt/tedxyola-speaker/server/.env && echo "present" || echo "MISSING — add it"
```

`.env.example` in the repo lists every variable the app understands — compare against your
real `.env` after pulling:

```bash
cd /opt/tedxyola-speaker/server
diff <(grep -o '^[A-Z_]*' .env.example | sort -u) <(grep -o '^[A-Z_]*' .env | sort -u)
```

**2. New database table/field?** Run the full update (it includes `prisma db push`), or see
the schema section below.

**3. New backend dependency?** The full update's `npm install` handles it.

**4. New uploaded-file handling?** Uploaded media lives in `server/uploads/` (gitignored) and
is untouched by updates.

After deploying, verify:

```bash
pm2 logs tedx-speaker --lines 30     # watch for startup errors
curl -sI http://127.0.0.1:5000/ | head -n1            # frontend → HTTP 200
curl -s  http://127.0.0.1:5000/api/public/speakers    # API responds
```

---

## Database schema changes

Only relevant when a feature edited `server/prisma/schema.prisma`:

```bash
cd /opt/tedxyola-speaker/server
npx prisma db push          # syncs the SQLite DB to the new schema
npx prisma generate         # regenerates the client
pm2 restart tedx-speaker
```

`prisma db push` is safe to run on every deploy — it does nothing when the DB already
matches the schema. The SQLite database (`server/prisma/dev.db`) is gitignored, so your
data is never touched by `git`.

---

## Rollback

If an update breaks something, jump back to the previous commit:

```bash
cd /opt/tedxyola-speaker
git log --oneline -5            # find the last-good commit hash
git reset --hard <hash>
cd frontend && npm run build && cd ..
pm2 restart tedx-speaker
```

---

## pm2 quick reference

```bash
pm2 status                 # is tedx-speaker online?
pm2 logs tedx-speaker      # live logs
pm2 restart tedx-speaker   # after backend/.env changes
pm2 save                   # persist the process list across reboots
```

For first-time setup, Apache config, and the reverse proxy, see **DEPLOY.md**.

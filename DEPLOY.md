# Deployment Guide — TEDx Speaker Dashboard

Target server: **Ubuntu 22.04 + Virtualmin/Apache**, running other Node apps under
**pm2** with **Apache reverse-proxying each domain to a localhost port**.

This guide mirrors that existing pattern (e.g. `dashboard.tedxyola.com → 127.0.0.1:3200`).

```
Browser ──HTTPS──▶ Apache vhost speaker.tedxyola.com
                     └─ ProxyPass /  →  http://127.0.0.1:5000   (Node + Express, pm2)
                                          ├─ serves the React build (frontend/dist)
                                          └─ /api/*  →  Prisma → SQLite (server/prisma/dev.db)
```

Node serves **both** the compiled frontend and the API, so Apache only needs a single
`ProxyPass /`. Port **5000** is free on this box (3000–3003/3101/3200/5432/6379 are taken).

Run everything below as **root**.

---

## 1. Clone the code (outside public_html)

Keep source out of the web root; Apache proxies straight to Node, so `public_html`
is not used by this app.

```bash
cd /opt
git clone https://github.com/danielishakutv/tedxyola_speaker_dashboard.git tedxyola-speaker
cd tedxyola-speaker
```

> Node 20 + pm2 are already installed system-wide — no version changes needed.

---

## 2. Backend — install, configure, init database

```bash
cd /opt/tedxyola-speaker/server
npm install
```

Create `.env` with a generated JWT secret and a bcrypt-hashed admin password.
**Set `ADMIN_PASS` to your own strong password first:**

```bash
ADMIN_PASS='ChangeMe_To_A_Strong_Password' node -e '
const bcrypt=require("bcryptjs"),crypto=require("crypto"),fs=require("fs");
const hash=bcrypt.hashSync(process.env.ADMIN_PASS,10);
const jwt=crypto.randomBytes(48).toString("hex");
fs.writeFileSync(".env",[
 "DATABASE_URL=\"file:./dev.db\"","",
 "PORT=5000","",
 "CLOUDINARY_CLOUD_NAME=\"\"","CLOUDINARY_API_KEY=\"\"","CLOUDINARY_API_SECRET=\"\"","",
 "# Auth","JWT_SECRET=\""+jwt+"\"","ADMIN_USERNAME=\"admin\"","ADMIN_PASSWORD_HASH=\""+hash+"\"",""
].join("\n"));
console.log("Wrote .env — login user: admin");
'
```

> Cloudinary is optional (blank = image uploads fall back to a placeholder). Add keys
> later and `pm2 restart tedx-speaker` to enable uploads.

Generate the Prisma client and create the SQLite DB:

```bash
npx prisma generate
npx prisma db push        # creates server/prisma/dev.db
```

**Seed the initial users (interactive):**

```bash
chmod +x setup-users.sh
./setup-users.sh
```

The script will prompt you for usernames and passwords. Press Enter to accept the defaults in brackets.

> **Security:** Passwords are never stored in files or git — only in the database as bcrypt hashes.

---

## 3. Build the frontend

```bash
cd /opt/tedxyola-speaker/frontend
npm install
npm run build             # outputs to frontend/dist (served by the backend)
```

---

## 4. Run the backend with pm2 (port 5000)

Start from the `server/` directory so `.env` and the Prisma schema resolve:

```bash
cd /opt/tedxyola-speaker/server
pm2 start server.js --name tedx-speaker
pm2 save                  # persist across reboots (pm2 startup is already configured)
```

Smoke-test locally (before touching Apache):

```bash
curl -s http://127.0.0.1:5000/api/public/speakers      # → []   (API works)
curl -sI http://127.0.0.1:5000/ | head -n1             # → HTTP/1.1 200 OK (frontend served)
```

---

## 5. Apache reverse proxy

The `speaker.tedxyola.com` vhost already exists (created by Virtualmin, SSL active).
This script adds the reverse proxy to the `:443` block and an HTTP→HTTPS redirect to
the `:80` block — idempotent, with a timestamped backup. Run as root:

```bash
python3 - <<'PY'
import re, sys, time, shutil
p = "/etc/apache2/sites-available/speaker.tedxyola.com.conf"
s = open(p).read()
if "tedx-speaker reverse proxy" in s:
    print("Already patched — nothing to do."); sys.exit(0)
shutil.copy(p, p + ".bak-" + time.strftime("%Y%m%d%H%M%S"))

proxy = """    # >>> tedx-speaker reverse proxy >>>
    ProxyRequests Off
    ProxyPreserveHost On
    ProxyPass        /  http://127.0.0.1:5000/
    ProxyPassReverse /  http://127.0.0.1:5000/
    RequestHeader set X-Forwarded-Proto "https"
    ProxyTimeout 60
    # <<< tedx-speaker reverse proxy <<<
"""
redirect = """    # >>> tedx-speaker http->https >>>
    RewriteCond %{REQUEST_URI} !^/\\.well-known
    RewriteRule ^/(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
    # <<< tedx-speaker http->https <<<
"""
def patch(m):
    b = m.group(0)
    add = proxy if "SSLEngine on" in b else redirect
    return b.replace("</VirtualHost>", add + "</VirtualHost>")
s = re.sub(r"<VirtualHost.*?</VirtualHost>", patch, s, flags=re.S)
open(p, "w").write(s)
print("Patched", p)
PY
```

Validate and reload:

```bash
apache2ctl configtest      # must say: Syntax OK
systemctl reload apache2
```

> `.well-known` is left unproxied/unredirected so Let's Encrypt renewals keep working.
> If you ever regenerate this vhost from the Virtualmin UI, re-run the script above.

---

## 6. Done — log in

Open **https://speaker.tedxyola.com** and log in:

- **Username:** `admin`
- **Password:** the `ADMIN_PASS` you set in step 2

Speakers you mark **LIVE** in the dashboard appear on the public API
(`/api/public/speakers`).

---

## Updating later (debug-from-server workflow)

```bash
cd /opt/tedxyola-speaker
git pull
# backend changed:
cd server && npm install && npx prisma generate && pm2 restart tedx-speaker
# frontend changed:
cd ../frontend && npm install && npm run build      # no pm2 restart needed for FE-only
```

Schema change (after editing `server/prisma/schema.prisma`):

```bash
cd /opt/tedxyola-speaker/server && npx prisma db push && pm2 restart tedx-speaker
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| 502/503 from Apache | Backend down → `pm2 status`, `pm2 logs tedx-speaker` |
| Login fails / "Cannot reach the server" | `curl http://127.0.0.1:5000/api/public/speakers` on the server |
| Blank page or 404 on refresh of `/dashboard` | Frontend not built → `cd frontend && npm run build`; confirm `frontend/dist/index.html` exists |
| `apache2ctl configtest` errors after patch | Restore the `.bak-*` file next to the vhost and re-run the script |
| Cert renewal fails | Ensure `/.well-known` is excluded (the script does this) |
| Images not uploading | Cloudinary keys blank — add to `server/.env`, then `pm2 restart tedx-speaker` |

## pm2 quick reference

```bash
pm2 status                 # all apps (tedx-speaker + your existing ones)
pm2 logs tedx-speaker      # live logs for this app
pm2 restart tedx-speaker   # after code/.env changes
pm2 save                   # persist process list across reboots
```

-------------------------------------------
ALL UPDATES
cd /opt/tedxyola-speaker && git pull
# backend changed:  cd server && npm install && npx prisma generate && pm2 restart tedx-speaker
# frontend changed: cd frontend && npm install && npm run build
pm2 logs tedx-speaker   # live logs when something misbehaves

-----------------------------------------------

cd /opt/tedxyola-speaker && git pull
cd frontend && npm run build
pm2 restart tedx-speaker


--------------------------------------
# 1. Clone (source lives outside public_html)
cd /opt
git clone https://github.com/danielishakutv/tedxyola_speaker_dashboard.git tedxyola-speaker

# 2. Backend: install + .env + DB
cd /opt/tedxyola-speaker/server
npm install
ADMIN_PASS='Tedx@2026' node -e '
const bcrypt=require("bcryptjs"),crypto=require("crypto"),fs=require("fs");
const hash=bcrypt.hashSync(process.env.ADMIN_PASS,10);
const jwt=crypto.randomBytes(48).toString("hex");
fs.writeFileSync(".env",[
 "DATABASE_URL=\"file:./dev.db\"","","PORT=5000","",
 "CLOUDINARY_CLOUD_NAME=\"\"","CLOUDINARY_API_KEY=\"\"","CLOUDINARY_API_SECRET=\"\"","",
 "# Auth","JWT_SECRET=\""+jwt+"\"","ADMIN_USERNAME=\"admin\"","ADMIN_PASSWORD_HASH=\""+hash+"\"",""
].join("\n"));
console.log("Wrote .env — login user: admin");
'   # 👈 change ADMIN_PASS above
npx prisma generate
npx prisma db push

# 3. Frontend build
cd /opt/tedxyola-speaker/frontend
npm install
npm run build

# 4. Start with pm2 + smoke-test
cd /opt/tedxyola-speaker/server
pm2 start server.js --name tedx-speaker
pm2 save
echo "=== API check ===";  curl -s http://127.0.0.1:5000/api/public/speakers
echo; echo "=== frontend check ==="; curl -sI http://127.0.0.1:5000/ | head -n1



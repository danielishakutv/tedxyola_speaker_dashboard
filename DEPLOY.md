# Deployment Guide — TEDx Speaker Dashboard

Deploy target: **Ubuntu/Debian VPS**, served at **https://speaker.tedxyola.com** with
**Apache** as a reverse proxy in front of the Node backend.

Architecture:

```
Browser ──HTTPS──▶ Apache (speaker.tedxyola.com)
                     ├─ /            → static React build  (frontend/dist)
                     └─ /api/*       → http://127.0.0.1:5000  (Node + Express, run by pm2)
                                          └─ Prisma → SQLite (server/prisma/dev.db)
```

The frontend uses **relative** API URLs (`/api/...`), so Apache just needs to proxy
`/api` to the backend. No CORS, works over HTTPS, no hardcoded hostnames.

> Run everything as a normal user with `sudo` rights. Replace `speaker.tedxyola.com`
> if you use a different hostname.

---

## 1. Install Node.js 22 LTS, git, and pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v && npm -v          # expect v22.x and 10.x
sudo npm install -g pm2
```

> Vite 8 (the build tool) requires Node 20.19+ or 22.12+. Node 22 LTS is recommended.

---

## 2. Clone the repo into /var/www

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/danielishakutv/tedxyola_speaker_dashboard.git tedxyola
sudo chown -R "$USER":"$USER" /var/www/tedxyola
cd /var/www/tedxyola
```

---

## 3. Backend — install, configure, init database

```bash
cd /var/www/tedxyola/server
npm install
```

Create the `.env` file with a freshly generated JWT secret and a bcrypt-hashed admin
password. **Edit `ADMIN_PASS` to your own strong password first:**

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

> **Cloudinary is optional.** Leave the three values blank to run without image
> uploads — the API falls back to a placeholder image. To enable uploads, paste your
> Cloudinary credentials into `.env` later and `pm2 restart tedx-backend`.

Generate the Prisma client and create the SQLite database:

```bash
npx prisma generate
npx prisma db push        # creates server/prisma/dev.db
```

---

## 4. Run the backend with pm2

Start it **from the `server/` directory** (so `.env` and the Prisma schema resolve):

```bash
cd /var/www/tedxyola/server
pm2 start server.js --name tedx-backend
pm2 save
pm2 startup               # run the `sudo ...` command it prints, to start on boot
```

Smoke-test the API locally:

```bash
curl http://127.0.0.1:5000/api/public/speakers     # → []  (empty list = working)
```

Useful pm2 commands while debugging:

```bash
pm2 logs tedx-backend       # live logs
pm2 restart tedx-backend    # after a code/.env change
pm2 status
```

---

## 5. Build the frontend

```bash
cd /var/www/tedxyola/frontend
npm install
npm run build               # outputs static files to frontend/dist
```

> Low-RAM VPS (≤1 GB)? If `npm run build` is killed/OOMs, add swap first:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> ```

---

## 6. Apache reverse proxy

Enable the needed modules:

```bash
sudo a2enmod proxy proxy_http rewrite headers
```

Create `/etc/apache2/sites-available/speaker.tedxyola.com.conf`:

```apache
<VirtualHost *:80>
    ServerName speaker.tedxyola.com
    DocumentRoot /var/www/tedxyola/frontend/dist

    <Directory /var/www/tedxyola/frontend/dist>
        Require all granted
        # SPA fallback so React Router deep links (e.g. /dashboard) work on refresh
        FallbackResource /index.html
    </Directory>

    # Forward API calls to the Node backend
    ProxyPreserveHost On
    ProxyPass        /api  http://127.0.0.1:5000/api
    ProxyPassReverse /api  http://127.0.0.1:5000/api

    ErrorLog  ${APACHE_LOG_DIR}/tedxyola_error.log
    CustomLog ${APACHE_LOG_DIR}/tedxyola_access.log combined
</VirtualHost>
```

Enable the site and reload:

```bash
sudo a2ensite speaker.tedxyola.com.conf
sudo apache2ctl configtest        # should say: Syntax OK
sudo systemctl reload apache2
```

---

## 7. HTTPS with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-apache
sudo certbot --apache -d speaker.tedxyola.com
```

Certbot rewrites the vhost for port 443 and auto-renews.

---

## 8. Firewall

Expose only web + SSH. Port 5000 stays internal (only Apache reaches it):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Apache Full'
sudo ufw enable
```

---

## 9. Done — log in

Open **https://speaker.tedxyola.com** → log in with:

- **Username:** `admin`
- **Password:** the `ADMIN_PASS` you set in step 3

Public speaker page data comes from speakers you mark **LIVE** in the dashboard.

---

## Updating later (debug-from-server workflow)

```bash
cd /var/www/tedxyola
git pull
# backend changed:
cd server && npm install && npx prisma generate && pm2 restart tedx-backend
# frontend changed:
cd ../frontend && npm install && npm run build
```

Schema change? After editing `server/prisma/schema.prisma`:

```bash
cd /var/www/tedxyola/server && npx prisma db push && pm2 restart tedx-backend
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Login fails / "Cannot reach the server" | `pm2 logs tedx-backend`; `curl http://127.0.0.1:5000/api/public/speakers` |
| 502 from Apache on `/api` | Backend down (`pm2 status`) or proxy modules not enabled (`a2enmod proxy proxy_http`) |
| Blank page / 404 on refresh of `/dashboard` | `FallbackResource /index.html` missing in vhost |
| `Invalid credentials` | Re-run the `.env` step with the right `ADMIN_PASS`, then `pm2 restart tedx-backend` |
| Images not uploading | Cloudinary keys blank — add them to `server/.env` and restart |

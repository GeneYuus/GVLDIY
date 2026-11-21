# Hostinger Cutover Guide (Zero Source-Code Edits Required)

The **Greenville DIY Archive & Barter Market** (`greenvillediyarchive.org` / `thebartermarket.org`) is wired with an automatic runtime posture switch (`lib/config/runtimeEnv.ts`):

- **During Design & Demo Refinement (Current Default)**: Leaving `DB_HOST` empty keeps the app pinned to **Port `3000`**, serves the full seeded archive from memory, and enables iframe-safe **Instant Demo Unlock** on `/admin`.
- **On Hostinger Cutover**: Setting the environment variables below in Hostinger hPanel automatically switches the app to **Hostinger's runtime `$PORT`**, auto-creates all **MySQL (`127.0.0.1:3306`)** tables on first boot, and locks `/admin` strictly behind **`ADMIN_PASSKEY`**—without changing a single line of code.

---

## 5-Step Hostinger Deployment Checklist

### Step 01 · Connect Node.js Web App in Hostinger hPanel
1. Open **Hostinger hPanel → Websites → Add Website → Node.js Web App** and connect your GitHub repository (or upload the project archive).
2. Select **Node.js `20.x` or `22.x`**.
3. Set commands:
   - **Install command**: `npm install`
   - **Build command**: `npm run build`
   - **Start command**: `npm run start` *(automatically runs `next start -p ${PORT:-3000}`, honoring Hostinger's assigned port while keeping local/demo builds on `3000`; `.next/standalone/server.js` is also emitted if you prefer standalone mode).*

### Step 02 · Create Local MySQL Database in hPanel
1. Go to **hPanel → Websites → Databases → Management** and create a new MySQL database and user.
2. Copy the generated `u123456789_archive` database name, username, and password.
3. **Zero-Touch Schema Bootstrap**: On first boot, the app runs `CREATE TABLE IF NOT EXISTS` for all 11 tables automatically. *(Optional: you can also download `mysql-schema.sql` directly from `/admin → 07. Cutover` if you prefer importing via phpMyAdmin first.)*

### Step 03 · Paste the 6 Required Environment Variables in hPanel
Open **hPanel → Node.js → Environment Variables** and paste:

```ini
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u123456789_gvl_diy
DB_USER=u123456789_curator
DB_PASSWORD=your-mysql-user-password
ADMIN_PASSKEY=your-strong-curator-passkey
ADMIN_SESSION_SECRET=64-char-random-hex-signing-secret
```

> **Why `127.0.0.1` instead of `localhost`?** On Hostinger Business/Cloud Linux nodes, `localhost` can resolve to IPv6 `::1` or a Unix socket path difference in Node `mysql2`. Using `127.0.0.1` forces clean IPv4 loopback TCP on port `3306` (the runtime resolver also normalizes `localhost` to `127.0.0.1` as a safety net).

### Step 04 · (Optional) Connect Off-Hostinger Media Streaming & IG Webhooks
To keep large 24-bit FLAC files and 35mm scans off Hostinger's inode/disk quota:
- **Google Drive HTTP `206` Range Proxy (`/api/media/drive/[fileId]`)**: Add `GDRIVE_CLIENT_EMAIL` and `GDRIVE_PRIVATE_KEY` for a read-only Google Cloud Service Account shared on your archive folder.
- **Cloudflare R2 `$0`-Egress Domain**: Set `NEXT_PUBLIC_R2_PUBLIC_URL=https://media.greenvillediyarchive.org`.
- **Instagram Barter Market `"SOLD"` Webhook (`/api/webhooks/instagram`)**: Set `IG_WEBHOOK_APP_SECRET` and `IG_VERIFY_TOKEN`.

### Step 05 · Point Domain DNS & Verify Live Posture
1. Point `greenvillediyarchive.org` (and alias `thebartermarket.org`) to your Hostinger Node.js instance and enable hPanel Auto-SSL.
2. Visit `https://greenvillediyarchive.org/admin`, sign in with your `ADMIN_PASSKEY`, and open **`07. Cutover`**—confirm the top **Runtime Posture Strip** reads:
   `MODE: HOSTINGER PRODUCTION · STORAGE: MYSQL 127.0.0.1:3306 · AUTH: PASSKEY ENFORCED`.

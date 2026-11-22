# Hostinger & Cloudflare Production Cutover Guide (Pass 8 Ready)

The **Greenville DIY Archive & Barter Market** (`greenvillediyarchive.org` / `thebartermarket.org`) ships with an automatic, fail-closed production posture across `lib/config/runtimeEnv.ts`, `lib/dal/auth.ts`, `lib/storage/mysqlRelationalDriver.ts`, and `lib/security/sanitize.ts`:

- **During Development & Preview (`NODE_ENV !== 'production'`)**: Leaving `DB_HOST` and `ADMIN_PASSWORD_HASH` empty keeps the app pinned to **Port `3000`**, serves the seeded archive from in-memory preview storage, and enables iframe-safe **Instant Demo Unlock** on `/admin`.
- **On Hostinger Production (`NODE_ENV=production`)**: Demo Unlock and first-caller passkey claiming are unconditionally disabled. The app binds Hostinger's `$PORT`, auto-initializes all **15+ relational MySQL (`127.0.0.1:3306`)** tables (preserving any legacy `archive_kv_snapshot` row untouched as a read-only backup), issues `__Host-gvl_diy_admin_session` (`SameSite=Strict; Secure; HttpOnly`), and fails closed (`503`) until `ADMIN_PASSWORD_HASH` and a `>= 32`-character `ADMIN_SESSION_SECRET` are configured.

---

## 5-Step Production Cutover Checklist

### Step 01 · Generate Your Memory-Hard `ADMIN_PASSWORD_HASH` (`64 MiB` `scrypt`)
1. Open `/admin → 07. Cutover` in preview, enter a **16+ character curator passphrase** in the **Passphrase Hash Generator**, and click **Generate ADMIN_PASSWORD_HASH**.
2. Copy the exact string (`scrypt$65536$8$2$<64-char-saltHex>$<128-char-hashHex>`).
3. Generate a dedicated 64-hex signing secret for revocable session tokens:
   ```bash
   openssl rand -hex 32
   ```

### Step 02 · Provision Node.js Web App & Loopback MySQL in Hostinger hPanel
1. Open **Hostinger hPanel → Websites → Add Website → Node.js Web App**, connect your Git repository (`main` branch), and select **Node.js `20.x` or `22.x`**.
2. Set build & runtime commands:
   - **Install**: `npm install`
   - **Build**: `npm run build`
   - **Start**: `npm run start`
3. Under **hPanel → Databases → Management**, create your MySQL database and user:
   - Leave **Remote MySQL** **disabled** so port `3306` accepts local `127.0.0.1` loopback connections only.
   - All relational tables (`videos`, `video_timestamps`, `flac_tracks`, `photos`, `artists`, `calendar_events`, `timeline_eras`, `remembered_places`, `auction_items`, `comments`, `comment_replies`, `scene_chat_messages`, `subscribers`, `puck_pages`, `future_tasks`, `admin_sessions`, `auth_rate_limits`, and `audit_logs`) plus column migrations auto-create idempotently on first boot using a bounded pool (`connectionLimit: 5`, `multipleStatements: false`).

### Step 03 · Configure Environment Variables in hPanel
Open **hPanel → Node.js → Environment Variables** and paste (quote `ADMIN_PASSWORD_HASH` so `$` parameters are preserved literally if loaded by shell scripts):

```ini
NODE_ENV=production
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=u123456789_gvl_diy
DB_USER=u123456789_curator
DB_PASSWORD=your-mysql-user-password
ADMIN_PASSWORD_HASH="scrypt$65536$8$2$<saltHex>$<hashHex>"
ADMIN_SESSION_SECRET=64-char-random-hex-secret-at-least-32-chars
```

> **Why `127.0.0.1` instead of `localhost`?** On Hostinger Linux nodes, `localhost` can resolve to IPv6 `::1` or a Unix socket mismatch in `mysql2`. `127.0.0.1` guarantees clean IPv4 loopback TCP on port `3306`.

### Step 04 · (Optional) Off-Hostinger Media Streaming & Signed Instagram Webhooks
- **Google Drive HTTP `206` Byte-Range Proxy (`/api/media/drive/[fileId]`)**: Add `GDRIVE_CLIENT_EMAIL` and `GDRIVE_PRIVATE_KEY`. Only `fileId`s referenced by published archive/Puck records (or previewed by an authenticated curator) are proxied.
- **Cloudflare R2 `$0`-Egress Public Bucket**: Set `NEXT_PUBLIC_R2_PUBLIC_URL=https://media.greenvillediyarchive.org`.
- **Instagram Barter Market `"SOLD"` Webhook (`/api/webhooks/instagram`)**: Set `IG_WEBHOOK_APP_SECRET` and `IG_VERIFY_TOKEN` from your Meta App dashboard. Unsigned requests fail closed (`403`), and signatures are verified via constant-time `HMAC-SHA256` against exact `igMediaId` records.

### Step 05 · Cloudflare WAF, DNS & Post-Cutover Verification
1. **DNS & SSL/TLS**:
   - Point `greenvillediyarchive.org` (and alias `thebartermarket.org`) through Cloudflare (orange-cloud proxied) with **SSL/TLS encryption mode: Full (Strict)** and **Always Use HTTPS** enabled.
2. **Cloudflare WAF Rate-Limiting Rules (Security → WAF → Rate limiting rules)**:
   - **Rule A — Curator Auth Shield**: Match `(http.request.uri.path eq "/api/admin/auth" and http.request.method eq "POST")` → block for `10 minutes` if `> 8` requests per `1 minute` per IP (complements the in-app MySQL 5-failure progressive `15m / 1h / 24h` lockout).
   - **Rule B — Public Write Burst Guard**: Match `(http.request.uri.path in {"/api/archive" "/api/contact-ingest"} and http.request.method eq "POST")` → block for `1 minute` if `> 15` requests per `1 minute` per IP.
   - **Webhook Allow Note**: Ensure Bot Fight Mode does not challenge `POST /api/webhooks/instagram` so signed Meta `"SOLD"` comment webhooks deliver cleanly.
3. **Final Smoke Check**:
   - Sign into `https://greenvillediyarchive.org/admin` and open **`07. Cutover`**—confirm the **Runtime Posture Strip** reads `HOSTINGER PRODUCTION · PASSKEY ENFORCED` + `hostinger-mysql`, verify your sign-in appears in the **Security Audit Trail**, and confirm `IT-01` through `IT-05` show `Completed` in **`08. Next Pass`**.

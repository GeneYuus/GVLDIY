# Hostinger & Cloudflare Production Cutover Guide (Pass 11 Ready)

The **Greenville DIY Archive & Barter Market** (`greenvillediyarchive.org` / `thebartermarket.org`) ships with an automatic, fail-closed production posture across `lib/config/runtimeEnv.ts`, `lib/dal/auth.ts`, `lib/security/totp.ts`, `lib/storage/mysqlRelationalDriver.ts`, and `lib/security/sanitize.ts`:

- **During Development & Preview (`NODE_ENV !== 'production'`)**: Leaving `DB_HOST` and `ADMIN_PASSWORD_HASH` empty keeps the app pinned to **Port `3000`**, serves the seeded archive from in-memory preview storage, and enables iframe-safe **Instant Demo Unlock** on `/admin` (while passphrase sign-in enforces two-step RFC 6238 TOTP 2FA whenever enrolled).
- **On Hostinger & Cloud Run Production (`NODE_ENV=production`)**: Demo Unlock and first-caller passkey claiming are unconditionally disabled. Production builds emit `.next/standalone` for Cloud Run / container artifact deployment while `npm run start` automatically syncs `public/` and `.next/static/` into `.next/standalone/` and launches `node .next/standalone/server.js` under a **`512 MiB` V8 runtime heap cap** (`NODE_OPTIONS=--max-old-space-size=512`, while `build` retains `1152 MiB`), auto-initializes all **20 relational MySQL (`127.0.0.1:3306`)** tables, issues `__Host-gvl_diy_admin_session` (`SameSite=Strict; Secure; HttpOnly`), and fails closed (`503`) until `ADMIN_PASSWORD_HASH` and a `>= 32`-character `ADMIN_SESSION_SECRET` are configured.

---

## 5-Step Production Cutover Checklist

### Step 01 · Generate Your Memory-Hard `ADMIN_PASSWORD_HASH` (`64 MiB` `scrypt`)
1. Open `/admin → 08. Hostinger & Tasks` in preview, enter a **16+ character curator passphrase** in the **Passphrase Hash Generator**, and click **Generate ADMIN_PASSWORD_HASH**.
2. Copy the exact string (`scrypt$65536$8$2$<64-char-saltHex>$<128-char-hashHex>`).
3. Generate a dedicated 64-hex signing & AES-256-GCM MFA encryption secret:
   ```bash
   openssl rand -hex 32
   ```

### Step 02 · Provision Managed Node.js Web App & Loopback MySQL in Hostinger hPanel
1. Open **Hostinger hPanel → Websites → Add Website → Node.js Web App**, connect your Git repository (`main` branch), and select **Node.js `20.x` or `22.x`**.
2. Set build & runtime commands (aligned for both Cloud Run standalone artifacts and Hostinger Business plan RAM ceilings):
   - **Install**: `npm install`
   - **Build**: `npm run build` (`tsc --noEmit` + `next build` at `1152 MiB` build-time heap, emitting `.next/standalone`)
   - **Start**: `npm run start` (idempotently links `public/` + `.next/static/` and runs `.next/standalone/server.js` under `NODE_OPTIONS=--max-old-space-size=512`)
3. Under **hPanel → Databases → Management**, create your MySQL database and user:
   - Leave **Remote MySQL** **disabled** so port `3306` accepts local `127.0.0.1` loopback connections only.
   - All relational tables (`videos`, `video_timestamps`, `flac_tracks`, `photos`, `artists`, `calendar_events`, `timeline_eras`, `remembered_places`, `auction_items`, `comments`, `comment_replies`, `comment_votes`, `scene_chat_messages`, `subscribers`, `puck_pages`, `future_tasks`, `admin_sessions`, `admin_mfa_config`, `auth_rate_limits`, and `audit_logs`) auto-create idempotently on first boot using a bounded pool (`connectionLimit: 5`, `multipleStatements: false`).

### Step 03 · Configure Environment Variables in hPanel & Enroll Authenticator 2FA
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
ADMIN_TOTP_SECRET=
```

> **Why `127.0.0.1` instead of `localhost`?** On Hostinger Linux nodes, `localhost` can resolve to IPv6 `::1` or a Unix socket mismatch in `mysql2`. `127.0.0.1` guarantees clean IPv4 loopback TCP on port `3306`.

After first production sign-in, open **`/admin → 08. Hostinger & Tasks → Set Up Authenticator 2FA`**, scan the server-rendered inline SVG QR code in **Microsoft Authenticator** or **Google Authenticator**, confirm a live 6-digit code, and store your **8 single-use `XXXX-XXXX` backup recovery codes** offline.

### Step 04 · (Optional) Off-Hostinger Media Streaming & Signed Instagram Webhooks
- **Google Drive HTTP `206` Byte-Range Proxy (`/api/media/drive/[fileId]`)**: Add `GDRIVE_CLIENT_EMAIL` and `GDRIVE_PRIVATE_KEY`. Only `fileId`s referenced by published archive/Puck records (or previewed by an authenticated curator) are proxied.
- **Cloudflare R2 `$0`-Egress Public Bucket**: Set `NEXT_PUBLIC_R2_PUBLIC_URL=https://media.greenvillediyarchive.org`.
- **Instagram Barter Market `"SOLD"` Webhook (`/api/webhooks/instagram`)**: Set `IG_WEBHOOK_APP_SECRET` and `IG_VERIFY_TOKEN` from your Meta App dashboard. Requests enforce a `64 KB` `Content-Length` pre-check, fail closed (`403`) when unsigned, and verify constant-time `HMAC-SHA256` signatures against exact `igMediaId` records.

### Step 05 · Cloudflare WAF, DNS & Post-Cutover Verification
1. **DNS & SSL/TLS**:
   - Point `greenvillediyarchive.org` (and alias `thebartermarket.org`) through Cloudflare (orange-cloud proxied) with **SSL/TLS encryption mode: Full (Strict)** and **Always Use HTTPS** enabled.
2. **Cloudflare WAF Rate-Limiting Rules (Security → WAF → Rate limiting rules)**:
   - **Rule A — Curator Auth Shield**: Match `(http.request.uri.path in {"/api/admin/auth" "/api/admin/login"} and http.request.method eq "POST")` → block for `10 minutes` if `> 8` requests per `1 minute` per IP (complements the in-app per-IP 5-failure `15m / 1h / 24h` lockout and `60s` global burst guard).
   - **Rule B — Public Write Burst Guard**: Match `(http.request.uri.path in {"/api/archive" "/api/contact-ingest"} and http.request.method eq "POST")` → block for `1 minute` if `> 15` requests per `1 minute` per IP.
   - **Webhook Allow Note**: Ensure Bot Fight Mode does not challenge `POST /api/webhooks/instagram` so signed Meta `"SOLD"` comment webhooks deliver cleanly.
3. **Final Smoke Check**:
   - Sign into `https://greenvillediyarchive.org/admin` and open **`08. Hostinger & Tasks`**—confirm the **Runtime Posture Strip** reads `Hostinger Production` + `MySQL · 127.0.0.1:3306` + `TOTP 2FA Enrolled`, test a `[ COPY LINK ]` deep-link (`?tab=videos&item=VID-01&t=74`), and confirm Passes `5–11` (`IT-01..IT-05`, `IT-07..IT-09`) show `Completed` in the task ledger.

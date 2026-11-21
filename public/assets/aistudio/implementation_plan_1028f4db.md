# Greenville DIY Archive & Barter Market — Hostinger Edition: Pass 2 Specification, Off-Hostinger Storage & Pass 3 Ledger

## PART I: PASS 2 IMPLEMENTATION SPECIFICATION (CURRENT RUN)

### 1. Invisible-Until-Authenticated `/admin` & `/admin/login` Architecture
To ensure public visitors never see administrative entry points unless they know the URL or hold an active administrator session ([Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)):

- **Zero Public Admin Links When Logged Out**:
  - Remove the `Admin Portal` button from the public desktop left index rail and the mobile `More` slide-up sheet for unauthenticated visitors.
  - Remove the inline `'admin'` tab from the public `ResponsiveArchiveShell` so the public shell is 100% dedicated to the 8 archival and barter modules (`Videos`, `Audio (FLAC)`, `Photos`, `Artists`, `Calendar`, `Timeline`, `Remembered`, `Auctions`).
- **Dedicated Next.js App Router Pages (`/admin/login` & `/admin`)**:
  - **`app/admin/login/page.tsx`**: Standalone frosted liquid-glass authentication gateway reachable only by navigating directly to `/admin/login` (or being redirected from `/admin`). Verifies the passkey (`poe2026` in preview or `process.env.ADMIN_PASSKEY`) via `POST /api/admin/auth`, sets the Web Crypto HMAC-SHA256 `httpOnly` cookie (`gvl_diy_admin_session`), and routes to `/admin`.
  - **`app/admin/page.tsx`**: Server-guarded App Manager page that invokes `verifyAdminSession()` on the server. If unauthenticated, it immediately redirects via `redirect('/admin/login')`. If authenticated, it renders the full-screen `<AdminManagerClient />` workspace with a top `← Return to Public Archive` link.
- **Conditional Authenticated Navigation Badge**:
  - When `verifyAdminSession()` is `true`, the public archive receives `isAdminAuthenticated={true}` from the server and renders a subtle `Admin Manager ↗` link in the desktop rail footer and mobile `More` sheet so logged-in curators can jump back and forth effortlessly.

### 2. Cozy, Breathable Spacing, Rounded Architectural Angles & Low-Verbosity Copy Cleanup
Eliminate visual clutter, chamfered polygons, and meta-commentary while preserving warm spacing and tight rounded architectural angles (`--r-xs: 6px`, `--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 14px`) with iOS frosted liquid glass (`backdrop-filter: blur(24px) saturate(190%)`):

- **Strip Unnecessary Helper Copy & Meta-Badges**:
  - **Masthead**: Remove the read-only `SEASON: FALL` technical pill from the public top bar; keep only the seasonal SVG silhouette, brand title, optional clickable event announcement pill, `♪ PPG Synth`, and `Light / Dark` toggle.
  - **Videos**: Remove `UNLISTED · YT COMMENTS OFF` meta-badge; keep clean clip count and timestamp buttons.
  - **Audio (FLAC)**: Replace verbose `● LOSSLESS STREAM · 24-bit / 48 kHz FLAC · SAMPLY ENGINE` technical string with a concise spec badge (`24-bit / 48 kHz FLAC`).
  - **Calendar**: Remove instructional caption `Tap highlighted day to unfurl flyer` and internal meta-label `CUSTOM MIXED-MEDIA FLYER CSS · ...` inside the unfurled flyer; show only the date, doors/admission, lineup title, venue, and flyer notes.
  - **Timeline**: Remove instructional subtitle `Scroll wheel, drag slider, or tap era notches`; let the tactile porthole dial, range slider, and era buttons speak for themselves.
- **Cozy Architectural Margins & Breathing Room**:
  - **Workspace Cushion**: Increase desktop workspace padding to `28px 36px 120px` (`18px 16px 136px` on mobile) so content sits comfortably inside the viewport above the `58px` mobile bottom navigation bar.
  - **Section Headers**: Use `margin-bottom: 20px` and `padding-bottom: 12px` for uncrowded vertical rhythm.
  - **Card Grids & Surfaces**: Expand `.card-grid` gap to `18px` (`grid-template-columns: repeat(auto-fill, minmax(285px, 1fr))`), increase `.card-pad` to `15px 18px`, `.card-foot` to `11px 18px`, and featured stage panels (Video Stage, FLAC Deck, Timeline Stage, Memorial Blocks) to `20px–24px` internal padding with `20px` vertical separation.

### 3. Hostinger-Ready Dual-Mode Persistence & Off-Hostinger Media Resolver (Refined for Pass 2)
Because [Hostinger Managed Node.js Web Apps](https://docs.hostinger.com/node.js/overview) run on demand and **stop automatically after periods without traffic** (restarting seamlessly on the next incoming request), relying on `globalThis.__gvlDiyStore` in-memory state in production would wipe newly added shows, auctions, and subscriber rows whenever the Node process sleeps. Furthermore, storing 40–120 MB 24-bit `.flac` sets on shared web hosting wastes SSD quota and risks redeploy overwrites inside `~/domains/{domain}/hbuilds/current/nodejs` ([Hostinger Creating a Node.js App](https://docs.hostinger.com/node.js/creating-an-app)).

Pass 2 upgrades the storage layer so AI Studio preview still works with zero credentials while production on Hostinger runs at near-zero cost:

- **Dual-Mode Repository (`lib/storage/repository.ts`) — Preview Memory + Hostinger Local MySQL (`$0` Extra)**:
  - When `DB_HOST` is unset (Google AI Studio preview / local dev), `repository.ts` uses the deterministic seeded `globalThis` store so every CRUD button works out of the box.
  - When `DB_HOST=127.0.0.1` and `DB_PORT=3306` are set in [Hostinger Environment Variables](https://docs.hostinger.com/node.js/environment-variables), `repository.ts` switches to `mysql2/promise` (or Drizzle ORM MySQL) connecting directly to the free MySQL database included in your Hostinger plan ([Hostinger Databases Documentation](https://docs.hostinger.com/websites/databases)). Always use `127.0.0.1` instead of `localhost` on Hostinger so Node.js connects over IPv4 TCP rather than failing on IPv6 `::1`.
- **Off-Hostinger Media Source Resolver (`lib/media/resolveMediaUrl.ts` & `/api/media/drive/[fileId]`)**:
  - Every FLAC track, 35mm photo plate, and auction card accepts four storage provider modes so **zero media binaries ever live on Hostinger's disk**:
    1. **`samply` / `youtube` (Zero-Storage Embeds)**: Unlisted YouTube video IDs (`0 GB` storage/bandwidth) and [Samply Lossless Player](https://docs.samply.app/playback-quality.html) URLs for engineers who already upload 24-bit `.flac` mixes to Samply.
    2. **`gdrive` (Google Drive Curator Folder via Authenticated API v3 Proxy)**: Never paste raw `drive.google.com/uc?id=...` share links into `<img>` or `<audio>` tags—Google locks public share links for 24 hours under multi-visitor traffic and injects virus-scan HTML interstitials on large `.flac` files. Instead, curators drop files into a shared Google Drive folder and paste the Drive File ID (or Drive link, auto-parsed to `fileId`) in `/admin`. Next.js serves `/api/media/drive/[fileId]` using a free Google Cloud Service Account calling `GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media` ([Google Drive API Manage Downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads)), forwarding `Range: bytes=...` (`HTTP 206 Partial Content`, [MDN 206 Status](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/206)) with `Cache-Control: public, max-age=31536000, immutable` behind Cloudflare's free CDN proxy so Drive (`1 TB/day` project egress, `1,000,000` quota units/min per [Google Drive API Usage Limits](https://developers.google.com/workspace/drive/api/guides/limits)) and Hostinger's `120` NPROC limit ([Hostinger Node.js Plan Limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/)) are shielded by edge caching.
    3. **`r2` (Cloudflare R2 Free-Tier CDN — Recommended for Heavy FLAC Catalogs)**: Direct public custom-domain URLs (`media.greenvillediyarchive.org/...`) backed by [Cloudflare R2 Standard Storage](https://developers.cloudflare.com/r2/pricing/), which gives **`10 GB-month / month` free**, **`10,000,000` Class B reads/month free**, and **`$0.00` egress bandwidth** (`$0.015/GB-month` beyond 10 GB).
- **Client-Side Web Audio Peak & EXIF Extraction on Admin Create (Eliminating Paid Cloud Workers)**:
  - When a curator selects a local `.flac`/`.wav` file or `.jpg` scan in `/admin` (before or alongside uploading to Google Drive / R2), the browser computes the normalized 42-bar RMS waveform array via Web Audio `decodeAudioData` and reads basic image dimensions/EXIF client-side, storing the lightweight JSON array directly in MySQL—eliminating the need for a paid background FFmpeg server.

### 4. Full 6-Tab Admin Content & Media CRUD inside `/admin`
Using the dual-mode repository (`lib/storage/repository.ts`) and protected `/api/admin/actions` endpoint, `/admin` provides a 6-tab App Manager:

1. **Theme & Site Config**:
   - Switch global active **Season Theme** (`Fall`, `Spring`, `Summer`, `Winter`), **Default Contrast Mode** (`Light`, `Dark`), **Masthead Announcement Banner**, and curator submission email addresses (`submissions@greenvillediyarchive.org`, `auctions@thebartermarket.org`).
2. **Media & Archive CRUD**:
   - **Videos + Multi-Segment Timestamps**: Publish unlisted YouTube videos with custom multi-segment timestamp rows (`00:00 — Intro`, `04:12 — Set`) or remove existing tapes.
   - **24-Bit FLAC Audio Tracks**: Add lossless recordings with `sourceType` (`samply`, `gdrive`, or `r2`), Google Drive URL/File ID auto-extractor, optional local-file 42-bar waveform analyzer, bit-depth/sample-rate spec, and harmonic preview frequency, or remove tracks.
   - **35mm Photo Plates**: Add archival photography plates via Google Drive File ID or R2 URL (title, photographer, venue, year, hashtags) or remove plates.
   - **Scene Artists & Bands**: Add bands/artists/collectives, toggle any artist between `● ACTIVE` and `○ INACTIVE` in one click, or remove entries.
   - **Comment Moderation**: Delete flagged comments from the on-site Scene Board.
3. **Calendar & Flyer Publisher**:
   - Publish shows to the 7-column calendar with `punk-xerox`, `concrete-stencil`, or `riso-zine` flyer styling, and delete past/cancelled shows.
4. **Barter Market Auctions & IG Webhook Manager**:
   - Publish vetted artist auction photo cards (backed by Google Drive or R2 image URLs), toggle `LIVE` / `SOLD` status overrides, delete items, or trigger a simulated [Instagram Graph API Comments](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/comments) `SOLD` webhook.
5. **Subscriber & Contact CSV Manager**:
   - Inspect/delete rows silently ingested from public `Message Us` and `Live Chat`, download the RFC-4180 `.CSV` spreadsheet, or copy the Mailchimp LLM segmentation prompt.
6. **Pass 3 Hostinger & Storage Cutover Ledger**:
   - Interactive ledger tracking the simplified Hostinger MySQL, Google Drive Service Account, Cloudflare R2 sync, and Meta Webhook cutover tasks (`Planned`, `In Progress`, `Deferred`, `Completed`).

## PART II: REFINED PASS 3 INFRASTRUCTURE LEDGER (HOSTINGER + GOOGLE DRIVE / R2 EDITION)

Expensive Google Cloud SQL, Firestore, and Cloud Run FFmpeg worker dependencies from the initial draft have been replaced with zero-extra-cost Hostinger MySQL, Google Drive API v3 / Cloudflare R2 storage, and client-side Web Audio peak extraction:

| ID | Deferred Pass 3 / Hostinger Cutover Task | Why It Is Deferred Until Hostinger Provisioning | Exact Prerequisite for Pass 3 Execution |
| :--- | :--- | :--- | :--- |
| `P3-01` | **Hostinger Local MySQL (`127.0.0.1:3306`) Schema Migration & Live Cutover** | Replaces paid Cloud SQL / Firestore. Requires creating the MySQL database inside Hostinger hPanel and injecting credentials so data survives Hostinger's on-demand Node.js process sleep ([Hostinger Node.js Overview](https://docs.hostinger.com/node.js/overview)). | Create DB in `hPanel -> Databases -> MySQL Databases`, run `schema.sql` in phpMyAdmin, and set `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` ([Hostinger Databases](https://docs.hostinger.com/websites/databases)). |
| `P3-02` | **Google Drive Service Account API Streamer + Optional Cloudflare R2 Sync** | Keeps 100% of binary media off Hostinger's SSD. Requires a Google Cloud Service Account JSON key shared on your curator Drive folder (and/or free [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) bucket keys for >1 TB/day or zero-proxy FLAC streaming). | Share a Google Drive `Greenville_DIY_Media` folder with a Service Account email (`GDRIVE_CLIENT_EMAIL`, `GDRIVE_PRIVATE_KEY`) and put Cloudflare free CDN in front of the domain; optionally add `R2_PUBLIC_URL` + R2 S3 keys for one-click Drive-to-R2 mirroring. |
| `P3-03` | **Live Meta App Review & Production Instagram Graph API Webhook Subscription** | `/api/webhooks/instagram` is implemented with HMAC-SHA256 verification, but live Instagram comment events require a Meta Developer App approved for `instagram_business_manage_comments` ([Instagram Graph API](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/comments)). | Complete Meta App Review and register `https://thebartermarket.org/api/webhooks/instagram` with `IG_APP_SECRET` and `IG_VERIFY_TOKEN` in Hostinger env vars. |
| `P3-04` | **Multi-Curator MySQL Accounts & Audit Log (Zero External Auth Cost)** | Pass 2 uses a single shared HMAC-signed passkey (`ADMIN_PASSKEY`). Per-curator logins (`bookings` vs. `barter_mod`) can live directly in a `curators` MySQL table on Hostinger without paying for an external OAuth provider. | Add `curators` + `audit_logs` tables to Hostinger MySQL (`127.0.0.1:3306`) in Pass 3. |
| `P3-05` | **Optional Google Sheets Live Mirror for Subscriber CSV** | Curators may want `Message Us` submissions mirrored live into a shared Google Sheet alongside the `/admin` RFC-4180 `.CSV` download, using the same free Google Service Account from `P3-02`. | Enable Google Sheets API on the same Google Cloud project and set `GSHEETS_SUBSCRIBER_SPREADSHEET_ID` in Hostinger env vars. |

## PART III: HOSTINGER TIER SELECTION & STEP-BY-STEP DEPLOYMENT Architecture

### 1. Hostinger Plan Comparison for `greenvillediyarchive.org` + `thebartermarket.org`

| Hostinger Plan | Typical Intro Cost | Node.js Architecture & Limits | Included Extras | Verdict for Greenville DIY Archive |
| :--- | :--- | :--- | :--- | :--- |
| **Business Web Hosting** ([Hostinger Node.js Hosting](https://www.hostinger.com/nodejs-hosting)) | `~$2.79–$3.99/mo` (promotional multi-year) | Managed **Web Apps** in hPanel; Node 18/20/22/24; Next.js standalone server mode; `120` NPROC / `60` Entry processes ([Plan Limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/)); sleeps when idle | Free MySQL (`127.0.0.1:3306`), free SSL, daily/weekly backups ([Hostinger Backups](https://docs.hostinger.com/websites/backups)), free custom-domain mailboxes, up to 50–100 websites | **Best Cheap & Reliable Default**: Runs your Next.js App Router archive, MySQL DB, and domain emails on one `$3–$4/mo` bill with zero Linux maintenance. |
| **Cloud Startup** ([Next.js Hosting](https://www.hostinger.com/web-apps-hosting/nextjs-hosting)) | `~$7.99/mo` (promotional) | Managed **Web Apps** in hPanel; dedicated resources; `200` NPROC / `100` Entry processes; up to `10` Node apps | Dedicated IP, priority support, MySQL, free mailboxes | **Skip at Launch**: Only needed if concurrent uncached API traffic outgrows Business Web Hosting. |
| **KVM 1 VPS + Coolify** ([Hostinger Coolify VPS](https://www.hostinger.com/vps/coolify-hosting)) | `~$4.99–$6.49/mo` (promotional) | Full root Docker VPS (1 vCPU, 4 GB RAM, 50 GB NVMe) with 1-click Coolify self-hosted PaaS; **never sleeps** | Persistent WebSockets, custom Docker workers, PostgreSQL/MySQL containers | **Power-User Alternative**: Pick only if you want always-on WebSocket chat without process sleep and are comfortable managing a VPS + external email forwarding. |

### 2. Multi-Domain Routing (`greenvillediyarchive.org` + `thebartermarket.org`)
- Deploy the Next.js codebase once as your primary **Node.js web app** under `greenvillediyarchive.org` ([Creating a Node.js App](https://docs.hostinger.com/node.js/creating-an-app)).
- Point `thebartermarket.org` to the app (or configure a domain redirect/alias to `greenvillediyarchive.org/?tab=auctions` or host-header check in Next.js `middleware.ts` so visiting `thebartermarket.org` opens the **Monthly Auctions** view directly while sharing the exact same MySQL database and `/admin` manager).

### 3. Next.js Build & Config Requirements for Hostinger
- Keep `package.json` at the repository root with `"build": "next build"` and `"start": "next start"`—Hostinger auto-detects Next.js, defaults to **Node.js 22 LTS**, builds `.next`, and starts the Next.js server automatically inside `~/domains/greenvillediyarchive.org/hbuilds/current/nodejs` without requiring a custom entry file ([Hostinger Node.js Overview](https://docs.hostinger.com/node.js/overview)).
- In `next.config.ts`, configure `images: { unoptimized: true }` (or allow your Cloudflare R2 custom domain in `remotePatterns`) so Hostinger's `120` NPROC budget is never spent running sharp/CPU image resizing on concurrent 35mm gallery loads.

## Planned File Modifications for Pass 2

| Path | Action | Purpose |
| :--- | :--- | :--- |
| `next.config.ts` | Update | Add `images: { unoptimized: true }` and `remotePatterns` for R2/Drive proxy compatibility on Hostinger Business Web Hosting |
| `lib/media/resolveMediaUrl.ts` | Create | Parse Google Drive URLs/IDs into `/api/media/drive/[fileId]`, resolve Cloudflare R2 / Samply / YouTube URLs, and compute client-side 42-bar Web Audio waveform peaks |
| `app/api/media/drive/[fileId]/route.ts` | Create | Authenticated Google Drive API v3 (`alt=media`) streaming proxy with HTTP `Range` (`206 Partial Content`) pass-through and immutable Cloudflare CDN `Cache-Control` headers |
| `lib/storage/mysql-schema.sql` | Create | Ready-to-import phpMyAdmin SQL schema (`videos`, `flac_tracks`, `photos`, `artists`, `calendar_shows`, `auctions`, `comments`, `subscribers`, `site_config`, `pass3_tasks`) for Hostinger MySQL (`127.0.0.1:3306`) |
| `lib/storage/repository.ts` | Update | Dual-mode adapter (AI Studio `globalThis` preview fallback + Hostinger `mysql2` `127.0.0.1:3306` driver) with full CRUD for all 6 `/admin` tabs and updated Hostinger Pass 3 Ledger seed |
| `app/api/admin/actions/route.ts` | Update | Expose authenticated admin actions for video/FLAC/photo/artist/calendar/comment CRUD including `sourceType` (`samply` / `gdrive` / `r2`) |
| `app/admin/login/page.tsx` | Create | Dedicated URL-only `/admin/login` frosted liquid-glass authentication page with passkey verification and redirect to `/admin` |
| `app/admin/page.tsx` | Create | Server-protected `/admin` App Manager route using `verifyAdminSession()` and `redirect('/admin/login')` |
| `components/admin/AdminManagerClient.tsx` | Create | Dedicated 6-tab Admin Manager interface with Google Drive URL/File ID auto-parser, client-side FLAC peak analyzer, and Hostinger Pass 3 Ledger |
| `components/shell/ResponsiveArchiveShell.tsx` | Update | Remove unauthenticated Admin UI links, show conditional `Admin Manager ↗` link only when logged in, and strip verbose copy/badges |
| `components/calendar/MonthFlyerCalendar.tsx` | Update | Remove verbose instructional subtitles and internal meta-labels; refine flyer card spacing |
| `components/timeline/TactilePortholeTimeline.tsx` | Update | Remove instructional subtitle and refine porthole stage padding |
| `app/globals.css` | Update | Calibrate cozy, breathable margins, card padding, grid spacing, and `6px–14px` rounded liquid-glass geometry |
| `app/page.tsx` | Update | Check `verifyAdminSession()` on the server, support `?tab=auctions` / `thebartermarket.org` host routing, and pass `isAdminAuthenticated` to `ResponsiveArchiveShell` |

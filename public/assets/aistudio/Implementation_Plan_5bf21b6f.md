# Greenville DIY Archive & Barter Market — Hostinger + Built-In Puck Edition: Pass 2 Specification & Pass 3 Ledger

## PART I: PASS 2 IMPLEMENTATION SPECIFICATION (SELF-CONTAINED IN APP)

### 1. Invisible-Until-Authenticated `/admin` & `/admin/login` Architecture
To ensure public visitors never see administrative entry points unless they know the URL or hold an active administrator session ([Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)):

- **Zero Public Admin Links When Logged Out**:
  - Remove the `Admin Portal` button from the public desktop left index rail and the mobile `More` slide-up sheet for unauthenticated visitors.
  - Remove the inline `'admin'` tab from the public `ResponsiveArchiveShell` so the public shell is dedicated exclusively to the 8 archival and barter modules (`Videos`, `Audio (FLAC)`, `Photos`, `Artists`, `Calendar`, `Timeline`, `Remembered`, `Auctions`) plus public `/p/[slug]` zine pages.
- **Dedicated Next.js App Router Pages (`/admin/login`, `/admin`, `/admin/editor/[slug]`)**:
  - **`app/admin/login/page.tsx`**: Standalone frosted liquid-glass authentication gateway reachable only via `/admin/login`. Verifies `process.env.ADMIN_PASSKEY` (falling back to `poe2026` in preview) via `POST /api/admin/auth`, sets the Web Crypto HMAC-SHA256 `httpOnly` cookie (`gvl_diy_admin_session`), and redirects to `/admin`.
  - **`app/admin/page.tsx` & `app/admin/editor/[slug]/page.tsx`**: Server-guarded routes invoking `verifyAdminSession()` and immediately redirecting unauthenticated requests to `/admin/login`.
- **Conditional Authenticated Navigation Badges**:
  - When `verifyAdminSession()` returns `true`, pass `isAdminAuthenticated={true}` to the public archive so logged-in curators see a subtle `Admin Manager ↗` link in the desktop rail footer and mobile `More` sheet, plus one-click `Edit Slot Visually ↗` links on inline Puck slots.

### 2. Built-In Puck Visual Page & Section Studio (`@puckeditor/core`)
Pre-install and wire [`@puckeditor/core`](https://puckeditor.com/docs/getting-started) (`^0.24.0`) directly into the app so curators can visually drag, reorder, nest, and edit individual sections and standalone pages in the browser—with **zero manual setup on import** and **zero editor JS shipped to public visitors** ([Puck React Server Components](https://puckeditor.com/docs/integrating-puck/server-components)):

- **Server-Safe Liquid Glass Block Config (`lib/puck/puck.config.tsx`)**:
  - Shared `Config` avoiding client hooks inside `puck.config.tsx` and using Puck's native `slot` field (never deprecated `DropZone`) so `<Render />` runs inside React Server Components.
  - Pre-registered blocks styled with `6px–14px` rounded architectural angles (zero chamfers/bevels) and iOS frosted liquid glass: `LiquidGlassBanner`, `ArchivalMediaCard` (auto-resolving Google Drive File IDs/URLs), `MixedMediaFlyerBlock`, `MemorialSpotlightBlock`, `TwoColumnLayout` (`slot` columns), and `SandboxedHtmlZineBlock` (isolated `<iframe sandbox="" srcDoc>` for custom HTML/CSS flyers).
- **Scoped Editor Stylesheet & Responsive Canvas (`components/admin/PuckEditorClient.tsx`)**:
  - Imports `"@puckeditor/core/puck.css"` ([Puck Theming](https://puckeditor.com/docs/extending-puck/theming)) strictly inside the admin `"use client"` editor bundle, exposes `390px` / `820px` / `1280px` viewport previews, and publishes JSON layouts to `POST /api/admin/puck` with `revalidatePath()` for instant live updates.
- **Pre-Seeded Inline Slots & Standalone `/p/[slug]` Pages**:
  - Seeds editable inline slots (`slot:videos-top`, `slot:remembered-top`, `slot:auctions-top`) inside the main archive tabs plus a sample custom page (`/p/poe-mill-concrete-history`) rendered on the server at `app/p/[slug]/page.tsx`.

### 3. Cozy Spacing, Rounded Architectural Angles & Low-Verbosity Cleanup
- **Strip Unnecessary Helper Copy & Meta-Badges**: Remove `SEASON: FALL`, `UNLISTED · YT COMMENTS OFF`, verbose `SAMPLY ENGINE` strings (keep concise `24-bit / 48 kHz FLAC`), `Tap highlighted day to unfurl flyer`, `CUSTOM MIXED-MEDIA FLYER CSS`, and timeline scroll instructions.
- **Cozy Architectural Margins**: Use `28px 36px 120px` desktop workspace padding (`18px 16px 136px` mobile above the `58px` 5-slot bottom bar), `18px` card grid gaps, `15px 18px` card padding, and `20px–24px` stage padding.

### 4. Auto-Bootstrapping Hostinger MySQL & Off-Server Media Proxy
- **Zero-Touch Auto-Migrating Dual-Mode Repository (`lib/storage/repository.ts`)**:
  - Uses seeded `globalThis` memory when `DB_HOST` is unset (AI Studio preview).
  - Automatically switches to `mysql2/promise` (`DB_HOST=127.0.0.1`, `DB_PORT=3306` per [Hostinger Databases](https://docs.hostinger.com/websites/databases)) when `DB_HOST` is present in [Hostinger Environment Variables](https://docs.hostinger.com/node.js/environment-variables), executing `CREATE TABLE IF NOT EXISTS` (including `puck_pages`) and seeding empty tables automatically on first boot so data survives [Hostinger Node.js idle process sleep](https://docs.hostinger.com/node.js/overview) with **zero manual SQL setup**.
- **Off-Hostinger Media Resolver (`lib/media/resolveMediaUrl.ts` & `/api/media/drive/[fileId]`)**:
  - Parses pasted Google Drive share links or File IDs into `/api/media/drive/[fileId]`, streaming via [Google Drive API v3](https://developers.google.com/workspace/drive/api/guides/manage-downloads) (`alt=media`) with HTTP `Range` (`206 Partial Content`, [MDN 206](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/206)) and immutable `Cache-Control` headers for Cloudflare edge caching, alongside [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/), [Samply](https://docs.samply.app/playback-quality.html), and Unlisted YouTube, plus browser Web Audio 42-bar waveform peak extraction on upload.
- **7-Tab `/admin` App Manager**: `Visual Studio (Puck)`, `Theme & Site Config`, `Media & Archive CRUD`, `Calendar & Flyer Publisher`, `Barter Market Auctions`, `Subscriber & Contact CSV`, and `Hostinger Cutover Ledger`.

## PART II: PASS 3 EXTERNAL CREDENTIAL CUTOVER LEDGER (ZERO CODE CHANGES NEEDED)

Because Puck, auto-migrating MySQL tables, HTTP polling, and the Google Drive streaming route are all compiled directly into Pass 2, importing to [Hostinger Business Web Hosting](https://docs.hostinger.com/node.js/creating-an-app) only requires dropping environment variables into hPanel:

| ID | External Provisioning Step | Why It Happens at Hostinger Deploy Time | Exact Environment Variables / Action |
| :--- | :--- | :--- | :--- |
| `P3-01` | **Connect Hostinger Local MySQL (`127.0.0.1:3306`)** | Tables (`puck_pages`, `videos`, `flac_tracks`, etc.) auto-create on first boot once hPanel DB credentials exist ([Hostinger Databases](https://docs.hostinger.com/websites/databases)). | Create DB in `hPanel -> Databases -> MySQL Databases` and set `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |
| `P3-02` | **Connect Google Drive Curator Folder (or Cloudflare R2)** | `/api/media/drive/[fileId]` needs a free Google Cloud Service Account shared as Viewer on your Drive media folder ([Google Drive Limits](https://developers.google.com/workspace/drive/api/guides/limits)). | Share Drive folder with Service Account, set `GDRIVE_CLIENT_EMAIL` & `GDRIVE_PRIVATE_KEY`, and enable Cloudflare free proxy DNS (`www` redirected at edge per [Plan Limits](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/)). |
| `P3-03` | **Live Meta App Review for Instagram `SOLD` Webhooks** | `/api/webhooks/instagram` is built in, but live events require Meta approval for `instagram_business_manage_comments` ([Instagram Graph API](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/comments)). | Register `https://thebartermarket.org/api/webhooks/instagram` and set `IG_APP_SECRET` & `IG_VERIFY_TOKEN`. |

## Planned File Modifications for Pass 2

| Path | Action | Purpose |
| :--- | :--- | :--- |
| `package.json` & `next.config.ts` | Update | Add `@puckeditor/core` and `mysql2`; set `images: { unoptimized: true }` for Hostinger Business Web Hosting |
| `lib/puck/puck.config.tsx` | Create | Server-safe Puck `Config` with 6 Liquid Glass blocks (`6px–14px` radii), `slot` columns, and sandboxed `<iframe srcDoc>` flyer block |
| `app/admin/editor/[slug]/page.tsx` & `components/admin/PuckEditorClient.tsx` | Create | Server-guarded full-screen Puck visual studio loading `@puckeditor/core/puck.css` only for authenticated admins |
| `app/api/admin/puck/route.ts` & `app/p/[slug]/page.tsx` | Create | Save Puck JSON to MySQL/`globalThis` with `revalidatePath()`, and server-render custom `/p/[slug]` pages with zero editor JS |
| `lib/media/resolveMediaUrl.ts` & `app/api/media/drive/[fileId]/route.ts` | Create | Auto-parse Google Drive URLs/IDs, stream `alt=media` with `Range` (`206`) + immutable CDN cache headers, and extract 42-bar Web Audio peaks |
| `lib/storage/repository.ts` & `app/api/admin/actions/route.ts` | Update | Dual-mode `globalThis` + auto-bootstrapping `mysql2` (`127.0.0.1:3306`) adapter (`CREATE TABLE IF NOT EXISTS` on boot) + full 7-tab CRUD |
| `app/admin/login/page.tsx`, `app/admin/page.tsx` & `components/admin/AdminManagerClient.tsx` | Create | Invisible URL-only login gateway and 7-tab App Manager led by the **Visual Studio (Puck)** manager |
| `components/shell/ResponsiveArchiveShell.tsx`, `app/page.tsx` & `app/globals.css` | Update | Hide unauthenticated admin links, render inline `<Render />` Puck slots, strip verbose badges, and calibrate cozy Liquid Glass spacing |

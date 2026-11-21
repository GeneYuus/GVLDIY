# Pass 2 Agent Prompt — Self-Contained Puck Visual Studio, Hostinger MySQL Auto-Bootstrap & Off-Server Media

Copy and paste everything below directly to your coding agent (in **Google AI Studio Build Mode**, Cursor, or Claude Code) to build the entire Puck visual editor, dual-mode Hostinger MySQL persistence, Google Drive media proxy, and Pass 2 UI refinements directly into the app so zero manual code setup is required on import:

You are acting as a unified **UI/UX Design Council, Systems Architecture Council, and Security Council**. Execute **Pass 2** on the **Greenville DIY Archive & Barter Market** ([Next.js App Router](https://nextjs.org/docs/app) + TypeScript) codebase so that **Puck visual block editing (`@puckeditor/core`)**, **auto-bootstrapping Hostinger MySQL persistence**, **Google Drive / Cloudflare R2 off-server media resolution**, and **invisible `/admin` authentication** are 100% built in and work automatically both in preview mode and upon Git import to [Hostinger Node.js Web Apps](https://docs.hostinger.com/node.js/overview).

### 1. Package & Build Configuration (Zero Manual Setup on Import)

* **`package.json`**: Add `"@puckeditor/core": "^0.24.0"` ([Puck Getting Started](https://puckeditor.com/docs/getting-started)) and `"mysql2": "^3.11.0"` to `dependencies`. Keep `"build": "next build"` and `"start": "next start"` at the repository root so Hostinger auto-detects Next.js on Node.js 22 LTS ([Hostinger Git Deployments](https://docs.hostinger.com/node.js/git-deployments)).
* **`next.config.ts`**: Set `images: { unoptimized: true }` so image rendering never consumes [Hostinger Business Web Hosting](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/) `120` NPROC process threads.
* **No Inbound WebSockets**: Never use `Socket.IO` or persistent background daemons; refresh `Scene Room` chat and `LIVE` / `SOLD` auction states via lightweight client HTTP polling (`every 8s` only while the tab/drawer is open) so the app runs cleanly on managed Hostinger Business Web Hosting without a VPS.

### 2. Self-Bootstrapping Dual-Mode Repository (`lib/storage/repository.ts`)

Because Hostinger Node.js Web Apps sleep after idle periods ([Hostinger Node.js Overview](https://docs.hostinger.com/node.js/overview)), implement a zero-touch dual-mode data layer in `lib/storage/repository.ts`:

* **Preview Mode (Default when `process.env.DB_HOST` is unset)**: Read and mutate a deterministic seeded `globalThis.__gvlDiyStore` object (including seeded `puckPages` slots and custom pages) so every feature and visual editor button works immediately in Google AI Studio preview with zero credentials.
* **Hostinger Production Mode (Automatic when `process.env.DB_HOST` is set)**:
  * Connect via `mysql2/promise` pool using `DB_HOST` (defaulting to IPv4 `127.0.0.1`—never `localhost`, which fails over IPv6 `::1` on Hostinger per [Hostinger Databases](https://docs.hostinger.com/websites/databases)), `DB_PORT` (`3306`), `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
  * **Automatic Schema & Seed Initialization (`ensureSchemaInitialized()`)**: On the first connection per server boot, automatically execute `CREATE TABLE IF NOT EXISTS` for `site_config`, `videos`, `flac_tracks`, `photos`, `artists`, `calendar_shows`, `places_remembered`, `auctions`, `comments`, `subscribers`, `puck_pages` (`slug VARCHAR(120) PRIMARY KEY, title VARCHAR(255) NOT NULL, is_slot TINYINT(1) DEFAULT 0, published TINYINT(1) DEFAULT 1, puck_data JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`), and `pass3_tasks`. If `site_config` or `puck_pages` is empty, automatically insert the initial Greenville DIY seed data so deploying to Hostinger requires **zero manual SQL imports**.

### 3. Built-In Puck Visual Page & Section Studio (`@puckeditor/core`)

Integrate [Puck](https://puckeditor.com/docs/integrating-puck/server-components) end-to-end so curators can visually drag, reorder, nest, and edit individual sections and custom zine pages in the browser without touching code or triggering rebuilds:

* **Shared Server-Safe Config (`lib/puck/puck.config.tsx`)**:
  * Export `puckConfig: Config<ArchivePuckProps>` without `useState` or browser-only globals inside `puck.config.tsx` so it is 100% compatible with both `<Puck />` on the client and `<Render />` inside Next.js React Server Components ([Puck React Server Components](https://puckeditor.com/docs/integrating-puck/server-components)).
  * Use Puck's native `slot` field type (never the deprecated `DropZone` component) for multi-column/nested layouts.
  * Enforce the project's **iOS Frosted Liquid Glass** aesthetic (`backdrop-filter: blur(24px) saturate(190%)`, specular inner top highlight, and **small rounded architectural angles `6px–14px` with zero chamfering or beveling**) across 6 pre-registered blocks grouped by category:
    1. **`LiquidGlassBanner`**: Eyebrow badge (`6px` radius), headline, concise description, optional CTA label + URL, and accent style (`neutral`, `sienna`, `sage`, `ice`).
    2. **`ArchivalMediaCard`**: Heading, body copy, media source (`Google Drive File ID/URL` auto-converted to `/api/media/drive/[id]` or direct image URL), aspect ratio (`16:9`, `4:3`, `3:2`), and padding preset (`cozy` `15px 18px` vs. `stage` `24px`).
    3. **`MixedMediaFlyerBlock`**: Date/doors/price header, lineup title, venue, flyer aesthetic (`punk-xerox`, `concrete-stencil`, `riso-zine`), and show notes (`12px` card radius).
    4. **`MemorialSpotlightBlock`**: Venue/spot name, active years, Greenville/Upstate neighborhood, archival photo source, and tribute paragraphs (`14px` stage radius).
    5. **`TwoColumnLayout`**: Left and right `slot` drop zones with selectable gap (`16px`, `20px`, `24px`) and mobile stacking (`<= 820px`) so curators can visually nest cards side-by-side.
    6. **`SandboxedHtmlZineBlock`**: Title, height (`px`), and raw HTML/CSS textarea rendered safely inside an isolated `<iframe sandbox="" srcDoc={html} />` (`12px` radius) so custom hand-coded or external HTML flyer exports never leak CSS into the main shell.
* **Pre-Seeded Editable Section Slots + Custom `/p/[slug]` Pages**:
  * Seed three live inline section slots in `puck_pages` (`slot:videos-top`, `slot:remembered-top`, and `slot:auctions-top`) rendered via `<Render config={puckConfig} data={slotData} />` inside their respective archive tabs whenever non-empty, plus one example standalone zine page (`poe-mill-concrete-history`) reachable at `/p/poe-mill-concrete-history`.
  * Create `app/p/[slug]/page.tsx` as an async React Server Component (`params: Promise<{ slug: string }>`) wrapped in the archive's seasonal Liquid Glass theme and header link back to `/`, rendering `<Render config={puckConfig} data={page.puckData} />` with **zero Puck editor JS or CSS shipped to public visitors**.
* **Guarded Full-Screen Visual Editor (`app/admin/editor/[slug]/page.tsx` & `components/admin/PuckEditorClient.tsx`)**:
  * On the server, call `verifyAdminSession()` ([Next.js DAL Auth](https://nextjs.org/docs/app/guides/authentication)) and `redirect('/admin/login')` if unauthenticated.
  * Inside `"use client"` `PuckEditorClient.tsx`, import `"@puckeditor/core/puck.css"` ([Puck Theming](https://puckeditor.com/docs/extending-puck/theming)) **only** in this admin client module, configure responsive viewport presets (`390px` Mobile, `820px` Tablet, `1280px` Desktop), include a top bar link (`← Back to Admin Manager` and `View Live ↗`), and wire `onPublish` to `POST /api/admin/puck` (which validates `verifyAdminSession()`, saves `puckData` to `repository.ts`, calls `revalidatePath('/')` and `revalidatePath('/p/' + slug)`, and shows a concise saved toast).

### 4. Off-Hostinger Media Resolver & Google Drive Streaming Proxy

Keep 100% of binary media off Hostinger's SSD:

* **`lib/media/resolveMediaUrl.ts`**: Helper that extracts the clean Drive `fileId` if a curator pastes a full `https://drive.google.com/file/d/{fileId}/view...` link or raw ID, returning `/api/media/drive/${fileId}`, while passing through [Samply](https://docs.samply.app/playback-quality.html), `youtube-nocookie.com`, and [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) (`https://...`) URLs unchanged. Also export a browser Web Audio helper `extractWaveformPeaksFromFile(file, 42)` so curators can optionally drop a local `.flac`/`.wav` file in `/admin` to auto-populate the 42-bar RMS waveform array in JSON without any server FFmpeg worker.
* **`app/api/media/drive/[fileId]/route.ts`**: Authenticated [Google Drive API v3](https://developers.google.com/workspace/drive/api/guides/manage-downloads) (`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`) `GET` route using Web Crypto JWT signing (`GDRIVE_CLIENT_EMAIL` + `GDRIVE_PRIVATE_KEY` env vars, with a clean SVG/audio preview fallback when unset in AI Studio), forwarding incoming `Range` headers (`206 Partial Content`, [MDN 206](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/206)) and setting `Cache-Control: public, max-age=31536000, immutable` for Cloudflare edge caching.

### 5. Invisible `/admin` Gateway, 7-Tab App Manager & Cozy Low-Verbosity UI

* **Invisible-Until-Authenticated Admin**:
  * Remove all `Admin Portal` buttons and `'admin'` tabs from the public desktop left rail and mobile `More` sheet when logged out.
  * Serve `app/admin/login/page.tsx` (passkey `poe2026` fallback when `process.env.ADMIN_PASSKEY` is unset -> `POST /api/admin/auth` -> HMAC-SHA256 `httpOnly` cookie `gvl_diy_admin_session`) and `app/admin/page.tsx` (`verifyAdminSession()` -> `redirect('/admin/login')` when unauthenticated).
  * Pass `isAdminAuthenticated` from `app/page.tsx` to `ResponsiveArchiveShell` so logged-in curators see a subtle `Admin Manager ↗` badge in the rail footer and mobile `More` sheet, plus quick `Edit Slot in Puck ↗` pills above inline Puck slots.
* **7-Tab `<AdminManagerClient />` Workspace**:
  1. **Visual Studio (Puck)**: List the 3 inline tab slots (`slot:videos-top`, `slot:remembered-top`, `slot:auctions-top`) and all custom `/p/[slug]` pages; create/delete custom pages, copy public `/p/[slug]` links, and launch `/admin/editor/[slug]` in one click.
  2. **Theme & Site Config**: Switch active Season (`Fall`, `Spring`, `Summer`, `Winter`), Default Contrast (`Light`, `Dark`), Masthead Banner, and curator emails.
  3. **Media & Archive CRUD**: Full add/delete for Unlisted YouTube Videos + multi-segment timestamps, 24-bit FLAC tracks (supporting Google Drive URL/ID paste + client-side 42-bar peak analyzer), 35mm Photo Plates (Drive URL/ID or R2 URL), Artists (`● ACTIVE` / `○ INACTIVE` toggle), and Scene Board comment moderation.
  4. **Calendar & Flyer Publisher**: Add/delete 7-column calendar shows (`punk-xerox`, `concrete-stencil`, `riso-zine`).
  5. **Barter Market Auctions**: Add/delete auction photo cards, toggle `LIVE` / `SOLD`, or test the HMAC-verified [Instagram Graph API](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-media/comments) `/api/webhooks/instagram` `SOLD` simulator.
  6. **Subscriber & Contact CSV**: Inspect/delete `Message Us` & `Live Chat` contacts, download RFC-4180 `.csv`, and copy the Mailchimp segmentation prompt.
  7. **Hostinger Cutover Ledger**: Interactive checklist pre-loaded with the Hostinger `127.0.0.1:3306` MySQL env vars, Google Drive Service Account keys, Cloudflare DNS caching rules, and Meta Webhook setup steps.
* **Cozy Spacing & Verbosity Cleanup**:
  * Strip read-only technical meta-badges (`SEASON: FALL`, `UNLISTED · YT COMMENTS OFF`, `SAMPLY ENGINE`, `Tap highlighted day to unfurl flyer`, `CUSTOM MIXED-MEDIA FLYER CSS`, `Scroll wheel, drag slider...`).
  * Apply breathable workspace padding (`28px 36px 120px` desktop; `18px 16px 136px` mobile above the `58px` 5-slot bottom bar), `18px` card grid gaps, `15px 18px` card body padding, and `20px–24px` stage padding, plus `thebartermarket.org` / `?tab=auctions` initial tab routing in `app/page.tsx`.

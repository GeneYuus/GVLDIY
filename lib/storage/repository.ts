// lib/storage/repository.ts
import type { Pool } from 'mysql2/promise';
import {
  AdminSiteSettings,
  ArchiveDataset,
  AuditLogEntry,
  CommentNode,
  CommentReply,
  FlacRecording,
  FlacVersionSource,
  FlyerPresetStyle,
  FutureTaskLedgerItem,
  InstagramAuctionItem,
  MediaSourceType,
  PhotoPlate,
  PuckPageRecord,
  PuckSerializedData,
  RememberedPlace,
  RuntimePostureSnapshot,
  SceneArtist,
  SceneChatMessage,
  ShowCalendarEvent,
  SubscriberCsvRow,
  TaskStatus,
  TimelineEra,
  VideoTape,
  VideoTimestamp,
} from '@/types/archive';
import {
  getRuntimePostureSnapshot,
  isHostingerMysqlConfigured,
} from '@/lib/config/runtimeEnv';
import { sanitizeScopedFlyerCss } from '@/lib/security/sanitize';
import {
  IMG_BORO_GLASS,
  IMG_FUZZ_PEDAL,
  IMG_POE_MILL,
  IMG_THE_BARN,
  IMG_VELO_STAGE,
} from '@/lib/storage/embedded-media';
import {
  buildDeterministicPeaks,
  extractYoutubeVideoId,
  resolveMediaUrl,
} from '@/lib/media/resolveMediaUrl';
import {
  appendCommentReplySql,
  appendSceneChatSql,
  countTableRowsSql,
  deleteArtistSql,
  deleteAuctionSql,
  deleteCalendarShowSql,
  deleteCommentSql,
  deleteFlacSql,
  deleteFutureTaskSql,
  deleteOrClearPuckPageSql,
  deletePhotoSql,
  deletePlaceSql,
  deleteSceneChatSql,
  deleteSubscriberSql,
  deleteTimelineEraSql,
  deleteVideoSql,
  fetchAdminDatasetSql,
  fetchLivePollSnapshotSql,
  fetchPublicPayloadSql,
  findAuctionByMediaOrIdSql,
  getArtistByIdSql,
  getAuctionByIdSql,
  getCalendarShowByIdSql,
  getFlacByIdSql,
  getPhotoByIdSql,
  getPlaceByIdSql,
  getPuckPageBySlugSql,
  getReadyMysqlPool,
  getSiteSettingsSql,
  getSubscriberByIdSql,
  getTimelineEraByIdSql,
  getVideoByIdSql,
  insertArtistSql,
  insertAuctionSql,
  insertCalendarShowSql,
  insertCommentSql,
  insertFlacSql,
  insertFutureTaskSql,
  insertPhotoSql,
  insertPlaceSql,
  insertSubscriberSql,
  insertTimelineEraSql,
  insertVideoSql,
  insertAuditLogSql,
  isPublishedDriveFileIdSql,
  listAuditLogsSql,
  listPuckPagesSql,
  listSubscribersSql,
  reorderTimelineErasSql,
  updateArtistSql,
  updateAuctionSql,
  updateCalendarShowSql,
  updateFlacSql,
  updateFutureTaskStatusSql,
  updatePhotoSql,
  updatePlaceSql,
  updateSubscriberSql,
  updateTimelineEraSql,
  updateVideoSql,
  upsertPuckPageSql,
  upsertSiteSettingsSql,
  voteCommentAtomicSql,
} from '@/lib/storage/mysqlRelationalDriver';

const SEED_PUCK_PAGES: PuckPageRecord[] = [
  {
    slug: 'slot:videos-top',
    title: 'Videos Tab · Top Editorial Slot',
    isSlot: true,
    published: true,
    updatedAtIso: '2026-11-20T09:00:00Z',
    puckData: {
      root: { props: { title: 'Videos Tab · Top Editorial Slot' } },
      content: [
        {
          type: 'LiquidGlassBanner',
          props: {
            id: 'LiquidGlassBanner-videos-slot-1',
            eyebrow: 'CURATOR ZINE · POE MILL DIY',
            headline: '15 Years of Skater-Poured Concrete in West Greenville',
            description:
              'Explore 35mm contact sheets, bag-mix workdays, and early quarter-pipe pours in our standalone visual zine.',
            ctaLabel: 'Open Zine',
            ctaUrl: '/p/poe-mill-concrete-history',
            accentStyle: 'neutral',
          },
        },
      ],
    },
  },
  {
    slug: 'slot:remembered-top',
    title: 'Remembered Tab · Top Editorial Slot',
    isSlot: true,
    published: true,
    updatedAtIso: '2026-11-20T09:00:00Z',
    puckData: {
      root: { props: { title: 'Remembered Tab · Top Editorial Slot' } },
      content: [],
    },
  },
  {
    slug: 'slot:auctions-top',
    title: 'Auctions Tab · Top Editorial Slot',
    isSlot: true,
    published: true,
    updatedAtIso: '2026-11-20T09:00:00Z',
    puckData: {
      root: { props: { title: 'Auctions Tab · Top Editorial Slot' } },
      content: [
        {
          type: 'LiquidGlassBanner',
          props: {
            id: 'LiquidGlassBanner-auctions-slot-1',
            eyebrow: '0% PLATFORM CUT · COMMUNITY BARTER',
            headline: 'Bid Directly in Artist Instagram Comments',
            description:
              'When a vetted Upstate artist replies "SOLD" on their Instagram post, this board updates automatically.',
            ctaLabel: '',
            ctaUrl: '',
            accentStyle: 'neutral',
          },
        },
      ],
    },
  },
  {
    slug: 'poe-mill-concrete-history',
    title: 'Poe Mill DIY Concrete History (2011–2026)',
    isSlot: false,
    published: true,
    updatedAtIso: '2026-11-20T09:00:00Z',
    puckData: {
      root: { props: { title: 'Poe Mill DIY Concrete History (2011–2026)' } },
      content: [
        {
          type: 'LiquidGlassBanner',
          props: {
            id: 'LiquidGlassBanner-zine-hero',
            eyebrow: 'STANDALONE ARCHIVAL ZINE · WEST GREENVILLE',
            headline: 'Poe Mill Concrete History (2011–2026)',
            description:
              'How buckets, wheelbarrows, and 80-lb bags of Quikrete turned cracked textile-mill brick into Greenville’s anchor DIY skate foundation.',
            ctaLabel: 'Watch Poe Mill Tapes',
            ctaUrl: '/?tab=videos',
            accentStyle: 'sienna',
          },
        },
        {
          type: 'TwoColumnLayout',
          props: {
            id: 'TwoColumnLayout-zine-1',
            gap: '20px',
            leftColumn: [
              {
                type: 'ArchivalMediaCard',
                props: {
                  id: 'ArchivalMediaCard-zine-left',
                  kicker: 'Poe Mill · 2014 Workday',
                  heading: 'Hand-Troweled Coping & Brick Jersey Barrier',
                  body: 'Every transition at Poe Mill was funded out-of-pocket by skaters, bands, and benefit floor shows across Greenville and Marietta.',
                  sourceType: 'embedded',
                  mediaSource: IMG_POE_MILL,
                  aspectRatio: '16:9',
                  paddingPreset: 'cozy',
                },
              },
            ],
            rightColumn: [
              {
                type: 'MixedMediaFlyerBlock',
                props: {
                  id: 'MixedMediaFlyerBlock-zine-right',
                  headerMeta: 'CONCRETE BENEFIT · $8 / 1 BAG QUIKRETE',
                  lineupTitle: 'POE MILL POUR BENEFIT @ THE BARN',
                  venue: 'The Barn · Poinsett Corridor',
                  flyerStyle: 'concrete-stencil',
                  notes:
                    '100% of door money buys fast-set bags, rebar tie wire, and pool coping blocks for the north hip extension.',
                },
              },
            ],
          },
        },
        {
          type: 'MemorialSpotlightBlock',
          props: {
            id: 'MemorialSpotlightBlock-zine-spot',
            spotName: 'First Mill Foundation Quarter-Pipe',
            activeYears: '2011 – Present',
            neighborhood: 'West Greenville Mill Village',
            sourceType: 'embedded',
            photoSource: IMG_THE_BARN,
            tributeBody:
              'Poured over old industrial loading bays, the original slab taught a generation of Upstate skaters how to mix mud, set steel coping, and steward a shared neighborhood space.',
          },
        },
        {
          type: 'SandboxedHtmlZineBlock',
          props: {
            id: 'SandboxedHtmlZineBlock-zine-note',
            title: 'Poe Mill Patch Etiquette Bulletin',
            heightPx: 185,
            rawHtml: `<!doctype html>
<html>
<head>
<style>
  body {
    margin: 0;
    padding: 18px 20px;
    background: #12151c;
    color: #f4f1e8;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .tag { color: #ff5900; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
  h3 { margin: 6px 0 6px; font-size: 16px; }
  p { margin: 0; font-size: 12.5px; line-height: 1.5; color: #cbd5e1; }
</style>
</head>
<body>
  <div class="tag">ETIQ-01 · CURING &amp; STEWARDSHIP</div>
  <h3>Respect Wet Concrete Barriers (48-Hour Cure)</h3>
  <p>Pack out all cans and trash, park clear of residential driveways, and check Scene Room before Sunday patch mornings.</p>
</body>
</html>`,
          },
        },
      ],
    },
  },
];

const INITIAL_SEED: ArchiveDataset = {
  siteSettings: {
    seasonTheme: 'fall',
    defaultContrast: 'light',
    archiveSubmissionEmail: 'submissions@greenvillediyarchive.org',
    calendarSubmissionEmail: 'calendar@greenvillediyarchive.org',
    auctionSubmissionEmail: 'auctions@thebartermarket.org',
    updatedAtIso: '2026-11-19T21:15:00Z',
  },
  videos: [
    {
      id: 'VID-01',
      slug: 'vernon-tape-04-poe-mill-barn',
      title: 'Vernon Tape #04: Poe Mill Concrete + Friends @ The Barn',
      recordedDate: '2025-10-18',
      venue: 'Poe Mill & The Barn',
      filmer: 'Vernon',
      youtubeUnlistedId: 'M7lc1UVf-VE',
      posterUrl: IMG_POE_MILL,
      tags: ['poe-mill', 'the-barn', 'skate', 'vernon', 'greenville'],
      timestamps: [
        { sec: 0, time: '00:00', label: 'Poe Mill Quarter-Pipe Session' },
        { sec: 252, time: '04:12', label: 'Backside Smith on Poured Ledge' },
        { sec: 525, time: '08:45', label: 'String-Light Load-In @ The Barn' },
        { sec: 690, time: '11:30', label: 'Friends Full 3-Song Set' },
      ],
    },
    {
      id: 'VID-02',
      slug: 'rocco-and-his-bones-barn-floor-set',
      title: 'Rocco and His Bones — Full Floor Set at The Barn',
      recordedDate: '2024-11-02',
      venue: 'The Barn',
      filmer: 'Chandler',
      youtubeUnlistedId: 'M7lc1UVf-VE',
      posterUrl: IMG_THE_BARN,
      tags: ['rocco-and-his-bones', 'the-barn', 'punk-rock', 'greenville'],
      timestamps: [
        { sec: 0, time: '00:00', label: 'Amp Check & Feedback Intro' },
        { sec: 125, time: '02:05', label: 'Poinsett Static' },
        { sec: 400, time: '06:40', label: 'Mill Village Concrete' },
      ],
    },
    {
      id: 'VID-03',
      slug: 'velo-fellow-final-week-basement-reel',
      title: 'The Velo Fellow Final Week Basement Reel',
      recordedDate: '2024-12-05',
      venue: 'The Velo Fellow',
      filmer: 'Upstate Tape Crew',
      youtubeUnlistedId: 'M7lc1UVf-VE',
      posterUrl: IMG_VELO_STAGE,
      tags: ['velo-fellow', 'downtown', 'indie', 'greenville'],
      timestamps: [
        { sec: 0, time: '00:00', label: '1 Augusta St. Soundcheck' },
        { sec: 315, time: '05:15', label: 'Closing Singalong' },
      ],
    },
  ],
  audio: [
    {
      id: 'AUD-01',
      slug: 'curly-blue-no-room-on-poinsett',
      title: 'No Room on Poinsett (Barn Practice Tape)',
      artist: 'Curly Blue',
      venue: 'The Barn',
      recordedDate: '2022-09-14',
      durationSec: 214,
      bitDepth: 24,
      sampleRateHz: 48000,
      specLabel: '24-bit · 48 kHz FLAC',
      sourceType: 'samply',
      sourceIdOrUrl: 'smp-curly-blue-01',
      flacStreamUrl: '',
      artworkUrl: IMG_THE_BARN,
      samplyPlayerId: 'smp-curly-blue-01',
      previewRootHz: 196.0,
      loudnessLufs: -15.8,
      altVersions: [
        { id: 'v-room', label: 'Room Mics', streamUrl: '', variantKind: 'primary' },
        { id: 'v-board', label: '2-Track Desk', streamUrl: '', variantKind: 'alt' },
      ],
      waveformPeaks: buildDeterministicPeaks('Curly Blue — No Room on Poinsett', 72),
      tags: ['curly-blue', 'the-barn', 'greenville', 'flac'],
    },
    {
      id: 'AUD-02',
      slug: 'rocco-and-his-bones-sixth-gen-poe',
      title: 'Sixth Gen at Poe',
      artist: 'Rocco and His Bones',
      venue: 'The Barn',
      recordedDate: '2025-04-19',
      durationSec: 188,
      bitDepth: 24,
      sampleRateHz: 44100,
      specLabel: '24-bit · 44.1 kHz FLAC',
      sourceType: 'samply',
      sourceIdOrUrl: 'smp-rocco-02',
      flacStreamUrl: '',
      artworkUrl: IMG_POE_MILL,
      samplyPlayerId: 'smp-rocco-02',
      previewRootHz: 220.0,
      loudnessLufs: -9.4,
      altVersions: [
        { id: 'v-master', label: 'Master v2', streamUrl: '', variantKind: 'primary' },
        { id: 'v-floor', label: 'Floor Mix v1', streamUrl: '', variantKind: 'alt' },
      ],
      waveformPeaks: buildDeterministicPeaks('Rocco and His Bones — Sixth Gen at Poe', 72),
      tags: ['rocco-and-his-bones', 'punk-rock', 'the-barn', 'flac'],
    },
    {
      id: 'AUD-03',
      slug: 'marietta-creekbed-split-cassette-master',
      title: 'Split Cassette Master',
      artist: 'Marietta Creekbed',
      venue: 'Marietta Room',
      recordedDate: '2025-08-03',
      durationSec: 242,
      bitDepth: 16,
      sampleRateHz: 44100,
      specLabel: '16-bit · 44.1 kHz FLAC',
      sourceType: 'samply',
      sourceIdOrUrl: 'smp-marietta-03',
      flacStreamUrl: '',
      artworkUrl: IMG_VELO_STAGE,
      samplyPlayerId: 'smp-marietta-03',
      previewRootHz: 164.81,
      loudnessLufs: -12.6,
      waveformPeaks: buildDeterministicPeaks('Marietta Creekbed — Split Cassette Master', 72),
      tags: ['marietta', 'upstate-sc', 'indie', 'flac'],
    },
  ],
  photos: [
    {
      id: 'PHO-01',
      title: 'Quarter-Pipe & Concrete Ledge in Brick Ruins',
      photographer: 'Vernon',
      venue: 'Poe Mill DIY',
      year: '2025',
      sourceType: 'embedded',
      imageUrl: IMG_POE_MILL,
      tags: ['poe-mill', 'skate', '35mm', 'greenville'],
    },
    {
      id: 'PHO-02',
      title: 'Rafters, String Lights & Floor Set',
      photographer: 'Chandler',
      venue: 'The Barn',
      year: '2025',
      sourceType: 'embedded',
      imageUrl: IMG_THE_BARN,
      tags: ['the-barn', 'punk-rock', '35mm', 'greenville'],
    },
    {
      id: 'PHO-03',
      title: 'Stage Mic & Stereo Field Recorder After Hours',
      photographer: 'Archive Crew',
      venue: 'The Velo Fellow',
      year: '2024',
      sourceType: 'embedded',
      imageUrl: IMG_VELO_STAGE,
      tags: ['velo-fellow', 'downtown', '35mm', 'greenville'],
    },
  ],
  artists: [
    {
      id: 'ART-01',
      name: 'Rocco and His Bones',
      role: 'Band',
      genre: 'Punk / Basement Rock',
      area: 'Greenville, SC',
      active: true,
      tags: ['band', 'punk-rock', 'poe-mill', 'the-barn', 'greenville', 'active'],
    },
    {
      id: 'ART-02',
      name: 'Curly Blue',
      role: 'Band',
      genre: 'DIY Indie / Garage',
      area: 'Greenville, SC',
      active: false,
      tags: ['band', 'garage-rock', 'the-barn', 'greenville', 'inactive'],
    },
    {
      id: 'ART-03',
      name: 'Skyler',
      role: 'Musician',
      genre: 'Experimental / Noise',
      area: 'Greenville, SC',
      active: true,
      tags: ['band', 'experimental', 'the-barn', 'greenville', 'active'],
    },
    {
      id: 'ART-04',
      name: 'Marietta Creekbed',
      role: 'Band',
      genre: 'Lo-Fi Post-Punk',
      area: 'Marietta, SC',
      active: true,
      tags: ['band', 'post-punk', 'marietta', 'upstate-sc', 'active'],
    },
    {
      id: 'ART-05',
      name: 'Vernon',
      role: 'Videographer',
      genre: 'MiniDV / 35mm Skate & Show Tapes',
      area: 'Greenville, SC',
      active: true,
      tags: ['photographer', 'skate', 'poe-mill', 'the-barn', 'greenville', 'active'],
    },
    {
      id: 'ART-06',
      name: 'Chandler',
      role: 'Photographer',
      genre: '35mm Darkroom & Floor Sets',
      area: 'Greenville, SC',
      active: true,
      tags: ['photographer', '35mm', 'the-barn', 'poe-mill', 'greenville', 'active'],
    },
    {
      id: 'ART-07',
      name: 'French Broad Static',
      role: 'Band',
      genre: 'D-Beat / Hardcore',
      area: 'Asheville, NC',
      active: true,
      tags: ['band', 'punk-rock', 'asheville', 'the-barn', 'active'],
    },
  ],
  calendar: [
    {
      id: 'CAL-01',
      isoDate: '2026-11-21',
      monthKey: '2026-11',
      dayOfMonth: 21,
      title: 'Rocco & His Bones + Marietta Creekbed',
      venue: 'The Barn',
      doorsInfo: '7:30 PM · $8 PWYC',
      flyerStyle: 'punk-xerox',
      flyerHeadlineNote: 'RESPECT NEIGHBORS · PARK ON GRAVEL',
      tags: ['the-barn', 'punk-rock', 'greenville'],
    },
    {
      id: 'CAL-02',
      isoDate: '2026-11-28',
      monthKey: '2026-11',
      dayOfMonth: 28,
      title: 'Poe Mill Concrete Patch & Skate Jam',
      venue: 'Poe Mill Slabs',
      doorsInfo: '2:00 PM · Bring Quick-Set',
      flyerStyle: 'concrete-stencil',
      flyerHeadlineNote: '6 BAGS QUIKRETE + TROWELS + GENERATOR',
      tags: ['poe-mill', 'skate', 'greenville'],
    },
    {
      id: 'CAL-03',
      isoDate: '2026-12-05',
      monthKey: '2026-12',
      dayOfMonth: 5,
      title: 'Upstate Cassette Dub & Zine Print Swap',
      venue: 'West End Pop-Up',
      doorsInfo: '8:00 PM · Free Trade',
      flyerStyle: 'riso-zine',
      flyerHeadlineNote: 'BRING MASTER WAVS & STAPLED ZINES',
      tags: ['zine', 'cassette', 'greenville'],
    },
    {
      id: 'CAL-04',
      isoDate: '2026-12-12',
      monthKey: '2026-12',
      dayOfMonth: 12,
      title: 'Greenville × Asheville 4-Band Split',
      venue: 'The Barn',
      doorsInfo: '7:00 PM · All Ages',
      flyerStyle: 'punk-xerox',
      flyerHeadlineNote: 'CAROLINAS DIY TOUR EXCHANGE · NO BOOZE OUTSIDE',
      tags: ['asheville', 'the-barn', 'hardcore'],
    },
  ],
  timeline: [
    {
      id: 'ERA-01',
      eraRange: '1896–1977',
      dialShortLabel: '1896',
      title: 'F.W. Poe Textile Mill Built & Shuttered',
      summary:
        'Constructed in 1896 on Greenville’s west side; ran 80 years until Burlington Industries closed the gates in 1977.',
      portholeImageUrl: IMG_POE_MILL,
      sortOrder: 0,
    },
    {
      id: 'ERA-02',
      eraRange: '2002–2003',
      dialShortLabel: '2003',
      title: 'Two Mill Fires & First Skater Concrete',
      summary:
        'Fires left only brick smokestacks and concrete slabs. Skaters cleared rubble by hand and poured Greenville’s DIY park.',
      portholeImageUrl: IMG_POE_MILL,
      sortOrder: 1,
    },
    {
      id: 'ERA-03',
      eraRange: '2012–2014',
      dialShortLabel: '2012',
      title: 'No Name & S.P.O.G. Close Doors',
      summary:
        'When Greenville’s indoor wooden skateparks closed, self-built concrete at Poe Mill became the scene’s permanent anchor.',
      portholeImageUrl: IMG_POE_MILL,
      sortOrder: 2,
    },
    {
      id: 'ERA-04',
      eraRange: 'Barn Origin',
      dialShortLabel: 'BARN',
      title: 'Curly Blue Turned Away -> The Barn Born',
      summary:
        'After Curly Blue could not get booked at Radio Room, practice sessions inside The Barn turned into full underground bills.',
      portholeImageUrl: IMG_THE_BARN,
      sortOrder: 3,
    },
    {
      id: 'ERA-05',
      eraRange: '5th–6th Gen',
      dialShortLabel: 'GEN 6',
      title: 'Poe Mill Friendships & Craigslist Jams',
      summary:
        'Skyler’s Craigslist musician post and friendships forged at Poe (Chandler, B-Man, Zach of Rocco & His Bones) carried The Barn forward.',
      portholeImageUrl: IMG_THE_BARN,
      sortOrder: 4,
    },
    {
      id: 'ERA-06',
      eraRange: '2021–2024',
      dialShortLabel: '2024',
      title: 'Developer Sale & Velo Fellow Closing',
      summary:
        'The 2021 Poe Mill land sale and Dec 2024 loss of The Velo Fellow sparked an urgent push to preserve tapes, film, and stories.',
      portholeImageUrl: IMG_VELO_STAGE,
      sortOrder: 5,
    },
    {
      id: 'ERA-07',
      eraRange: '2026+',
      dialShortLabel: 'NOW',
      title: 'Unified Carolinas DIY Archive & Barter Market',
      summary:
        'Fast, mobile-first archive uniting Upstate SC & Asheville bands, lossless FLAC recordings, custom show flyers, and 0%-fee artist auctions.',
      portholeImageUrl: IMG_THE_BARN,
      sortOrder: 6,
    },
  ],
  remembered: [
    {
      id: 'REM-01',
      name: 'No Name Skatepark',
      closedSortIso: '2012-06',
      closedDisplayLabel: 'Closed 2012',
      location: 'Greenville, SC',
      imageUrl: IMG_POE_MILL,
      memorialStory:
        'Grassroots indoor wooden skatepark where a generation of Upstate skaters learned transition before migrating full-time to Poe Mill.',
      tags: ['skate', 'indoor', 'greenville'],
    },
    {
      id: 'REM-02',
      name: 'Skate Park of Greenville (S.P.O.G.)',
      closedSortIso: '2014-08',
      closedDisplayLabel: 'Closed 2014',
      location: 'Greenville, SC',
      imageUrl: IMG_POE_MILL,
      memorialStory:
        'Community skate hub whose 2014 closure left Greenville without a sanctioned park for over a decade.',
      tags: ['skate', 'spog', 'greenville'],
    },
    {
      id: 'REM-03',
      name: "Chai's / Lost West End DIY Rooms",
      closedSortIso: '2018-10',
      closedDisplayLabel: 'Closed Late 2010s',
      location: 'Downtown / West End Greenville',
      imageUrl: IMG_THE_BARN,
      memorialStory:
        'Scrappy small-cap rooms memorialized in local zine obituaries where experimental and punk bills thrived before luxury redevelopment.',
      tags: ['venue', 'west-end', 'diy'],
    },
    {
      id: 'REM-04',
      name: 'Gottrocks',
      closedSortIso: '2023-03',
      closedDisplayLabel: 'Closed March 2023',
      location: 'Pleasantburg Dr., Greenville',
      imageUrl: IMG_VELO_STAGE,
      memorialStory:
        'Eclectic neighborhood stage that hosted hundreds of local rock, metal, funk, and touring underground bands.',
      tags: ['venue', 'live-music', 'greenville'],
    },
    {
      id: 'REM-05',
      name: 'The Velo Fellow',
      closedSortIso: '2024-12',
      closedDisplayLabel: 'Closed Dec 2024',
      location: '1 Augusta St. Suite 126',
      imageUrl: IMG_VELO_STAGE,
      memorialStory:
        'Fourteen-year subterranean brick pub famous for Starving Artist plates and late-night alternative sets, priced out by rent and liquor liability insurance.',
      tags: ['velo-fellow', 'west-end', 'pub', 'venue'],
    },
  ],
  auctions: [
    {
      id: 'AUC-01',
      title: 'Fumed Silver & Cobalt Borosilicate Vessel',
      ownerUsername: 'upstate_boro_glass',
      currentBidLabel: '$85 · 11 IG bids',
      pickupArea: 'Greenville Pickup',
      sourceType: 'embedded',
      imageUrl: IMG_BORO_GLASS,
      igMediaId: '17992837461928374',
      igPermalink: 'https://www.instagram.com/',
      sold: false,
      tags: ['glass', 'boro', 'greenville', 'live'],
    },
    {
      id: 'AUC-02',
      title: 'Hand-Stamped Brushed Aluminum Germanium Fuzz',
      ownerUsername: 'barn_noise_boxes',
      currentBidLabel: '$110 · Owner marked SOLD',
      pickupArea: 'Marietta / Greenville',
      sourceType: 'embedded',
      imageUrl: IMG_FUZZ_PEDAL,
      igMediaId: '17992837461999112',
      igPermalink: 'https://www.instagram.com/',
      sold: true,
      tags: ['pedal', 'fuzz', 'gear', 'sold'],
    },
    {
      id: 'AUC-03',
      title: '35mm Darkroom Silver Print: Poe Mill Quarter-Pipe',
      ownerUsername: 'vernon_tapes',
      currentBidLabel: '$50 · 5 IG bids',
      pickupArea: 'West End Pickup',
      sourceType: 'embedded',
      imageUrl: IMG_POE_MILL,
      igMediaId: '17992837461955109',
      igPermalink: 'https://www.instagram.com/',
      sold: false,
      tags: ['print', '35mm', 'poe-mill', 'live'],
    },
    {
      id: 'AUC-04',
      title: 'Barn String-Lights 35mm Framed Print + Tape',
      ownerUsername: 'chandler_archive',
      currentBidLabel: '$45 · 4 IG bids',
      pickupArea: 'Local Pickup (0% Fee)',
      sourceType: 'embedded',
      imageUrl: IMG_THE_BARN,
      igMediaId: '17992837461981140',
      igPermalink: 'https://www.instagram.com/',
      sold: false,
      tags: ['print', 'cassette', 'the-barn', 'live'],
    },
  ],
  commentsByItem: {
    'VID-01': [
      {
        id: 'CMT-01',
        targetItemId: 'VID-01',
        author: 'chandler',
        text: 'Backside smith at 04:12 straight into The Barn set—classic tape.',
        votes: 9,
        createdAtIso: '2026-11-19T18:00:00Z',
        replies: [
          {
            id: 'RPL-01',
            author: 'vernon',
            text: 'Transferred straight from master miniDV!',
            createdAtIso: '2026-11-19T18:12:00Z',
          },
        ],
      },
    ],
    'AUD-01': [
      {
        id: 'CMT-02',
        targetItemId: 'AUD-01',
        author: 'b_man',
        text: 'Uncompressed FLAC keeps the exact room decay in the rafters.',
        timestampSec: 48,
        votes: 7,
        createdAtIso: '2026-11-19T18:30:00Z',
        replies: [],
      },
      {
        id: 'CMT-03',
        targetItemId: 'AUD-01',
        author: 'vernon',
        text: 'Snare rimshot locks right into the tempo push here.',
        timestampSec: 134,
        votes: 4,
        createdAtIso: '2026-11-19T18:45:00Z',
        replies: [],
      },
    ],
    'AUD-02': [
      {
        id: 'CMT-04',
        targetItemId: 'AUD-02',
        author: 'chandler',
        text: 'Toggle Master v2 vs Floor Mix v1 right at the fuzz drop.',
        timestampSec: 72,
        votes: 6,
        createdAtIso: '2026-11-19T19:10:00Z',
        replies: [],
      },
    ],
  },
  sceneChat: [
    {
      id: 'CHAT-01',
      who: 'vernon',
      time: '2:20p',
      msg: "Uploading 24-bit WAV from Saturday's Barn set.",
      createdAtIso: '2026-11-20T14:20:00Z',
    },
    {
      id: 'CHAT-02',
      who: 'zach_rhb',
      time: '2:24p',
      msg: 'Nov 21 xerox flyer is live on Calendar.',
      createdAtIso: '2026-11-20T14:24:00Z',
    },
  ],
  puckPages: structuredClone(SEED_PUCK_PAGES),
  subscribers: [
    {
      id: 'SUB-01',
      createdAtIso: '2026-11-19',
      source: 'Message Us',
      name: 'Skyler M.',
      email: 'skyler@example.org',
      interests: 'Drummer wanted for noise-punk project; Barn show alerts',
    },
    {
      id: 'SUB-02',
      createdAtIso: '2026-11-19',
      source: 'Live Chat',
      name: 'Dana K.',
      email: 'dana@example.org',
      interests: '35mm zine contributions & Poe Mill concrete workdays',
    },
    {
      id: 'SUB-03',
      createdAtIso: '2026-11-19',
      source: 'Message Us',
      name: 'Sam B.',
      email: 'sam@example.org',
      interests: 'Monthly borosilicate glass & DIY pedal IG auctions',
    },
  ],
  futureTasks: [
    {
      id: 'IT-01',
      passPhase: 'Pass 5',
      title:
        'Async scrypt (64 MiB), Fail-Closed Prod Auth, MySQL Lockout, Revocable admin_sessions & Signed IG Webhook',
      area: 'Auth & Security',
      priority: 'P0',
      status: 'Completed',
      rationale:
        'Shipped in Iteration 1 (Pass 5): async crypto.scrypt (N=65536, r=8, p=2) with max-2 semaphore, 5-try progressive lockout (15m/1h/24h) + 450ms floor, SHA-256 revocable admin_sessions, universal CSRF parity, __Host- SameSite=Strict prod cookies, and constant-time signed IG webhooks.',
      prerequisite:
        'Active now; generate ADMIN_PASSWORD_HASH in 07. Cutover & Next Pass before Hostinger deploy.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'IT-02',
      passPhase: 'Pass 5',
      title:
        'Drive fileId Allowlist, Public Chat/Vote/Contact Rate Limits, CSV Formula Escape & CSP Headers',
      area: 'Auth & Security',
      priority: 'P0',
      status: 'Completed',
      rationale:
        'Shipped in Iteration 1 (Pass 5): published-record Google Drive fileId allowlist, 8 KB public JSON cap + 6 writes/min IP rate limit + IP+comment vote dedup, CSV formula prefix protection,picsum removal, and CSP / nosniff / prod admin X-Frame-Options: DENY headers.',
      prerequisite:
        'Active automatically across public API routes, CSV export, and Next.js response headers.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'IT-03',
      passPhase: 'Pass 6',
      title:
        'Modularize AdminManagerClient.tsx + Full Post-Entry [ EDIT ] CRUD (Including Timeline, Remembered & Any-Year Calendar)',
      area: 'UI & Media',
      priority: 'P0',
      status: 'Completed',
      rationale:
        'Shipped in Iteration 2 (Pass 6): modular < 550-line Admin panels, 01–08 curator rail with 04. Timeline & Places, inline Soft 3D Frosted Glass [ EDIT ] drawers across all 9 collections, Scene Chat moderation, and full YYYY-MM-DD multi-year calendar show support.',
      prerequisite:
        'Active across /admin tabs 01–08 and /api/admin/actions with live audit_logs tracking.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'IT-04',
      passPhase: 'Pass 7',
      title:
        'Migrate MySQL Driver from Single-Row archive_kv_snapshot Blob to Atomic Row-Level Relational SQL + Schema Sync',
      area: 'Hostinger MySQL',
      priority: 'P1',
      status: 'Completed',
      rationale:
        'Shipped in Iteration 3 (Pass 7): retired single-row archive_kv_snapshot overwrites in favor of direct ?-parameterized row-level SQL across all 15 relational tables, added idempotent INFORMATION_SCHEMA column migrations (artwork_url, loudness_lufs, alt_versions_json, timestamp_sec), atomic comment vote increments, 200-row scene chat cap, and indefinite audit_logs retention while preserving archive_kv_snapshot untouched as a read-only backup.',
      prerequisite:
        'Active automatically whenever DB_HOST, DB_USER, and DB_NAME are configured.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'IT-05',
      passPhase: 'Pass 8',
      title:
        'Chromeless Analog Sliding-Portal 3D Glass Timeline, Puck/Auction URL & Flyer CSS Sanitizers & Any-Month Calendar',
      area: 'Puck Visual Studio',
      priority: 'P1',
      status: 'Completed',
      rationale:
        'Shipped in Iteration 4 (Pass 8): chromeless scrollbar-free analog sliding-portal 3D frosted glass timeline guided solely by archival dates over a single active-only card slot, unrestricted any-month/year show calendar navigation, centralized sanitizeSafeHref + sanitizeScopedFlyerCss guards, and finalized Hostinger + Cloudflare WAF cutover docs.',
      prerequisite:
        'Active across 05. Calendar, 06. Timeline, 08. Auctions, Puck Visual Studio, and HOSTINGER_CUTOVER.md.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'IT-06',
      passPhase: 'Hostinger',
      title:
        'Live hPanel Env Secrets (ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, DB_HOST=127.0.0.1), Cloudflare Edge WAF & Nightly R2 Backup',
      area: 'Hostinger MySQL',
      priority: 'P0',
      status: 'Deferred',
      rationale:
        'Final live cutover: provision Hostinger MySQL credentials, paste 16+ char ADMIN_PASSWORD_HASH & 64-hex ADMIN_SESSION_SECRET, lock Remote MySQL, and attach Cloudflare WAF.',
      prerequisite:
        'Set Hostinger hPanel Node.js environment variables and point greenvillediyarchive.org DNS.',
      createdAtIso: '2026-11-21T07:45:00Z',
    },
    {
      id: 'P5-01',
      passPhase: 'Pass 5',
      title: 'Built-In Puck Visual Studio (@puckeditor/core), Inline Slots & /p/[slug] Pages',
      area: 'Puck Visual Studio',
      priority: 'P1',
      status: 'Completed',
      rationale:
        'Shipped in Pass 5: 6 flatter frosted-glass blocks, native slot multi-column nesting, sandboxed HTML zine frames, 3 inline tab slots, and /p/[slug] RSC pages.',
      prerequisite:
        'Active in /admin -> 01. Visual Studio and /admin/editor/[slug].',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
    {
      id: 'P5-02',
      passPhase: 'Pass 5',
      title: 'Persistent Docked Mini-Player Across All Archive Views',
      area: 'UI & Media',
      priority: 'P1',
      status: 'Completed',
      rationale:
        'Shipped in Pass 5: hoisted dual-buffer audio controller keeps lossless FLAC playback and A/B takes uninterrupted when switching tabs.',
      prerequisite:
        'Active automatically whenever leaving Audio with an active session.',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
  ],
};

const PREVIEW_SCENE_CHAT_MAX_STORED = 200;
const PREVIEW_SCENE_CHAT_DISPLAY = 40;

const globalForArchive = globalThis as unknown as {
  __gvlDiyStore?: ArchiveDataset;
  __gvlAuditLogs?: AuditLogEntry[];
};

function isMysqlConfigured(): boolean {
  return isHostingerMysqlConfigured();
}

/**
 * Singleton MySQL Pool + Idempotent Relational Schema & One-Time Boot Hydration:
 * Used by both `archiveRepository` and `lib/dal/auth.ts`.
 */
export async function getInitializedMysqlPool(): Promise<Pool | null> {
  return getReadyMysqlPool(INITIAL_SEED);
}

function getPreviewAuditLogs(): AuditLogEntry[] {
  if (!globalForArchive.__gvlAuditLogs) {
    globalForArchive.__gvlAuditLogs = [
      {
        id: 'audit-boot-1',
        curatorUsername: 'system',
        actionName: 'SECURITY_POSTURE_READY',
        targetId: 'IT-01..IT-05',
        createdAtIso: '2026-11-21T07:45:00Z',
      },
    ];
  }
  return globalForArchive.__gvlAuditLogs;
}

/**
 * In-memory preview dataset used strictly when `DB_HOST` is empty (preview mode)
 * or if the MySQL socket is temporarily unreachable.
 */
function getPreviewStore(): ArchiveDataset {
  if (!globalForArchive.__gvlDiyStore) {
    globalForArchive.__gvlDiyStore = structuredClone(INITIAL_SEED);
  } else {
    if (!Array.isArray(globalForArchive.__gvlDiyStore.sceneChat)) {
      globalForArchive.__gvlDiyStore.sceneChat = structuredClone(INITIAL_SEED.sceneChat);
    }
    if (!Array.isArray(globalForArchive.__gvlDiyStore.puckPages)) {
      globalForArchive.__gvlDiyStore.puckPages = structuredClone(INITIAL_SEED.puckPages);
      globalForArchive.__gvlDiyStore.futureTasks = structuredClone(INITIAL_SEED.futureTasks);
    } else if (Array.isArray(globalForArchive.__gvlDiyStore.futureTasks)) {
      const reversedSeed = [...INITIAL_SEED.futureTasks].reverse();
      for (const seedTask of reversedSeed) {
        const idx = globalForArchive.__gvlDiyStore.futureTasks.findIndex(
          (t) => t.id === seedTask.id
        );
        if (idx === -1) {
          globalForArchive.__gvlDiyStore.futureTasks.unshift(structuredClone(seedTask));
        } else if (
          seedTask.id === 'IT-01' ||
          seedTask.id === 'IT-02' ||
          seedTask.id === 'IT-03' ||
          seedTask.id === 'IT-04' ||
          seedTask.id === 'IT-05'
        ) {
          globalForArchive.__gvlDiyStore.futureTasks[idx] = structuredClone(seedTask);
        }
      }
    }
    if (Array.isArray(globalForArchive.__gvlDiyStore.timeline)) {
      globalForArchive.__gvlDiyStore.timeline.forEach((era, i) => {
        if (typeof era.sortOrder !== 'number') {
          era.sortOrder = i;
        }
      });
    }
  }

  return globalForArchive.__gvlDiyStore;
}

function normalizeTagsList(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  const cleaned = Array.from(
    new Set(
      raw
        .map((t) =>
          String(t || '')
            .trim()
            .toLowerCase()
            .replace(/^#+/, '')
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 36)
        )
        .filter(Boolean)
    )
  ).slice(0, 16);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeVideoTimestamps(raw: unknown): VideoTimestamp[] {
  if (!Array.isArray(raw)) {
    return [{ sec: 0, time: '00:00', label: 'Full Set' }];
  }
  const normalized = raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Partial<VideoTimestamp>;
      const label = String(obj.label || '').trim().slice(0, 140);
      if (!label) return null;

      let sec = 0;
      let time = '00:00';
      const timeStr = String(obj.time || '').trim();
      const mmSsMatch = timeStr.match(/^(\d{1,3}):(\d{2})$/);
      if (mmSsMatch) {
        const mins = Number(mmSsMatch[1]);
        const secs = Math.min(59, Number(mmSsMatch[2]));
        sec = mins * 60 + secs;
        time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      } else if (typeof obj.sec === 'number' && Number.isFinite(obj.sec) && obj.sec >= 0) {
        sec = Math.floor(obj.sec);
        const mins = Math.floor(sec / 60);
        const secs = sec % 60;
        time = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      return { sec, time, label };
    })
    .filter((v): v is VideoTimestamp => v !== null)
    .slice(0, 60);

  return normalized.length > 0
    ? normalized
    : [{ sec: 0, time: '00:00', label: 'Full Set' }];
}

function formatFlacSpecLabel(
  bitDepth: 16 | 24,
  sampleRateHz: 44100 | 48000 | 96000
): string {
  const srKhz =
    sampleRateHz === 96000
      ? '96 kHz'
      : sampleRateHz === 48000
      ? '48 kHz'
      : '44.1 kHz';
  return `${bitDepth}-bit · ${srKhz} FLAC`;
}

function sanitizeSafeMediaOrWebUrl(raw: string, fallback = ''): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return fallback;
  if (/^(javascript|vbscript|file):/i.test(trimmed)) return fallback;
  if (/^data:/i.test(trimmed)) {
    return /^data:image\/(svg\+xml|png|jpeg|jpg|webp|gif);/i.test(trimmed)
      ? trimmed
      : fallback;
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) {
    return trimmed.slice(0, 2048);
  }
  return fallback;
}

function sanitizeHttpUrlOnly(raw: string | undefined, fallback: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().slice(0, 1024);
    }
  } catch {
    // Fall back safely
  }
  return fallback;
}

function parseAndValidateIsoDate(raw: string): {
  isoDate: string;
  monthKey: string;
  dayOfMonth: number;
} {
  const clean = String(raw || '').trim();
  const match = clean.match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) {
    throw new Error('Valid YYYY-MM-DD calendar date is required');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    utcCheck.getUTCFullYear() !== year ||
    utcCheck.getUTCMonth() + 1 !== month ||
    utcCheck.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar day for selected month');
  }
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0'
  )}-${String(day).padStart(2, '0')}`;
  return {
    isoDate,
    monthKey: isoDate.slice(0, 7),
    dayOfMonth: Number(isoDate.slice(8, 10)),
  };
}

export type PublicArchivePayload = Omit<ArchiveDataset, 'subscribers' | 'futureTasks'>;

export const archiveRepository = {
  getStorageDriverMode(): 'hostinger-mysql' | 'preview-memory' {
    return isMysqlConfigured() ? 'hostinger-mysql' : 'preview-memory';
  },

  async getPublicPayload(): Promise<PublicArchivePayload> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return fetchPublicPayloadSql(pool, INITIAL_SEED.siteSettings);
    }
    const store = getPreviewStore();
    const { subscribers: _omitSub, futureTasks: _omitTasks, ...publicRest } = store;
    return {
      ...structuredClone(publicRest),
      sceneChat: structuredClone(store.sceneChat.slice(-PREVIEW_SCENE_CHAT_DISPLAY)),
    };
  },

  async getAdminFullPayload(): Promise<
    ArchiveDataset & {
      storageDriver: 'hostinger-mysql' | 'preview-memory';
      runtimePosture: RuntimePostureSnapshot;
      auditLogs: AuditLogEntry[];
    }
  > {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const [dataset, auditLogs] = await Promise.all([
        fetchAdminDatasetSql(pool, INITIAL_SEED.siteSettings),
        listAuditLogsSql(pool, 40),
      ]);
      return {
        ...dataset,
        storageDriver: 'hostinger-mysql',
        runtimePosture: getRuntimePostureSnapshot(),
        auditLogs,
      };
    }

    const store = getPreviewStore();
    const auditLogs = await this.listAuditLogs(40);
    return {
      ...structuredClone(store),
      sceneChat: structuredClone(store.sceneChat.slice(-PREVIEW_SCENE_CHAT_DISPLAY)),
      storageDriver: 'preview-memory',
      runtimePosture: getRuntimePostureSnapshot(),
      auditLogs,
    };
  },

  async recordAuditLog(
    actionName: string,
    targetId?: string | null,
    curatorUsername = 'curator'
  ): Promise<AuditLogEntry> {
    const cleanAction = String(actionName || 'ADMIN_ACTION').trim().slice(0, 96);
    const cleanTarget = targetId ? String(targetId).trim().slice(0, 128) : null;
    const cleanActor = String(curatorUsername || 'curator').trim().slice(0, 80);
    const nowIso = new Date().toISOString();

    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      curatorUsername: cleanActor,
      actionName: cleanAction,
      targetId: cleanTarget,
      createdAtIso: nowIso,
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      await insertAuditLogSql(pool, {
        createdAtIso: nowIso,
        curatorUsername: cleanActor,
        actionName: cleanAction,
        targetId: cleanTarget,
      });
      return structuredClone(entry);
    }

    // Preview mode retains full audit log history in memory as well
    const previewLogs = getPreviewAuditLogs();
    previewLogs.unshift(entry);
    return structuredClone(entry);
  },

  async listAuditLogs(limit = 40): Promise<AuditLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return listAuditLogsSql(pool, safeLimit);
    }
    return structuredClone(getPreviewAuditLogs().slice(0, safeLimit));
  },

  async isPublishedDriveFileId(cleanFileId: string): Promise<boolean> {
    if (!cleanFileId || !/^[a-zA-Z0-9_-]{10,80}$/.test(cleanFileId)) {
      return false;
    }
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return isPublishedDriveFileIdSql(pool, cleanFileId);
    }

    const store = getPreviewStore();
    const proxyNeedle = `/api/media/drive/${cleanFileId}`;

    const matchesRef = (val?: string | null) =>
      Boolean(
        val &&
          (val === cleanFileId ||
            val.includes(proxyNeedle) ||
            val.includes(`/d/${cleanFileId}`) ||
            val.includes(`id=${cleanFileId}`))
      );

    if (store.videos.some((v) => matchesRef(v.posterUrl))) {
      return true;
    }

    if (
      store.audio.some(
        (a) =>
          (a.sourceType === 'gdrive' && matchesRef(a.sourceIdOrUrl)) ||
          matchesRef(a.flacStreamUrl) ||
          matchesRef(a.artworkUrl) ||
          (Array.isArray(a.altVersions) &&
            a.altVersions.some((alt) => matchesRef(alt.streamUrl)))
      )
    ) {
      return true;
    }

    if (
      store.photos.some(
        (p) =>
          (p.sourceType === 'gdrive' && matchesRef(p.sourceIdOrUrl)) ||
          matchesRef(p.imageUrl)
      )
    ) {
      return true;
    }

    if (
      store.auctions.some(
        (a) =>
          (a.sourceType === 'gdrive' && matchesRef(a.sourceIdOrUrl)) ||
          matchesRef(a.imageUrl)
      )
    ) {
      return true;
    }

    if (store.timeline.some((t) => matchesRef(t.portholeImageUrl))) {
      return true;
    }

    if (store.remembered.some((r) => matchesRef(r.imageUrl))) {
      return true;
    }

    if (
      store.puckPages.some(
        (p) => p.published && JSON.stringify(p.puckData).includes(cleanFileId)
      )
    ) {
      return true;
    }

    return false;
  },

  async updateSiteSettings(
    partial: Partial<Omit<AdminSiteSettings, 'updatedAtIso'>>
  ): Promise<AdminSiteSettings> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const current = await getSiteSettingsSql(pool, INITIAL_SEED.siteSettings);
      const nextSettings: AdminSiteSettings = {
        ...current,
        ...partial,
        updatedAtIso: new Date().toISOString(),
      };
      return upsertSiteSettingsSql(pool, nextSettings);
    }

    const store = getPreviewStore();
    store.siteSettings = {
      ...store.siteSettings,
      ...partial,
      updatedAtIso: new Date().toISOString(),
    };
    return structuredClone(store.siteSettings);
  },

  // ==================== VIDEOS CRUD ====================
  async addVideoTape(input: {
    title: string;
    venue: string;
    filmer: string;
    recordedDate: string;
    youtubeIdOrUrl: string;
    posterSourceType?: MediaSourceType;
    posterSourceIdOrUrl?: string;
    timestamps: VideoTimestamp[];
    tags: string[];
  }): Promise<VideoTape> {
    const cleanTitle = input.title.trim().slice(0, 180);
    if (!cleanTitle) throw new Error('Video title is required');
    const ytId = extractYoutubeVideoId(input.youtubeIdOrUrl);
    const resolvedPoster = resolveMediaUrl(
      input.posterSourceType || 'embedded',
      input.posterSourceIdOrUrl,
      IMG_POE_MILL
    );
    const cleanTimestamps = normalizeVideoTimestamps(input.timestamps);
    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'videos')
      : getPreviewStore().videos.length;

    const created: VideoTape = {
      id: `VID-0${count + 1}-${Date.now().toString().slice(-3)}`,
      slug:
        cleanTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || `tape-${Date.now()}`,
      title: cleanTitle,
      recordedDate: input.recordedDate.trim() || new Date().toISOString().slice(0, 10),
      venue: input.venue.trim().slice(0, 120) || 'Greenville DIY',
      filmer: input.filmer.trim().slice(0, 80) || 'Archive Crew',
      youtubeUnlistedId: ytId,
      posterUrl: resolvedPoster,
      timestamps: cleanTimestamps,
      tags: normalizeTagsList(input.tags, ['greenville', 'diy']),
    };

    if (pool) {
      await insertVideoSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.videos.unshift(created);
    return structuredClone(created);
  },

  async updateVideoTape(
    id: string,
    input: {
      title?: string;
      venue?: string;
      filmer?: string;
      recordedDate?: string;
      youtubeIdOrUrl?: string;
      posterSourceType?: MediaSourceType;
      posterSourceIdOrUrl?: string;
      posterUrl?: string;
      timestamps?: VideoTimestamp[];
      tags?: string[];
    }
  ): Promise<VideoTape | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getVideoByIdSql(pool, id)
      : getPreviewStore().videos.find((v) => v.id === id) || null;
    if (!target) return null;

    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 180);
      target.slug =
        target.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || target.slug;
    }
    if (typeof input.venue === 'string' && input.venue.trim()) {
      target.venue = input.venue.trim().slice(0, 120);
    }
    if (typeof input.filmer === 'string' && input.filmer.trim()) {
      target.filmer = input.filmer.trim().slice(0, 80);
    }
    if (typeof input.recordedDate === 'string' && input.recordedDate.trim()) {
      target.recordedDate = input.recordedDate.trim().slice(0, 20);
    }
    if (typeof input.youtubeIdOrUrl === 'string' && input.youtubeIdOrUrl.trim()) {
      target.youtubeUnlistedId = extractYoutubeVideoId(input.youtubeIdOrUrl);
    }

    if (typeof input.posterSourceIdOrUrl === 'string' && input.posterSourceIdOrUrl.trim()) {
      target.posterUrl = resolveMediaUrl(
        input.posterSourceType || 'embedded',
        input.posterSourceIdOrUrl,
        target.posterUrl
      );
    } else if (typeof input.posterUrl === 'string' && input.posterUrl.trim()) {
      target.posterUrl = sanitizeSafeMediaOrWebUrl(input.posterUrl, target.posterUrl);
    }

    if (Array.isArray(input.timestamps)) {
      target.timestamps = normalizeVideoTimestamps(input.timestamps);
    }
    if (Array.isArray(input.tags)) {
      target.tags = normalizeTagsList(input.tags, ['greenville', 'diy']);
    }

    if (pool) {
      await updateVideoSql(pool, target);
    }
    return structuredClone(target);
  },

  async deleteVideoTape(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteVideoSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.videos.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    store.videos.splice(idx, 1);
    return true;
  },

  // ==================== 24-BIT FLAC AUDIO CRUD (WITH A/B TAKES & LUFS) ====================
  async addFlacRecording(input: {
    title: string;
    artist: string;
    venue: string;
    recordedDate?: string;
    durationSec: number;
    bitDepth: 16 | 24;
    sampleRateHz: 44100 | 48000 | 96000;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    artworkUrl?: string;
    artworkSourceType?: MediaSourceType;
    artworkSourceIdOrUrl?: string;
    primaryTakeLabel?: string;
    altTakes?: Array<{
      label: string;
      sourceType: MediaSourceType;
      sourceIdOrUrl: string;
      bitDepth?: 16 | 24;
      sampleRateHz?: 44100 | 48000 | 96000;
    }>;
    loudnessLufs?: number;
    previewRootHz?: number;
    waveformPeaks?: number[];
    tags: string[];
  }): Promise<FlacRecording> {
    const cleanTitle = input.title.trim().slice(0, 180);
    const cleanArtist = input.artist.trim().slice(0, 120);
    if (!cleanTitle || !cleanArtist) {
      throw new Error('Track title and artist are required');
    }

    const bitDepth: 16 | 24 = input.bitDepth === 16 ? 16 : 24;
    const sampleRateHz: 44100 | 48000 | 96000 =
      input.sampleRateHz === 96000
        ? 96000
        : input.sampleRateHz === 44100
        ? 44100
        : 48000;
    const specLabel = formatFlacSpecLabel(bitDepth, sampleRateHz);
    const streamUrl =
      input.sourceType === 'gdrive' || input.sourceType === 'r2'
        ? resolveMediaUrl(input.sourceType, input.sourceIdOrUrl, '')
        : '';

    const cleanAltTakes = (input.altTakes || []).filter((t) => t.label.trim());
    let altVersions: FlacVersionSource[] | undefined;

    if (cleanAltTakes.length > 0) {
      altVersions = [
        {
          id: `v-primary-${Date.now()}`,
          label: (input.primaryTakeLabel || 'Primary Mix').trim().slice(0, 40),
          specLabel,
          streamUrl,
          variantKind: 'primary',
        },
        ...cleanAltTakes.map((take, idx) => {
          const takeBd: 16 | 24 = take.bitDepth === 16 ? 16 : 24;
          const takeSr: 44100 | 48000 | 96000 = take.sampleRateHz || sampleRateHz;
          const takeUrl =
            take.sourceType === 'gdrive' || take.sourceType === 'r2'
              ? resolveMediaUrl(take.sourceType, take.sourceIdOrUrl, '')
              : '';
          return {
            id: `v-alt-${idx + 1}-${Date.now()}`,
            label: take.label.trim().slice(0, 40),
            specLabel: formatFlacSpecLabel(takeBd, takeSr),
            streamUrl: takeUrl,
            variantKind: 'alt' as const,
          };
        }),
      ];
    }

    const resolvedLufs =
      typeof input.loudnessLufs === 'number' && Number.isFinite(input.loudnessLufs)
        ? Math.round(Math.max(-40, Math.min(0, input.loudnessLufs)) * 10) / 10
        : -14.0;

    const resolvedArtwork = input.artworkSourceIdOrUrl?.trim()
      ? resolveMediaUrl(
          input.artworkSourceType || 'embedded',
          input.artworkSourceIdOrUrl,
          IMG_THE_BARN
        )
      : input.artworkUrl?.trim()
      ? sanitizeSafeMediaOrWebUrl(input.artworkUrl, IMG_THE_BARN)
      : IMG_THE_BARN;

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'flac_tracks')
      : getPreviewStore().audio.length;

    const created: FlacRecording = {
      id: `AUD-0${count + 1}-${Date.now().toString().slice(-3)}`,
      slug:
        cleanTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || `flac-${Date.now()}`,
      title: cleanTitle,
      artist: cleanArtist,
      venue: input.venue.trim().slice(0, 120) || 'The Barn',
      recordedDate:
        (input.recordedDate || '').trim() || new Date().toISOString().slice(0, 10),
      durationSec: Math.max(5, Math.min(14400, Number(input.durationSec) || 180)),
      bitDepth,
      sampleRateHz,
      specLabel,
      sourceType: input.sourceType,
      sourceIdOrUrl: input.sourceIdOrUrl.trim(),
      flacStreamUrl: streamUrl,
      artworkUrl: resolvedArtwork,
      samplyPlayerId:
        input.sourceType === 'samply' ? input.sourceIdOrUrl.trim() : undefined,
      previewRootHz: Math.max(60, Math.min(1200, Number(input.previewRootHz) || 196.0)),
      loudnessLufs: resolvedLufs,
      altVersions,
      waveformPeaks:
        Array.isArray(input.waveformPeaks) && input.waveformPeaks.length >= 24
          ? input.waveformPeaks.map((n) => Math.max(6, Math.min(64, Math.round(Number(n) || 18))))
          : buildDeterministicPeaks(cleanTitle, 72),
      tags: normalizeTagsList(input.tags, ['greenville', 'flac']),
    };

    if (pool) {
      await insertFlacSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.audio.unshift(created);
    return structuredClone(created);
  },

  async updateFlacRecording(
    id: string,
    input: {
      title?: string;
      artist?: string;
      venue?: string;
      recordedDate?: string;
      durationSec?: number;
      bitDepth?: 16 | 24;
      sampleRateHz?: 44100 | 48000 | 96000;
      sourceType?: MediaSourceType;
      sourceIdOrUrl?: string;
      loudnessLufs?: number;
      artworkUrl?: string;
      artworkSourceType?: MediaSourceType;
      artworkSourceIdOrUrl?: string;
      previewRootHz?: number;
      altVersions?: FlacVersionSource[];
      waveformPeaks?: number[];
      tags?: string[];
    }
  ): Promise<FlacRecording | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getFlacByIdSql(pool, id)
      : getPreviewStore().audio.find((a) => a.id === id) || null;
    if (!target) return null;

    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 180);
      target.slug =
        target.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || target.slug;
    }
    if (typeof input.artist === 'string' && input.artist.trim()) {
      target.artist = input.artist.trim().slice(0, 120);
    }
    if (typeof input.venue === 'string' && input.venue.trim()) {
      target.venue = input.venue.trim().slice(0, 120);
    }
    if (typeof input.recordedDate === 'string' && input.recordedDate.trim()) {
      target.recordedDate = input.recordedDate.trim().slice(0, 20);
    }
    if (typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)) {
      target.durationSec = Math.max(5, Math.min(14400, Math.round(input.durationSec)));
    }
    if (input.bitDepth === 16 || input.bitDepth === 24) {
      target.bitDepth = input.bitDepth;
    }
    if (
      input.sampleRateHz === 44100 ||
      input.sampleRateHz === 48000 ||
      input.sampleRateHz === 96000
    ) {
      target.sampleRateHz = input.sampleRateHz;
    }
    target.specLabel = formatFlacSpecLabel(target.bitDepth, target.sampleRateHz);

    if (
      input.sourceType &&
      ['samply', 'gdrive', 'r2', 'embedded'].includes(input.sourceType)
    ) {
      target.sourceType = input.sourceType;
    }
    if (typeof input.sourceIdOrUrl === 'string') {
      target.sourceIdOrUrl = input.sourceIdOrUrl.trim();
    }
    target.flacStreamUrl =
      target.sourceType === 'gdrive' || target.sourceType === 'r2'
        ? resolveMediaUrl(target.sourceType, target.sourceIdOrUrl, '')
        : '';
    target.samplyPlayerId =
      target.sourceType === 'samply' ? target.sourceIdOrUrl : undefined;

    if (typeof input.loudnessLufs === 'number' && Number.isFinite(input.loudnessLufs)) {
      target.loudnessLufs =
        Math.round(Math.max(-40, Math.min(0, input.loudnessLufs)) * 10) / 10;
    }
    if (typeof input.previewRootHz === 'number' && Number.isFinite(input.previewRootHz)) {
      target.previewRootHz = Math.max(60, Math.min(1200, input.previewRootHz));
    }

    if (
      typeof input.artworkSourceIdOrUrl === 'string' &&
      input.artworkSourceIdOrUrl.trim()
    ) {
      target.artworkUrl = resolveMediaUrl(
        input.artworkSourceType || 'embedded',
        input.artworkSourceIdOrUrl,
        target.artworkUrl || IMG_THE_BARN
      );
    } else if (typeof input.artworkUrl === 'string' && input.artworkUrl.trim()) {
      target.artworkUrl = sanitizeSafeMediaOrWebUrl(
        input.artworkUrl,
        target.artworkUrl || IMG_THE_BARN
      );
    }

    if (Array.isArray(input.altVersions)) {
      const cleaned = input.altVersions
        .map((v, idx): FlacVersionSource | null => {
          const label = String(v?.label || '').trim().slice(0, 48);
          if (!label) return null;
          const rawStream = String(v?.streamUrl || '').trim();
          const resolvedStream = rawStream
            ? rawStream.includes('drive.google.com/') ||
              /^[a-zA-Z0-9_-]{15,}$/.test(rawStream)
              ? resolveMediaUrl('gdrive', rawStream, '')
              : sanitizeSafeMediaOrWebUrl(rawStream, '')
            : idx === 0
            ? target.flacStreamUrl
            : '';
          return {
            id: String(v?.id || `v-edit-${idx}-${Date.now()}`).slice(0, 48),
            label,
            specLabel: v?.specLabel
              ? String(v.specLabel).trim().slice(0, 64)
              : target.specLabel,
            streamUrl: resolvedStream,
            variantKind:
              idx === 0 || v?.variantKind === 'primary' ? 'primary' : 'alt',
          };
        })
        .filter((v): v is FlacVersionSource => v !== null);
      target.altVersions = cleaned.length > 0 ? cleaned : undefined;
    }

    if (Array.isArray(input.waveformPeaks) && input.waveformPeaks.length >= 24) {
      target.waveformPeaks = input.waveformPeaks.map((n) =>
        Math.max(6, Math.min(64, Math.round(Number(n) || 18)))
      );
    }
    if (Array.isArray(input.tags)) {
      target.tags = normalizeTagsList(input.tags, ['greenville', 'flac']);
    }

    if (pool) {
      await updateFlacSql(pool, target);
    }
    return structuredClone(target);
  },

  async deleteFlacRecording(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteFlacSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.audio.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.audio.splice(idx, 1);
    return true;
  },

  // ==================== 35MM PHOTOS CRUD ====================
  async addPhotoPlate(input: {
    title: string;
    photographer: string;
    venue: string;
    year: string;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    dimensionsLabel?: string;
    tags: string[];
  }): Promise<PhotoPlate> {
    const cleanTitle = input.title.trim().slice(0, 180);
    if (!cleanTitle) throw new Error('Photo title is required');
    const resolvedImg = resolveMediaUrl(
      input.sourceType,
      input.sourceIdOrUrl,
      IMG_THE_BARN
    );
    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'photos')
      : getPreviewStore().photos.length;

    const created: PhotoPlate = {
      id: `PHO-0${count + 1}-${Date.now().toString().slice(-3)}`,
      title: cleanTitle,
      photographer: input.photographer.trim().slice(0, 100) || 'Archive Crew',
      venue: input.venue.trim().slice(0, 120) || 'Greenville DIY',
      year: input.year.trim().slice(0, 12) || '2026',
      sourceType: input.sourceType,
      sourceIdOrUrl: input.sourceIdOrUrl.trim(),
      dimensionsLabel: input.dimensionsLabel?.trim().slice(0, 80),
      imageUrl: resolvedImg,
      tags: normalizeTagsList(input.tags, ['35mm', 'greenville']),
    };

    if (pool) {
      await insertPhotoSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.photos.unshift(created);
    return structuredClone(created);
  },

  async updatePhotoPlate(
    id: string,
    input: {
      title?: string;
      photographer?: string;
      venue?: string;
      year?: string;
      sourceType?: MediaSourceType;
      sourceIdOrUrl?: string;
      dimensionsLabel?: string;
      imageUrl?: string;
      tags?: string[];
    }
  ): Promise<PhotoPlate | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getPhotoByIdSql(pool, id)
      : getPreviewStore().photos.find((p) => p.id === id) || null;
    if (!target) return null;

    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 180);
    }
    if (typeof input.photographer === 'string' && input.photographer.trim()) {
      target.photographer = input.photographer.trim().slice(0, 100);
    }
    if (typeof input.venue === 'string' && input.venue.trim()) {
      target.venue = input.venue.trim().slice(0, 120);
    }
    if (typeof input.year === 'string' && input.year.trim()) {
      target.year = input.year.trim().slice(0, 12);
    }
    if (
      input.sourceType &&
      ['gdrive', 'r2', 'embedded'].includes(input.sourceType)
    ) {
      target.sourceType = input.sourceType;
    }
    if (typeof input.sourceIdOrUrl === 'string') {
      target.sourceIdOrUrl = input.sourceIdOrUrl.trim();
      if (target.sourceIdOrUrl) {
        target.imageUrl = resolveMediaUrl(
          target.sourceType || 'embedded',
          target.sourceIdOrUrl,
          target.imageUrl
        );
      }
    }
    if (typeof input.imageUrl === 'string' && input.imageUrl.trim()) {
      target.imageUrl = sanitizeSafeMediaOrWebUrl(input.imageUrl, target.imageUrl);
    }
    if (typeof input.dimensionsLabel === 'string') {
      target.dimensionsLabel = input.dimensionsLabel.trim().slice(0, 80) || undefined;
    }
    if (Array.isArray(input.tags)) {
      target.tags = normalizeTagsList(input.tags, ['35mm', 'greenville']);
    }

    if (pool) {
      await updatePhotoSql(pool, target);
    }
    return structuredClone(target);
  },

  async deletePhotoPlate(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deletePhotoSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.photos.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    store.photos.splice(idx, 1);
    return true;
  },

  // ==================== BANDS & ARTISTS CRUD ====================
  async addSceneArtist(input: {
    name: string;
    role: SceneArtist['role'];
    genre: string;
    area: string;
    active: boolean;
    tags: string[];
  }): Promise<SceneArtist> {
    const cleanName = input.name.trim().slice(0, 140);
    if (!cleanName) throw new Error('Artist name is required');
    const statusTag = input.active ? 'active' : 'inactive';
    const baseTags = normalizeTagsList(
      input.tags.filter((t) => t !== 'active' && t !== 'inactive'),
      ['greenville']
    );
    const cleanTags = Array.from(new Set([...baseTags, statusTag]));

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'artists')
      : getPreviewStore().artists.length;

    const created: SceneArtist = {
      id: `ART-0${count + 1}-${Date.now().toString().slice(-3)}`,
      name: cleanName,
      role: input.role,
      genre: input.genre.trim().slice(0, 120) || 'DIY Scene',
      area: input.area.trim().slice(0, 100) || 'Greenville, SC',
      active: input.active,
      tags: cleanTags,
    };

    if (pool) {
      await insertArtistSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.artists.unshift(created);
    return structuredClone(created);
  },

  async updateSceneArtist(
    id: string,
    input: {
      name?: string;
      role?: SceneArtist['role'];
      genre?: string;
      area?: string;
      active?: boolean;
      tags?: string[];
    }
  ): Promise<SceneArtist | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getArtistByIdSql(pool, id)
      : getPreviewStore().artists.find((a) => a.id === id) || null;
    if (!target) return null;

    if (typeof input.name === 'string' && input.name.trim()) {
      target.name = input.name.trim().slice(0, 140);
    }
    if (
      input.role &&
      ['Band', 'Musician', 'Photographer', 'Videographer', 'Collective'].includes(
        input.role
      )
    ) {
      target.role = input.role;
    }
    if (typeof input.genre === 'string' && input.genre.trim()) {
      target.genre = input.genre.trim().slice(0, 120);
    }
    if (typeof input.area === 'string' && input.area.trim()) {
      target.area = input.area.trim().slice(0, 100);
    }
    if (typeof input.active === 'boolean') {
      target.active = input.active;
    }

    const rawTags = Array.isArray(input.tags) ? input.tags : target.tags;
    const baseTags = normalizeTagsList(
      rawTags.filter((t) => t !== 'active' && t !== 'inactive'),
      ['greenville']
    );
    target.tags = Array.from(
      new Set([...baseTags, target.active ? 'active' : 'inactive'])
    );

    if (pool) {
      await updateArtistSql(pool, target);
    }
    return structuredClone(target);
  },

  async toggleSceneArtistActive(id: string): Promise<SceneArtist | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getArtistByIdSql(pool, id)
      : getPreviewStore().artists.find((a) => a.id === id) || null;
    if (!target) return null;

    target.active = !target.active;
    target.tags = [
      ...target.tags.filter((t) => t !== 'active' && t !== 'inactive'),
      target.active ? 'active' : 'inactive',
    ];

    if (pool) {
      await updateArtistSql(pool, target);
    }
    return structuredClone(target);
  },

  async deleteSceneArtist(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteArtistSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.artists.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.artists.splice(idx, 1);
    return true;
  },

  // ==================== TIMELINE ERAS CRUD & REORDER ====================
  async addTimelineEra(input: {
    eraRange: string;
    dialShortLabel: string;
    title: string;
    summary: string;
    sourceType?: MediaSourceType;
    sourceIdOrUrl?: string;
    portholeImageUrl?: string;
  }): Promise<TimelineEra> {
    const cleanTitle = input.title.trim().slice(0, 160);
    const cleanEraRange = input.eraRange.trim().slice(0, 40);
    if (!cleanTitle || !cleanEraRange) {
      throw new Error('Era range and title are required');
    }
    const resolvedImg = input.sourceIdOrUrl?.trim()
      ? resolveMediaUrl(
          input.sourceType || 'embedded',
          input.sourceIdOrUrl,
          IMG_POE_MILL
        )
      : input.portholeImageUrl?.trim()
      ? sanitizeSafeMediaOrWebUrl(input.portholeImageUrl, IMG_POE_MILL)
      : IMG_POE_MILL;

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'timeline_eras')
      : getPreviewStore().timeline.length;

    const created: TimelineEra = {
      id: `ERA-0${count + 1}-${Date.now().toString().slice(-3)}`,
      eraRange: cleanEraRange,
      dialShortLabel:
        input.dialShortLabel.trim().slice(0, 12).toUpperCase() ||
        cleanEraRange.slice(0, 6).toUpperCase(),
      title: cleanTitle,
      summary: input.summary.trim().slice(0, 600),
      portholeImageUrl: resolvedImg,
      sortOrder: count,
    };

    if (pool) {
      await insertTimelineEraSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.timeline.push(created);
    store.timeline.forEach((e, idx) => {
      e.sortOrder = idx;
    });
    return structuredClone(created);
  },

  async updateTimelineEra(
    id: string,
    input: {
      eraRange?: string;
      dialShortLabel?: string;
      title?: string;
      summary?: string;
      sourceType?: MediaSourceType;
      sourceIdOrUrl?: string;
      portholeImageUrl?: string;
    }
  ): Promise<TimelineEra | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getTimelineEraByIdSql(pool, id)
      : getPreviewStore().timeline.find((e) => e.id === id) || null;
    if (!target) return null;

    if (typeof input.eraRange === 'string' && input.eraRange.trim()) {
      target.eraRange = input.eraRange.trim().slice(0, 40);
    }
    if (typeof input.dialShortLabel === 'string' && input.dialShortLabel.trim()) {
      target.dialShortLabel = input.dialShortLabel.trim().slice(0, 12).toUpperCase();
    }
    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 160);
    }
    if (typeof input.summary === 'string' && input.summary.trim()) {
      target.summary = input.summary.trim().slice(0, 600);
    }
    if (typeof input.sourceIdOrUrl === 'string' && input.sourceIdOrUrl.trim()) {
      target.portholeImageUrl = resolveMediaUrl(
        input.sourceType || 'embedded',
        input.sourceIdOrUrl,
        target.portholeImageUrl
      );
    } else if (
      typeof input.portholeImageUrl === 'string' &&
      input.portholeImageUrl.trim()
    ) {
      target.portholeImageUrl = sanitizeSafeMediaOrWebUrl(
        input.portholeImageUrl,
        target.portholeImageUrl
      );
    }

    if (pool) {
      await updateTimelineEraSql(pool, target);
    }
    return structuredClone(target);
  },

  async reorderTimelineEras(orderedIds: string[]): Promise<TimelineEra[]> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return reorderTimelineErasSql(pool, orderedIds);
    }

    const store = getPreviewStore();
    const byId = new Map(store.timeline.map((e) => [e.id, e]));
    const nextOrdered: TimelineEra[] = [];

    for (const rawId of orderedIds) {
      const id = String(rawId || '').trim();
      const found = byId.get(id);
      if (found) {
        nextOrdered.push(found);
        byId.delete(id);
      }
    }
    for (const remaining of byId.values()) {
      nextOrdered.push(remaining);
    }
    nextOrdered.forEach((e, idx) => {
      e.sortOrder = idx;
    });
    store.timeline = nextOrdered;
    return structuredClone(store.timeline);
  },

  async deleteTimelineEra(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteTimelineEraSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.timeline.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    store.timeline.splice(idx, 1);
    store.timeline.forEach((e, i) => {
      e.sortOrder = i;
    });
    return true;
  },

  // ==================== PLACES TO REMEMBER CRUD ====================
  async addRememberedPlace(input: {
    name: string;
    closedSortIso: string;
    closedDisplayLabel: string;
    location: string;
    sourceType?: MediaSourceType;
    sourceIdOrUrl?: string;
    imageUrl?: string;
    memorialStory: string;
    tags: string[];
  }): Promise<RememberedPlace> {
    const cleanName = input.name.trim().slice(0, 160);
    if (!cleanName) throw new Error('Place name is required');
    const resolvedImg = input.sourceIdOrUrl?.trim()
      ? resolveMediaUrl(
          input.sourceType || 'embedded',
          input.sourceIdOrUrl,
          IMG_VELO_STAGE
        )
      : input.imageUrl?.trim()
      ? sanitizeSafeMediaOrWebUrl(input.imageUrl, IMG_VELO_STAGE)
      : IMG_VELO_STAGE;

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'places_remembered')
      : getPreviewStore().remembered.length;

    const created: RememberedPlace = {
      id: `REM-0${count + 1}-${Date.now().toString().slice(-3)}`,
      name: cleanName,
      closedSortIso: input.closedSortIso.trim().slice(0, 20) || '2024-12',
      closedDisplayLabel:
        input.closedDisplayLabel.trim().slice(0, 60) || 'Remembered Space',
      location: input.location.trim().slice(0, 140) || 'Greenville, SC',
      imageUrl: resolvedImg,
      memorialStory: input.memorialStory.trim().slice(0, 900),
      tags: normalizeTagsList(input.tags, ['venue', 'greenville']),
    };

    if (pool) {
      await insertPlaceSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.remembered.unshift(created);
    return structuredClone(created);
  },

  async updateRememberedPlace(
    id: string,
    input: {
      name?: string;
      closedSortIso?: string;
      closedDisplayLabel?: string;
      location?: string;
      sourceType?: MediaSourceType;
      sourceIdOrUrl?: string;
      imageUrl?: string;
      memorialStory?: string;
      tags?: string[];
    }
  ): Promise<RememberedPlace | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getPlaceByIdSql(pool, id)
      : getPreviewStore().remembered.find((r) => r.id === id) || null;
    if (!target) return null;

    if (typeof input.name === 'string' && input.name.trim()) {
      target.name = input.name.trim().slice(0, 160);
    }
    if (typeof input.closedSortIso === 'string' && input.closedSortIso.trim()) {
      target.closedSortIso = input.closedSortIso.trim().slice(0, 20);
    }
    if (
      typeof input.closedDisplayLabel === 'string' &&
      input.closedDisplayLabel.trim()
    ) {
      target.closedDisplayLabel = input.closedDisplayLabel.trim().slice(0, 60);
    }
    if (typeof input.location === 'string' && input.location.trim()) {
      target.location = input.location.trim().slice(0, 140);
    }
    if (typeof input.memorialStory === 'string' && input.memorialStory.trim()) {
      target.memorialStory = input.memorialStory.trim().slice(0, 900);
    }
    if (typeof input.sourceIdOrUrl === 'string' && input.sourceIdOrUrl.trim()) {
      target.imageUrl = resolveMediaUrl(
        input.sourceType || 'embedded',
        input.sourceIdOrUrl,
        target.imageUrl
      );
    } else if (typeof input.imageUrl === 'string' && input.imageUrl.trim()) {
      target.imageUrl = sanitizeSafeMediaOrWebUrl(input.imageUrl, target.imageUrl);
    }
    if (Array.isArray(input.tags)) {
      target.tags = normalizeTagsList(input.tags, ['venue', 'greenville']);
    }

    if (pool) {
      await updatePlaceSql(pool, target);
    }
    return structuredClone(target);
  },

  async deleteRememberedPlace(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deletePlaceSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.remembered.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    store.remembered.splice(idx, 1);
    return true;
  },

  // ==================== SUBSCRIBERS CSV ====================
  async appendSubscriberRow(
    input: Omit<SubscriberCsvRow, 'id' | 'createdAtIso'>
  ): Promise<SubscriberCsvRow> {
    const row: SubscriberCsvRow = {
      id: `SUB-${Date.now()}`,
      createdAtIso: new Date().toISOString().slice(0, 10),
      source: input.source,
      name: input.name.trim().slice(0, 120),
      email: input.email.trim().toLowerCase().slice(0, 180),
      interests: input.interests.trim().slice(0, 500),
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      await insertSubscriberSql(pool, row);
      return structuredClone(row);
    }

    const store = getPreviewStore();
    store.subscribers.unshift(row);
    return structuredClone(row);
  },

  async updateSubscriberRow(
    id: string,
    input: {
      createdAtIso?: string;
      source?: SubscriberCsvRow['source'];
      name?: string;
      email?: string;
      interests?: string;
    }
  ): Promise<SubscriberCsvRow | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getSubscriberByIdSql(pool, id)
      : getPreviewStore().subscribers.find((r) => r.id === id) || null;
    if (!target) return null;

    if (typeof input.createdAtIso === 'string' && input.createdAtIso.trim()) {
      target.createdAtIso = input.createdAtIso.trim().slice(0, 32);
    }
    if (input.source === 'Message Us' || input.source === 'Live Chat') {
      target.source = input.source;
    }
    if (typeof input.name === 'string' && input.name.trim()) {
      target.name = input.name.trim().slice(0, 120);
    }
    if (typeof input.email === 'string' && input.email.trim()) {
      const cleanEmail = input.email.trim().toLowerCase().slice(0, 180);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new Error('Valid email address is required');
      }
      target.email = cleanEmail;
    }
    if (typeof input.interests === 'string') {
      target.interests = input.interests.trim().slice(0, 500);
    }

    if (pool) {
      await updateSubscriberSql(pool, target);
    }
    return structuredClone(target);
  },

  async removeSubscriberRow(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteSubscriberSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.subscribers.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    store.subscribers.splice(idx, 1);
    return true;
  },

  async listSubscribersAdminOnly(): Promise<SubscriberCsvRow[]> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return listSubscribersSql(pool);
    }
    const store = getPreviewStore();
    return structuredClone(store.subscribers);
  },

  async serializeSubscribersToCsv(): Promise<string> {
    const rows = await this.listSubscribersAdminOnly();
    const sanitizeSpreadsheetFormula = (raw: string): string => {
      const cell = String(raw ?? '');
      if (/^[=+\-@\t\r]/.test(cell)) {
        return `'${cell}`;
      }
      return cell;
    };
    const escapeCsv = (val: string) =>
      `"${sanitizeSpreadsheetFormula(val).replace(/"/g, '""')}"`;
    const header = 'Date,Source,Name,Email,Interests';
    const lines = rows.map((r) =>
      [r.createdAtIso, r.source, r.name, r.email, r.interests].map(escapeCsv).join(',')
    );
    return [header, ...lines].join('\n');
  },

  // ==================== BARTER MARKET AUCTIONS ====================
  async markAuctionSoldByMediaOrId(identifier: {
    igMediaId?: string;
    auctionId?: string;
    sold: boolean;
  }): Promise<InstagramAuctionItem | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await findAuctionByMediaOrIdSql(pool, identifier)
      : getPreviewStore().auctions.find(
          (a) =>
            (identifier.auctionId && a.id === identifier.auctionId) ||
            (identifier.igMediaId && a.igMediaId === identifier.igMediaId)
        ) || null;
    if (!target) return null;

    target.sold = identifier.sold;
    target.currentBidLabel = identifier.sold
      ? 'Marked SOLD (Verified)'
      : 'Open IG Bidding';
    target.tags = [
      ...target.tags.filter((t) => t !== 'live' && t !== 'sold'),
      identifier.sold ? 'sold' : 'live',
    ];

    if (pool) {
      await updateAuctionSql(pool, target);
    }
    return structuredClone(target);
  },

  async addAuctionItem(input: {
    title: string;
    ownerUsername: string;
    openingBid: string;
    pickupArea?: string;
    sourceType?: MediaSourceType;
    sourceIdOrUrl?: string;
    igMediaId?: string;
    igPermalink?: string;
    tags?: string[];
  }): Promise<InstagramAuctionItem> {
    const cleanTitle = input.title.trim().slice(0, 140);
    if (!cleanTitle) throw new Error('Auction title is required');
    const resolvedImg = resolveMediaUrl(
      input.sourceType || 'embedded',
      input.sourceIdOrUrl,
      IMG_BORO_GLASS
    );
    const baseTags = normalizeTagsList(
      (input.tags || []).filter((t) => t !== 'live' && t !== 'sold'),
      ['vetted', 'greenville']
    );

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'auctions')
      : getPreviewStore().auctions.length;

    const created: InstagramAuctionItem = {
      id: `AUC-0${count + 1}-${Date.now().toString().slice(-3)}`,
      title: cleanTitle,
      ownerUsername: input.ownerUsername.trim().replace(/^@/, '').slice(0, 60) || 'artist',
      currentBidLabel: input.openingBid.includes('·')
        ? input.openingBid.trim().slice(0, 120)
        : `${input.openingBid.trim().slice(0, 60)} · Opening IG bid`,
      pickupArea: (input.pickupArea || 'Greenville Local Pickup').trim().slice(0, 120),
      sourceType: input.sourceType || 'embedded',
      sourceIdOrUrl: (input.sourceIdOrUrl || '').trim(),
      imageUrl: resolvedImg,
      igMediaId: input.igMediaId?.trim().slice(0, 64) || undefined,
      igPermalink: sanitizeHttpUrlOnly(
        input.igPermalink,
        'https://www.instagram.com/'
      ),
      sold: false,
      tags: Array.from(new Set([...baseTags, 'live'])),
    };

    if (pool) {
      await insertAuctionSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.auctions.unshift(created);
    return structuredClone(created);
  },

  async updateAuctionItem(
    id: string,
    input: {
      title?: string;
      ownerUsername?: string;
      currentBidLabel?: string;
      pickupArea?: string;
      sourceType?: MediaSourceType;
      sourceIdOrUrl?: string;
      imageUrl?: string;
      igMediaId?: string;
      igPermalink?: string;
      sold?: boolean;
      tags?: string[];
    }
  ): Promise<InstagramAuctionItem | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getAuctionByIdSql(pool, id)
      : getPreviewStore().auctions.find((a) => a.id === id) || null;
    if (!target) return null;

    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 140);
    }
    if (typeof input.ownerUsername === 'string' && input.ownerUsername.trim()) {
      target.ownerUsername = input.ownerUsername
        .trim()
        .replace(/^@/, '')
        .slice(0, 60);
    }
    if (typeof input.currentBidLabel === 'string' && input.currentBidLabel.trim()) {
      target.currentBidLabel = input.currentBidLabel.trim().slice(0, 120);
    }
    if (typeof input.pickupArea === 'string' && input.pickupArea.trim()) {
      target.pickupArea = input.pickupArea.trim().slice(0, 120);
    }
    if (
      input.sourceType &&
      ['gdrive', 'r2', 'embedded'].includes(input.sourceType)
    ) {
      target.sourceType = input.sourceType;
    }
    if (typeof input.sourceIdOrUrl === 'string') {
      target.sourceIdOrUrl = input.sourceIdOrUrl.trim();
      if (target.sourceIdOrUrl) {
        target.imageUrl = resolveMediaUrl(
          target.sourceType || 'embedded',
          target.sourceIdOrUrl,
          target.imageUrl
        );
      }
    }
    if (typeof input.imageUrl === 'string' && input.imageUrl.trim()) {
      target.imageUrl = sanitizeSafeMediaOrWebUrl(input.imageUrl, target.imageUrl);
    }
    if (typeof input.igMediaId === 'string') {
      target.igMediaId = input.igMediaId.trim().slice(0, 64) || undefined;
    }
    if (typeof input.igPermalink === 'string' && input.igPermalink.trim()) {
      target.igPermalink = sanitizeHttpUrlOnly(
        input.igPermalink,
        target.igPermalink
      );
    }
    if (typeof input.sold === 'boolean') {
      target.sold = input.sold;
    }

    const rawTags = Array.isArray(input.tags) ? input.tags : target.tags;
    const baseTags = normalizeTagsList(
      rawTags.filter((t) => t !== 'live' && t !== 'sold'),
      ['vetted', 'greenville']
    );
    target.tags = Array.from(
      new Set([...baseTags, target.sold ? 'sold' : 'live'])
    );

    if (pool) {
      await updateAuctionSql(pool, target);
    }
    return structuredClone(target);
  },

  async deleteAuctionItem(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteAuctionSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.auctions.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.auctions.splice(idx, 1);
    return true;
  },

  // ==================== CALENDAR SHOWS (FULL YYYY-MM-DD + CUSTOM CSS) ====================
  async publishCalendarShow(input: {
    isoDate: string;
    monthKey?: string;
    dayOfMonth?: number;
    title: string;
    venue: string;
    doorsInfo: string;
    flyerStyle: FlyerPresetStyle;
    flyerHeadlineNote: string;
    scopedCustomCss?: string;
    tags?: string[];
  }): Promise<ShowCalendarEvent> {
    const parsedDate = parseAndValidateIsoDate(input.isoDate);
    const cleanTitle = input.title.trim().slice(0, 180);
    const cleanVenue = input.venue.trim().slice(0, 120);
    if (!cleanTitle || !cleanVenue) {
      throw new Error('Show title and venue are required');
    }
    const flyerStyle: FlyerPresetStyle = [
      'punk-xerox',
      'concrete-stencil',
      'riso-zine',
      'custom-css',
    ].includes(input.flyerStyle)
      ? input.flyerStyle
      : 'punk-xerox';

    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'calendar_shows')
      : getPreviewStore().calendar.length;

    const created: ShowCalendarEvent = {
      id: `CAL-0${count + 1}-${Date.now().toString().slice(-3)}`,
      isoDate: parsedDate.isoDate,
      monthKey: parsedDate.monthKey,
      dayOfMonth: parsedDate.dayOfMonth,
      title: cleanTitle,
      venue: cleanVenue,
      doorsInfo: input.doorsInfo.trim().slice(0, 120) || '8:00 PM · DIY Bill',
      flyerStyle,
      flyerHeadlineNote: input.flyerHeadlineNote.trim().slice(0, 320),
      scopedCustomCss: sanitizeScopedFlyerCss(input.scopedCustomCss),
      tags: normalizeTagsList(input.tags || [], ['greenville', 'diy']),
    };

    if (pool) {
      await insertCalendarShowSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.calendar.push(created);
    store.calendar.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    return structuredClone(created);
  },

  async updateCalendarShow(
    id: string,
    input: {
      isoDate?: string;
      title?: string;
      venue?: string;
      doorsInfo?: string;
      flyerStyle?: FlyerPresetStyle;
      flyerHeadlineNote?: string;
      scopedCustomCss?: string;
      tags?: string[];
    }
  ): Promise<ShowCalendarEvent | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const target = pool
      ? await getCalendarShowByIdSql(pool, id)
      : getPreviewStore().calendar.find((c) => c.id === id) || null;
    if (!target) return null;

    if (typeof input.isoDate === 'string' && input.isoDate.trim()) {
      const parsed = parseAndValidateIsoDate(input.isoDate);
      target.isoDate = parsed.isoDate;
      target.monthKey = parsed.monthKey;
      target.dayOfMonth = parsed.dayOfMonth;
    }
    if (typeof input.title === 'string' && input.title.trim()) {
      target.title = input.title.trim().slice(0, 180);
    }
    if (typeof input.venue === 'string' && input.venue.trim()) {
      target.venue = input.venue.trim().slice(0, 120);
    }
    if (typeof input.doorsInfo === 'string' && input.doorsInfo.trim()) {
      target.doorsInfo = input.doorsInfo.trim().slice(0, 120);
    }
    if (
      input.flyerStyle &&
      ['punk-xerox', 'concrete-stencil', 'riso-zine', 'custom-css'].includes(
        input.flyerStyle
      )
    ) {
      target.flyerStyle = input.flyerStyle;
    }
    if (typeof input.flyerHeadlineNote === 'string') {
      target.flyerHeadlineNote = input.flyerHeadlineNote.trim().slice(0, 320);
    }
    if (typeof input.scopedCustomCss === 'string') {
      target.scopedCustomCss = sanitizeScopedFlyerCss(input.scopedCustomCss);
    }
    if (Array.isArray(input.tags)) {
      target.tags = normalizeTagsList(input.tags, ['greenville', 'diy']);
    }

    if (pool) {
      await updateCalendarShowSql(pool, target);
      return structuredClone(target);
    }

    const store = getPreviewStore();
    store.calendar.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
    return structuredClone(target);
  },

  async deleteCalendarShow(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteCalendarShowSql(pool, id);
    }
    const store = getPreviewStore();
    const idx = store.calendar.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    store.calendar.splice(idx, 1);
    return true;
  },

  // ==================== COMMENTS & MODERATION ====================
  async addComment(
    targetItemId: string,
    author: string,
    text: string,
    timestampSec?: number
  ): Promise<CommentNode> {
    const cleanTs =
      typeof timestampSec === 'number' && Number.isFinite(timestampSec) && timestampSec >= 0
        ? Math.floor(timestampSec)
        : undefined;
    const node: CommentNode = {
      id: `CMT-${Date.now()}`,
      targetItemId,
      author: author.trim().replace(/^@/, '').slice(0, 50) || 'anon',
      text: text.trim().slice(0, 500),
      timestampSec: cleanTs,
      votes: 1,
      createdAtIso: new Date().toISOString(),
      replies: [],
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      await insertCommentSql(pool, node);
      return structuredClone(node);
    }

    const store = getPreviewStore();
    if (!store.commentsByItem[targetItemId]) {
      store.commentsByItem[targetItemId] = [];
    }
    store.commentsByItem[targetItemId].unshift(node);
    return structuredClone(node);
  },

  async voteComment(
    targetItemId: string,
    commentId: string,
    delta: 1 | -1
  ): Promise<CommentNode | null> {
    const safeDelta: 1 | -1 = delta === -1 ? -1 : 1;
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return voteCommentAtomicSql(pool, targetItemId, commentId, safeDelta);
    }

    const store = getPreviewStore();
    const list = store.commentsByItem[targetItemId] || [];
    const target = list.find((c) => c.id === commentId);
    if (!target) return null;
    target.votes += safeDelta;
    return structuredClone(target);
  },

  async addReply(
    targetItemId: string,
    commentId: string,
    author: string,
    text: string
  ): Promise<CommentNode | null> {
    const reply: CommentReply = {
      id: `RPL-${Date.now()}`,
      author: author.trim().replace(/^@/, '').slice(0, 50) || 'anon',
      text: text.trim().slice(0, 400),
      createdAtIso: new Date().toISOString(),
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return appendCommentReplySql(pool, targetItemId, commentId, reply);
    }

    const store = getPreviewStore();
    const list = store.commentsByItem[targetItemId] || [];
    const target = list.find((c) => c.id === commentId);
    if (!target) return null;
    target.replies.push(reply);
    return structuredClone(target);
  },

  async deleteComment(targetItemId: string, commentId: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteCommentSql(pool, targetItemId, commentId);
    }

    const store = getPreviewStore();
    const list = store.commentsByItem[targetItemId];
    if (!list) return false;
    const idx = list.findIndex((c) => c.id === commentId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  },

  // ==================== SCENE ROOM CHAT & 8S POLLING ====================
  async getLivePollSnapshot(): Promise<{
    sceneChat: SceneChatMessage[];
    auctions: InstagramAuctionItem[];
  }> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return fetchLivePollSnapshotSql(pool);
    }

    const store = getPreviewStore();
    return {
      sceneChat: structuredClone(store.sceneChat.slice(-PREVIEW_SCENE_CHAT_DISPLAY)),
      auctions: structuredClone(store.auctions),
    };
  },

  async appendSceneChatMessage(
    who: string,
    msg: string
  ): Promise<SceneChatMessage[]> {
    const d = new Date();
    const timeLabel =
      (d.getHours() % 12 || 12) +
      ':' +
      String(d.getMinutes()).padStart(2, '0') +
      (d.getHours() >= 12 ? 'p' : 'a');
    const entry: SceneChatMessage = {
      id: `CHAT-${Date.now()}`,
      who: who.trim().replace(/^@/, '').slice(0, 32) || 'visitor',
      time: timeLabel,
      msg: msg.trim().slice(0, 280),
      createdAtIso: d.toISOString(),
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return appendSceneChatSql(pool, entry);
    }

    const store = getPreviewStore();
    store.sceneChat = [
      ...store.sceneChat.slice(-(PREVIEW_SCENE_CHAT_MAX_STORED - 1)),
      entry,
    ];
    return structuredClone(store.sceneChat.slice(-PREVIEW_SCENE_CHAT_DISPLAY));
  },

  async deleteSceneChatMessage(id: string): Promise<boolean> {
    const cleanId = String(id || '').trim();
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteSceneChatSql(pool, cleanId);
    }

    const store = getPreviewStore();
    const idx = store.sceneChat.findIndex((m) => m.id === cleanId);
    if (idx === -1) return false;
    store.sceneChat.splice(idx, 1);
    return true;
  },

  // ==================== NEXT-ROUND LEDGER ====================
  async addFutureTask(
    input: Omit<FutureTaskLedgerItem, 'id' | 'createdAtIso'>
  ): Promise<FutureTaskLedgerItem> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    const count = pool
      ? await countTableRowsSql(pool, 'future_tasks')
      : getPreviewStore().futureTasks.length;

    const item: FutureTaskLedgerItem = {
      ...input,
      id: `P7-0${count + 1}-${Date.now().toString().slice(-2)}`,
      createdAtIso: new Date().toISOString(),
    };

    if (pool) {
      await insertFutureTaskSql(pool, item);
      return structuredClone(item);
    }

    const store = getPreviewStore();
    store.futureTasks.unshift(item);
    return structuredClone(item);
  },

  async updateFutureTaskStatus(
    id: string,
    status: TaskStatus
  ): Promise<FutureTaskLedgerItem | null> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return updateFutureTaskStatusSql(pool, id, status);
    }

    const store = getPreviewStore();
    const item = store.futureTasks.find((t) => t.id === id);
    if (!item) return null;
    item.status = status;
    return structuredClone(item);
  },

  async deleteFutureTask(id: string): Promise<boolean> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteFutureTaskSql(pool, id);
    }

    const store = getPreviewStore();
    const idx = store.futureTasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    store.futureTasks.splice(idx, 1);
    return true;
  },

  // ==================== PUCK VISUAL STUDIO PAGES & SLOTS ====================
  async listPuckPages(): Promise<PuckPageRecord[]> {
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return listPuckPagesSql(pool);
    }
    const store = getPreviewStore();
    return structuredClone(store.puckPages);
  },

  async getPuckPageBySlug(slug: string): Promise<PuckPageRecord | null> {
    const clean = slug.trim();
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return getPuckPageBySlugSql(pool, clean);
    }
    const store = getPreviewStore();
    const found = store.puckPages.find((p) => p.slug === clean);
    return found ? structuredClone(found) : null;
  },

  async savePuckPageData(
    slug: string,
    input: {
      title?: string;
      published?: boolean;
      puckData: PuckSerializedData;
    }
  ): Promise<PuckPageRecord> {
    const cleanSlug = slug.trim();
    const nowIso = new Date().toISOString();
    const safePuckData: PuckSerializedData = {
      root: input.puckData?.root || { props: { title: input.title || cleanSlug } },
      content: Array.isArray(input.puckData?.content) ? input.puckData.content : [],
      ...(input.puckData?.zones ? { zones: input.puckData.zones } : {}),
    };

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const existing = await getPuckPageBySlugSql(pool, cleanSlug);
      const nextPage: PuckPageRecord = existing
        ? {
            ...existing,
            title:
              typeof input.title === 'string' && input.title.trim()
                ? input.title.trim().slice(0, 180)
                : existing.title,
            published:
              typeof input.published === 'boolean' ? input.published : existing.published,
            puckData: safePuckData,
            updatedAtIso: nowIso,
          }
        : {
            slug: cleanSlug,
            title: (input.title || cleanSlug).trim().slice(0, 180),
            isSlot: cleanSlug.startsWith('slot:'),
            published: input.published ?? true,
            puckData: safePuckData,
            updatedAtIso: nowIso,
          };
      await upsertPuckPageSql(pool, nextPage);
      return structuredClone(nextPage);
    }

    const store = getPreviewStore();
    let target = store.puckPages.find((p) => p.slug === cleanSlug);
    if (target) {
      if (typeof input.title === 'string' && input.title.trim()) {
        target.title = input.title.trim().slice(0, 180);
      }
      if (typeof input.published === 'boolean') {
        target.published = input.published;
      }
      target.puckData = safePuckData;
      target.updatedAtIso = nowIso;
    } else {
      target = {
        slug: cleanSlug,
        title: (input.title || cleanSlug).trim().slice(0, 180),
        isSlot: cleanSlug.startsWith('slot:'),
        published: input.published ?? true,
        puckData: safePuckData,
        updatedAtIso: nowIso,
      };
      store.puckPages.push(target);
    }

    return structuredClone(target);
  },

  async createCustomPuckPage(input: {
    slug: string;
    title: string;
  }): Promise<PuckPageRecord> {
    const cleanSlug = input.slug
      .trim()
      .toLowerCase()
      .replace(/^\/+|^p\/+/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 96);

    if (!cleanSlug) {
      throw new Error('Valid URL slug required');
    }

    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      const existing = await getPuckPageBySlugSql(pool, cleanSlug);
      if (existing) {
        return structuredClone(existing);
      }
    } else {
      const existing = getPreviewStore().puckPages.find((p) => p.slug === cleanSlug);
      if (existing) {
        return structuredClone(existing);
      }
    }

    const cleanTitle = (input.title || cleanSlug).trim().slice(0, 180);
    const nowIso = new Date().toISOString();
    const created: PuckPageRecord = {
      slug: cleanSlug,
      title: cleanTitle,
      isSlot: false,
      published: true,
      updatedAtIso: nowIso,
      puckData: {
        root: { props: { title: cleanTitle } },
        content: [
          {
            type: 'LiquidGlassBanner',
            props: {
              id: `LiquidGlassBanner-${Date.now()}`,
              eyebrow: 'GREENVILLE DIY ZINE',
              headline: cleanTitle,
              description:
                'Open this page in the Visual Studio editor to add media cards, mixed-media flyers, two-column slots, or sandboxed HTML zines.',
              ctaLabel: 'Back to Archive',
              ctaUrl: '/',
              accentStyle: 'neutral',
            },
          },
        ],
      },
    };

    if (pool) {
      await upsertPuckPageSql(pool, created);
      return structuredClone(created);
    }

    const store = getPreviewStore();
    store.puckPages.push(created);
    return structuredClone(created);
  },

  async deleteCustomPuckPage(slug: string): Promise<boolean> {
    const cleanSlug = slug.trim();
    const pool = await getInitializedMysqlPool().catch(() => null);
    if (pool) {
      return deleteOrClearPuckPageSql(pool, cleanSlug);
    }

    const store = getPreviewStore();
    const idx = store.puckPages.findIndex((p) => p.slug === cleanSlug);
    if (idx === -1) return false;

    if (store.puckPages[idx].isSlot) {
      store.puckPages[idx].puckData = {
        root: { props: { title: store.puckPages[idx].title } },
        content: [],
      };
      store.puckPages[idx].updatedAtIso = new Date().toISOString();
      return true;
    }

    store.puckPages.splice(idx, 1);
    return true;
  },
};

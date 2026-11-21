// lib/storage/repository.ts
import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import {
  AdminSiteSettings,
  ArchiveDataset,
  CommentNode,
  FlacRecording,
  FlacVersionSource,
  FutureTaskLedgerItem,
  InstagramAuctionItem,
  MediaSourceType,
  PhotoPlate,
  PuckPageRecord,
  PuckSerializedData,
  RuntimePostureSnapshot,
  SceneArtist,
  SceneChatMessage,
  ShowCalendarEvent,
  SubscriberCsvRow,
  TaskStatus,
  VideoTape,
  VideoTimestamp,
} from '@/types/archive';
import {
  getRuntimePostureSnapshot,
  isHostingerMysqlConfigured,
  resolveMysqlHost,
  resolveMysqlPort,
} from '@/lib/config/runtimeEnv';
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
    },
    {
      id: 'ERA-02',
      eraRange: '2002–2003',
      dialShortLabel: '2003',
      title: 'Two Mill Fires & First Skater Concrete',
      summary:
        'Fires left only brick smokestacks and concrete slabs. Skaters cleared rubble by hand and poured Greenville’s DIY park.',
      portholeImageUrl: IMG_POE_MILL,
    },
    {
      id: 'ERA-03',
      eraRange: '2012–2014',
      dialShortLabel: '2012',
      title: 'No Name & S.P.O.G. Close Doors',
      summary:
        'When Greenville’s indoor wooden skateparks closed, self-built concrete at Poe Mill became the scene’s permanent anchor.',
      portholeImageUrl: IMG_POE_MILL,
    },
    {
      id: 'ERA-04',
      eraRange: 'Barn Origin',
      dialShortLabel: 'BARN',
      title: 'Curly Blue Turned Away -> The Barn Born',
      summary:
        'After Curly Blue could not get booked at Radio Room, practice sessions inside The Barn turned into full underground bills.',
      portholeImageUrl: IMG_THE_BARN,
    },
    {
      id: 'ERA-05',
      eraRange: '5th–6th Gen',
      dialShortLabel: 'GEN 6',
      title: 'Poe Mill Friendships & Craigslist Jams',
      summary:
        'Skyler’s Craigslist musician post and friendships forged at Poe (Chandler, B-Man, Zach of Rocco & His Bones) carried The Barn forward.',
      portholeImageUrl: IMG_THE_BARN,
    },
    {
      id: 'ERA-06',
      eraRange: '2021–2024',
      dialShortLabel: '2024',
      title: 'Developer Sale & Velo Fellow Closing',
      summary:
        'The 2021 Poe Mill land sale and Dec 2024 loss of The Velo Fellow sparked an urgent push to preserve tapes, film, and stories.',
      portholeImageUrl: IMG_VELO_STAGE,
    },
    {
      id: 'ERA-07',
      eraRange: '2026+',
      dialShortLabel: 'NOW',
      title: 'Unified Carolinas DIY Archive & Barter Market',
      summary:
        'Fast, mobile-first archive uniting Upstate SC & Asheville bands, lossless FLAC recordings, custom show flyers, and 0%-fee artist auctions.',
      portholeImageUrl: IMG_THE_BARN,
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
      id: 'P5-01',
      passPhase: 'Pass 5',
      title: 'Built-In Puck Visual Studio (@puckeditor/core), Inline Slots & /p/[slug] Pages',
      area: 'Puck Visual Studio',
      priority: 'P1',
      status: 'Completed',
      rationale:
        'Shipped in Pass 5: 6 flatter frosted-glass blocks, native slot multi-column nesting, sandboxed HTML zine frames, 3 inline tab slots, and /p/[slug] RSC pages.',
      prerequisite:
        'Active in /admin -> 1. Visual Studio and /admin/editor/[slug].',
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
    {
      id: 'P5-03',
      passPhase: 'Pass 5',
      title: 'Multi-Take A/B Mix Admin Uploader & Browser LUFS Analyzer',
      area: 'UI & Media',
      priority: 'P2',
      status: 'Completed',
      rationale:
        'Shipped in Pass 5: repeatable alternate mix take inputs in /admin plus client-side 72-bar RMS & integrated LUFS loudness decoding.',
      prerequisite:
        'Active in /admin -> Media & Archive CRUD -> 24-Bit FLAC Audio.',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
    {
      id: 'P5-04',
      passPhase: 'Hostinger',
      title: 'Hostinger Local MySQL (127.0.0.1:3306) Live Credential Cutover',
      area: 'Hostinger MySQL',
      priority: 'P0',
      status: 'Planned',
      rationale:
        'ensureSchemaInitialized() auto-creates all tables (including puck_pages) on first boot; live cutover only requires hPanel database credentials.',
      prerequisite:
        'Create MySQL DB in hPanel -> Databases and set DB_HOST=127.0.0.1, DB_PORT=3306, DB_USER, DB_PASSWORD, DB_NAME in Hostinger Environment Variables.',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
    {
      id: 'P5-05',
      passPhase: 'Storage / CDN',
      title: 'Google Drive Service Account API v3 + Cloudflare R2 Production Keys',
      area: 'Google Drive / R2',
      priority: 'P0',
      status: 'Planned',
      rationale:
        'Range proxy and preview fallbacks are compiled in; live 24-bit FLAC and 35mm streaming needs the curator Drive folder service account.',
      prerequisite:
        'Share Greenville_DIY_Media Drive folder with Service Account and set GDRIVE_CLIENT_EMAIL & GDRIVE_PRIVATE_KEY (plus Cloudflare edge DNS).',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
    {
      id: 'P5-06',
      passPhase: 'Pass 6',
      title: 'Meta Graph API App Review for Live Instagram "SOLD" Webhooks',
      area: 'IG Webhooks',
      priority: 'P1',
      status: 'Deferred',
      rationale:
        'HMAC verification and 8-second client auction polling are active, but live Instagram comment events require Meta business approval.',
      prerequisite:
        'Approve instagram_business_manage_comments in Meta Developer Portal and set IG_WEBHOOK_APP_SECRET & IG_VERIFY_TOKEN on thebartermarket.org.',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
    {
      id: 'P6-01',
      passPhase: 'Pass 6',
      title: 'Cross-Browser WebGPU / WebGL2 Background-Capture Refraction for Safari & Firefox',
      area: 'UI & Media',
      priority: 'P1',
      status: 'Deferred',
      rationale:
        'Chromium renders full Snell’s-law SVG feDisplacementMap backdrop refraction today; WebKit/Gecko require a multi-pass WebGPU/WebGL2 background capture pass beyond CSS backdrop-filter.',
      prerequisite:
        'Evaluate lightweight canvas snapshot shader pass once Safari/Firefox expose native SVG backdrop-filter or offscreen DOM capture.',
      createdAtIso: '2026-11-20T12:00:00Z',
    },
    {
      id: 'P6-02',
      passPhase: 'Pass 6',
      title: 'Mobile Hardware Gyroscope 3D Specular Tilt Reflection',
      area: 'UI & Media',
      priority: 'P2',
      status: 'Deferred',
      rationale:
        'iOS Safari blocks DeviceOrientationEvent streams unless triggered from an explicit user permission modal; desktop/touch pointer sheen is active now without arrival popups.',
      prerequisite:
        'Add opt-in motion calibration toggle inside Audio/Timeline settings for handheld specular tilt.',
      createdAtIso: '2026-11-20T12:00:00Z',
    },
    {
      id: 'P6-03',
      passPhase: 'Pass 6',
      title: 'Custom External-Label Field Renderers Inside @puckeditor/core Inspector',
      area: 'Puck Visual Studio',
      priority: 'P2',
      status: 'Deferred',
      rationale:
        'All public archive drawers and all 7 Admin Manager tabs now enforce stacked external monospace labels; overriding internal third-party Puck sidebar inputs requires custom fieldTypes adapters.',
      prerequisite:
        'Map Puck fieldTypes (text, textarea, number, select) to .field-group / .field-label in puck.config.tsx.',
      createdAtIso: '2026-11-20T12:00:00Z',
    },
    {
      id: 'P6-04',
      passPhase: 'Pass 6',
      title: 'Off-Hostinger Worker for Server-Side FFmpeg HLS/FLAC Segmenting',
      area: 'UI & Media',
      priority: 'P2',
      status: 'Deferred',
      rationale:
        'Cannot run FFmpeg child processes inside Hostinger Business Web Hosting’s 120 NPROC limit; client Web Audio peak/LUFS analysis covers current uploads.',
      prerequisite:
        'Optional Cloudflare Worker / external transcode job if adaptive HLS manifests are needed later.',
      createdAtIso: '2026-11-20T09:00:00Z',
    },
  ],
};

const globalForArchive = globalThis as unknown as {
  __gvlDiyStore?: ArchiveDataset;
  __gvlMysqlPool?: Pool;
  __gvlMysqlHydrated?: boolean;
};

function isMysqlConfigured(): boolean {
  return isHostingerMysqlConfigured();
}

function getMysqlPool(): Pool | null {
  if (!isMysqlConfigured()) return null;
  if (!globalForArchive.__gvlMysqlPool) {
    const host = resolveMysqlHost();
    globalForArchive.__gvlMysqlPool = mysql.createPool({
      host,
      port: resolveMysqlPort(),
      user: process.env.DB_USER!.trim(),
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME!.trim(),
      waitForConnections: true,
      connectionLimit: 5, // Tuned for Hostinger Business Web Hosting 120 NPROC budget
      queueLimit: 0,
    });
  }
  return globalForArchive.__gvlMysqlPool;
}

/**
 * Zero-Touch Hostinger MySQL Auto-Bootstrap (`ensureSchemaInitialized`):
 * Automatically creates all relational & snapshot tables on first connection per boot
 * so deploying to Hostinger Node.js Web Apps requires zero manual SQL imports.
 */
async function ensureSchemaInitialized(pool: Pool): Promise<void> {
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS archive_kv_snapshot (
      store_key VARCHAR(32) PRIMARY KEY,
      payload_json LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS site_config (
      id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
      season_theme VARCHAR(16) NOT NULL DEFAULT 'fall',
      default_contrast VARCHAR(16) NOT NULL DEFAULT 'light',
      archive_submission_email VARCHAR(180) NOT NULL DEFAULT 'submissions@greenvillediyarchive.org',
      calendar_submission_email VARCHAR(180) NOT NULL DEFAULT 'calendar@greenvillediyarchive.org',
      auction_submission_email VARCHAR(180) NOT NULL DEFAULT 'auctions@thebartermarket.org',
      updated_at_iso VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS videos (
      id VARCHAR(40) PRIMARY KEY,
      slug VARCHAR(160) NOT NULL,
      title VARCHAR(220) NOT NULL,
      recorded_date VARCHAR(20) NOT NULL,
      venue VARCHAR(140) NOT NULL,
      filmer VARCHAR(120) NOT NULL,
      youtube_unlisted_id VARCHAR(32) NOT NULL,
      poster_url MEDIUMTEXT NOT NULL,
      timestamps_json JSON NOT NULL,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS flac_tracks (
      id VARCHAR(40) PRIMARY KEY,
      slug VARCHAR(160) NOT NULL,
      title VARCHAR(220) NOT NULL,
      artist VARCHAR(160) NOT NULL,
      venue VARCHAR(140) NOT NULL,
      recorded_date VARCHAR(20) NOT NULL,
      duration_sec INT UNSIGNED NOT NULL DEFAULT 180,
      bit_depth TINYINT UNSIGNED NOT NULL DEFAULT 24,
      sample_rate_hz INT UNSIGNED NOT NULL DEFAULT 48000,
      spec_label VARCHAR(80) NOT NULL,
      source_type VARCHAR(24) NOT NULL DEFAULT 'samply',
      source_id_or_url TEXT NOT NULL,
      flac_stream_url TEXT NOT NULL,
      samply_player_id VARCHAR(80) NULL,
      preview_root_hz DOUBLE NOT NULL DEFAULT 196.0,
      waveform_peaks_json JSON NOT NULL,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS photos (
      id VARCHAR(40) PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      photographer VARCHAR(120) NOT NULL,
      venue VARCHAR(140) NOT NULL,
      year_label VARCHAR(16) NOT NULL,
      source_type VARCHAR(24) NOT NULL DEFAULT 'embedded',
      source_id_or_url TEXT NULL,
      dimensions_label VARCHAR(80) NULL,
      image_url MEDIUMTEXT NOT NULL,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS artists (
      id VARCHAR(40) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      role VARCHAR(40) NOT NULL,
      genre VARCHAR(140) NOT NULL,
      area VARCHAR(120) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS calendar_shows (
      id VARCHAR(40) PRIMARY KEY,
      iso_date VARCHAR(20) NOT NULL,
      month_key VARCHAR(10) NOT NULL,
      day_of_month TINYINT UNSIGNED NOT NULL,
      title VARCHAR(220) NOT NULL,
      venue VARCHAR(140) NOT NULL,
      doors_info VARCHAR(120) NOT NULL,
      flyer_style VARCHAR(32) NOT NULL DEFAULT 'punk-xerox',
      flyer_headline_note TEXT NOT NULL,
      scoped_custom_css TEXT NULL,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_calendar_month (month_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS places_remembered (
      id VARCHAR(40) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      closed_sort_iso VARCHAR(20) NOT NULL,
      closed_display_label VARCHAR(60) NOT NULL,
      location VARCHAR(160) NOT NULL,
      image_url MEDIUMTEXT NOT NULL,
      memorial_story TEXT NOT NULL,
      tags_json JSON NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS auctions (
      id VARCHAR(40) PRIMARY KEY,
      title VARCHAR(220) NOT NULL,
      owner_username VARCHAR(80) NOT NULL,
      current_bid_label VARCHAR(120) NOT NULL,
      pickup_area VARCHAR(140) NOT NULL,
      source_type VARCHAR(24) NOT NULL DEFAULT 'embedded',
      source_id_or_url TEXT NULL,
      image_url MEDIUMTEXT NOT NULL,
      ig_media_id VARCHAR(64) NULL,
      ig_permalink TEXT NOT NULL,
      sold TINYINT(1) NOT NULL DEFAULT 0,
      tags_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS comments (
      id VARCHAR(40) PRIMARY KEY,
      target_item_id VARCHAR(40) NOT NULL,
      author VARCHAR(80) NOT NULL,
      text_body TEXT NOT NULL,
      votes INT NOT NULL DEFAULT 1,
      created_at_iso VARCHAR(40) NOT NULL,
      replies_json JSON NOT NULL,
      INDEX idx_comments_target (target_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS subscribers (
      id VARCHAR(40) PRIMARY KEY,
      created_at_iso VARCHAR(40) NOT NULL,
      source VARCHAR(32) NOT NULL,
      name VARCHAR(140) NOT NULL,
      email VARCHAR(190) NOT NULL,
      interests TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS scene_chat_messages (
      id VARCHAR(40) PRIMARY KEY,
      who_handle VARCHAR(60) NOT NULL,
      time_label VARCHAR(20) NOT NULL,
      msg_body VARCHAR(400) NOT NULL,
      created_at_iso VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS puck_pages (
      slug VARCHAR(120) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      is_slot TINYINT(1) NOT NULL DEFAULT 0,
      published TINYINT(1) NOT NULL DEFAULT 1,
      puck_data JSON NOT NULL,
      updated_at_iso VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS future_tasks (
      id VARCHAR(40) PRIMARY KEY,
      pass_phase VARCHAR(32) NOT NULL,
      title VARCHAR(220) NOT NULL,
      area VARCHAR(48) NOT NULL,
      priority VARCHAR(8) NOT NULL,
      status VARCHAR(24) NOT NULL,
      rationale TEXT NOT NULL,
      prerequisite TEXT NOT NULL,
      created_at_iso VARCHAR(40) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];

  for (const ddl of ddlStatements) {
    await pool.query(ddl);
  }
}

async function getStore(): Promise<ArchiveDataset> {
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
      for (const seedTask of INITIAL_SEED.futureTasks) {
        const idx = globalForArchive.__gvlDiyStore.futureTasks.findIndex(
          (t) => t.id === seedTask.id
        );
        if (idx === -1) {
          globalForArchive.__gvlDiyStore.futureTasks.push(structuredClone(seedTask));
        } else if (
          seedTask.id === 'P6-01' &&
          globalForArchive.__gvlDiyStore.futureTasks[idx].title.includes('FFmpeg')
        ) {
          globalForArchive.__gvlDiyStore.futureTasks[idx] = structuredClone(seedTask);
        }
      }
    }
  }

  const pool = getMysqlPool();
  if (pool && !globalForArchive.__gvlMysqlHydrated) {
    try {
      await ensureSchemaInitialized(pool);
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT payload_json FROM archive_kv_snapshot WHERE store_key = ? LIMIT 1',
        ['primary']
      );
      if (rows.length > 0 && rows[0].payload_json) {
        const parsed = JSON.parse(String(rows[0].payload_json)) as ArchiveDataset;
        if (!Array.isArray(parsed.sceneChat)) {
          parsed.sceneChat = structuredClone(INITIAL_SEED.sceneChat);
        }
        if (!Array.isArray(parsed.puckPages)) {
          parsed.puckPages = structuredClone(INITIAL_SEED.puckPages);
        }
        globalForArchive.__gvlDiyStore = parsed;
      } else {
        await pool.query(
          'INSERT INTO archive_kv_snapshot (store_key, payload_json) VALUES (?, ?)',
          ['primary', JSON.stringify(globalForArchive.__gvlDiyStore)]
        );
      }

      // Ensure puck_pages relational table is seeded when empty
      const [puckCountRows] = await pool.query<RowDataPacket[]>(
        'SELECT COUNT(*) AS cnt FROM puck_pages'
      );
      if (Number(puckCountRows?.[0]?.cnt || 0) === 0) {
        for (const page of globalForArchive.__gvlDiyStore.puckPages) {
          await pool.query(
            `INSERT IGNORE INTO puck_pages (slug, title, is_slot, published, puck_data, updated_at_iso)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              page.slug,
              page.title,
              page.isSlot ? 1 : 0,
              page.published ? 1 : 0,
              JSON.stringify(page.puckData),
              page.updatedAtIso,
            ]
          );
        }
      }

      globalForArchive.__gvlMysqlHydrated = true;
    } catch {
      // Fallback gracefully to in-memory seed if MySQL socket is temporarily unreachable
    }
  }

  if (!globalForArchive.__gvlDiyStore) {
    globalForArchive.__gvlDiyStore = structuredClone(INITIAL_SEED);
  }

  return globalForArchive.__gvlDiyStore;
}

async function persistMysqlSnapshot(store: ArchiveDataset): Promise<void> {
  const pool = getMysqlPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO archive_kv_snapshot (store_key, payload_json)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json)`,
      ['primary', JSON.stringify(store)]
    );
  } catch {
    // Non-fatal in preview
  }
}

export type PublicArchivePayload = Omit<ArchiveDataset, 'subscribers' | 'futureTasks'>;

export const archiveRepository = {
  getStorageDriverMode(): 'hostinger-mysql' | 'preview-memory' {
    return isMysqlConfigured() ? 'hostinger-mysql' : 'preview-memory';
  },

  async getPublicPayload(): Promise<PublicArchivePayload> {
    const store = await getStore();
    const { subscribers: _omitSub, futureTasks: _omitTasks, ...publicRest } = store;
    return structuredClone(publicRest);
  },

  async getAdminFullPayload(): Promise<
    ArchiveDataset & {
      storageDriver: 'hostinger-mysql' | 'preview-memory';
      runtimePosture: RuntimePostureSnapshot;
    }
  > {
    const store = await getStore();
    return {
      ...structuredClone(store),
      storageDriver: isMysqlConfigured() ? 'hostinger-mysql' : 'preview-memory',
      runtimePosture: getRuntimePostureSnapshot(),
    };
  },

  async updateSiteSettings(
    partial: Partial<Omit<AdminSiteSettings, 'updatedAtIso'>>
  ): Promise<AdminSiteSettings> {
    const store = await getStore();
    store.siteSettings = {
      ...store.siteSettings,
      ...partial,
      updatedAtIso: new Date().toISOString(),
    };
    await persistMysqlSnapshot(store);
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
    const store = await getStore();
    const ytId = extractYoutubeVideoId(input.youtubeIdOrUrl);
    const resolvedPoster = resolveMediaUrl(
      input.posterSourceType || 'embedded',
      input.posterSourceIdOrUrl,
      IMG_POE_MILL
    );
    const created: VideoTape = {
      id: `VID-0${store.videos.length + 1}-${Date.now().toString().slice(-3)}`,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      title: input.title.trim().slice(0, 180),
      recordedDate: input.recordedDate.trim() || new Date().toISOString().slice(0, 10),
      venue: input.venue.trim().slice(0, 120),
      filmer: input.filmer.trim().slice(0, 80) || 'Archive Crew',
      youtubeUnlistedId: ytId,
      posterUrl: resolvedPoster,
      timestamps:
        input.timestamps.length > 0
          ? input.timestamps
          : [{ sec: 0, time: '00:00', label: 'Full Set' }],
      tags: input.tags.length > 0 ? input.tags : ['greenville', 'diy'],
    };
    store.videos.unshift(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async deleteVideoTape(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.videos.findIndex((v) => v.id === id);
    if (idx === -1) return false;
    store.videos.splice(idx, 1);
    await persistMysqlSnapshot(store);
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
    const store = await getStore();
    const formatSpec = (bd: 16 | 24, sr: 44100 | 48000 | 96000) => {
      const srKhz =
        sr === 96000 ? '96 kHz' : sr === 48000 ? '48 kHz' : '44.1 kHz';
      return `${bd}-bit · ${srKhz} FLAC`;
    };

    const bitDepth: 16 | 24 = input.bitDepth === 16 ? 16 : 24;
    const sampleRateHz: 44100 | 48000 | 96000 = input.sampleRateHz || 48000;
    const specLabel = formatSpec(bitDepth, sampleRateHz);
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
            specLabel: formatSpec(takeBd, takeSr),
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

    const created: FlacRecording = {
      id: `AUD-0${store.audio.length + 1}-${Date.now().toString().slice(-3)}`,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
      title: input.title.trim().slice(0, 180),
      artist: input.artist.trim().slice(0, 120),
      venue: input.venue.trim().slice(0, 120),
      recordedDate:
        (input.recordedDate || '').trim() || new Date().toISOString().slice(0, 10),
      durationSec: Math.max(5, Number(input.durationSec) || 180),
      bitDepth,
      sampleRateHz,
      specLabel,
      sourceType: input.sourceType,
      sourceIdOrUrl: input.sourceIdOrUrl.trim(),
      flacStreamUrl: streamUrl,
      artworkUrl: IMG_THE_BARN,
      samplyPlayerId:
        input.sourceType === 'samply' ? input.sourceIdOrUrl.trim() : undefined,
      previewRootHz: Number(input.previewRootHz) || 196.0,
      loudnessLufs: resolvedLufs,
      altVersions,
      waveformPeaks:
        Array.isArray(input.waveformPeaks) && input.waveformPeaks.length >= 42
          ? input.waveformPeaks
          : buildDeterministicPeaks(input.title, 72),
      tags: input.tags.length > 0 ? input.tags : ['greenville', 'flac'],
    };
    store.audio.unshift(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async deleteFlacRecording(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.audio.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.audio.splice(idx, 1);
    await persistMysqlSnapshot(store);
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
    const store = await getStore();
    const resolvedImg = resolveMediaUrl(
      input.sourceType,
      input.sourceIdOrUrl,
      IMG_THE_BARN
    );
    const created: PhotoPlate = {
      id: `PHO-0${store.photos.length + 1}-${Date.now().toString().slice(-3)}`,
      title: input.title.trim().slice(0, 180),
      photographer: input.photographer.trim().slice(0, 100),
      venue: input.venue.trim().slice(0, 120),
      year: input.year.trim().slice(0, 12) || '2026',
      sourceType: input.sourceType,
      sourceIdOrUrl: input.sourceIdOrUrl.trim(),
      dimensionsLabel: input.dimensionsLabel,
      imageUrl: resolvedImg,
      tags: input.tags.length > 0 ? input.tags : ['35mm', 'greenville'],
    };
    store.photos.unshift(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async deletePhotoPlate(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.photos.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    store.photos.splice(idx, 1);
    await persistMysqlSnapshot(store);
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
    const store = await getStore();
    const statusTag = input.active ? 'active' : 'inactive';
    const cleanTags = Array.from(
      new Set([
        ...input.tags.filter((t) => t !== 'active' && t !== 'inactive'),
        statusTag,
      ])
    );
    const created: SceneArtist = {
      id: `ART-0${store.artists.length + 1}-${Date.now().toString().slice(-3)}`,
      name: input.name.trim().slice(0, 140),
      role: input.role,
      genre: input.genre.trim().slice(0, 120),
      area: input.area.trim().slice(0, 100) || 'Greenville, SC',
      active: input.active,
      tags: cleanTags,
    };
    store.artists.unshift(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async toggleSceneArtistActive(id: string): Promise<SceneArtist | null> {
    const store = await getStore();
    const target = store.artists.find((a) => a.id === id);
    if (!target) return null;
    target.active = !target.active;
    target.tags = [
      ...target.tags.filter((t) => t !== 'active' && t !== 'inactive'),
      target.active ? 'active' : 'inactive',
    ];
    await persistMysqlSnapshot(store);
    return structuredClone(target);
  },

  async deleteSceneArtist(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.artists.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.artists.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  // ==================== SUBSCRIBERS CSV ====================
  async appendSubscriberRow(
    input: Omit<SubscriberCsvRow, 'id' | 'createdAtIso'>
  ): Promise<SubscriberCsvRow> {
    const store = await getStore();
    const row: SubscriberCsvRow = {
      id: `SUB-${Date.now()}`,
      createdAtIso: new Date().toISOString().slice(0, 10),
      source: input.source,
      name: input.name.trim().slice(0, 120),
      email: input.email.trim().toLowerCase().slice(0, 180),
      interests: input.interests.trim().slice(0, 500),
    };
    store.subscribers.unshift(row);
    await persistMysqlSnapshot(store);
    return structuredClone(row);
  },

  async removeSubscriberRow(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.subscribers.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    store.subscribers.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  async listSubscribersAdminOnly(): Promise<SubscriberCsvRow[]> {
    const store = await getStore();
    return structuredClone(store.subscribers);
  },

  async serializeSubscribersToCsv(): Promise<string> {
    const store = await getStore();
    const rows = store.subscribers;
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
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
    const store = await getStore();
    const target = store.auctions.find(
      (a) =>
        (identifier.auctionId && a.id === identifier.auctionId) ||
        (identifier.igMediaId && a.igMediaId === identifier.igMediaId)
    );
    if (!target) return null;
    target.sold = identifier.sold;
    target.currentBidLabel = identifier.sold
      ? 'Marked SOLD (Verified)'
      : 'Open IG Bidding';
    target.tags = [
      ...target.tags.filter((t) => t !== 'live' && t !== 'sold'),
      identifier.sold ? 'sold' : 'live',
    ];
    await persistMysqlSnapshot(store);
    return structuredClone(target);
  },

  async addAuctionItem(input: {
    title: string;
    ownerUsername: string;
    openingBid: string;
    pickupArea?: string;
    sourceType?: MediaSourceType;
    sourceIdOrUrl?: string;
    igPermalink?: string;
  }): Promise<InstagramAuctionItem> {
    const store = await getStore();
    const resolvedImg = resolveMediaUrl(
      input.sourceType || 'embedded',
      input.sourceIdOrUrl,
      IMG_BORO_GLASS
    );
    const created: InstagramAuctionItem = {
      id: `AUC-0${store.auctions.length + 1}-${Date.now().toString().slice(-3)}`,
      title: input.title.trim().slice(0, 140),
      ownerUsername: input.ownerUsername.trim().replace(/^@/, '').slice(0, 60),
      currentBidLabel: `${input.openingBid.trim()} · Opening IG bid`,
      pickupArea: (input.pickupArea || 'Greenville Local Pickup').trim(),
      sourceType: input.sourceType || 'embedded',
      sourceIdOrUrl: (input.sourceIdOrUrl || '').trim(),
      imageUrl: resolvedImg,
      igPermalink: (input.igPermalink || 'https://www.instagram.com/').trim(),
      sold: false,
      tags: ['vetted', 'greenville', 'live'],
    };
    store.auctions.unshift(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async deleteAuctionItem(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.auctions.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    store.auctions.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  // ==================== CALENDAR SHOWS ====================
  async publishCalendarShow(
    event: Omit<ShowCalendarEvent, 'id'>
  ): Promise<ShowCalendarEvent> {
    const store = await getStore();
    const created: ShowCalendarEvent = {
      ...event,
      id: `CAL-0${store.calendar.length + 1}-${Date.now().toString().slice(-3)}`,
    };
    store.calendar.push(created);
    await persistMysqlSnapshot(store);
    return structuredClone(created);
  },

  async deleteCalendarShow(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.calendar.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    store.calendar.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  // ==================== COMMENTS & MODERATION ====================
  async addComment(
    targetItemId: string,
    author: string,
    text: string,
    timestampSec?: number
  ): Promise<CommentNode> {
    const store = await getStore();
    if (!store.commentsByItem[targetItemId]) {
      store.commentsByItem[targetItemId] = [];
    }
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
    store.commentsByItem[targetItemId].unshift(node);
    await persistMysqlSnapshot(store);
    return structuredClone(node);
  },

  async voteComment(
    targetItemId: string,
    commentId: string,
    delta: 1 | -1
  ): Promise<CommentNode | null> {
    const store = await getStore();
    const list = store.commentsByItem[targetItemId] || [];
    const target = list.find((c) => c.id === commentId);
    if (!target) return null;
    target.votes += delta;
    await persistMysqlSnapshot(store);
    return structuredClone(target);
  },

  async addReply(
    targetItemId: string,
    commentId: string,
    author: string,
    text: string
  ): Promise<CommentNode | null> {
    const store = await getStore();
    const list = store.commentsByItem[targetItemId] || [];
    const target = list.find((c) => c.id === commentId);
    if (!target) return null;
    target.replies.push({
      id: `RPL-${Date.now()}`,
      author: author.trim().replace(/^@/, '').slice(0, 50) || 'anon',
      text: text.trim().slice(0, 400),
      createdAtIso: new Date().toISOString(),
    });
    await persistMysqlSnapshot(store);
    return structuredClone(target);
  },

  async deleteComment(targetItemId: string, commentId: string): Promise<boolean> {
    const store = await getStore();
    const list = store.commentsByItem[targetItemId];
    if (!list) return false;
    const idx = list.findIndex((c) => c.id === commentId);
    if (idx === -1) return false;
    list.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  // ==================== SCENE ROOM CHAT & 8S POLLING ====================
  async getLivePollSnapshot(): Promise<{
    sceneChat: SceneChatMessage[];
    auctions: InstagramAuctionItem[];
  }> {
    const store = await getStore();
    return {
      sceneChat: structuredClone(store.sceneChat),
      auctions: structuredClone(store.auctions),
    };
  },

  async appendSceneChatMessage(
    who: string,
    msg: string
  ): Promise<SceneChatMessage[]> {
    const store = await getStore();
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
    store.sceneChat = [...store.sceneChat.slice(-39), entry];
    await persistMysqlSnapshot(store);
    return structuredClone(store.sceneChat);
  },

  // ==================== PASS 5 NEXT-ROUND LEDGER ====================
  async addFutureTask(
    input: Omit<FutureTaskLedgerItem, 'id' | 'createdAtIso'>
  ): Promise<FutureTaskLedgerItem> {
    const store = await getStore();
    const item: FutureTaskLedgerItem = {
      ...input,
      id: `P5-0${store.futureTasks.length + 1}-${Date.now().toString().slice(-2)}`,
      createdAtIso: new Date().toISOString(),
    };
    store.futureTasks.unshift(item);
    await persistMysqlSnapshot(store);
    return structuredClone(item);
  },

  async updateFutureTaskStatus(
    id: string,
    status: TaskStatus
  ): Promise<FutureTaskLedgerItem | null> {
    const store = await getStore();
    const item = store.futureTasks.find((t) => t.id === id);
    if (!item) return null;
    item.status = status;
    await persistMysqlSnapshot(store);
    return structuredClone(item);
  },

  async deleteFutureTask(id: string): Promise<boolean> {
    const store = await getStore();
    const idx = store.futureTasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    store.futureTasks.splice(idx, 1);
    await persistMysqlSnapshot(store);
    return true;
  },

  // ==================== PUCK VISUAL STUDIO PAGES & SLOTS ====================
  async listPuckPages(): Promise<PuckPageRecord[]> {
    const store = await getStore();
    return structuredClone(store.puckPages);
  },

  async getPuckPageBySlug(slug: string): Promise<PuckPageRecord | null> {
    const store = await getStore();
    const clean = slug.trim();
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
    const store = await getStore();
    const cleanSlug = slug.trim();
    const nowIso = new Date().toISOString();
    let target = store.puckPages.find((p) => p.slug === cleanSlug);

    const safePuckData: PuckSerializedData = {
      root: input.puckData?.root || { props: { title: input.title || cleanSlug } },
      content: Array.isArray(input.puckData?.content) ? input.puckData.content : [],
      ...(input.puckData?.zones ? { zones: input.puckData.zones } : {}),
    };

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

    await persistMysqlSnapshot(store);
    const pool = getMysqlPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO puck_pages (slug, title, is_slot, published, puck_data, updated_at_iso)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             published = VALUES(published),
             puck_data = VALUES(puck_data),
             updated_at_iso = VALUES(updated_at_iso)`,
          [
            target.slug,
            target.title,
            target.isSlot ? 1 : 0,
            target.published ? 1 : 0,
            JSON.stringify(target.puckData),
            target.updatedAtIso,
          ]
        );
      } catch {
        // Snapshot already persisted
      }
    }

    return structuredClone(target);
  },

  async createCustomPuckPage(input: {
    slug: string;
    title: string;
  }): Promise<PuckPageRecord> {
    const store = await getStore();
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

    const existing = store.puckPages.find((p) => p.slug === cleanSlug);
    if (existing) {
      return structuredClone(existing);
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

    store.puckPages.push(created);
    await persistMysqlSnapshot(store);
    const pool = getMysqlPool();
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO puck_pages (slug, title, is_slot, published, puck_data, updated_at_iso)
           VALUES (?, ?, 0, 1, ?, ?)`,
          [created.slug, created.title, JSON.stringify(created.puckData), created.updatedAtIso]
        );
      } catch {
        // Non-fatal
      }
    }

    return structuredClone(created);
  },

  async deleteCustomPuckPage(slug: string): Promise<boolean> {
    const store = await getStore();
    const cleanSlug = slug.trim();
    const idx = store.puckPages.findIndex((p) => p.slug === cleanSlug);
    if (idx === -1) return false;

    // Built-in inline slots are cleared rather than deleted so slot keys remain stable
    if (store.puckPages[idx].isSlot) {
      store.puckPages[idx].puckData = {
        root: { props: { title: store.puckPages[idx].title } },
        content: [],
      };
      store.puckPages[idx].updatedAtIso = new Date().toISOString();
      await persistMysqlSnapshot(store);
      return true;
    }

    store.puckPages.splice(idx, 1);
    await persistMysqlSnapshot(store);
    const pool = getMysqlPool();
    if (pool) {
      try {
        await pool.query('DELETE FROM puck_pages WHERE slug = ? AND is_slot = 0', [
          cleanSlug,
        ]);
      } catch {
        // Non-fatal
      }
    }
    return true;
  },
};

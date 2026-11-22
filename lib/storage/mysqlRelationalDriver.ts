// lib/storage/mysqlRelationalDriver.ts
import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import {
  AdminSiteSettings,
  ArchiveDataset,
  AuditLogEntry,
  CommentNode,
  CommentReply,
  ContrastMode,
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
  SceneArtist,
  SceneChatMessage,
  SeasonTheme,
  ShowCalendarEvent,
  SubscriberCsvRow,
  TaskPriority,
  TaskStatus,
  TimelineEra,
  VideoTape,
  VideoTimestamp,
} from '@/types/archive';
import {
  isHostingerMysqlConfigured,
  resolveMysqlHost,
  resolveMysqlPort,
} from '@/lib/config/runtimeEnv';

const SCENE_CHAT_MAX_STORED_ROWS = 200;
const SCENE_CHAT_DISPLAY_LIMIT = 40;

const globalForMysql = globalThis as unknown as {
  __gvlMysqlPool?: Pool;
  __gvlMysqlReadyPromise?: Promise<Pool>;
};

export function createOrGetMysqlPool(): Pool | null {
  if (!isHostingerMysqlConfigured()) return null;
  if (!globalForMysql.__gvlMysqlPool) {
    globalForMysql.__gvlMysqlPool = mysql.createPool({
      host: resolveMysqlHost(),
      port: resolveMysqlPort(),
      user: process.env.DB_USER!.trim(),
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME!.trim(),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      multipleStatements: false,
      namedPlaceholders: false,
    });
  }
  return globalForMysql.__gvlMysqlPool;
}

const DDL_TABLES: string[] = [
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
    artwork_url MEDIUMTEXT NULL,
    samply_player_id VARCHAR(80) NULL,
    preview_root_hz DOUBLE NOT NULL DEFAULT 196.0,
    loudness_lufs DOUBLE NULL,
    alt_versions_json JSON NULL,
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
  `CREATE TABLE IF NOT EXISTS timeline_eras (
    id VARCHAR(40) PRIMARY KEY,
    sort_order INT UNSIGNED NOT NULL DEFAULT 0,
    era_range VARCHAR(60) NOT NULL,
    dial_short_label VARCHAR(24) NOT NULL,
    title VARCHAR(220) NOT NULL,
    summary TEXT NOT NULL,
    porthole_image_url MEDIUMTEXT NOT NULL,
    INDEX idx_timeline_sort (sort_order)
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auctions_ig_media (ig_media_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(40) PRIMARY KEY,
    target_item_id VARCHAR(40) NOT NULL,
    author VARCHAR(80) NOT NULL,
    text_body TEXT NOT NULL,
    timestamp_sec INT UNSIGNED NULL,
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
    created_at_iso VARCHAR(40) NOT NULL,
    INDEX idx_scene_chat_created (created_at_iso)
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
  `CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id_hash CHAR(64) PRIMARY KEY,
    created_at_iso VARCHAR(40) NOT NULL,
    expires_at_ms BIGINT UNSIGNED NOT NULL,
    revoked_at_iso VARCHAR(40) NULL,
    ip_hash CHAR(64) NULL,
    INDEX idx_admin_sessions_exp (expires_at_ms)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS auth_rate_limits (
    bucket_key VARCHAR(128) PRIMARY KEY,
    fail_count INT UNSIGNED NOT NULL DEFAULT 0,
    window_start_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    strike_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at_iso VARCHAR(40) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    created_at_iso VARCHAR(40) NULL,
    curator_username VARCHAR(80) NOT NULL DEFAULT 'curator',
    action_name VARCHAR(96) NOT NULL,
    target_id VARCHAR(128) NULL,
    ip_hash CHAR(64) NULL,
    details_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

// Static allowlisted column migrations checked via INFORMATION_SCHEMA.COLUMNS
const SAFE_COLUMN_MIGRATIONS: ReadonlyArray<{
  table: string;
  column: string;
  alterSql: string;
}> = [
  {
    table: 'flac_tracks',
    column: 'artwork_url',
    alterSql: 'ALTER TABLE flac_tracks ADD COLUMN artwork_url MEDIUMTEXT NULL',
  },
  {
    table: 'flac_tracks',
    column: 'loudness_lufs',
    alterSql: 'ALTER TABLE flac_tracks ADD COLUMN loudness_lufs DOUBLE NULL',
  },
  {
    table: 'flac_tracks',
    column: 'alt_versions_json',
    alterSql: 'ALTER TABLE flac_tracks ADD COLUMN alt_versions_json JSON NULL',
  },
  {
    table: 'comments',
    column: 'timestamp_sec',
    alterSql: 'ALTER TABLE comments ADD COLUMN timestamp_sec INT UNSIGNED NULL',
  },
  {
    table: 'timeline_eras',
    column: 'sort_order',
    alterSql:
      'ALTER TABLE timeline_eras ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0',
  },
  {
    table: 'calendar_shows',
    column: 'scoped_custom_css',
    alterSql: 'ALTER TABLE calendar_shows ADD COLUMN scoped_custom_css TEXT NULL',
  },
  {
    table: 'auctions',
    column: 'ig_media_id',
    alterSql: 'ALTER TABLE auctions ADD COLUMN ig_media_id VARCHAR(64) NULL',
  },
  {
    table: 'audit_logs',
    column: 'created_at_iso',
    alterSql: 'ALTER TABLE audit_logs ADD COLUMN created_at_iso VARCHAR(40) NULL',
  },
  {
    table: 'audit_logs',
    column: 'ip_hash',
    alterSql: 'ALTER TABLE audit_logs ADD COLUMN ip_hash CHAR(64) NULL',
  },
  {
    table: 'audit_logs',
    column: 'details_json',
    alterSql: 'ALTER TABLE audit_logs ADD COLUMN details_json JSON NULL',
  },
];

async function ensureSchemaInitialized(pool: Pool): Promise<void> {
  for (const ddl of DDL_TABLES) {
    await pool.query(ddl);
  }

  for (const migration of SAFE_COLUMN_MIGRATIONS) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = ?`,
      [migration.table, migration.column]
    );
    if (Number(rows?.[0]?.cnt || 0) === 0) {
      await pool.query(migration.alterSql);
    }
  }
}

async function hydrateRelationalTablesOnce(
  pool: Pool,
  initialSeed: ArchiveDataset
): Promise<void> {
  const [[siteCountRows], [videoCountRows]] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM site_config'),
    pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM videos'),
  ]);

  const isFreshRelationalBoot =
    Number(siteCountRows?.[0]?.cnt || 0) === 0 &&
    Number(videoCountRows?.[0]?.cnt || 0) === 0;

  if (isFreshRelationalBoot) {
    let sourceData: ArchiveDataset = structuredClone(initialSeed);

    // Check read-only legacy archive_kv_snapshot if populated (leave table untouched)
    const [snapRows] = await pool.query<RowDataPacket[]>(
      'SELECT payload_json FROM archive_kv_snapshot WHERE store_key = ? LIMIT 1',
      ['primary']
    );
    if (snapRows.length > 0 && snapRows[0].payload_json) {
      try {
        const parsed = JSON.parse(String(snapRows[0].payload_json)) as Partial<ArchiveDataset>;
        sourceData = {
          siteSettings: parsed.siteSettings || structuredClone(initialSeed.siteSettings),
          videos: Array.isArray(parsed.videos) ? parsed.videos : structuredClone(initialSeed.videos),
          audio: Array.isArray(parsed.audio) ? parsed.audio : structuredClone(initialSeed.audio),
          photos: Array.isArray(parsed.photos) ? parsed.photos : structuredClone(initialSeed.photos),
          artists: Array.isArray(parsed.artists) ? parsed.artists : structuredClone(initialSeed.artists),
          calendar: Array.isArray(parsed.calendar) ? parsed.calendar : structuredClone(initialSeed.calendar),
          timeline: Array.isArray(parsed.timeline) ? parsed.timeline : structuredClone(initialSeed.timeline),
          remembered: Array.isArray(parsed.remembered)
            ? parsed.remembered
            : structuredClone(initialSeed.remembered),
          auctions: Array.isArray(parsed.auctions) ? parsed.auctions : structuredClone(initialSeed.auctions),
          commentsByItem:
            parsed.commentsByItem && typeof parsed.commentsByItem === 'object'
              ? parsed.commentsByItem
              : structuredClone(initialSeed.commentsByItem),
          sceneChat: Array.isArray(parsed.sceneChat)
            ? parsed.sceneChat
            : structuredClone(initialSeed.sceneChat),
          puckPages: Array.isArray(parsed.puckPages)
            ? parsed.puckPages
            : structuredClone(initialSeed.puckPages),
          subscribers: Array.isArray(parsed.subscribers)
            ? parsed.subscribers
            : structuredClone(initialSeed.subscribers),
          futureTasks: Array.isArray(parsed.futureTasks)
            ? parsed.futureTasks
            : structuredClone(initialSeed.futureTasks),
        };
      } catch {
        sourceData = structuredClone(initialSeed);
      }
    }

    await upsertSiteSettingsSql(pool, sourceData.siteSettings);

    for (const v of sourceData.videos) {
      await insertVideoSql(pool, v, true);
    }
    for (const a of sourceData.audio) {
      await insertFlacSql(pool, a, true);
    }
    for (const p of sourceData.photos) {
      await insertPhotoSql(pool, p, true);
    }
    for (const art of sourceData.artists) {
      await insertArtistSql(pool, art, true);
    }
    for (const ev of sourceData.calendar) {
      await insertCalendarShowSql(pool, ev, true);
    }
    for (let idx = 0; idx < sourceData.timeline.length; idx++) {
      const era = sourceData.timeline[idx];
      await insertTimelineEraSql(
        pool,
        { ...era, sortOrder: typeof era.sortOrder === 'number' ? era.sortOrder : idx },
        true
      );
    }
    for (const pl of sourceData.remembered) {
      await insertPlaceSql(pool, pl, true);
    }
    for (const auc of sourceData.auctions) {
      await insertAuctionSql(pool, auc, true);
    }
    for (const list of Object.values(sourceData.commentsByItem)) {
      for (const c of list) {
        await insertCommentSql(pool, c, true);
      }
    }
    for (const sub of sourceData.subscribers) {
      await insertSubscriberSql(pool, sub, true);
    }
    for (const chat of sourceData.sceneChat.slice(-SCENE_CHAT_MAX_STORED_ROWS)) {
      await pool.query(
        `INSERT IGNORE INTO scene_chat_messages (id, who_handle, time_label, msg_body, created_at_iso)
         VALUES (?, ?, ?, ?, ?)`,
        [chat.id, chat.who, chat.time, chat.msg, chat.createdAtIso]
      );
    }
    for (const page of sourceData.puckPages) {
      await upsertPuckPageSql(pool, page);
    }
    for (const task of sourceData.futureTasks) {
      await insertFutureTaskSql(pool, task, true);
    }
  } else {
    // Ensure puck_pages and future_tasks are seeded on partially populated instances
    const [[puckCount], [taskCount]] = await Promise.all([
      pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM puck_pages'),
      pool.query<RowDataPacket[]>('SELECT COUNT(*) AS cnt FROM future_tasks'),
    ]);
    if (Number(puckCount?.[0]?.cnt || 0) === 0) {
      for (const page of initialSeed.puckPages) {
        await upsertPuckPageSql(pool, page);
      }
    }
    if (Number(taskCount?.[0]?.cnt || 0) === 0) {
      for (const task of initialSeed.futureTasks) {
        await insertFutureTaskSql(pool, task, true);
      }
    }
  }

  // Sync completed roadmap ledger items IT-01 through IT-05 in future_tasks
  for (const seedTask of initialSeed.futureTasks) {
    if (
      seedTask.id === 'IT-01' ||
      seedTask.id === 'IT-02' ||
      seedTask.id === 'IT-03' ||
      seedTask.id === 'IT-04' ||
      seedTask.id === 'IT-05'
    ) {
      await pool.query(
        `INSERT INTO future_tasks
           (id, pass_phase, title, area, priority, status, rationale, prerequisite, created_at_iso)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           pass_phase = VALUES(pass_phase),
           title = VALUES(title),
           area = VALUES(area),
           priority = VALUES(priority),
           status = VALUES(status),
           rationale = VALUES(rationale),
           prerequisite = VALUES(prerequisite)`,
        [
          seedTask.id,
          seedTask.passPhase,
          seedTask.title,
          seedTask.area,
          seedTask.priority,
          seedTask.status,
          seedTask.rationale,
          seedTask.prerequisite,
          seedTask.createdAtIso,
        ]
      );
    }
  }
}

export async function getReadyMysqlPool(
  initialSeed?: ArchiveDataset
): Promise<Pool | null> {
  const pool = createOrGetMysqlPool();
  if (!pool) return null;

  if (!globalForMysql.__gvlMysqlReadyPromise) {
    globalForMysql.__gvlMysqlReadyPromise = (async () => {
      await ensureSchemaInitialized(pool);
      if (initialSeed) {
        await hydrateRelationalTablesOnce(pool, initialSeed);
      }
      return pool;
    })().catch((err) => {
      globalForMysql.__gvlMysqlReadyPromise = undefined;
      throw err;
    });
  }

  return globalForMysql.__gvlMysqlReadyPromise;
}

// ==================== SAFE JSON & ROW MAPPERS ====================
function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    if (!raw.trim()) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

function mapSiteConfigRow(
  row: RowDataPacket | undefined,
  fallback: AdminSiteSettings
): AdminSiteSettings {
  if (!row) return structuredClone(fallback);
  const season = String(row.season_theme || fallback.seasonTheme) as SeasonTheme;
  const contrast = String(
    row.default_contrast || fallback.defaultContrast
  ) as ContrastMode;
  return {
    seasonTheme: ['fall', 'spring', 'summer', 'winter'].includes(season)
      ? season
      : fallback.seasonTheme,
    defaultContrast: ['light', 'dark'].includes(contrast)
      ? contrast
      : fallback.defaultContrast,
    archiveSubmissionEmail: String(
      row.archive_submission_email || fallback.archiveSubmissionEmail
    ),
    calendarSubmissionEmail: String(
      row.calendar_submission_email || fallback.calendarSubmissionEmail
    ),
    auctionSubmissionEmail: String(
      row.auction_submission_email || fallback.auctionSubmissionEmail
    ),
    updatedAtIso: String(row.updated_at_iso || fallback.updatedAtIso),
  };
}

function mapVideoRow(r: RowDataPacket): VideoTape {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    recordedDate: String(r.recorded_date),
    venue: String(r.venue),
    filmer: String(r.filmer),
    youtubeUnlistedId: String(r.youtube_unlisted_id),
    posterUrl: String(r.poster_url || ''),
    timestamps: parseJsonColumn<VideoTimestamp[]>(r.timestamps_json, []),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapFlacRow(r: RowDataPacket): FlacRecording {
  const bitDepth: 16 | 24 = Number(r.bit_depth) === 16 ? 16 : 24;
  const srNum = Number(r.sample_rate_hz);
  const sampleRateHz: 44100 | 48000 | 96000 =
    srNum === 96000 ? 96000 : srNum === 44100 ? 44100 : 48000;
  const altVersions = parseJsonColumn<FlacVersionSource[] | null>(
    r.alt_versions_json,
    null
  );
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    artist: String(r.artist),
    venue: String(r.venue),
    recordedDate: String(r.recorded_date),
    durationSec: Number(r.duration_sec || 180),
    bitDepth,
    sampleRateHz,
    specLabel: String(r.spec_label),
    sourceType: String(r.source_type || 'samply') as MediaSourceType,
    sourceIdOrUrl: String(r.source_id_or_url || ''),
    flacStreamUrl: String(r.flac_stream_url || ''),
    artworkUrl: r.artwork_url ? String(r.artwork_url) : undefined,
    samplyPlayerId: r.samply_player_id ? String(r.samply_player_id) : undefined,
    previewRootHz: Number(r.preview_root_hz || 196.0),
    loudnessLufs:
      r.loudness_lufs !== null && r.loudness_lufs !== undefined
        ? Number(r.loudness_lufs)
        : undefined,
    altVersions:
      Array.isArray(altVersions) && altVersions.length > 0
        ? altVersions
        : undefined,
    waveformPeaks: parseJsonColumn<number[]>(r.waveform_peaks_json, []),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapPhotoRow(r: RowDataPacket): PhotoPlate {
  return {
    id: String(r.id),
    title: String(r.title),
    photographer: String(r.photographer),
    venue: String(r.venue),
    year: String(r.year_label),
    sourceType: String(r.source_type || 'embedded') as MediaSourceType,
    sourceIdOrUrl: r.source_id_or_url ? String(r.source_id_or_url) : undefined,
    dimensionsLabel: r.dimensions_label ? String(r.dimensions_label) : undefined,
    imageUrl: String(r.image_url || ''),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapArtistRow(r: RowDataPacket): SceneArtist {
  return {
    id: String(r.id),
    name: String(r.name),
    role: String(r.role || 'Band') as SceneArtist['role'],
    genre: String(r.genre),
    area: String(r.area),
    active: Boolean(Number(r.active)),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapCalendarRow(r: RowDataPacket): ShowCalendarEvent {
  return {
    id: String(r.id),
    isoDate: String(r.iso_date),
    monthKey: String(r.month_key),
    dayOfMonth: Number(r.day_of_month),
    title: String(r.title),
    venue: String(r.venue),
    doorsInfo: String(r.doors_info),
    flyerStyle: String(r.flyer_style || 'punk-xerox') as FlyerPresetStyle,
    flyerHeadlineNote: String(r.flyer_headline_note || ''),
    scopedCustomCss: r.scoped_custom_css ? String(r.scoped_custom_css) : undefined,
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapTimelineRow(r: RowDataPacket): TimelineEra {
  return {
    id: String(r.id),
    sortOrder: Number(r.sort_order ?? 0),
    eraRange: String(r.era_range),
    dialShortLabel: String(r.dial_short_label),
    title: String(r.title),
    summary: String(r.summary || ''),
    portholeImageUrl: String(r.porthole_image_url || ''),
  };
}

function mapPlaceRow(r: RowDataPacket): RememberedPlace {
  return {
    id: String(r.id),
    name: String(r.name),
    closedSortIso: String(r.closed_sort_iso),
    closedDisplayLabel: String(r.closed_display_label),
    location: String(r.location),
    imageUrl: String(r.image_url || ''),
    memorialStory: String(r.memorial_story || ''),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapAuctionRow(r: RowDataPacket): InstagramAuctionItem {
  return {
    id: String(r.id),
    title: String(r.title),
    ownerUsername: String(r.owner_username),
    currentBidLabel: String(r.current_bid_label),
    pickupArea: String(r.pickup_area),
    sourceType: String(r.source_type || 'embedded') as MediaSourceType,
    sourceIdOrUrl: r.source_id_or_url ? String(r.source_id_or_url) : undefined,
    imageUrl: String(r.image_url || ''),
    igMediaId: r.ig_media_id ? String(r.ig_media_id) : undefined,
    igPermalink: String(r.ig_permalink || 'https://www.instagram.com/'),
    sold: Boolean(Number(r.sold)),
    tags: parseJsonColumn<string[]>(r.tags_json, []),
  };
}

function mapCommentRow(r: RowDataPacket): CommentNode {
  return {
    id: String(r.id),
    targetItemId: String(r.target_item_id),
    author: String(r.author),
    text: String(r.text_body),
    timestampSec:
      r.timestamp_sec !== null && r.timestamp_sec !== undefined
        ? Number(r.timestamp_sec)
        : undefined,
    votes: Number(r.votes ?? 1),
    createdAtIso: String(r.created_at_iso),
    replies: parseJsonColumn<CommentReply[]>(r.replies_json, []),
  };
}

function mapSubscriberRow(r: RowDataPacket): SubscriberCsvRow {
  return {
    id: String(r.id),
    createdAtIso: String(r.created_at_iso),
    source:
      r.source === 'Live Chat' ? 'Live Chat' : ('Message Us' as SubscriberCsvRow['source']),
    name: String(r.name),
    email: String(r.email),
    interests: String(r.interests || ''),
  };
}

function mapChatRow(r: RowDataPacket): SceneChatMessage {
  return {
    id: String(r.id),
    who: String(r.who_handle),
    time: String(r.time_label),
    msg: String(r.msg_body),
    createdAtIso: String(r.created_at_iso),
  };
}

function mapPuckRow(r: RowDataPacket): PuckPageRecord {
  return {
    slug: String(r.slug),
    title: String(r.title),
    isSlot: Boolean(Number(r.is_slot)),
    published: Boolean(Number(r.published)),
    puckData: parseJsonColumn<PuckSerializedData>(r.puck_data, {
      root: { props: { title: String(r.title || '') } },
      content: [],
    }),
    updatedAtIso: String(r.updated_at_iso),
  };
}

function mapFutureTaskRow(r: RowDataPacket): FutureTaskLedgerItem {
  return {
    id: String(r.id),
    passPhase: String(r.pass_phase || 'Pass 7') as FutureTaskLedgerItem['passPhase'],
    title: String(r.title),
    area: String(r.area || 'Hostinger MySQL') as FutureTaskLedgerItem['area'],
    priority: (['P0', 'P1', 'P2'].includes(String(r.priority))
      ? String(r.priority)
      : 'P1') as TaskPriority,
    status: (['Planned', 'In Progress', 'Deferred', 'Completed'].includes(
      String(r.status)
    )
      ? String(r.status)
      : 'Planned') as TaskStatus,
    rationale: String(r.rationale || ''),
    prerequisite: String(r.prerequisite || ''),
    createdAtIso: String(r.created_at_iso),
  };
}

// ==================== DIRECT LIVE RELATIONAL READS ====================
export async function fetchPublicPayloadSql(
  pool: Pool,
  defaultSettings: AdminSiteSettings
): Promise<Omit<ArchiveDataset, 'subscribers' | 'futureTasks'>> {
  const [
    [siteRows],
    [videoRows],
    [flacRows],
    [photoRows],
    [artistRows],
    [calendarRows],
    [timelineRows],
    [placeRows],
    [auctionRows],
    [commentRows],
    [chatRows],
    [puckRows],
  ] = await Promise.all([
    pool.query<RowDataPacket[]>('SELECT * FROM site_config WHERE id = 1 LIMIT 1'),
    pool.query<RowDataPacket[]>('SELECT * FROM videos ORDER BY created_at DESC, id ASC'),
    pool.query<RowDataPacket[]>('SELECT * FROM flac_tracks ORDER BY created_at DESC, id ASC'),
    pool.query<RowDataPacket[]>('SELECT * FROM photos ORDER BY created_at DESC, id ASC'),
    pool.query<RowDataPacket[]>('SELECT * FROM artists ORDER BY created_at DESC, id ASC'),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM calendar_shows ORDER BY iso_date ASC, id ASC'
    ),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM timeline_eras ORDER BY sort_order ASC, id ASC'
    ),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM places_remembered ORDER BY closed_sort_iso DESC, id ASC'
    ),
    pool.query<RowDataPacket[]>('SELECT * FROM auctions ORDER BY created_at DESC, id ASC'),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM comments ORDER BY created_at_iso DESC, id DESC'
    ),
    pool.query<RowDataPacket[]>(
      `SELECT * FROM scene_chat_messages
       ORDER BY created_at_iso DESC, id DESC
       LIMIT ?`,
      [SCENE_CHAT_DISPLAY_LIMIT]
    ),
    pool.query<RowDataPacket[]>('SELECT * FROM puck_pages ORDER BY is_slot DESC, slug ASC'),
  ]);

  const commentsByItem: Record<string, CommentNode[]> = {};
  for (const row of commentRows) {
    const mapped = mapCommentRow(row);
    if (!commentsByItem[mapped.targetItemId]) {
      commentsByItem[mapped.targetItemId] = [];
    }
    commentsByItem[mapped.targetItemId].push(mapped);
  }

  return {
    siteSettings: mapSiteConfigRow(siteRows[0], defaultSettings),
    videos: videoRows.map(mapVideoRow),
    audio: flacRows.map(mapFlacRow),
    photos: photoRows.map(mapPhotoRow),
    artists: artistRows.map(mapArtistRow),
    calendar: calendarRows.map(mapCalendarRow),
    timeline: timelineRows.map(mapTimelineRow),
    remembered: placeRows.map(mapPlaceRow),
    auctions: auctionRows.map(mapAuctionRow),
    commentsByItem,
    sceneChat: chatRows.map(mapChatRow).reverse(),
    puckPages: puckRows.map(mapPuckRow),
  };
}

export async function fetchAdminDatasetSql(
  pool: Pool,
  defaultSettings: AdminSiteSettings
): Promise<ArchiveDataset> {
  const [publicData, [subRows], [taskRows]] = await Promise.all([
    fetchPublicPayloadSql(pool, defaultSettings),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM subscribers ORDER BY created_at_iso DESC, id DESC'
    ),
    pool.query<RowDataPacket[]>(
      'SELECT * FROM future_tasks ORDER BY id ASC'
    ),
  ]);

  return {
    ...publicData,
    subscribers: subRows.map(mapSubscriberRow),
    futureTasks: taskRows.map(mapFutureTaskRow),
  };
}

export async function fetchLivePollSnapshotSql(pool: Pool): Promise<{
  sceneChat: SceneChatMessage[];
  auctions: InstagramAuctionItem[];
}> {
  const [[chatRows], [auctionRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(
      `SELECT * FROM scene_chat_messages
       ORDER BY created_at_iso DESC, id DESC
       LIMIT ?`,
      [SCENE_CHAT_DISPLAY_LIMIT]
    ),
    pool.query<RowDataPacket[]>('SELECT * FROM auctions ORDER BY created_at DESC, id ASC'),
  ]);

  return {
    sceneChat: chatRows.map(mapChatRow).reverse(),
    auctions: auctionRows.map(mapAuctionRow),
  };
}

export async function isPublishedDriveFileIdSql(
  pool: Pool,
  cleanFileId: string
): Promise<boolean> {
  if (!/^[a-zA-Z0-9_-]{10,80}$/.test(cleanFileId)) {
    return false;
  }
  const escapedId = cleanFileId.replace(/[\\%_]/g, '\\$&');
  const likeId = `%${escapedId}%`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS hit FROM videos WHERE poster_url LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM flac_tracks
       WHERE source_id_or_url = ?
          OR flac_stream_url LIKE ? ESCAPE '\\\\'
          OR artwork_url LIKE ? ESCAPE '\\\\'
          OR CAST(alt_versions_json AS CHAR) LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM photos WHERE source_id_or_url = ? OR image_url LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM auctions WHERE source_id_or_url = ? OR image_url LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM timeline_eras WHERE porthole_image_url LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM places_remembered WHERE image_url LIKE ? ESCAPE '\\\\'
     UNION ALL
     SELECT 1 AS hit FROM puck_pages WHERE published = 1 AND CAST(puck_data AS CHAR) LIKE ? ESCAPE '\\\\'
     LIMIT 1`,
    [
      likeId,
      cleanFileId,
      likeId,
      likeId,
      likeId,
      cleanFileId,
      likeId,
      cleanFileId,
      likeId,
      likeId,
      likeId,
      likeId,
    ]
  );
  return rows.length > 0;
}

// ==================== ATOMIC ROW-LEVEL MUTATIONS ====================
export async function getSiteSettingsSql(
  pool: Pool,
  fallback: AdminSiteSettings
): Promise<AdminSiteSettings> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM site_config WHERE id = 1 LIMIT 1'
  );
  return mapSiteConfigRow(rows[0], fallback);
}

export async function upsertSiteSettingsSql(
  pool: Pool,
  settings: AdminSiteSettings
): Promise<AdminSiteSettings> {
  await pool.query(
    `INSERT INTO site_config
       (id, season_theme, default_contrast, archive_submission_email, calendar_submission_email, auction_submission_email, updated_at_iso)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       season_theme = VALUES(season_theme),
       default_contrast = VALUES(default_contrast),
       archive_submission_email = VALUES(archive_submission_email),
       calendar_submission_email = VALUES(calendar_submission_email),
       auction_submission_email = VALUES(auction_submission_email),
       updated_at_iso = VALUES(updated_at_iso)`,
    [
      settings.seasonTheme,
      settings.defaultContrast,
      settings.archiveSubmissionEmail,
      settings.calendarSubmissionEmail,
      settings.auctionSubmissionEmail,
      settings.updatedAtIso,
    ]
  );
  return structuredClone(settings);
}

const ALLOWED_COUNT_TABLES = new Set([
  'videos',
  'flac_tracks',
  'photos',
  'artists',
  'calendar_shows',
  'timeline_eras',
  'places_remembered',
  'auctions',
  'future_tasks',
]);

// Videos
export async function countTableRowsSql(
  pool: Pool,
  table:
    | 'videos'
    | 'flac_tracks'
    | 'photos'
    | 'artists'
    | 'calendar_shows'
    | 'timeline_eras'
    | 'places_remembered'
    | 'auctions'
    | 'future_tasks'
): Promise<number> {
  if (!ALLOWED_COUNT_TABLES.has(table)) {
    throw new Error('Invalid count table');
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM ${table}`
  );
  return Number(rows?.[0]?.cnt || 0);
}

export async function getVideoByIdSql(
  pool: Pool,
  id: string
): Promise<VideoTape | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM videos WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapVideoRow(rows[0]) : null;
}

export async function insertVideoSql(
  pool: Pool,
  v: VideoTape,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO videos
       (id, slug, title, recorded_date, venue, filmer, youtube_unlisted_id, poster_url, timestamps_json, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      v.id,
      v.slug,
      v.title,
      v.recordedDate,
      v.venue,
      v.filmer,
      v.youtubeUnlistedId,
      v.posterUrl,
      JSON.stringify(v.timestamps),
      JSON.stringify(v.tags),
    ]
  );
}

export async function updateVideoSql(pool: Pool, v: VideoTape): Promise<void> {
  await pool.query(
    `UPDATE videos
     SET slug = ?, title = ?, recorded_date = ?, venue = ?, filmer = ?,
         youtube_unlisted_id = ?, poster_url = ?, timestamps_json = ?, tags_json = ?
     WHERE id = ?`,
    [
      v.slug,
      v.title,
      v.recordedDate,
      v.venue,
      v.filmer,
      v.youtubeUnlistedId,
      v.posterUrl,
      JSON.stringify(v.timestamps),
      JSON.stringify(v.tags),
      v.id,
    ]
  );
}

export async function deleteVideoSql(pool: Pool, id: string): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM videos WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// FLAC Tracks
export async function getFlacByIdSql(
  pool: Pool,
  id: string
): Promise<FlacRecording | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM flac_tracks WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapFlacRow(rows[0]) : null;
}

export async function insertFlacSql(
  pool: Pool,
  t: FlacRecording,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO flac_tracks
       (id, slug, title, artist, venue, recorded_date, duration_sec, bit_depth, sample_rate_hz,
        spec_label, source_type, source_id_or_url, flac_stream_url, artwork_url, samply_player_id,
        preview_root_hz, loudness_lufs, alt_versions_json, waveform_peaks_json, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      t.id,
      t.slug,
      t.title,
      t.artist,
      t.venue,
      t.recordedDate,
      t.durationSec,
      t.bitDepth,
      t.sampleRateHz,
      t.specLabel,
      t.sourceType,
      t.sourceIdOrUrl,
      t.flacStreamUrl,
      t.artworkUrl ?? null,
      t.samplyPlayerId ?? null,
      t.previewRootHz,
      typeof t.loudnessLufs === 'number' ? t.loudnessLufs : null,
      t.altVersions && t.altVersions.length > 0
        ? JSON.stringify(t.altVersions)
        : null,
      JSON.stringify(t.waveformPeaks),
      JSON.stringify(t.tags),
    ]
  );
}

export async function updateFlacSql(pool: Pool, t: FlacRecording): Promise<void> {
  await pool.query(
    `UPDATE flac_tracks
     SET slug = ?, title = ?, artist = ?, venue = ?, recorded_date = ?,
         duration_sec = ?, bit_depth = ?, sample_rate_hz = ?, spec_label = ?,
         source_type = ?, source_id_or_url = ?, flac_stream_url = ?, artwork_url = ?,
         samply_player_id = ?, preview_root_hz = ?, loudness_lufs = ?,
         alt_versions_json = ?, waveform_peaks_json = ?, tags_json = ?
     WHERE id = ?`,
    [
      t.slug,
      t.title,
      t.artist,
      t.venue,
      t.recordedDate,
      t.durationSec,
      t.bitDepth,
      t.sampleRateHz,
      t.specLabel,
      t.sourceType,
      t.sourceIdOrUrl,
      t.flacStreamUrl,
      t.artworkUrl ?? null,
      t.samplyPlayerId ?? null,
      t.previewRootHz,
      typeof t.loudnessLufs === 'number' ? t.loudnessLufs : null,
      t.altVersions && t.altVersions.length > 0
        ? JSON.stringify(t.altVersions)
        : null,
      JSON.stringify(t.waveformPeaks),
      JSON.stringify(t.tags),
      t.id,
    ]
  );
}

export async function deleteFlacSql(pool: Pool, id: string): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM flac_tracks WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Photos
export async function getPhotoByIdSql(
  pool: Pool,
  id: string
): Promise<PhotoPlate | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM photos WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapPhotoRow(rows[0]) : null;
}

export async function insertPhotoSql(
  pool: Pool,
  p: PhotoPlate,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO photos
       (id, title, photographer, venue, year_label, source_type, source_id_or_url, dimensions_label, image_url, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id,
      p.title,
      p.photographer,
      p.venue,
      p.year,
      p.sourceType || 'embedded',
      p.sourceIdOrUrl ?? null,
      p.dimensionsLabel ?? null,
      p.imageUrl,
      JSON.stringify(p.tags),
    ]
  );
}

export async function updatePhotoSql(pool: Pool, p: PhotoPlate): Promise<void> {
  await pool.query(
    `UPDATE photos
     SET title = ?, photographer = ?, venue = ?, year_label = ?,
         source_type = ?, source_id_or_url = ?, dimensions_label = ?,
         image_url = ?, tags_json = ?
     WHERE id = ?`,
    [
      p.title,
      p.photographer,
      p.venue,
      p.year,
      p.sourceType || 'embedded',
      p.sourceIdOrUrl ?? null,
      p.dimensionsLabel ?? null,
      p.imageUrl,
      JSON.stringify(p.tags),
      p.id,
    ]
  );
}

export async function deletePhotoSql(pool: Pool, id: string): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM photos WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Artists
export async function getArtistByIdSql(
  pool: Pool,
  id: string
): Promise<SceneArtist | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM artists WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapArtistRow(rows[0]) : null;
}

export async function insertArtistSql(
  pool: Pool,
  a: SceneArtist,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO artists (id, name, role, genre, area, active, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.id, a.name, a.role, a.genre, a.area, a.active ? 1 : 0, JSON.stringify(a.tags)]
  );
}

export async function updateArtistSql(pool: Pool, a: SceneArtist): Promise<void> {
  await pool.query(
    `UPDATE artists
     SET name = ?, role = ?, genre = ?, area = ?, active = ?, tags_json = ?
     WHERE id = ?`,
    [a.name, a.role, a.genre, a.area, a.active ? 1 : 0, JSON.stringify(a.tags), a.id]
  );
}

export async function deleteArtistSql(pool: Pool, id: string): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM artists WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Timeline Eras
export async function listTimelineErasSql(pool: Pool): Promise<TimelineEra[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM timeline_eras ORDER BY sort_order ASC, id ASC'
  );
  return rows.map(mapTimelineRow);
}

export async function getTimelineEraByIdSql(
  pool: Pool,
  id: string
): Promise<TimelineEra | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM timeline_eras WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapTimelineRow(rows[0]) : null;
}

export async function insertTimelineEraSql(
  pool: Pool,
  e: TimelineEra,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO timeline_eras
       (id, sort_order, era_range, dial_short_label, title, summary, porthole_image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      e.id,
      e.sortOrder ?? 0,
      e.eraRange,
      e.dialShortLabel,
      e.title,
      e.summary,
      e.portholeImageUrl,
    ]
  );
}

export async function updateTimelineEraSql(
  pool: Pool,
  e: TimelineEra
): Promise<void> {
  await pool.query(
    `UPDATE timeline_eras
     SET sort_order = ?, era_range = ?, dial_short_label = ?, title = ?, summary = ?, porthole_image_url = ?
     WHERE id = ?`,
    [
      e.sortOrder ?? 0,
      e.eraRange,
      e.dialShortLabel,
      e.title,
      e.summary,
      e.portholeImageUrl,
      e.id,
    ]
  );
}

export async function reorderTimelineErasSql(
  pool: Pool,
  orderedIds: string[]
): Promise<TimelineEra[]> {
  const current = await listTimelineErasSql(pool);
  const byId = new Map(current.map((e) => [e.id, e]));
  const nextOrdered: TimelineEra[] = [];

  for (const rawId of orderedIds) {
    const clean = String(rawId || '').trim();
    const found = byId.get(clean);
    if (found) {
      nextOrdered.push(found);
      byId.delete(clean);
    }
  }
  for (const rem of byId.values()) {
    nextOrdered.push(rem);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let idx = 0; idx < nextOrdered.length; idx++) {
      nextOrdered[idx].sortOrder = idx;
      await conn.query('UPDATE timeline_eras SET sort_order = ? WHERE id = ?', [
        idx,
        nextOrdered[idx].id,
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return nextOrdered;
}

export async function deleteTimelineEraSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM timeline_eras WHERE id = ?', [id]);
  const deleted = Boolean((res as { affectedRows?: number })?.affectedRows);
  if (deleted) {
    const remaining = await listTimelineErasSql(pool);
    await reorderTimelineErasSql(
      pool,
      remaining.map((e) => e.id)
    );
  }
  return deleted;
}

// Remembered Places
export async function getPlaceByIdSql(
  pool: Pool,
  id: string
): Promise<RememberedPlace | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM places_remembered WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapPlaceRow(rows[0]) : null;
}

export async function insertPlaceSql(
  pool: Pool,
  p: RememberedPlace,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO places_remembered
       (id, name, closed_sort_iso, closed_display_label, location, image_url, memorial_story, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.id,
      p.name,
      p.closedSortIso,
      p.closedDisplayLabel,
      p.location,
      p.imageUrl,
      p.memorialStory,
      JSON.stringify(p.tags),
    ]
  );
}

export async function updatePlaceSql(
  pool: Pool,
  p: RememberedPlace
): Promise<void> {
  await pool.query(
    `UPDATE places_remembered
     SET name = ?, closed_sort_iso = ?, closed_display_label = ?, location = ?,
         image_url = ?, memorial_story = ?, tags_json = ?
     WHERE id = ?`,
    [
      p.name,
      p.closedSortIso,
      p.closedDisplayLabel,
      p.location,
      p.imageUrl,
      p.memorialStory,
      JSON.stringify(p.tags),
      p.id,
    ]
  );
}

export async function deletePlaceSql(pool: Pool, id: string): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM places_remembered WHERE id = ?', [
    id,
  ]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Subscribers
export async function listSubscribersSql(
  pool: Pool
): Promise<SubscriberCsvRow[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM subscribers ORDER BY created_at_iso DESC, id DESC'
  );
  return rows.map(mapSubscriberRow);
}

export async function getSubscriberByIdSql(
  pool: Pool,
  id: string
): Promise<SubscriberCsvRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM subscribers WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapSubscriberRow(rows[0]) : null;
}

export async function insertSubscriberSql(
  pool: Pool,
  r: SubscriberCsvRow,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO subscribers (id, created_at_iso, source, name, email, interests)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [r.id, r.createdAtIso, r.source, r.name, r.email, r.interests]
  );
}

export async function updateSubscriberSql(
  pool: Pool,
  r: SubscriberCsvRow
): Promise<void> {
  await pool.query(
    `UPDATE subscribers
     SET created_at_iso = ?, source = ?, name = ?, email = ?, interests = ?
     WHERE id = ?`,
    [r.createdAtIso, r.source, r.name, r.email, r.interests, r.id]
  );
}

export async function deleteSubscriberSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM subscribers WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Auctions
export async function getAuctionByIdSql(
  pool: Pool,
  id: string
): Promise<InstagramAuctionItem | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM auctions WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapAuctionRow(rows[0]) : null;
}

export async function findAuctionByMediaOrIdSql(
  pool: Pool,
  identifier: { auctionId?: string; igMediaId?: string }
): Promise<InstagramAuctionItem | null> {
  if (identifier.auctionId) {
    const byId = await getAuctionByIdSql(pool, identifier.auctionId);
    if (byId) return byId;
  }
  if (identifier.igMediaId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM auctions WHERE ig_media_id = ? LIMIT 1',
      [identifier.igMediaId]
    );
    if (rows.length > 0) return mapAuctionRow(rows[0]);
  }
  return null;
}

export async function insertAuctionSql(
  pool: Pool,
  a: InstagramAuctionItem,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO auctions
       (id, title, owner_username, current_bid_label, pickup_area, source_type,
        source_id_or_url, image_url, ig_media_id, ig_permalink, sold, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      a.title,
      a.ownerUsername,
      a.currentBidLabel,
      a.pickupArea,
      a.sourceType || 'embedded',
      a.sourceIdOrUrl ?? null,
      a.imageUrl,
      a.igMediaId ?? null,
      a.igPermalink,
      a.sold ? 1 : 0,
      JSON.stringify(a.tags),
    ]
  );
}

export async function updateAuctionSql(
  pool: Pool,
  a: InstagramAuctionItem
): Promise<void> {
  await pool.query(
    `UPDATE auctions
     SET title = ?, owner_username = ?, current_bid_label = ?, pickup_area = ?,
         source_type = ?, source_id_or_url = ?, image_url = ?, ig_media_id = ?,
         ig_permalink = ?, sold = ?, tags_json = ?
     WHERE id = ?`,
    [
      a.title,
      a.ownerUsername,
      a.currentBidLabel,
      a.pickupArea,
      a.sourceType || 'embedded',
      a.sourceIdOrUrl ?? null,
      a.imageUrl,
      a.igMediaId ?? null,
      a.igPermalink,
      a.sold ? 1 : 0,
      JSON.stringify(a.tags),
      a.id,
    ]
  );
}

export async function deleteAuctionSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM auctions WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Calendar Shows
export async function getCalendarShowByIdSql(
  pool: Pool,
  id: string
): Promise<ShowCalendarEvent | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM calendar_shows WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapCalendarRow(rows[0]) : null;
}

export async function insertCalendarShowSql(
  pool: Pool,
  ev: ShowCalendarEvent,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO calendar_shows
       (id, iso_date, month_key, day_of_month, title, venue, doors_info, flyer_style, flyer_headline_note, scoped_custom_css, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ev.id,
      ev.isoDate,
      ev.monthKey,
      ev.dayOfMonth,
      ev.title,
      ev.venue,
      ev.doorsInfo,
      ev.flyerStyle,
      ev.flyerHeadlineNote,
      ev.scopedCustomCss ?? null,
      JSON.stringify(ev.tags),
    ]
  );
}

export async function updateCalendarShowSql(
  pool: Pool,
  ev: ShowCalendarEvent
): Promise<void> {
  await pool.query(
    `UPDATE calendar_shows
     SET iso_date = ?, month_key = ?, day_of_month = ?, title = ?, venue = ?,
         doors_info = ?, flyer_style = ?, flyer_headline_note = ?,
         scoped_custom_css = ?, tags_json = ?
     WHERE id = ?`,
    [
      ev.isoDate,
      ev.monthKey,
      ev.dayOfMonth,
      ev.title,
      ev.venue,
      ev.doorsInfo,
      ev.flyerStyle,
      ev.flyerHeadlineNote,
      ev.scopedCustomCss ?? null,
      JSON.stringify(ev.tags),
      ev.id,
    ]
  );
}

export async function deleteCalendarShowSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM calendar_shows WHERE id = ?', [
    id,
  ]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Comments (with atomic SQL vote increment & transactional reply append)
export async function insertCommentSql(
  pool: Pool,
  c: CommentNode,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO comments
       (id, target_item_id, author, text_body, timestamp_sec, votes, created_at_iso, replies_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      c.targetItemId,
      c.author,
      c.text,
      typeof c.timestampSec === 'number' ? c.timestampSec : null,
      c.votes,
      c.createdAtIso,
      JSON.stringify(c.replies),
    ]
  );
}

export async function voteCommentAtomicSql(
  pool: Pool,
  targetItemId: string,
  commentId: string,
  delta: 1 | -1
): Promise<CommentNode | null> {
  const [res] = await pool.query(
    'UPDATE comments SET votes = votes + ? WHERE id = ? AND target_item_id = ?',
    [delta, commentId, targetItemId]
  );
  if (!Boolean((res as { affectedRows?: number })?.affectedRows)) {
    return null;
  }
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM comments WHERE id = ? AND target_item_id = ? LIMIT 1',
    [commentId, targetItemId]
  );
  return rows.length > 0 ? mapCommentRow(rows[0]) : null;
}

export async function appendCommentReplySql(
  pool: Pool,
  targetItemId: string,
  commentId: string,
  reply: CommentReply
): Promise<CommentNode | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM comments WHERE id = ? AND target_item_id = ? FOR UPDATE',
      [commentId, targetItemId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }
    const existing = mapCommentRow(rows[0]);
    existing.replies.push(reply);
    await conn.query(
      'UPDATE comments SET replies_json = ? WHERE id = ? AND target_item_id = ?',
      [JSON.stringify(existing.replies), commentId, targetItemId]
    );
    await conn.commit();
    return existing;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteCommentSql(
  pool: Pool,
  targetItemId: string,
  commentId: string
): Promise<boolean> {
  const [res] = await pool.query(
    'DELETE FROM comments WHERE id = ? AND target_item_id = ?',
    [commentId, targetItemId]
  );
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Scene Chat Messages (append-only + bounded to latest 200 rows)
export async function appendSceneChatSql(
  pool: Pool,
  entry: SceneChatMessage
): Promise<SceneChatMessage[]> {
  await pool.query(
    `INSERT INTO scene_chat_messages (id, who_handle, time_label, msg_body, created_at_iso)
     VALUES (?, ?, ?, ?, ?)`,
    [entry.id, entry.who, entry.time, entry.msg, entry.createdAtIso]
  );

  // Cap stored scene_chat_messages at 200 newest rows
  await pool.query(
    `DELETE FROM scene_chat_messages
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM scene_chat_messages
         ORDER BY created_at_iso DESC, id DESC
         LIMIT ?
       ) AS keep_recent
     )`,
    [SCENE_CHAT_MAX_STORED_ROWS]
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM scene_chat_messages
     ORDER BY created_at_iso DESC, id DESC
     LIMIT ?`,
    [SCENE_CHAT_DISPLAY_LIMIT]
  );
  return rows.map(mapChatRow).reverse();
}

export async function deleteSceneChatSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query(
    'DELETE FROM scene_chat_messages WHERE id = ?',
    [id]
  );
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Future Tasks Ledger
export async function getFutureTaskByIdSql(
  pool: Pool,
  id: string
): Promise<FutureTaskLedgerItem | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM future_tasks WHERE id = ? LIMIT 1',
    [id]
  );
  return rows.length > 0 ? mapFutureTaskRow(rows[0]) : null;
}

export async function insertFutureTaskSql(
  pool: Pool,
  item: FutureTaskLedgerItem,
  ignoreDuplicate = false
): Promise<void> {
  const verb = ignoreDuplicate ? 'INSERT IGNORE' : 'INSERT';
  await pool.query(
    `${verb} INTO future_tasks
       (id, pass_phase, title, area, priority, status, rationale, prerequisite, created_at_iso)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.passPhase,
      item.title,
      item.area,
      item.priority,
      item.status,
      item.rationale,
      item.prerequisite,
      item.createdAtIso,
    ]
  );
}

export async function updateFutureTaskStatusSql(
  pool: Pool,
  id: string,
  status: TaskStatus
): Promise<FutureTaskLedgerItem | null> {
  const [res] = await pool.query(
    'UPDATE future_tasks SET status = ? WHERE id = ?',
    [status, id]
  );
  if (!Boolean((res as { affectedRows?: number })?.affectedRows)) {
    return null;
  }
  return getFutureTaskByIdSql(pool, id);
}

export async function deleteFutureTaskSql(
  pool: Pool,
  id: string
): Promise<boolean> {
  const [res] = await pool.query('DELETE FROM future_tasks WHERE id = ?', [id]);
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Puck Pages
export async function listPuckPagesSql(pool: Pool): Promise<PuckPageRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM puck_pages ORDER BY is_slot DESC, slug ASC'
  );
  return rows.map(mapPuckRow);
}

export async function getPuckPageBySlugSql(
  pool: Pool,
  slug: string
): Promise<PuckPageRecord | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM puck_pages WHERE slug = ? LIMIT 1',
    [slug]
  );
  return rows.length > 0 ? mapPuckRow(rows[0]) : null;
}

export async function upsertPuckPageSql(
  pool: Pool,
  page: PuckPageRecord
): Promise<void> {
  await pool.query(
    `INSERT INTO puck_pages (slug, title, is_slot, published, puck_data, updated_at_iso)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       is_slot = VALUES(is_slot),
       published = VALUES(published),
       puck_data = VALUES(puck_data),
       updated_at_iso = VALUES(updated_at_iso)`,
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

export async function deleteOrClearPuckPageSql(
  pool: Pool,
  slug: string
): Promise<boolean> {
  const existing = await getPuckPageBySlugSql(pool, slug);
  if (!existing) return false;

  if (existing.isSlot) {
    await upsertPuckPageSql(pool, {
      ...existing,
      puckData: {
        root: { props: { title: existing.title } },
        content: [],
      },
      updatedAtIso: new Date().toISOString(),
    });
    return true;
  }

  const [res] = await pool.query(
    'DELETE FROM puck_pages WHERE slug = ? AND is_slot = 0',
    [slug]
  );
  return Boolean((res as { affectedRows?: number })?.affectedRows);
}

// Audit Logs (full indefinite retention)
export async function insertAuditLogSql(
  pool: Pool,
  input: {
    createdAtIso: string;
    curatorUsername: string;
    actionName: string;
    targetId: string | null;
    ipHash?: string | null;
    details?: Record<string, unknown> | null;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs
       (created_at_iso, curator_username, action_name, target_id, ip_hash, details_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.createdAtIso,
      input.curatorUsername,
      input.actionName,
      input.targetId,
      input.ipHash ?? null,
      input.details ? JSON.stringify(input.details) : null,
    ]
  );
}

export async function listAuditLogsSql(
  pool: Pool,
  limit: number
): Promise<AuditLogEntry[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, created_at_iso, curator_username, action_name, target_id, created_at
     FROM audit_logs
     ORDER BY id DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map((r) => ({
    id: String(r.id),
    curatorUsername: String(r.curator_username || 'curator'),
    actionName: String(r.action_name || ''),
    targetId: r.target_id ? String(r.target_id) : null,
    createdAtIso: r.created_at_iso
      ? String(r.created_at_iso)
      : r.created_at instanceof Date
      ? r.created_at.toISOString()
      : String(r.created_at || new Date().toISOString()),
  }));
}

-- ============================================================================
-- GREENVILLE DIY ARCHIVE & BARTER MARKET — HOSTINGER MYSQL SCHEMA (Pass 7)
-- Target Engine: MySQL 8.0+ / MariaDB 10.6+ (Auto-bootstrapped & migrated)
-- Connection: DB_HOST=127.0.0.1 (IPv4 TCP), DB_PORT=3306, connectionLimit=5,
--             multipleStatements=false, namedPlaceholders=false
-- ============================================================================

-- Read-only legacy snapshot safety backup (hydrated once on boot if relational tables are empty)
CREATE TABLE IF NOT EXISTS archive_kv_snapshot (
  store_key VARCHAR(32) PRIMARY KEY,
  payload_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS site_config (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  season_theme VARCHAR(16) NOT NULL DEFAULT 'fall',
  default_contrast VARCHAR(16) NOT NULL DEFAULT 'light',
  archive_submission_email VARCHAR(180) NOT NULL DEFAULT 'submissions@greenvillediyarchive.org',
  calendar_submission_email VARCHAR(180) NOT NULL DEFAULT 'calendar@greenvillediyarchive.org',
  auction_submission_email VARCHAR(180) NOT NULL DEFAULT 'auctions@thebartermarket.org',
  updated_at_iso VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS videos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flac_tracks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS photos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS artists (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  role VARCHAR(40) NOT NULL,
  genre VARCHAR(140) NOT NULL,
  area VARCHAR(120) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  tags_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calendar_shows (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS timeline_eras (
  id VARCHAR(40) PRIMARY KEY,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  era_range VARCHAR(60) NOT NULL,
  dial_short_label VARCHAR(24) NOT NULL,
  title VARCHAR(220) NOT NULL,
  summary TEXT NOT NULL,
  porthole_image_url MEDIUMTEXT NOT NULL,
  INDEX idx_timeline_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS places_remembered (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  closed_sort_iso VARCHAR(20) NOT NULL,
  closed_display_label VARCHAR(60) NOT NULL,
  location VARCHAR(160) NOT NULL,
  image_url MEDIUMTEXT NOT NULL,
  memorial_story TEXT NOT NULL,
  tags_json JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auctions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(40) PRIMARY KEY,
  target_item_id VARCHAR(40) NOT NULL,
  author VARCHAR(80) NOT NULL,
  text_body TEXT NOT NULL,
  timestamp_sec INT UNSIGNED NULL,
  votes INT NOT NULL DEFAULT 1,
  created_at_iso VARCHAR(40) NOT NULL,
  replies_json JSON NOT NULL,
  INDEX idx_comments_target (target_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscribers (
  id VARCHAR(40) PRIMARY KEY,
  created_at_iso VARCHAR(40) NOT NULL,
  source VARCHAR(32) NOT NULL,
  name VARCHAR(140) NOT NULL,
  email VARCHAR(190) NOT NULL,
  interests TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scene_chat_messages (
  id VARCHAR(40) PRIMARY KEY,
  who_handle VARCHAR(60) NOT NULL,
  time_label VARCHAR(20) NOT NULL,
  msg_body VARCHAR(400) NOT NULL,
  created_at_iso VARCHAR(40) NOT NULL,
  INDEX idx_scene_chat_created (created_at_iso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS puck_pages (
  slug VARCHAR(120) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  is_slot TINYINT(1) NOT NULL DEFAULT 0,
  published TINYINT(1) NOT NULL DEFAULT 1,
  puck_data JSON NOT NULL,
  updated_at_iso VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS future_tasks (
  id VARCHAR(40) PRIMARY KEY,
  pass_phase VARCHAR(32) NOT NULL,
  title VARCHAR(220) NOT NULL,
  area VARCHAR(48) NOT NULL,
  priority VARCHAR(8) NOT NULL,
  status VARCHAR(24) NOT NULL,
  rationale TEXT NOT NULL,
  prerequisite TEXT NOT NULL,
  created_at_iso VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Security, Brute-Force Lockout & Session Revocation Tables (Pass 5 + Pass 7)
CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id_hash CHAR(64) PRIMARY KEY,
  created_at_iso VARCHAR(40) NOT NULL,
  expires_at_ms BIGINT UNSIGNED NOT NULL,
  revoked_at_iso VARCHAR(40) NULL,
  ip_hash CHAR(64) NULL,
  INDEX idx_admin_sessions_exp (expires_at_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key VARCHAR(128) PRIMARY KEY,
  fail_count INT UNSIGNED NOT NULL DEFAULT 0,
  window_start_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  strike_level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at_iso VARCHAR(40) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curators (
  id VARCHAR(40) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  role VARCHAR(32) NOT NULL DEFAULT 'curator',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_at_iso VARCHAR(40) NULL,
  curator_username VARCHAR(80) NOT NULL DEFAULT 'curator',
  action_name VARCHAR(96) NOT NULL,
  target_id VARCHAR(128) NULL,
  ip_hash CHAR(64) NULL,
  details_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_action (action_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pass 10: RFC 6238 TOTP MFA Persistence & Relational Comment Vote Deduplication
CREATE TABLE IF NOT EXISTS admin_mfa_config (
  id TINYINT PRIMARY KEY DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  encrypted_secret TEXT NULL,
  pending_encrypted_secret TEXT NULL,
  last_accepted_step BIGINT NULL,
  recovery_hashes_json TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id VARCHAR(64) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  created_at_iso VARCHAR(40) NOT NULL,
  PRIMARY KEY (comment_id, ip_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

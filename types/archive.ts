// types/archive.ts

export type SeasonTheme = 'fall' | 'spring' | 'summer' | 'winter';
export type ContrastMode = 'light' | 'dark';

export type PublicArchiveSection =
  | 'videos'
  | 'audio'
  | 'photos'
  | 'artists'
  | 'calendar'
  | 'timeline'
  | 'remembered'
  | 'auction';

export type ArchiveSection = PublicArchiveSection;

export type MediaSourceType = 'samply' | 'gdrive' | 'r2' | 'youtube' | 'embedded';

export type FlyerPresetStyle =
  | 'punk-xerox'
  | 'concrete-stencil'
  | 'riso-zine'
  | 'custom-css';

export interface VideoTimestamp {
  sec: number;
  time: string;
  label: string;
}

export interface VideoTape {
  id: string;
  slug: string;
  title: string;
  recordedDate: string;
  venue: string;
  filmer: string;
  youtubeUnlistedId: string;
  posterUrl: string;
  timestamps: VideoTimestamp[];
  tags: string[];
}

export interface FlacVersionSource {
  id: string;
  label: string;
  specLabel?: string;
  streamUrl: string;
  variantKind: 'primary' | 'alt';
}

export interface FlacRecording {
  id: string;
  slug: string;
  title: string;
  artist: string;
  venue: string;
  recordedDate: string;
  durationSec: number;
  bitDepth: 16 | 24;
  sampleRateHz: 44100 | 48000 | 96000;
  specLabel: string;
  sourceType: MediaSourceType;
  sourceIdOrUrl: string;
  flacStreamUrl: string;
  artworkUrl?: string;
  samplyPlayerId?: string;
  previewRootHz: number;
  loudnessLufs?: number;
  altVersions?: FlacVersionSource[];
  waveformPeaks: number[];
  tags: string[];
}

export interface PhotoPlate {
  id: string;
  title: string;
  photographer: string;
  venue: string;
  year: string;
  sourceType?: MediaSourceType;
  sourceIdOrUrl?: string;
  dimensionsLabel?: string;
  imageUrl: string;
  tags: string[];
}

export interface SceneArtist {
  id: string;
  name: string;
  role: 'Band' | 'Musician' | 'Photographer' | 'Videographer' | 'Collective';
  genre: string;
  area: string;
  active: boolean;
  tags: string[];
}

export interface ShowCalendarEvent {
  id: string;
  isoDate: string;
  monthKey: string;
  dayOfMonth: number;
  title: string;
  venue: string;
  doorsInfo: string;
  flyerStyle: FlyerPresetStyle;
  flyerHeadlineNote: string;
  scopedCustomCss?: string;
  tags: string[];
}

export interface TimelineEra {
  id: string;
  eraRange: string;
  dialShortLabel: string;
  title: string;
  summary: string;
  portholeImageUrl: string;
  sortOrder?: number;
}

export interface RememberedPlace {
  id: string;
  name: string;
  closedSortIso: string;
  closedDisplayLabel: string;
  location: string;
  imageUrl: string;
  memorialStory: string;
  tags: string[];
}

export interface InstagramAuctionItem {
  id: string;
  title: string;
  ownerUsername: string;
  currentBidLabel: string;
  pickupArea: string;
  sourceType?: MediaSourceType;
  sourceIdOrUrl?: string;
  imageUrl: string;
  igMediaId?: string;
  igPermalink: string;
  sold: boolean;
  tags: string[];
}

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAtIso: string;
}

export interface CommentNode {
  id: string;
  targetItemId: string;
  author: string;
  text: string;
  timestampSec?: number;
  votes: number;
  createdAtIso: string;
  replies: CommentReply[];
}

export interface SubscriberCsvRow {
  id: string;
  createdAtIso: string;
  source: 'Message Us' | 'Live Chat';
  name: string;
  email: string;
  interests: string;
}

export interface AdminSiteSettings {
  seasonTheme: SeasonTheme;
  defaultContrast: ContrastMode;
  archiveSubmissionEmail: string;
  calendarSubmissionEmail: string;
  auctionSubmissionEmail: string;
  updatedAtIso: string;
}

export interface SceneChatMessage {
  id: string;
  who: string;
  time: string;
  msg: string;
  createdAtIso: string;
}

export interface PuckSerializedData {
  root?: {
    props?: Record<string, unknown>;
  };
  content: Array<{
    type: string;
    props: Record<string, unknown>;
  }>;
  zones?: Record<
    string,
    Array<{
      type: string;
      props: Record<string, unknown>;
    }>
  >;
}

export interface PuckPageRecord {
  slug: string;
  title: string;
  isSlot: boolean;
  published: boolean;
  puckData: PuckSerializedData;
  updatedAtIso: string;
}

export type TaskPriority = 'P0' | 'P1' | 'P2';
export type TaskStatus = 'Planned' | 'In Progress' | 'Deferred' | 'Completed';

export interface AuditLogEntry {
  id: string;
  curatorUsername: string;
  actionName: string;
  targetId: string | null;
  createdAtIso: string;
}

export interface FutureTaskLedgerItem {
  id: string;
  passPhase:
    | 'Pass 5'
    | 'Pass 6'
    | 'Pass 7'
    | 'Pass 8'
    | 'Hostinger'
    | 'Storage / CDN';
  title: string;
  area:
    | 'Auth & Security'
    | 'Puck Visual Studio'
    | 'UI & Media'
    | 'Hostinger MySQL'
    | 'Google Drive / R2'
    | 'IG Webhooks';
  priority: TaskPriority;
  status: TaskStatus;
  rationale: string;
  prerequisite: string;
  createdAtIso: string;
}

export interface RuntimePostureSnapshot {
  mode: 'preview-demo' | 'hostinger-production';
  activePort: string;
  storageDriver: 'preview-memory' | 'hostinger-mysql';
  mysqlHostDisplay: string;
  demoUnlockEnabled: boolean;
  adminPasskeyConfigured: boolean;
  adminPasswordHashConfigured?: boolean;
  productionAuthReady?: boolean;
  sessionSecretConfigured: boolean;
  driveProxyConfigured: boolean;
  r2PublicDomain: string;
  igWebhookConfigured: boolean;
}

export interface ArchiveDataset {
  siteSettings: AdminSiteSettings;
  videos: VideoTape[];
  audio: FlacRecording[];
  photos: PhotoPlate[];
  artists: SceneArtist[];
  calendar: ShowCalendarEvent[];
  timeline: TimelineEra[];
  remembered: RememberedPlace[];
  auctions: InstagramAuctionItem[];
  commentsByItem: Record<string, CommentNode[]>;
  sceneChat: SceneChatMessage[];
  puckPages: PuckPageRecord[];
  subscribers: SubscriberCsvRow[];
  futureTasks: FutureTaskLedgerItem[];
}

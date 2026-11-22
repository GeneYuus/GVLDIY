// components/admin/panels/VideosFlacPanel.tsx
'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from 'lucide-react';
import {
  FlacRecording,
  FlacVersionSource,
  MediaSourceType,
  VideoTape,
  VideoTimestamp,
} from '@/types/archive';
import {
  extractGoogleDriveFileId,
  extractWaveformPeaksFromAudioFile,
} from '@/lib/media/resolveMediaUrl';

interface AltTakeDraft {
  label: string;
  sourceType: MediaSourceType;
  sourceIdOrUrl: string;
  bitDepth: 16 | 24;
  sampleRateHz: 44100 | 48000 | 96000;
}

interface FlacEditDraft {
  title: string;
  artist: string;
  venue: string;
  recordedDate: string;
  sourceType: MediaSourceType;
  sourceIdOrUrl: string;
  artworkUrl: string;
  bitDepth: 16 | 24;
  sampleRateHz: 44100 | 48000 | 96000;
  durationSec: number;
  loudnessLufs: number;
  previewRootHz: number;
  altVersions: FlacVersionSource[];
  waveformPeaks?: number[];
  tagsText: string;
}

interface VideoEditDraft {
  title: string;
  venue: string;
  filmer: string;
  recordedDate: string;
  youtubeIdOrUrl: string;
  posterUrl: string;
  timestamps: VideoTimestamp[];
  tagsText: string;
}

interface VideosFlacPanelProps {
  mode: 'flac' | 'videos';
  videos: VideoTape[];
  setVideos: React.Dispatch<React.SetStateAction<VideoTape[]>>;
  audioTracks: FlacRecording[];
  setAudioTracks: React.Dispatch<React.SetStateAction<FlacRecording[]>>;
  postAdminAction: (payload: Record<string, unknown>) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown) => void;
  showToast: (msg: string) => void;
}

export default function VideosFlacPanel({
  mode, videos, setVideos, audioTracks, setAudioTracks, postAdminAction, syncAuditLogs, showToast,
}: VideosFlacPanelProps) {
  const [flacTitle, setFlacTitle] = useState('');
  const [flacArtist, setFlacArtist] = useState('');
  const [flacVenue, setFlacVenue] = useState('The Barn');
  const [flacDate, setFlacDate] = useState('2026-11-20');
  const [flacSourceType, setFlacSourceType] = useState<MediaSourceType>('gdrive');
  const [flacSourceIdOrUrl, setFlacSourceIdOrUrl] = useState('');
  const [flacArtworkUrl, setFlacArtworkUrl] = useState('');
  const [flacBitDepth, setFlacBitDepth] = useState<16 | 24>(24);
  const [flacSampleRate, setFlacSampleRate] = useState<44100 | 48000 | 96000>(48000);
  const [flacDurationSec, setFlacDurationSec] = useState(195);
  const [flacRootHz, setFlacRootHz] = useState(196);
  const [flacLufs, setFlacLufs] = useState<number>(-14.0);
  const [flacPrimaryLabel, setFlacPrimaryLabel] = useState('Primary Mix');
  const [flacAltTakes, setFlacAltTakes] = useState<AltTakeDraft[]>([]);
  const [flacPeaks, setFlacPeaks] = useState<number[] | null>(null);
  const [flacAnalyzing, setFlacAnalyzing] = useState(false);
  const [flacTagsText, setFlacTagsText] = useState('the-barn greenville flac');
  const [editingFlacId, setEditingFlacId] = useState<string | null>(null);
  const [editFlac, setEditFlac] = useState<FlacEditDraft | null>(null);

  const [vidTitle, setVidTitle] = useState('');
  const [vidVenue, setVidVenue] = useState('The Barn');
  const [vidFilmer, setVidFilmer] = useState('');
  const [vidDate, setVidDate] = useState('2026-11-20');
  const [vidYtInput, setVidYtInput] = useState('');
  const [vidPosterType, setVidPosterType] = useState<MediaSourceType>('embedded');
  const [vidPosterUrl, setVidPosterUrl] = useState('');
  const [vidTimestampsText, setVidTimestampsText] = useState('00:00 Soundcheck & Load-In\n03:45 Opening Song');
  const [vidTagsText, setVidTagsText] = useState('the-barn punk-rock greenville');
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editVideo, setEditVideo] = useState<VideoEditDraft | null>(null);

  const analyzeAudioToState = async (file: File, forEdit: boolean) => {
    setFlacAnalyzing(true);
    try {
      const res = await extractWaveformPeaksFromAudioFile(file, 72);
      if (forEdit) {
        setEditFlac((p) => (p ? { ...p, waveformPeaks: res.peaks, durationSec: res.durationSec, sampleRateHz: res.sampleRateHz, loudnessLufs: res.loudnessLufs } : p));
      } else {
        setFlacPeaks(res.peaks);
        setFlacDurationSec(res.durationSec);
        setFlacSampleRate(res.sampleRateHz);
        setFlacLufs(res.loudnessLufs);
        if (!flacTitle) setFlacTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast(`Decoded 72 bars (${res.durationSec}s · ${res.sampleRateHz} Hz · ${res.loudnessLufs} LUFS)`);
    } catch {
      showToast('Browser could not decode audio file');
    } finally {
      setFlacAnalyzing(false);
    }
  };

  const handleAddFlac = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flacTitle.trim() || !flacArtist.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-flac', title: flacTitle, artist: flacArtist, venue: flacVenue, recordedDate: flacDate,
        durationSec: flacDurationSec, bitDepth: flacBitDepth, sampleRateHz: flacSampleRate, sourceType: flacSourceType,
        sourceIdOrUrl: flacSourceIdOrUrl || 'smp-preview', artworkUrl: flacArtworkUrl || undefined,
        primaryTakeLabel: flacPrimaryLabel, altTakes: flacAltTakes.filter((t) => t.label.trim()),
        loudnessLufs: flacLufs, previewRootHz: flacRootHz, waveformPeaks: flacPeaks || undefined, tagsText: flacTagsText,
      });
      if (data.ok && data.track) {
        setAudioTracks((prev) => [data.track as FlacRecording, ...prev]);
        syncAuditLogs(data.auditLogs);
        setFlacTitle(''); setFlacArtist(''); setFlacSourceIdOrUrl(''); setFlacArtworkUrl(''); setFlacAltTakes([]); setFlacPeaks(null);
        showToast('Published lossless FLAC track');
      } else showToast(String(data.error || 'Failed to add FLAC track'));
    } catch {
      showToast('Failed to add FLAC track');
    }
  };

  const startEditFlac = (t: FlacRecording) => {
    setEditingFlacId(t.id);
    setEditFlac({
      title: t.title, artist: t.artist, venue: t.venue, recordedDate: t.recordedDate, sourceType: t.sourceType,
      sourceIdOrUrl: t.sourceIdOrUrl, artworkUrl: t.artworkUrl || '', bitDepth: t.bitDepth, sampleRateHz: t.sampleRateHz,
      durationSec: t.durationSec, loudnessLufs: typeof t.loudnessLufs === 'number' ? t.loudnessLufs : -14.0,
      previewRootHz: t.previewRootHz || 196, altVersions: t.altVersions ? structuredClone(t.altVersions) : [], tagsText: t.tags.join(' '),
    });
  };

  const handleSaveFlacEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFlacId || !editFlac) return;
    try {
      const data = await postAdminAction({ action: 'update-flac', id: editingFlacId, ...editFlac });
      if (data.ok && data.track) {
        const updated = data.track as FlacRecording;
        setAudioTracks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        syncAuditLogs(data.auditLogs);
        setEditingFlacId(null); setEditFlac(null);
        showToast(`Updated ${updated.title}`);
      } else showToast(String(data.error || 'Could not update FLAC track'));
    } catch {
      showToast('Failed to update FLAC track');
    }
  };

  const handleDeleteFlac = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-flac', id });
    if (data.ok) {
      setAudioTracks((prev) => prev.filter((a) => a.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingFlacId === id) setEditingFlacId(null);
      showToast('Removed FLAC track');
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidTitle.trim() || !vidYtInput.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-video', title: vidTitle, venue: vidVenue, filmer: vidFilmer, recordedDate: vidDate,
        youtubeIdOrUrl: vidYtInput, posterSourceType: vidPosterType, posterSourceIdOrUrl: vidPosterUrl,
        timestampsText: vidTimestampsText, tagsText: vidTagsText,
      });
      if (data.ok && data.video) {
        setVideos((prev) => [data.video as VideoTape, ...prev]);
        syncAuditLogs(data.auditLogs);
        setVidTitle(''); setVidYtInput('');
        showToast('Published video tape');
      } else showToast(String(data.error || 'Failed to add video'));
    } catch {
      showToast('Failed to add video');
    }
  };

  const startEditVideo = (v: VideoTape) => {
    setEditingVideoId(v.id);
    setEditVideo({
      title: v.title, venue: v.venue, filmer: v.filmer, recordedDate: v.recordedDate,
      youtubeIdOrUrl: v.youtubeUnlistedId, posterUrl: v.posterUrl,
      timestamps: structuredClone(v.timestamps), tagsText: v.tags.join(' '),
    });
  };

  const moveTimestamp = (idx: number, dir: -1 | 1) => {
    setEditVideo((prev) => {
      if (!prev) return prev;
      const next = [...prev.timestamps];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return { ...prev, timestamps: next };
    });
  };

  const handleSaveVideoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideoId || !editVideo) return;
    try {
      const data = await postAdminAction({ action: 'update-video', id: editingVideoId, ...editVideo });
      if (data.ok && data.video) {
        const updated = data.video as VideoTape;
        setVideos((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        syncAuditLogs(data.auditLogs);
        setEditingVideoId(null); setEditVideo(null);
        showToast(`Updated ${updated.title}`);
      } else showToast(String(data.error || 'Could not update video'));
    } catch {
      showToast('Failed to update video');
    }
  };

  const handleDeleteVideo = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-video', id });
    if (data.ok) {
      setVideos((prev) => prev.filter((v) => v.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingVideoId === id) setEditingVideoId(null);
      showToast('Removed video tape');
    }
  };

  const parsedDriveId = flacSourceType === 'gdrive' && flacSourceIdOrUrl ? extractGoogleDriveFileId(flacSourceIdOrUrl) : '';

  if (mode === 'flac') {
    return (
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAddFlac} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
          <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
            <span className="font-mono text-xs font-bold text-[var(--accent)]">Add Off-Hostinger 24-Bit FLAC Recording (Drive v3 / R2 / Samply)</span>
            <label className="typo-action typo-action-accent cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>{flacAnalyzing ? 'Decoding 72-Bar RMS...' : 'Analyze Local Audio File (72-Bar RMS & LUFS)'}</span>
              <input type="file" accept="audio/*,.flac,.wav" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyzeAudioToState(f, false); }} className="hidden" />
            </label>
          </div>
          <div className="field-group sm:col-span-4"><label htmlFor="flac-title" className="field-label">Track Title</label><input id="flac-title" type="text" required value={flacTitle} onChange={(e) => setFlacTitle(e.target.value)} placeholder='e.g. "Poinsett Static"' className="input-clean" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="flac-artist" className="field-label">Band or Artist</label><input id="flac-artist" type="text" required value={flacArtist} onChange={(e) => setFlacArtist(e.target.value)} placeholder="e.g. Rocco and His Bones" className="input-clean" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="flac-venue" className="field-label">Venue</label><input id="flac-venue" type="text" required value={flacVenue} onChange={(e) => setFlacVenue(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-2"><label htmlFor="flac-date" className="field-label">Recorded Date</label><input id="flac-date" type="date" value={flacDate} onChange={(e) => setFlacDate(e.target.value)} className="input-clean tabular-nums" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="flac-provider" className="field-label">Stream Provider</label><select id="flac-provider" value={flacSourceType} onChange={(e) => setFlacSourceType(e.target.value as MediaSourceType)} className="input-clean"><option value="gdrive">Google Drive (API v3 Range)</option><option value="r2">Cloudflare R2 CDN</option><option value="samply">Samply Player ID</option></select></div>
          <div className="field-group sm:col-span-5"><label htmlFor="flac-source" className="field-label">Drive File ID, Share Link, or Stream URL</label><input id="flac-source" type="text" value={flacSourceIdOrUrl} onChange={(e) => setFlacSourceIdOrUrl(e.target.value)} placeholder="Drive share URL, R2 URL, or Samply ID" className="input-clean" /></div>
          <div className="field-group sm:col-span-4"><label htmlFor="flac-art" className="field-label">Artwork URL (Optional)</label><input id="flac-art" type="text" value={flacArtworkUrl} onChange={(e) => setFlacArtworkUrl(e.target.value)} placeholder="/api/media/drive/... or https://..." className="input-clean" /></div>
          {parsedDriveId && (
            <div className="sm:col-span-12 font-mono text-xs text-[var(--ink-2)] px-3 py-1.5 rounded-[var(--r-xs)] bg-[var(--glass-pill)] border border-[var(--glass-border)]">
              Resolved Stream Proxy: <code>/api/media/drive/{parsedDriveId}</code>
            </div>
          )}
          <div className="field-group sm:col-span-3"><label htmlFor="flac-bit-depth" className="field-label">Bit Depth</label><select id="flac-bit-depth" value={flacBitDepth} onChange={(e) => setFlacBitDepth(Number(e.target.value) === 16 ? 16 : 24)} className="input-clean"><option value={24}>24-Bit Lossless</option><option value={16}>16-Bit Redbook</option></select></div>
          <div className="field-group sm:col-span-3"><label htmlFor="flac-sample-rate" className="field-label">Sample Rate</label><select id="flac-sample-rate" value={flacSampleRate} onChange={(e) => setFlacSampleRate(Number(e.target.value) as 44100 | 48000 | 96000)} className="input-clean"><option value={48000}>48 kHz</option><option value={96000}>96 kHz</option><option value={44100}>44.1 kHz</option></select></div>
          <div className="field-group sm:col-span-2"><label htmlFor="flac-duration" className="field-label">Duration (sec)</label><input id="flac-duration" type="number" min={5} value={flacDurationSec} onChange={(e) => setFlacDurationSec(Number(e.target.value))} className="input-clean tabular-nums" /></div>
          <div className="field-group sm:col-span-2"><label htmlFor="flac-lufs" className="field-label">Integrated LUFS</label><input id="flac-lufs" type="number" step="0.1" min={-40} max={0} value={flacLufs} onChange={(e) => setFlacLufs(Number(e.target.value))} className="input-clean font-mono tabular-nums" /></div>
          <div className="field-group sm:col-span-2"><label htmlFor="flac-root-hz" className="field-label">Preview Root (Hz)</label><input id="flac-root-hz" type="number" min={80} max={880} value={flacRootHz} onChange={(e) => setFlacRootHz(Number(e.target.value))} className="input-clean tabular-nums" /></div>
          <div className="sm:col-span-12 p-4 rounded-[var(--r-sm)] bg-[var(--glass-pill)] border border-[var(--glass-border)] flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="field-group flex-1 min-w-[200px] max-w-sm"><label htmlFor="flac-primary-label" className="field-label">Primary Mix Label (A/B Stack)</label><input id="flac-primary-label" type="text" value={flacPrimaryLabel} onChange={(e) => setFlacPrimaryLabel(e.target.value)} className="input-clean py-1.5 px-2.5 text-xs" /></div>
              <button type="button" className="typo-action typo-action-accent pb-1.5" onClick={() => setFlacAltTakes((p) => [...p, { label: p.length === 0 ? 'Room Mics' : `Alt Take ${p.length + 1}`, sourceType: 'gdrive', sourceIdOrUrl: '', bitDepth: flacBitDepth, sampleRateHz: flacSampleRate }])}>
                <Plus className="w-3.5 h-3.5" /><span>Add Alternate Mix Take (A/B)</span>
              </button>
            </div>
            {flacAltTakes.map((take, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-3 border-t border-[var(--glass-border)]">
                <div className="field-group sm:col-span-4"><label className="field-label">Take Label</label><input type="text" value={take.label} onChange={(e) => setFlacAltTakes((p) => p.map((it, i) => (i === idx ? { ...it, label: e.target.value } : it)))} className="input-clean py-1.5 px-2.5 text-xs" /></div>
                <div className="field-group sm:col-span-3"><label className="field-label">Provider</label><select value={take.sourceType} onChange={(e) => setFlacAltTakes((p) => p.map((it, i) => (i === idx ? { ...it, sourceType: e.target.value as MediaSourceType } : it)))} className="input-clean py-1.5 px-2 text-xs"><option value="gdrive">Drive v3</option><option value="r2">Cloudflare R2</option><option value="samply">PCM Preview</option></select></div>
                <div className="field-group sm:col-span-4"><label className="field-label">Drive File ID or Stream URL</label><input type="text" value={take.sourceIdOrUrl} onChange={(e) => setFlacAltTakes((p) => p.map((it, i) => (i === idx ? { ...it, sourceIdOrUrl: e.target.value } : it)))} className="input-clean py-1.5 px-2.5 text-xs" /></div>
                <div className="sm:col-span-1 flex justify-end pb-1"><button type="button" onClick={() => setFlacAltTakes((p) => p.filter((_, i) => i !== idx))} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /></button></div>
              </div>
            ))}
          </div>

          <div className="field-group sm:col-span-8"><label htmlFor="flac-tags" className="field-label">Archive Hashtags (space-separated)</label><input id="flac-tags" type="text" value={flacTagsText} onChange={(e) => setFlacTagsText(e.target.value)} className="input-clean" /></div>
          <div className="sm:col-span-4 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Publish FLAC Track</button></div>
        </form>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Track / Artist</th><th>Venue / Spec / LUFS</th><th>Mixes &amp; Provider</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {audioTracks.map((t) => (
                <React.Fragment key={t.id}>
                  <tr>
                    <td><strong>{t.title}</strong><div className="text-xs text-[var(--mute)]">{t.artist} · {t.recordedDate}</div></td>
                    <td className="font-mono text-xs text-[var(--mute)] tabular-nums">
                      {t.venue} · {t.specLabel}{typeof t.loudnessLufs === 'number' ? ` · ${t.loudnessLufs} LUFS` : ''}
                    </td>
                    <td className="font-mono text-xs text-[var(--ink-2)]">
                      {t.sourceType.toUpperCase()}{t.altVersions && t.altVersions.length > 1 ? ` · ${t.altVersions.length} Mixes` : ''}
                    </td>
                    <td>
                      <div className="inline-flex flex-wrap items-center gap-2.5">
                        <button type="button" onClick={() => (editingFlacId === t.id ? setEditingFlacId(null) : startEditFlac(t))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                        <button type="button" onClick={() => handleDeleteFlac(t.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                      </div>
                    </td>
                  </tr>
                  {editingFlacId === t.id && editFlac && (
                    <tr>
                      <td colSpan={4} className="!p-3 bg-[var(--bg-ground)]/50">
                        <form onSubmit={handleSaveFlacEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                          <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
                            <span className="font-mono text-xs font-bold text-[var(--accent)]">Editing FLAC · {t.id}</span>
                            <label className="typo-action typo-action-accent cursor-pointer">
                              <Upload className="w-3.5 h-3.5" /><span>Re-Analyze Audio Peaks &amp; LUFS</span>
                              <input type="file" accept="audio/*,.flac,.wav" onChange={(e) => { const f = e.target.files?.[0]; if (f) void analyzeAudioToState(f, true); }} className="hidden" />
                            </label>
                          </div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Track Title</label><input type="text" required value={editFlac.title} onChange={(e) => setEditFlac({ ...editFlac, title: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Artist</label><input type="text" required value={editFlac.artist} onChange={(e) => setEditFlac({ ...editFlac, artist: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Venue</label><input type="text" required value={editFlac.venue} onChange={(e) => setEditFlac({ ...editFlac, venue: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Recorded Date</label><input type="text" value={editFlac.recordedDate} onChange={(e) => setEditFlac({ ...editFlac, recordedDate: e.target.value })} className="input-clean tabular-nums" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Provider</label><select value={editFlac.sourceType} onChange={(e) => setEditFlac({ ...editFlac, sourceType: e.target.value as MediaSourceType })} className="input-clean"><option value="gdrive">Google Drive</option><option value="r2">Cloudflare R2</option><option value="samply">Samply</option></select></div>
                          <div className="field-group sm:col-span-5"><label className="field-label">Source ID or URL</label><input type="text" value={editFlac.sourceIdOrUrl} onChange={(e) => setEditFlac({ ...editFlac, sourceIdOrUrl: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Artwork URL</label><input type="text" value={editFlac.artworkUrl} onChange={(e) => setEditFlac({ ...editFlac, artworkUrl: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Bit Depth</label><select value={editFlac.bitDepth} onChange={(e) => setEditFlac({ ...editFlac, bitDepth: Number(e.target.value) === 16 ? 16 : 24 })} className="input-clean"><option value={24}>24-Bit</option><option value={16}>16-Bit</option></select></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Sample Rate</label><select value={editFlac.sampleRateHz} onChange={(e) => setEditFlac({ ...editFlac, sampleRateHz: Number(e.target.value) as 44100 | 48000 | 96000 })} className="input-clean"><option value={48000}>48 kHz</option><option value={96000}>96 kHz</option><option value={44100}>44.1 kHz</option></select></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Duration (s)</label><input type="number" min={5} value={editFlac.durationSec} onChange={(e) => setEditFlac({ ...editFlac, durationSec: Number(e.target.value) })} className="input-clean tabular-nums" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">LUFS</label><input type="number" step="0.1" value={editFlac.loudnessLufs} onChange={(e) => setEditFlac({ ...editFlac, loudnessLufs: Number(e.target.value) })} className="input-clean tabular-nums" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Root Hz</label><input type="number" value={editFlac.previewRootHz} onChange={(e) => setEditFlac({ ...editFlac, previewRootHz: Number(e.target.value) })} className="input-clean tabular-nums" /></div>
                          <div className="sm:col-span-12 p-3 rounded-[var(--r-sm)] bg-[var(--glass-pill)] border border-[var(--glass-border)] flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="field-label">A/B Mix Versions ({editFlac.altVersions.length})</span>
                              <button type="button" className="typo-action typo-action-accent" onClick={() => setEditFlac({ ...editFlac, altVersions: [...editFlac.altVersions, { id: `v-${Date.now()}`, label: editFlac.altVersions.length === 0 ? 'Primary Mix' : 'Alt Mix', streamUrl: '', variantKind: editFlac.altVersions.length === 0 ? 'primary' : 'alt' }] })}><Plus className="w-3.5 h-3.5" /><span>Add Mix Version</span></button>
                            </div>
                            {editFlac.altVersions.map((ver, idx) => (
                              <div key={ver.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                                <div className="field-group sm:col-span-4"><label className="field-label">Mix Label</label><input type="text" value={ver.label} onChange={(e) => setEditFlac({ ...editFlac, altVersions: editFlac.altVersions.map((v, i) => (i === idx ? { ...v, label: e.target.value } : v)) })} className="input-clean py-1 text-xs" /></div>
                                <div className="field-group sm:col-span-7"><label className="field-label">Stream URL or Drive ID</label><input type="text" value={ver.streamUrl} onChange={(e) => setEditFlac({ ...editFlac, altVersions: editFlac.altVersions.map((v, i) => (i === idx ? { ...v, streamUrl: e.target.value } : v)) })} className="input-clean py-1 text-xs" /></div>
                                <div className="sm:col-span-1 flex justify-end"><button type="button" onClick={() => setEditFlac({ ...editFlac, altVersions: editFlac.altVersions.filter((_, i) => i !== idx) })} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /></button></div>
                              </div>
                            ))}
                          </div>
                          <div className="field-group sm:col-span-7"><label className="field-label">Hashtags</label><input type="text" value={editFlac.tagsText} onChange={(e) => setEditFlac({ ...editFlac, tagsText: e.target.value })} className="input-clean" /></div>
                          <div className="sm:col-span-5 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => { setEditingFlacId(null); setEditFlac(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
                            <button type="submit" className="btn-arch btn-cta-bright py-2 px-4">SAVE CHANGES</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAddVideo} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
        <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
          Publish Unlisted YouTube Tape &amp; Chapter Timestamps
        </div>
        <div className="field-group sm:col-span-8"><label htmlFor="vid-title" className="field-label">Tape Title</label><input id="vid-title" type="text" required value={vidTitle} onChange={(e) => setVidTitle(e.target.value)} placeholder="e.g. Vernon Tape #05" className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="vid-yt" className="field-label">YouTube Unlisted URL or 11-Char ID</label><input id="vid-yt" type="text" required value={vidYtInput} onChange={(e) => setVidYtInput(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="vid-venue" className="field-label">Venue</label><input id="vid-venue" type="text" required value={vidVenue} onChange={(e) => setVidVenue(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="vid-filmer" className="field-label">Filmer Handle</label><input id="vid-filmer" type="text" required value={vidFilmer} onChange={(e) => setVidFilmer(e.target.value)} placeholder="e.g. Vernon" className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="vid-date" className="field-label">Recorded Date</label><input id="vid-date" type="date" value={vidDate} onChange={(e) => setVidDate(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="vid-poster-type" className="field-label">Poster Provider</label><select id="vid-poster-type" value={vidPosterType} onChange={(e) => setVidPosterType(e.target.value as MediaSourceType)} className="input-clean"><option value="embedded">Default Poe Mill Poster</option><option value="gdrive">Google Drive Poster File ID</option><option value="r2">Cloudflare R2 Poster URL</option></select></div>
        <div className="field-group sm:col-span-8"><label htmlFor="vid-poster-url" className="field-label">Poster File ID or URL (Optional)</label><input id="vid-poster-url" type="text" value={vidPosterUrl} onChange={(e) => setVidPosterUrl(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-12"><label htmlFor="vid-timestamps" className="field-label">Chapter Timestamps (One MM:SS Label per Line)</label><textarea id="vid-timestamps" rows={3} value={vidTimestampsText} onChange={(e) => setVidTimestampsText(e.target.value)} className="auto-textarea font-mono" /></div>
        <div className="field-group sm:col-span-8"><label htmlFor="vid-tags" className="field-label">Archive Hashtags (space-separated)</label><input id="vid-tags" type="text" value={vidTagsText} onChange={(e) => setVidTagsText(e.target.value)} className="input-clean" /></div>
        <div className="sm:col-span-4 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Publish Video Tape</button></div>
      </form>

      <div className="table-wrap">
        <table className="clean-table">
          <thead>
            <tr><th>Tape Title</th><th>Venue / Filmer / Date</th><th>Chapters</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {videos.map((v) => (
              <React.Fragment key={v.id}>
                <tr>
                  <td><strong>{v.title}</strong></td>
                  <td className="font-mono text-xs text-[var(--mute)] tabular-nums">{v.venue} · {v.filmer} · {v.recordedDate}</td>
                  <td className="font-mono text-xs tabular-nums">{v.timestamps.length} clips</td>
                  <td>
                    <div className="inline-flex flex-wrap items-center gap-2.5">
                      <button type="button" onClick={() => (editingVideoId === v.id ? setEditingVideoId(null) : startEditVideo(v))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                      <button type="button" onClick={() => handleDeleteVideo(v.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                    </div>
                  </td>
                </tr>
                {editingVideoId === v.id && editVideo && (
                  <tr>
                    <td colSpan={4} className="!p-3 bg-[var(--bg-ground)]/50">
                      <form onSubmit={handleSaveVideoEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                        <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Video Tape · {v.id}</div>
                        <div className="field-group sm:col-span-6"><label className="field-label">Tape Title</label><input type="text" required value={editVideo.title} onChange={(e) => setEditVideo({ ...editVideo, title: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">YouTube ID or URL</label><input type="text" required value={editVideo.youtubeIdOrUrl} onChange={(e) => setEditVideo({ ...editVideo, youtubeIdOrUrl: e.target.value })} className="input-clean font-mono" /></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">Recorded Date</label><input type="date" value={editVideo.recordedDate} onChange={(e) => setEditVideo({ ...editVideo, recordedDate: e.target.value })} className="input-clean tabular-nums" /></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Venue</label><input type="text" required value={editVideo.venue} onChange={(e) => setEditVideo({ ...editVideo, venue: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Filmer Handle</label><input type="text" required value={editVideo.filmer} onChange={(e) => setEditVideo({ ...editVideo, filmer: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Poster URL</label><input type="text" value={editVideo.posterUrl} onChange={(e) => setEditVideo({ ...editVideo, posterUrl: e.target.value })} className="input-clean" /></div>
                        <div className="sm:col-span-12 p-3 rounded-[var(--r-sm)] bg-[var(--glass-pill)] border border-[var(--glass-border)] flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="field-label">Chapter Timestamps ({editVideo.timestamps.length})</span>
                            <button type="button" className="typo-action typo-action-accent" onClick={() => setEditVideo({ ...editVideo, timestamps: [...editVideo.timestamps, { sec: 0, time: '00:00', label: 'New Chapter' }] })}><Plus className="w-3.5 h-3.5" /><span>Add Chapter</span></button>
                          </div>
                          {editVideo.timestamps.map((ts, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                              <div className="field-group col-span-3 sm:col-span-2"><label className="field-label">MM:SS</label><input type="text" value={ts.time} onChange={(e) => setEditVideo({ ...editVideo, timestamps: editVideo.timestamps.map((item, i) => (i === idx ? { ...item, time: e.target.value } : item)) })} className="input-clean py-1 font-mono text-xs tabular-nums" /></div>
                              <div className="field-group col-span-6 sm:col-span-7"><label className="field-label">Chapter Label</label><input type="text" value={ts.label} onChange={(e) => setEditVideo({ ...editVideo, timestamps: editVideo.timestamps.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)) })} className="input-clean py-1 text-xs" /></div>
                              <div className="col-span-3 flex items-center justify-end gap-1.5 pb-0.5">
                                <button type="button" disabled={idx === 0} onClick={() => moveTimestamp(idx, -1)} className="btn-arch !py-1 !px-2 !text-[10px]" title="Move chapter up"><ArrowUp className="w-3 h-3" /></button>
                                <button type="button" disabled={idx === editVideo.timestamps.length - 1} onClick={() => moveTimestamp(idx, 1)} className="btn-arch !py-1 !px-2 !text-[10px]" title="Move chapter down"><ArrowDown className="w-3 h-3" /></button>
                                <button type="button" onClick={() => setEditVideo({ ...editVideo, timestamps: editVideo.timestamps.filter((_, i) => i !== idx) })} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="field-group sm:col-span-7"><label className="field-label">Hashtags</label><input type="text" value={editVideo.tagsText} onChange={(e) => setEditVideo({ ...editVideo, tagsText: e.target.value })} className="input-clean" /></div>
                        <div className="sm:col-span-5 flex items-center justify-end gap-2">
                          <button type="button" onClick={() => { setEditingVideoId(null); setEditVideo(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
                          <button type="submit" className="btn-arch btn-cta-bright py-2 px-4">SAVE CHANGES</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

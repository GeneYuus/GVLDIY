// components/admin/panels/PhotosArtistsPanel.tsx
'use client';

import React, { useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import {
  CommentNode,
  MediaSourceType,
  PhotoPlate,
  SceneArtist,
  SceneChatMessage,
} from '@/types/archive';
import {
  extractGoogleDriveFileId,
  extractImageDimensionsClient,
} from '@/lib/media/resolveMediaUrl';

interface PhotosArtistsPanelProps {
  mode: 'photos' | 'artists' | 'comments';
  photos: PhotoPlate[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoPlate[]>>;
  artists: SceneArtist[];
  setArtists: React.Dispatch<React.SetStateAction<SceneArtist[]>>;
  commentsByItem: Record<string, CommentNode[]>;
  setCommentsByItem: React.Dispatch<
    React.SetStateAction<Record<string, CommentNode[]>>
  >;
  sceneChat: SceneChatMessage[];
  setSceneChat: React.Dispatch<React.SetStateAction<SceneChatMessage[]>>;
  postAdminAction: (
    payload: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown) => void;
  showToast: (msg: string) => void;
}

export default function PhotosArtistsPanel({
  mode,
  photos,
  setPhotos,
  artists,
  setArtists,
  commentsByItem,
  setCommentsByItem,
  sceneChat,
  setSceneChat,
  postAdminAction,
  syncAuditLogs,
  showToast,
}: PhotosArtistsPanelProps) {
  // Photo Create State
  const [phoTitle, setPhoTitle] = useState('');
  const [phoPhotographer, setPhoPhotographer] = useState('');
  const [phoVenue, setPhoVenue] = useState('Poe Mill DIY');
  const [phoYear, setPhoYear] = useState('2026');
  const [phoSourceType, setPhoSourceType] = useState<MediaSourceType>('gdrive');
  const [phoSourceUrl, setPhoSourceUrl] = useState('');
  const [phoDimensions, setPhoDimensions] = useState('');
  const [phoTagsText, setPhoTagsText] = useState('poe-mill 35mm greenville');

  // Photo Inline Edit State
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [editPhoto, setEditPhoto] = useState<{
    title: string;
    photographer: string;
    venue: string;
    year: string;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    dimensionsLabel: string;
    imageUrl: string;
    tagsText: string;
  } | null>(null);

  // Artist Create State
  const [artName, setArtName] = useState('');
  const [artRole, setArtRole] = useState<SceneArtist['role']>('Band');
  const [artGenre, setArtGenre] = useState('');
  const [artArea, setArtArea] = useState('Greenville, SC');
  const [artActive, setArtActive] = useState(true);
  const [artTagsText, setArtTagsText] = useState('band punk-rock greenville');

  // Artist Inline Edit State
  const [editingArtistId, setEditingArtistId] = useState<string | null>(null);
  const [editArtist, setEditArtist] = useState<{
    name: string;
    role: SceneArtist['role'];
    genre: string;
    area: string;
    active: boolean;
    tagsText: string;
  } | null>(null);

  const handleInspectLocalPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    forEdit: boolean
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const info = await extractImageDimensionsClient(file);
      if (forEdit) {
        setEditPhoto((prev) =>
          prev ? { ...prev, dimensionsLabel: info.dimensionsLabel } : prev
        );
      } else {
        setPhoDimensions(info.dimensionsLabel);
        if (!phoTitle) setPhoTitle(file.name.replace(/\.[^.]+$/, ''));
      }
      showToast(`Inspected scan (${info.dimensionsLabel})`);
    } catch {
      showToast('Could not inspect image scan');
    }
  };

  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoTitle.trim() || !phoPhotographer.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-photo',
        title: phoTitle,
        photographer: phoPhotographer,
        venue: phoVenue,
        year: phoYear,
        sourceType: phoSourceType,
        sourceIdOrUrl: phoSourceUrl,
        dimensionsLabel: phoDimensions || undefined,
        tagsText: phoTagsText,
      });
      if (data.ok && data.photo) {
        setPhotos((prev) => [data.photo as PhotoPlate, ...prev]);
        syncAuditLogs(data.auditLogs);
        setPhoTitle('');
        setPhoSourceUrl('');
        setPhoDimensions('');
        showToast('Added 35mm photo plate');
      } else {
        showToast(String(data.error || 'Failed to add photo'));
      }
    } catch {
      showToast('Failed to add photo');
    }
  };

  const startEditPhoto = (p: PhotoPlate) => {
    setEditingPhotoId(p.id);
    setEditPhoto({
      title: p.title,
      photographer: p.photographer,
      venue: p.venue,
      year: p.year,
      sourceType: p.sourceType || 'embedded',
      sourceIdOrUrl: p.sourceIdOrUrl || '',
      dimensionsLabel: p.dimensionsLabel || '',
      imageUrl: p.imageUrl,
      tagsText: p.tags.join(' '),
    });
  };

  const handleSavePhotoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhotoId || !editPhoto) return;
    try {
      const data = await postAdminAction({
        action: 'update-photo',
        id: editingPhotoId,
        ...editPhoto,
      });
      if (data.ok && data.photo) {
        const updated = data.photo as PhotoPlate;
        setPhotos((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        syncAuditLogs(data.auditLogs);
        setEditingPhotoId(null);
        setEditPhoto(null);
        showToast(`Updated ${updated.title}`);
      } else {
        showToast(String(data.error || 'Could not update photo'));
      }
    } catch {
      showToast('Failed to update photo');
    }
  };

  const handleDeletePhoto = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-photo', id });
    if (data.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingPhotoId === id) setEditingPhotoId(null);
      showToast('Removed photo plate');
    }
  };

  const handleAddArtist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artName.trim() || !artGenre.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-artist',
        name: artName,
        role: artRole,
        genre: artGenre,
        area: artArea,
        active: artActive,
        tagsText: artTagsText,
      });
      if (data.ok && data.artist) {
        setArtists((prev) => [data.artist as SceneArtist, ...prev]);
        syncAuditLogs(data.auditLogs);
        setArtName('');
        setArtGenre('');
        showToast('Added scene artist');
      } else {
        showToast(String(data.error || 'Failed to add artist'));
      }
    } catch {
      showToast('Failed to add artist');
    }
  };

  const startEditArtist = (a: SceneArtist) => {
    setEditingArtistId(a.id);
    setEditArtist({
      name: a.name,
      role: a.role,
      genre: a.genre,
      area: a.area,
      active: a.active,
      tagsText: a.tags.filter((t) => t !== 'active' && t !== 'inactive').join(' '),
    });
  };

  const handleSaveArtistEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArtistId || !editArtist) return;
    try {
      const data = await postAdminAction({
        action: 'update-artist',
        id: editingArtistId,
        ...editArtist,
      });
      if (data.ok && data.artist) {
        const updated = data.artist as SceneArtist;
        setArtists((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        syncAuditLogs(data.auditLogs);
        setEditingArtistId(null);
        setEditArtist(null);
        showToast(`Updated ${updated.name}`);
      } else {
        showToast(String(data.error || 'Could not update artist'));
      }
    } catch {
      showToast('Failed to update artist');
    }
  };

  const handleToggleArtist = async (id: string) => {
    const data = await postAdminAction({ action: 'toggle-artist-active', id });
    if (data.ok && data.artist) {
      const updated = data.artist as SceneArtist;
      setArtists((prev) => prev.map((a) => (a.id === id ? updated : a)));
      syncAuditLogs(data.auditLogs);
      showToast(`${updated.name} -> ${updated.active ? 'ACTIVE' : 'INACTIVE'}`);
    }
  };

  const handleDeleteArtist = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-artist', id });
    if (data.ok) {
      setArtists((prev) => prev.filter((a) => a.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingArtistId === id) setEditingArtistId(null);
      showToast('Removed artist');
    }
  };

  const handleDeleteComment = async (targetItemId: string, commentId: string) => {
    const data = await postAdminAction({
      action: 'delete-comment',
      targetItemId,
      commentId,
    });
    if (data.ok) {
      setCommentsByItem((prev) => ({
        ...prev,
        [targetItemId]: (prev[targetItemId] || []).filter(
          (c) => c.id !== commentId
        ),
      }));
      syncAuditLogs(data.auditLogs);
      showToast('Deleted item note');
    }
  };

  const handleDeleteChatMessage = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-scene-chat', id });
    if (data.ok) {
      setSceneChat((prev) => prev.filter((m) => m.id !== id));
      syncAuditLogs(data.auditLogs);
      showToast('Deleted Scene Chat message');
    }
  };

  const parsedPhotoDriveId =
    phoSourceType === 'gdrive' && phoSourceUrl
      ? extractGoogleDriveFileId(phoSourceUrl)
      : '';

  if (mode === 'photos') {
    return (
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAddPhoto} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
          <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--glass-border)]">
            <span className="font-mono text-xs font-bold text-[var(--accent)]">Add 35mm Archival Photo Plate (Google Drive / R2)</span>
            <label className="typo-action typo-action-accent cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Inspect Local Scan Dimensions</span>
              <input type="file" accept="image/*" onChange={(e) => handleInspectLocalPhoto(e, false)} className="hidden" />
            </label>
          </div>
          <div className="field-group sm:col-span-4"><label htmlFor="pho-title" className="field-label">Photo Title</label><input id="pho-title" type="text" required value={phoTitle} onChange={(e) => setPhoTitle(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-4"><label htmlFor="pho-photographer" className="field-label">Photographer</label><input id="pho-photographer" type="text" required value={phoPhotographer} onChange={(e) => setPhoPhotographer(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="pho-venue" className="field-label">Venue</label><input id="pho-venue" type="text" required value={phoVenue} onChange={(e) => setPhoVenue(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-1"><label htmlFor="pho-year" className="field-label">Year</label><input id="pho-year" type="text" required value={phoYear} onChange={(e) => setPhoYear(e.target.value)} className="input-clean tabular-nums" /></div>
          <div className="field-group sm:col-span-4"><label htmlFor="pho-source-type" className="field-label">Image Provider</label><select id="pho-source-type" value={phoSourceType} onChange={(e) => setPhoSourceType(e.target.value as MediaSourceType)} className="input-clean"><option value="gdrive">Google Drive File ID / Link</option><option value="r2">Cloudflare R2 Public URL</option><option value="embedded">Preview Archival Plate</option></select></div>
          <div className="field-group sm:col-span-8"><label htmlFor="pho-source-url" className="field-label">Drive File ID, Share Link, or Image URL</label><input id="pho-source-url" type="text" value={phoSourceUrl} onChange={(e) => setPhoSourceUrl(e.target.value)} className="input-clean" /></div>
          {parsedPhotoDriveId && (
            <div className="sm:col-span-12 font-mono text-xs text-[var(--ink-2)]">
              Resolved Image Proxy: <code>/api/media/drive/{parsedPhotoDriveId}</code>
              {phoDimensions ? ` · ${phoDimensions}` : ''}
            </div>
          )}
          <div className="field-group sm:col-span-8"><label htmlFor="pho-tags" className="field-label">Archive Hashtags (space-separated)</label><input id="pho-tags" type="text" value={phoTagsText} onChange={(e) => setPhoTagsText(e.target.value)} className="input-clean" /></div>
          <div className="sm:col-span-4 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Add Photo Plate</button></div>
        </form>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Title</th><th>Photographer / Venue</th><th>Year</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {photos.map((p) => (
                <React.Fragment key={p.id}>
                  <tr>
                    <td><strong>{p.title}</strong></td>
                    <td className="font-mono text-xs text-[var(--mute)]">{p.photographer} · {p.venue}{p.dimensionsLabel ? ` · ${p.dimensionsLabel}` : ''}</td>
                    <td className="font-mono text-xs tabular-nums">{p.year}</td>
                    <td>
                      <div className="inline-flex flex-wrap items-center gap-2.5">
                        <button type="button" onClick={() => (editingPhotoId === p.id ? setEditingPhotoId(null) : startEditPhoto(p))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                        <button type="button" onClick={() => handleDeletePhoto(p.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                      </div>
                    </td>
                  </tr>
                  {editingPhotoId === p.id && editPhoto && (
                    <tr>
                      <td colSpan={4} className="!p-3 bg-[var(--bg-ground)]/50">
                        <form onSubmit={handleSavePhotoEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                          <div className="sm:col-span-12 flex items-center justify-between pb-1 border-b border-[var(--glass-border)]">
                            <span className="font-mono text-xs font-bold text-[var(--accent)]">Editing Photo Plate · {p.id}</span>
                            <label className="typo-action typo-action-accent cursor-pointer"><Upload className="w-3.5 h-3.5" /><span>Inspect Scan</span><input type="file" accept="image/*" onChange={(e) => handleInspectLocalPhoto(e, true)} className="hidden" /></label>
                          </div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Photo Title</label><input type="text" required value={editPhoto.title} onChange={(e) => setEditPhoto({ ...editPhoto, title: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Photographer</label><input type="text" required value={editPhoto.photographer} onChange={(e) => setEditPhoto({ ...editPhoto, photographer: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Venue</label><input type="text" required value={editPhoto.venue} onChange={(e) => setEditPhoto({ ...editPhoto, venue: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Year</label><input type="text" required value={editPhoto.year} onChange={(e) => setEditPhoto({ ...editPhoto, year: e.target.value })} className="input-clean tabular-nums" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Provider</label><select value={editPhoto.sourceType} onChange={(e) => setEditPhoto({ ...editPhoto, sourceType: e.target.value as MediaSourceType })} className="input-clean"><option value="gdrive">Google Drive</option><option value="r2">Cloudflare R2</option><option value="embedded">Embedded / URL</option></select></div>
                          <div className="field-group sm:col-span-5"><label className="field-label">Drive File ID or Source URL</label><input type="text" value={editPhoto.sourceIdOrUrl} onChange={(e) => setEditPhoto({ ...editPhoto, sourceIdOrUrl: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Dimensions Label</label><input type="text" value={editPhoto.dimensionsLabel} onChange={(e) => setEditPhoto({ ...editPhoto, dimensionsLabel: e.target.value })} className="input-clean font-mono text-xs" /></div>
                          <div className="field-group sm:col-span-7"><label className="field-label">Hashtags</label><input type="text" value={editPhoto.tagsText} onChange={(e) => setEditPhoto({ ...editPhoto, tagsText: e.target.value })} className="input-clean" /></div>
                          <div className="sm:col-span-5 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => { setEditingPhotoId(null); setEditPhoto(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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

  if (mode === 'artists') {
    return (
      <div className="flex flex-col gap-4">
        <form onSubmit={handleAddArtist} className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5">
          <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Add Band, Musician, Filmmaker, or Collective</div>
          <div className="field-group sm:col-span-4"><label htmlFor="art-name" className="field-label">Artist or Band Name</label><input id="art-name" type="text" required value={artName} onChange={(e) => setArtName(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-2"><label htmlFor="art-role" className="field-label">Role</label><select id="art-role" value={artRole} onChange={(e) => setArtRole(e.target.value as SceneArtist['role'])} className="input-clean"><option value="Band">Band</option><option value="Musician">Musician</option><option value="Photographer">Photographer</option><option value="Videographer">Videographer</option><option value="Collective">Collective</option></select></div>
          <div className="field-group sm:col-span-3"><label htmlFor="art-genre" className="field-label">Genre or Medium</label><input id="art-genre" type="text" required value={artGenre} onChange={(e) => setArtGenre(e.target.value)} placeholder="e.g. Punk / Basement Rock" className="input-clean" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="art-area" className="field-label">City / Area</label><input id="art-area" type="text" required value={artArea} onChange={(e) => setArtArea(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-6"><label htmlFor="art-tags" className="field-label">Archive Hashtags (space-separated)</label><input id="art-tags" type="text" value={artTagsText} onChange={(e) => setArtTagsText(e.target.value)} className="input-clean" /></div>
          <div className="field-group sm:col-span-3"><label htmlFor="art-status" className="field-label">Activity Status</label><select id="art-status" value={artActive ? 'active' : 'inactive'} onChange={(e) => setArtActive(e.target.value === 'active')} className="input-clean"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
          <div className="sm:col-span-3 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Add Entry</button></div>
        </form>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Status (Click to Toggle)</th><th>Name</th><th>Role / Genre</th><th>Area</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {artists.map((a) => (
                <React.Fragment key={a.id}>
                  <tr>
                    <td>
                      <button type="button" onClick={() => handleToggleArtist(a.id)} className={`typo-action ${a.active ? 'active' : ''}`}>{a.active ? 'Active' : 'Inactive'}</button>
                    </td>
                    <td><strong>{a.name}</strong></td>
                    <td>{a.role} · <span className="text-[var(--mute)]">{a.genre}</span></td>
                    <td className="font-mono text-xs">{a.area}</td>
                    <td>
                      <div className="inline-flex flex-wrap items-center gap-2.5">
                        <button type="button" onClick={() => (editingArtistId === a.id ? setEditingArtistId(null) : startEditArtist(a))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                        <button type="button" onClick={() => handleDeleteArtist(a.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                      </div>
                    </td>
                  </tr>
                  {editingArtistId === a.id && editArtist && (
                    <tr>
                      <td colSpan={5} className="!p-3 bg-[var(--bg-ground)]/50">
                        <form onSubmit={handleSaveArtistEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                          <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Scene Artist · {a.id}</div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Artist or Band Name</label><input type="text" required value={editArtist.name} onChange={(e) => setEditArtist({ ...editArtist, name: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Role</label><select value={editArtist.role} onChange={(e) => setEditArtist({ ...editArtist, role: e.target.value as SceneArtist['role'] })} className="input-clean"><option value="Band">Band</option><option value="Musician">Musician</option><option value="Photographer">Photographer</option><option value="Videographer">Videographer</option><option value="Collective">Collective</option></select></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Genre or Medium</label><input type="text" required value={editArtist.genre} onChange={(e) => setEditArtist({ ...editArtist, genre: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-3"><label className="field-label">City / Area</label><input type="text" required value={editArtist.area} onChange={(e) => setEditArtist({ ...editArtist, area: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-5"><label className="field-label">Hashtags</label><input type="text" value={editArtist.tagsText} onChange={(e) => setEditArtist({ ...editArtist, tagsText: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-2"><label className="field-label">Status</label><select value={editArtist.active ? 'active' : 'inactive'} onChange={(e) => setEditArtist({ ...editArtist, active: e.target.value === 'active' })} className="input-clean"><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
                          <div className="sm:col-span-5 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => { setEditingArtistId(null); setEditArtist(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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

  const allFlattenedComments = Object.entries(commentsByItem).flatMap(
    ([itemId, list]) => list.map((c) => ({ ...c, targetItemId: itemId }))
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Threaded Item Comments Moderation */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="plate-title text-sm m-0">Threaded Item Notes ({allFlattenedComments.length})</h3>
          <span className="font-mono text-[11px] text-[var(--ink-mono)]">Videos, FLAC &amp; Archive Plates</span>
        </div>
        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Target Item</th><th>Author</th><th>Note</th><th>Votes</th><th>Moderation</th></tr>
            </thead>
            <tbody>
              {allFlattenedComments.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.targetItemId}</td>
                  <td className="font-mono text-xs font-bold">@{c.author}</td>
                  <td>{c.text}</td>
                  <td className="font-mono text-xs tabular-nums">{c.votes}</td>
                  <td>
                    <button type="button" onClick={() => handleDeleteComment(c.targetItemId, c.id)} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono text-[var(--cta-bright)]">[ DELETE ]</button>
                  </td>
                </tr>
              ))}
              {allFlattenedComments.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[var(--mute)]">No item comments on Scene Board.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Live Scene Chat Moderation */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="plate-title text-sm m-0">Live Scene Room Chat ({sceneChat.length})</h3>
          <span className="font-mono text-[11px] text-[var(--ink-mono)]">Real-Time Community Feed</span>
        </div>
        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Time</th><th>Handle</th><th>Message</th><th>Moderation</th></tr>
            </thead>
            <tbody>
              {sceneChat.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs tabular-nums text-[var(--mute)]">{m.time}</td>
                  <td className="font-mono text-xs font-bold">@{m.who}</td>
                  <td>{m.msg}</td>
                  <td>
                    <button type="button" onClick={() => handleDeleteChatMessage(m.id)} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono text-[var(--cta-bright)]">[ DELETE ]</button>
                  </td>
                </tr>
              ))}
              {sceneChat.length === 0 && (
                <tr><td colSpan={4} className="text-center text-[var(--mute)]">No active messages in Scene Chat.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

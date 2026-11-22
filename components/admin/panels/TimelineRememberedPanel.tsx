// components/admin/panels/TimelineRememberedPanel.tsx
'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import {
  MediaSourceType,
  RememberedPlace,
  TimelineEra,
} from '@/types/archive';

interface TimelineRememberedPanelProps {
  timeline: TimelineEra[];
  setTimeline: React.Dispatch<React.SetStateAction<TimelineEra[]>>;
  remembered: RememberedPlace[];
  setRemembered: React.Dispatch<React.SetStateAction<RememberedPlace[]>>;
  postAdminAction: (
    payload: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown) => void;
  showToast: (msg: string) => void;
}

export default function TimelineRememberedPanel({
  timeline,
  setTimeline,
  remembered,
  setRemembered,
  postAdminAction,
  syncAuditLogs,
  showToast,
}: TimelineRememberedPanelProps) {
  const [subView, setSubView] = useState<'eras' | 'places'>('eras');

  // Era Create State
  const [eraRange, setEraRange] = useState('');
  const [eraDialLabel, setEraDialLabel] = useState('');
  const [eraTitle, setEraTitle] = useState('');
  const [eraSummary, setEraSummary] = useState('');
  const [eraSourceType, setEraSourceType] = useState<MediaSourceType>('embedded');
  const [eraSourceUrl, setEraSourceUrl] = useState('');

  // Era Inline Edit State
  const [editingEraId, setEditingEraId] = useState<string | null>(null);
  const [editEra, setEditEra] = useState<{
    eraRange: string;
    dialShortLabel: string;
    title: string;
    summary: string;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    portholeImageUrl: string;
  } | null>(null);
  const [reordering, setReordering] = useState(false);

  // Place Create State
  const [placeName, setPlaceName] = useState('');
  const [placeSortIso, setPlaceSortIso] = useState('2025-01');
  const [placeDisplayLabel, setPlaceDisplayLabel] = useState('Closed 2025');
  const [placeLocation, setPlaceLocation] = useState('Greenville, SC');
  const [placeSourceType, setPlaceSourceType] = useState<MediaSourceType>('embedded');
  const [placeSourceUrl, setPlaceSourceUrl] = useState('');
  const [placeStory, setPlaceStory] = useState('');
  const [placeTagsText, setPlaceTagsText] = useState('venue west-end greenville');

  // Place Inline Edit State
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [editPlace, setEditPlace] = useState<{
    name: string;
    closedSortIso: string;
    closedDisplayLabel: string;
    location: string;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    imageUrl: string;
    memorialStory: string;
    tagsText: string;
  } | null>(null);

  const handleAddEra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eraRange.trim() || !eraTitle.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-era',
        eraRange,
        dialShortLabel: eraDialLabel || eraRange.slice(0, 6),
        title: eraTitle,
        summary: eraSummary,
        sourceType: eraSourceType,
        sourceIdOrUrl: eraSourceUrl,
      });
      if (data.ok && data.era) {
        setTimeline((prev) => [...prev, data.era as TimelineEra]);
        syncAuditLogs(data.auditLogs);
        setEraRange('');
        setEraDialLabel('');
        setEraTitle('');
        setEraSummary('');
        setEraSourceUrl('');
        showToast('Added Timeline Era');
      } else {
        showToast(String(data.error || 'Could not add era'));
      }
    } catch {
      showToast('Failed to add Timeline Era');
    }
  };

  const startEditEra = (era: TimelineEra) => {
    setEditingEraId(era.id);
    setEditEra({
      eraRange: era.eraRange,
      dialShortLabel: era.dialShortLabel,
      title: era.title,
      summary: era.summary,
      sourceType: 'embedded',
      sourceIdOrUrl: '',
      portholeImageUrl: era.portholeImageUrl,
    });
  };

  const handleSaveEraEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEraId || !editEra) return;
    try {
      const data = await postAdminAction({
        action: 'update-era',
        id: editingEraId,
        ...editEra,
      });
      if (data.ok && data.era) {
        const updated = data.era as TimelineEra;
        setTimeline((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        syncAuditLogs(data.auditLogs);
        setEditingEraId(null);
        setEditEra(null);
        showToast(`Updated ${updated.dialShortLabel}`);
      } else {
        showToast(String(data.error || 'Could not update era'));
      }
    } catch {
      showToast('Failed to update Timeline Era');
    }
  };

  const handleMoveEra = async (index: number, direction: -1 | 1) => {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= timeline.length || reordering) return;
    const previous = timeline;
    const next = [...timeline];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    const reindexed = next.map((item, i) => ({ ...item, sortOrder: i }));
    setTimeline(reindexed);
    setReordering(true);

    try {
      const data = await postAdminAction({
        action: 'reorder-eras',
        orderedIds: reindexed.map((item) => item.id),
      });
      if (data.ok && Array.isArray(data.timeline)) {
        setTimeline(data.timeline as TimelineEra[]);
        syncAuditLogs(data.auditLogs);
        showToast('Saved Timeline Era sequence');
      } else {
        setTimeline(previous);
        showToast('Could not save era order');
      }
    } catch {
      setTimeline(previous);
      showToast('Failed to reorder Timeline Eras');
    } finally {
      setReordering(false);
    }
  };

  const handleDeleteEra = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-era', id });
    if (data.ok) {
      setTimeline((prev) =>
        prev.filter((e) => e.id !== id).map((e, idx) => ({ ...e, sortOrder: idx }))
      );
      syncAuditLogs(data.auditLogs);
      if (editingEraId === id) setEditingEraId(null);
      showToast('Removed Timeline Era');
    }
  };

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeName.trim() || !placeStory.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-place',
        name: placeName,
        closedSortIso: placeSortIso,
        closedDisplayLabel: placeDisplayLabel,
        location: placeLocation,
        sourceType: placeSourceType,
        sourceIdOrUrl: placeSourceUrl,
        memorialStory: placeStory,
        tagsText: placeTagsText,
      });
      if (data.ok && data.place) {
        setRemembered((prev) => [data.place as RememberedPlace, ...prev]);
        syncAuditLogs(data.auditLogs);
        setPlaceName('');
        setPlaceStory('');
        setPlaceSourceUrl('');
        showToast('Added Place to Remember');
      } else {
        showToast(String(data.error || 'Could not add place'));
      }
    } catch {
      showToast('Failed to add Place to Remember');
    }
  };

  const startEditPlace = (r: RememberedPlace) => {
    setEditingPlaceId(r.id);
    setEditPlace({
      name: r.name,
      closedSortIso: r.closedSortIso,
      closedDisplayLabel: r.closedDisplayLabel,
      location: r.location,
      sourceType: 'embedded',
      sourceIdOrUrl: '',
      imageUrl: r.imageUrl,
      memorialStory: r.memorialStory,
      tagsText: r.tags.join(' '),
    });
  };

  const handleSavePlaceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaceId || !editPlace) return;
    try {
      const data = await postAdminAction({
        action: 'update-place',
        id: editingPlaceId,
        ...editPlace,
      });
      if (data.ok && data.place) {
        const updated = data.place as RememberedPlace;
        setRemembered((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x))
        );
        syncAuditLogs(data.auditLogs);
        setEditingPlaceId(null);
        setEditPlace(null);
        showToast(`Updated ${updated.name}`);
      } else {
        showToast(String(data.error || 'Could not update place'));
      }
    } catch {
      showToast('Failed to update Place to Remember');
    }
  };

  const handleDeletePlace = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-place', id });
    if (data.ok) {
      setRemembered((prev) => prev.filter((r) => r.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingPlaceId === id) setEditingPlaceId(null);
      showToast('Removed Place to Remember');
    }
  };

  return (
    <div className="flex flex-col gap-5 anim-in">
      <div className="admin-tab-strip">
        <button
          type="button"
          className={`admin-tab-btn ${subView === 'eras' ? 'active' : ''}`}
          onClick={() => setSubView('eras')}
        >
          Rotary Timeline Eras ({timeline.length})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${subView === 'places' ? 'active' : ''}`}
          onClick={() => setSubView('places')}
        >
          Places to Remember ({remembered.length})
        </button>
      </div>

      {subView === 'eras' ? (
        <div className="flex flex-col gap-4">
          <form
            onSubmit={handleAddEra}
            className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
          >
            <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
              Add Historical Era to Tactile Porthole Timeline
            </div>
            <div className="field-group sm:col-span-3">
              <label htmlFor="era-range" className="field-label">Era Range</label>
              <input id="era-range" type="text" required value={eraRange} onChange={(e) => setEraRange(e.target.value)} placeholder="e.g. 2015–2019" className="input-clean tabular-nums" />
            </div>
            <div className="field-group sm:col-span-2">
              <label htmlFor="era-dial" className="field-label">Dial Short Label</label>
              <input id="era-dial" type="text" required maxLength={12} value={eraDialLabel} onChange={(e) => setEraDialLabel(e.target.value)} placeholder="e.g. 2015" className="input-clean font-mono uppercase" />
            </div>
            <div className="field-group sm:col-span-7">
              <label htmlFor="era-title" className="field-label">Era Headline</label>
              <input id="era-title" type="text" required value={eraTitle} onChange={(e) => setEraTitle(e.target.value)} placeholder="e.g. Second Concrete Bowl Extension" className="input-clean" />
            </div>
            <div className="field-group sm:col-span-4">
              <label htmlFor="era-src-type" className="field-label">Porthole Image Source</label>
              <select id="era-src-type" value={eraSourceType} onChange={(e) => setEraSourceType(e.target.value as MediaSourceType)} className="input-clean">
                <option value="embedded">Default Poe Mill Plate</option>
                <option value="gdrive">Google Drive File ID / Link</option>
                <option value="r2">Cloudflare R2 Image URL</option>
              </select>
            </div>
            <div className="field-group sm:col-span-8">
              <label htmlFor="era-src-url" className="field-label">Drive File ID or Image URL (Optional)</label>
              <input id="era-src-url" type="text" value={eraSourceUrl} onChange={(e) => setEraSourceUrl(e.target.value)} className="input-clean" />
            </div>
            <div className="field-group sm:col-span-9">
              <label htmlFor="era-summary" className="field-label">Archival Summary</label>
              <textarea id="era-summary" rows={2} required value={eraSummary} onChange={(e) => setEraSummary(e.target.value)} className="auto-textarea" />
            </div>
            <div className="sm:col-span-3 flex">
              <button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Add Timeline Era</button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Dial / Range</th>
                  <th>Era Title &amp; Summary</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((era, idx) => (
                  <React.Fragment key={era.id}>
                    <tr>
                      <td className="whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
                          <span className="w-5 text-[var(--mute)]">{String(idx + 1).padStart(2, '0')}</span>
                          <button type="button" disabled={idx === 0 || reordering} onClick={() => handleMoveEra(idx, -1)} className="btn-arch !py-1 !px-2 !text-[10.5px]" title="Move era up">
                            <ArrowUp className="w-3 h-3" /><span>Up</span>
                          </button>
                          <button type="button" disabled={idx === timeline.length - 1 || reordering} onClick={() => handleMoveEra(idx, 1)} className="btn-arch !py-1 !px-2 !text-[10.5px]" title="Move era down">
                            <ArrowDown className="w-3 h-3" /><span>Down</span>
                          </button>
                        </div>
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap tabular-nums">
                        <div className="font-bold text-[var(--accent)]">{era.dialShortLabel}</div>
                        <div className="text-[var(--mute)]">{era.eraRange}</div>
                      </td>
                      <td>
                        <strong>{era.title}</strong>
                        <p className="text-xs text-[var(--ink-2)] m-0 mt-0.5 leading-relaxed">{era.summary}</p>
                      </td>
                      <td>
                        <div className="inline-flex flex-wrap items-center gap-2.5">
                          <button type="button" onClick={() => (editingEraId === era.id ? setEditingEraId(null) : startEditEra(era))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                          <button type="button" onClick={() => handleDeleteEra(era.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                        </div>
                      </td>
                    </tr>
                    {editingEraId === era.id && editEra && (
                      <tr>
                        <td colSpan={4} className="!p-3 bg-[var(--bg-ground)]/50">
                          <form onSubmit={handleSaveEraEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                            <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Timeline Era · {era.id}</div>
                            <div className="field-group sm:col-span-3"><label className="field-label">Era Range</label><input type="text" required value={editEra.eraRange} onChange={(e) => setEditEra({ ...editEra, eraRange: e.target.value })} className="input-clean tabular-nums" /></div>
                            <div className="field-group sm:col-span-2"><label className="field-label">Dial Short Label</label><input type="text" required maxLength={12} value={editEra.dialShortLabel} onChange={(e) => setEditEra({ ...editEra, dialShortLabel: e.target.value })} className="input-clean font-mono uppercase" /></div>
                            <div className="field-group sm:col-span-7"><label className="field-label">Era Headline</label><input type="text" required value={editEra.title} onChange={(e) => setEditEra({ ...editEra, title: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-4"><label className="field-label">Image Provider</label><select value={editEra.sourceType} onChange={(e) => setEditEra({ ...editEra, sourceType: e.target.value as MediaSourceType })} className="input-clean"><option value="embedded">Keep Current / URL</option><option value="gdrive">Google Drive File ID</option><option value="r2">Cloudflare R2 URL</option></select></div>
                            <div className="field-group sm:col-span-8"><label className="field-label">New Drive ID or Direct Porthole URL</label><input type="text" value={editEra.sourceIdOrUrl || editEra.portholeImageUrl} onChange={(e) => setEditEra({ ...editEra, sourceIdOrUrl: editEra.sourceType === 'embedded' ? '' : e.target.value, portholeImageUrl: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-7"><label className="field-label">Summary</label><textarea rows={2} required value={editEra.summary} onChange={(e) => setEditEra({ ...editEra, summary: e.target.value })} className="auto-textarea" /></div>
                            <div className="sm:col-span-5 flex items-center justify-end gap-2">
                              <button type="button" onClick={() => { setEditingEraId(null); setEditEra(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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
      ) : (
        <div className="flex flex-col gap-4">
          <form
            onSubmit={handleAddPlace}
            className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
          >
            <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
              Add Memorial Entry to Places to Remember
            </div>
            <div className="field-group sm:col-span-4"><label htmlFor="rem-name" className="field-label">Venue or Skatepark Name</label><input id="rem-name" type="text" required value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="e.g. The Handlebar" className="input-clean" /></div>
            <div className="field-group sm:col-span-2"><label htmlFor="rem-sort" className="field-label">Sort Date (YYYY-MM)</label><input id="rem-sort" type="text" required value={placeSortIso} onChange={(e) => setPlaceSortIso(e.target.value)} className="input-clean font-mono tabular-nums" /></div>
            <div className="field-group sm:col-span-3"><label htmlFor="rem-label" className="field-label">Closed Display Label</label><input id="rem-label" type="text" required value={placeDisplayLabel} onChange={(e) => setPlaceDisplayLabel(e.target.value)} placeholder="Closed Dec 2024" className="input-clean" /></div>
            <div className="field-group sm:col-span-3"><label htmlFor="rem-loc" className="field-label">Neighborhood / Address</label><input id="rem-loc" type="text" required value={placeLocation} onChange={(e) => setPlaceLocation(e.target.value)} className="input-clean" /></div>
            <div className="field-group sm:col-span-4"><label htmlFor="rem-src-type" className="field-label">Photo Source</label><select id="rem-src-type" value={placeSourceType} onChange={(e) => setPlaceSourceType(e.target.value as MediaSourceType)} className="input-clean"><option value="embedded">Default Velo Stage Plate</option><option value="gdrive">Google Drive File ID / Link</option><option value="r2">Cloudflare R2 Image URL</option></select></div>
            <div className="field-group sm:col-span-8"><label htmlFor="rem-src-url" className="field-label">Drive File ID or Image URL (Optional)</label><input id="rem-src-url" type="text" value={placeSourceUrl} onChange={(e) => setPlaceSourceUrl(e.target.value)} className="input-clean" /></div>
            <div className="field-group sm:col-span-12"><label htmlFor="rem-story" className="field-label">Memorial Story</label><textarea id="rem-story" rows={2} required value={placeStory} onChange={(e) => setPlaceStory(e.target.value)} className="auto-textarea" /></div>
            <div className="field-group sm:col-span-8"><label htmlFor="rem-tags" className="field-label">Archive Hashtags (space-separated)</label><input id="rem-tags" type="text" value={placeTagsText} onChange={(e) => setPlaceTagsText(e.target.value)} className="input-clean" /></div>
            <div className="sm:col-span-4 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Add Remembered Place</button></div>
          </form>

          <div className="table-wrap">
            <table className="clean-table">
              <thead>
                <tr><th>Space</th><th>Closed / Location</th><th>Memorial Story</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {remembered.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr>
                      <td><strong>{r.name}</strong></td>
                      <td className="font-mono text-xs text-[var(--mute)] whitespace-nowrap tabular-nums">
                        <div>{r.closedDisplayLabel}</div>
                        <div>{r.location}</div>
                      </td>
                      <td className="text-xs text-[var(--ink-2)] leading-relaxed">{r.memorialStory}</td>
                      <td>
                        <div className="inline-flex flex-wrap items-center gap-2.5">
                          <button type="button" onClick={() => (editingPlaceId === r.id ? setEditingPlaceId(null) : startEditPlace(r))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                          <button type="button" onClick={() => handleDeletePlace(r.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                        </div>
                      </td>
                    </tr>
                    {editingPlaceId === r.id && editPlace && (
                      <tr>
                        <td colSpan={4} className="!p-3 bg-[var(--bg-ground)]/50">
                          <form onSubmit={handleSavePlaceEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                            <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Remembered Place · {r.id}</div>
                            <div className="field-group sm:col-span-4"><label className="field-label">Place Name</label><input type="text" required value={editPlace.name} onChange={(e) => setEditPlace({ ...editPlace, name: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-2"><label className="field-label">Sort Date</label><input type="text" required value={editPlace.closedSortIso} onChange={(e) => setEditPlace({ ...editPlace, closedSortIso: e.target.value })} className="input-clean font-mono tabular-nums" /></div>
                            <div className="field-group sm:col-span-3"><label className="field-label">Display Label</label><input type="text" required value={editPlace.closedDisplayLabel} onChange={(e) => setEditPlace({ ...editPlace, closedDisplayLabel: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-3"><label className="field-label">Location</label><input type="text" required value={editPlace.location} onChange={(e) => setEditPlace({ ...editPlace, location: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-4"><label className="field-label">Photo Provider</label><select value={editPlace.sourceType} onChange={(e) => setEditPlace({ ...editPlace, sourceType: e.target.value as MediaSourceType })} className="input-clean"><option value="embedded">Keep Current / URL</option><option value="gdrive">Google Drive File ID</option><option value="r2">Cloudflare R2 URL</option></select></div>
                            <div className="field-group sm:col-span-8"><label className="field-label">New Drive ID or Direct Image URL</label><input type="text" value={editPlace.sourceIdOrUrl || editPlace.imageUrl} onChange={(e) => setEditPlace({ ...editPlace, sourceIdOrUrl: editPlace.sourceType === 'embedded' ? '' : e.target.value, imageUrl: e.target.value })} className="input-clean" /></div>
                            <div className="field-group sm:col-span-12"><label className="field-label">Memorial Story</label><textarea rows={2} required value={editPlace.memorialStory} onChange={(e) => setEditPlace({ ...editPlace, memorialStory: e.target.value })} className="auto-textarea" /></div>
                            <div className="field-group sm:col-span-7"><label className="field-label">Hashtags</label><input type="text" value={editPlace.tagsText} onChange={(e) => setEditPlace({ ...editPlace, tagsText: e.target.value })} className="input-clean" /></div>
                            <div className="sm:col-span-5 flex items-center justify-end gap-2">
                              <button type="button" onClick={() => { setEditingPlaceId(null); setEditPlace(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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
      )}
    </div>
  );
}

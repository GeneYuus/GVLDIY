// components/admin/panels/CalendarAuctionsPanel.tsx
'use client';

import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  FlyerPresetStyle,
  InstagramAuctionItem,
  MediaSourceType,
  ShowCalendarEvent,
} from '@/types/archive';

interface CalendarAuctionsPanelProps {
  mode: 'calendar' | 'auctions';
  calendarEvents: ShowCalendarEvent[];
  setCalendarEvents: React.Dispatch<React.SetStateAction<ShowCalendarEvent[]>>;
  auctions: InstagramAuctionItem[];
  setAuctions: React.Dispatch<React.SetStateAction<InstagramAuctionItem[]>>;
  postAdminAction: (
    payload: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  syncAuditLogs: (logs?: unknown) => void;
  showToast: (msg: string) => void;
}

export default function CalendarAuctionsPanel({
  mode,
  calendarEvents,
  setCalendarEvents,
  auctions,
  setAuctions,
  postAdminAction,
  syncAuditLogs,
  showToast,
}: CalendarAuctionsPanelProps) {
  // Calendar Create State (BUG-02 fixed: full YYYY-MM-DD isoDate + scopedCustomCss + tags)
  const [calIsoDate, setCalIsoDate] = useState('2026-11-25');
  const [calVenue, setCalVenue] = useState('');
  const [calDoors, setCalDoors] = useState('8:00 PM · $8 PWYC');
  const [calStyle, setCalStyle] = useState<FlyerPresetStyle>('punk-xerox');
  const [calTitle, setCalTitle] = useState('');
  const [calNote, setCalNote] = useState('');
  const [calCustomCss, setCalCustomCss] = useState('');
  const [calTagsText, setCalTagsText] = useState('greenville diy');

  // Calendar Inline Edit State
  const [editingShowId, setEditingShowId] = useState<string | null>(null);
  const [editShow, setEditShow] = useState<{
    isoDate: string;
    venue: string;
    doorsInfo: string;
    flyerStyle: FlyerPresetStyle;
    title: string;
    flyerHeadlineNote: string;
    scopedCustomCss: string;
    tagsText: string;
  } | null>(null);

  // Auction Create State
  const [aucTitle, setAucTitle] = useState('');
  const [aucArtist, setAucArtist] = useState('');
  const [aucBid, setAucBid] = useState('$40');
  const [aucPickup, setAucPickup] = useState('Greenville Local Pickup');
  const [aucSourceType, setAucSourceType] =
    useState<MediaSourceType>('embedded');
  const [aucSourceUrl, setAucSourceUrl] = useState('');
  const [aucIgMediaId, setAucIgMediaId] = useState('');
  const [aucIgLink, setAucIgLink] = useState('https://www.instagram.com/');
  const [aucTagsText, setAucTagsText] = useState('vetted greenville');

  // Auction Inline Edit State
  const [editingAuctionId, setEditingAuctionId] = useState<string | null>(null);
  const [editAuction, setEditAuction] = useState<{
    title: string;
    ownerUsername: string;
    currentBidLabel: string;
    pickupArea: string;
    sourceType: MediaSourceType;
    sourceIdOrUrl: string;
    imageUrl: string;
    igMediaId: string;
    igPermalink: string;
    sold: boolean;
    tagsText: string;
  } | null>(null);

  const handlePublishShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calTitle.trim() || !calVenue.trim() || !calIsoDate.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'publish-show',
        isoDate: calIsoDate,
        venue: calVenue,
        doorsInfo: calDoors,
        flyerStyle: calStyle,
        title: calTitle,
        flyerHeadlineNote: calNote,
        scopedCustomCss: calCustomCss || undefined,
        tagsText: calTagsText,
      });
      if (data.ok && data.show) {
        const created = data.show as ShowCalendarEvent;
        setCalendarEvents((prev) =>
          [...prev, created].sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        );
        syncAuditLogs(data.auditLogs);
        setCalTitle('');
        setCalVenue('');
        setCalNote('');
        setCalCustomCss('');
        showToast(`Published show on ${created.isoDate}`);
      } else {
        showToast(String(data.error || 'Failed to publish show'));
      }
    } catch {
      showToast('Failed to publish show');
    }
  };

  const startEditShow = (ev: ShowCalendarEvent) => {
    setEditingShowId(ev.id);
    setEditShow({
      isoDate: ev.isoDate,
      venue: ev.venue,
      doorsInfo: ev.doorsInfo,
      flyerStyle: ev.flyerStyle,
      title: ev.title,
      flyerHeadlineNote: ev.flyerHeadlineNote,
      scopedCustomCss: ev.scopedCustomCss || '',
      tagsText: (ev.tags || []).join(' '),
    });
  };

  const handleSaveShowEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShowId || !editShow) return;
    try {
      const data = await postAdminAction({
        action: 'update-show',
        id: editingShowId,
        ...editShow,
      });
      if (data.ok && data.show) {
        const updated = data.show as ShowCalendarEvent;
        setCalendarEvents((prev) =>
          prev
            .map((x) => (x.id === updated.id ? updated : x))
            .sort((a, b) => a.isoDate.localeCompare(b.isoDate))
        );
        syncAuditLogs(data.auditLogs);
        setEditingShowId(null);
        setEditShow(null);
        showToast(`Updated show (${updated.isoDate})`);
      } else {
        showToast(String(data.error || 'Could not update show'));
      }
    } catch {
      showToast('Failed to update show');
    }
  };

  const handleDeleteShow = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-show', id });
    if (data.ok) {
      setCalendarEvents((prev) => prev.filter((c) => c.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingShowId === id) setEditingShowId(null);
      showToast('Removed calendar show');
    }
  };

  const handleAddAuction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aucTitle.trim() || !aucArtist.trim()) return;
    try {
      const data = await postAdminAction({
        action: 'add-auction',
        title: aucTitle,
        ownerUsername: aucArtist,
        openingBid: aucBid,
        pickupArea: aucPickup,
        sourceType: aucSourceType,
        sourceIdOrUrl: aucSourceUrl,
        igMediaId: aucIgMediaId || undefined,
        igPermalink: aucIgLink,
        tagsText: aucTagsText,
      });
      if (data.ok && data.auction) {
        setAuctions((prev) => [data.auction as InstagramAuctionItem, ...prev]);
        syncAuditLogs(data.auditLogs);
        setAucTitle('');
        setAucArtist('');
        setAucSourceUrl('');
        setAucIgMediaId('');
        showToast('Published Barter Market auction');
      } else {
        showToast(String(data.error || 'Failed to publish auction'));
      }
    } catch {
      showToast('Failed to publish auction');
    }
  };

  const startEditAuction = (a: InstagramAuctionItem) => {
    setEditingAuctionId(a.id);
    setEditAuction({
      title: a.title,
      ownerUsername: a.ownerUsername,
      currentBidLabel: a.currentBidLabel,
      pickupArea: a.pickupArea,
      sourceType: a.sourceType || 'embedded',
      sourceIdOrUrl: a.sourceIdOrUrl || '',
      imageUrl: a.imageUrl,
      igMediaId: a.igMediaId || '',
      igPermalink: a.igPermalink,
      sold: a.sold,
      tagsText: a.tags.filter((t) => t !== 'live' && t !== 'sold').join(' '),
    });
  };

  const handleSaveAuctionEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAuctionId || !editAuction) return;
    try {
      const data = await postAdminAction({
        action: 'update-auction',
        id: editingAuctionId,
        ...editAuction,
      });
      if (data.ok && data.auction) {
        const updated = data.auction as InstagramAuctionItem;
        setAuctions((prev) =>
          prev.map((x) => (x.id === updated.id ? updated : x))
        );
        syncAuditLogs(data.auditLogs);
        setEditingAuctionId(null);
        setEditAuction(null);
        showToast(`Updated ${updated.title}`);
      } else {
        showToast(String(data.error || 'Could not update auction'));
      }
    } catch {
      showToast('Failed to update auction');
    }
  };

  const handleToggleAuctionSold = async (item: InstagramAuctionItem) => {
    const data = await postAdminAction({
      action: 'toggle-auction-sold',
      auctionId: item.id,
      sold: !item.sold,
    });
    if (data.ok && data.auction) {
      const updated = data.auction as InstagramAuctionItem;
      setAuctions((prev) => prev.map((a) => (a.id === item.id ? updated : a)));
      syncAuditLogs(data.auditLogs);
      showToast(`Auction marked ${updated.sold ? 'SOLD' : 'LIVE'}`);
    }
  };

  const handleSimulateIgWebhook = async (auction: InstagramAuctionItem) => {
    try {
      const data = await postAdminAction({
        action: 'simulate-ig-sold',
        auctionId: auction.id,
      });
      if (data.ok && data.auction) {
        const updated = data.auction as InstagramAuctionItem;
        setAuctions((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a))
        );
        syncAuditLogs(data.auditLogs);
        showToast(
          `Simulated verified @${auction.ownerUsername.replace(/^@/, '')} IG "SOLD"`
        );
      } else {
        showToast(String(data.error || 'Could not simulate IG SOLD action'));
      }
    } catch {
      showToast('Webhook simulation error');
    }
  };

  const handleDeleteAuction = async (id: string) => {
    const data = await postAdminAction({ action: 'delete-auction', id });
    if (data.ok) {
      setAuctions((prev) => prev.filter((a) => a.id !== id));
      syncAuditLogs(data.auditLogs);
      if (editingAuctionId === id) setEditingAuctionId(null);
      showToast('Removed auction item');
    }
  };

  if (mode === 'calendar') {
    return (
      <div className="flex flex-col gap-5 anim-in">
        <form
          onSubmit={handlePublishShow}
          className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
        >
          <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
            Publish Show to Multi-Year Calendar &amp; Flyer Unfurl Stage
          </div>
          <div className="field-group sm:col-span-3">
            <label htmlFor="cal-iso-date" className="field-label">Show Date (YYYY-MM-DD)</label>
            <input id="cal-iso-date" type="date" required value={calIsoDate} onChange={(e) => setCalIsoDate(e.target.value)} className="input-clean font-mono tabular-nums" />
          </div>
          <div className="field-group sm:col-span-5">
            <label htmlFor="cal-venue" className="field-label">Venue</label>
            <input id="cal-venue" type="text" required value={calVenue} onChange={(e) => setCalVenue(e.target.value)} placeholder="e.g. The Barn" className="input-clean" />
          </div>
          <div className="field-group sm:col-span-4">
            <label htmlFor="cal-style" className="field-label">Flyer Print Preset</label>
            <select id="cal-style" value={calStyle} onChange={(e) => setCalStyle(e.target.value as FlyerPresetStyle)} className="input-clean">
              <option value="punk-xerox">Punk Xerox Cutout</option>
              <option value="concrete-stencil">Concrete Stencil</option>
              <option value="riso-zine">2-Color Risograph Zine</option>
              <option value="custom-css">Custom Scoped CSS</option>
            </select>
          </div>
          <div className="field-group sm:col-span-7">
            <label htmlFor="cal-title" className="field-label">Lineup / Event Headline</label>
            <input id="cal-title" type="text" required value={calTitle} onChange={(e) => setCalTitle(e.target.value)} placeholder="e.g. Rocco & His Bones + Marietta Creekbed" className="input-clean" />
          </div>
          <div className="field-group sm:col-span-5">
            <label htmlFor="cal-doors" className="field-label">Doors &amp; Cover Info</label>
            <input id="cal-doors" type="text" required value={calDoors} onChange={(e) => setCalDoors(e.target.value)} className="input-clean" />
          </div>
          <div className="field-group sm:col-span-6">
            <label htmlFor="cal-note" className="field-label">Flyer Etiquette / Footer Note</label>
            <input id="cal-note" type="text" required value={calNote} onChange={(e) => setCalNote(e.target.value)} placeholder="e.g. RESPECT NEIGHBORS · PARK ON GRAVEL" className="input-clean" />
          </div>
          <div className="field-group sm:col-span-6">
            <label htmlFor="cal-tags" className="field-label">Archive Hashtags (space-separated)</label>
            <input id="cal-tags" type="text" value={calTagsText} onChange={(e) => setCalTagsText(e.target.value)} className="input-clean" />
          </div>
          <div className="field-group sm:col-span-9">
            <label htmlFor="cal-css" className="field-label">Optional Scoped Custom Flyer CSS Declarations</label>
            <input id="cal-css" type="text" value={calCustomCss} onChange={(e) => setCalCustomCss(e.target.value)} placeholder="e.g. border: 2px solid #ff5900; letter-spacing: 0.02em;" className="input-clean font-mono text-xs" />
          </div>
          <div className="sm:col-span-3 flex">
            <button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Publish Show</button>
          </div>
        </form>

        <div className="table-wrap">
          <table className="clean-table">
            <thead>
              <tr><th>Date</th><th>Lineup / Event</th><th>Venue &amp; Doors</th><th>Preset</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {calendarEvents.map((ev) => (
                <React.Fragment key={ev.id}>
                  <tr>
                    <td className="font-mono text-xs font-bold tabular-nums">{ev.isoDate}</td>
                    <td><strong>{ev.title}</strong></td>
                    <td className="text-xs text-[var(--mute)]">{ev.venue} · {ev.doorsInfo}</td>
                    <td className="font-mono text-xs text-[var(--ink-2)]">{ev.flyerStyle}</td>
                    <td>
                      <div className="inline-flex flex-wrap items-center gap-2.5">
                        <button type="button" onClick={() => (editingShowId === ev.id ? setEditingShowId(null) : startEditShow(ev))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                        <button type="button" onClick={() => handleDeleteShow(ev.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                      </div>
                    </td>
                  </tr>
                  {editingShowId === ev.id && editShow && (
                    <tr>
                      <td colSpan={5} className="!p-3 bg-[var(--bg-ground)]/50">
                        <form onSubmit={handleSaveShowEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                          <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Calendar Show · {ev.id}</div>
                          <div className="field-group sm:col-span-3"><label className="field-label">Show Date (YYYY-MM-DD)</label><input type="date" required value={editShow.isoDate} onChange={(e) => setEditShow({ ...editShow, isoDate: e.target.value })} className="input-clean font-mono tabular-nums" /></div>
                          <div className="field-group sm:col-span-5"><label className="field-label">Venue</label><input type="text" required value={editShow.venue} onChange={(e) => setEditShow({ ...editShow, venue: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-4"><label className="field-label">Flyer Preset</label><select value={editShow.flyerStyle} onChange={(e) => setEditShow({ ...editShow, flyerStyle: e.target.value as FlyerPresetStyle })} className="input-clean"><option value="punk-xerox">Punk Xerox Cutout</option><option value="concrete-stencil">Concrete Stencil</option><option value="riso-zine">2-Color Risograph Zine</option><option value="custom-css">Custom Scoped CSS</option></select></div>
                          <div className="field-group sm:col-span-7"><label className="field-label">Lineup / Headline</label><input type="text" required value={editShow.title} onChange={(e) => setEditShow({ ...editShow, title: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-5"><label className="field-label">Doors &amp; Cover</label><input type="text" required value={editShow.doorsInfo} onChange={(e) => setEditShow({ ...editShow, doorsInfo: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-6"><label className="field-label">Flyer Note</label><input type="text" value={editShow.flyerHeadlineNote} onChange={(e) => setEditShow({ ...editShow, flyerHeadlineNote: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-6"><label className="field-label">Hashtags</label><input type="text" value={editShow.tagsText} onChange={(e) => setEditShow({ ...editShow, tagsText: e.target.value })} className="input-clean" /></div>
                          <div className="field-group sm:col-span-7"><label className="field-label">Scoped Custom CSS</label><input type="text" value={editShow.scopedCustomCss} onChange={(e) => setEditShow({ ...editShow, scopedCustomCss: e.target.value })} className="input-clean font-mono text-xs" /></div>
                          <div className="sm:col-span-5 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => { setEditingShowId(null); setEditShow(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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
    <div className="flex flex-col gap-5 anim-in">
      <form
        onSubmit={handleAddAuction}
        className="glass-panel p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 items-end gap-3.5"
      >
        <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">
          Publish Vetted Artist Auction (thebartermarket.org · 0% Fee)
        </div>
        <div className="field-group sm:col-span-5"><label htmlFor="auc-title" className="field-label">Artifact Title</label><input id="auc-title" type="text" required value={aucTitle} onChange={(e) => setAucTitle(e.target.value)} placeholder="e.g. Fumed Silver Borosilicate Vessel" className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="auc-artist" className="field-label">Creator Instagram (@handle)</label><input id="auc-artist" type="text" required value={aucArtist} onChange={(e) => setAucArtist(e.target.value)} placeholder="@upstate_boro_glass" className="input-clean" /></div>
        <div className="field-group sm:col-span-3"><label htmlFor="auc-bid" className="field-label">Opening Bid</label><input id="auc-bid" type="text" required value={aucBid} onChange={(e) => setAucBid(e.target.value)} className="input-clean tabular-nums" /></div>
        <div className="field-group sm:col-span-3"><label htmlFor="auc-source-type" className="field-label">Photo Provider</label><select id="auc-source-type" value={aucSourceType} onChange={(e) => setAucSourceType(e.target.value as MediaSourceType)} className="input-clean"><option value="embedded">Default Boro Glass Photo</option><option value="gdrive">Google Drive File ID / Link</option><option value="r2">Cloudflare R2 Image URL</option></select></div>
        <div className="field-group sm:col-span-3"><label htmlFor="auc-source-url" className="field-label">Photo File ID or URL</label><input id="auc-source-url" type="text" value={aucSourceUrl} onChange={(e) => setAucSourceUrl(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-3"><label htmlFor="auc-ig-media" className="field-label">Instagram Media ID (Webhook)</label><input id="auc-ig-media" type="text" value={aucIgMediaId} onChange={(e) => setAucIgMediaId(e.target.value)} placeholder="e.g. 17992837461928374" className="input-clean font-mono text-xs" /></div>
        <div className="field-group sm:col-span-3"><label htmlFor="auc-pickup" className="field-label">Local Pickup Area</label><input id="auc-pickup" type="text" value={aucPickup} onChange={(e) => setAucPickup(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-5"><label htmlFor="auc-ig-url" className="field-label">Instagram Post URL</label><input id="auc-ig-url" type="url" value={aucIgLink} onChange={(e) => setAucIgLink(e.target.value)} className="input-clean" /></div>
        <div className="field-group sm:col-span-4"><label htmlFor="auc-tags" className="field-label">Hashtags (space-separated)</label><input id="auc-tags" type="text" value={aucTagsText} onChange={(e) => setAucTagsText(e.target.value)} className="input-clean" /></div>
        <div className="sm:col-span-3 flex"><button type="submit" className="btn-arch btn-cta-bright w-full py-2">+ Publish Auction</button></div>
      </form>

      <div className="table-wrap">
        <table className="clean-table">
          <thead>
            <tr><th>Status</th><th>Item</th><th>Artist &amp; IG Media ID</th><th>Current Bid</th><th>Actions &amp; Webhook</th></tr>
          </thead>
          <tbody>
            {auctions.map((a) => (
              <React.Fragment key={a.id}>
                <tr>
                  <td><span className={`status-stamp ${a.sold ? 'status-sold' : 'status-live'}`}>{a.sold ? 'SOLD' : 'LIVE'}</span></td>
                  <td><strong>{a.title}</strong><div className="text-xs text-[var(--mute)]">{a.pickupArea}</div></td>
                  <td className="font-mono text-xs tabular-nums">
                    <div>@{a.ownerUsername.replace(/^@/, '')}</div>
                    {a.igMediaId && <div className="text-[10.5px] text-[var(--mute)]">ID: {a.igMediaId}</div>}
                  </td>
                  <td className="font-mono text-xs tabular-nums">{a.currentBidLabel}</td>
                  <td>
                    <div className="inline-flex flex-wrap items-center gap-2.5">
                      <button type="button" onClick={() => (editingAuctionId === a.id ? setEditingAuctionId(null) : startEditAuction(a))} className="btn-arch !py-1 !px-2.5 !text-[11px] font-mono">[ EDIT ]</button>
                      <button type="button" onClick={() => handleToggleAuctionSold(a)} className="typo-action typo-action-accent">{a.sold ? 'Mark Live' : 'Mark SOLD'}</button>
                      {!a.sold && (
                        <button type="button" onClick={() => handleSimulateIgWebhook(a)} className="typo-action">Simulate IG SOLD</button>
                      )}
                      <button type="button" onClick={() => handleDeleteAuction(a.id)} className="typo-action typo-action-danger"><Trash2 className="w-3.5 h-3.5" /><span>Remove</span></button>
                    </div>
                  </td>
                </tr>
                {editingAuctionId === a.id && editAuction && (
                  <tr>
                    <td colSpan={5} className="!p-3 bg-[var(--bg-ground)]/50">
                      <form onSubmit={handleSaveAuctionEdit} className="glass-panel p-5 grid grid-cols-1 sm:grid-cols-12 items-end gap-3">
                        <div className="sm:col-span-12 font-mono text-xs font-bold text-[var(--accent)] pb-1 border-b border-[var(--glass-border)]">Editing Barter Auction · {a.id}</div>
                        <div className="field-group sm:col-span-5"><label className="field-label">Artifact Title</label><input type="text" required value={editAuction.title} onChange={(e) => setEditAuction({ ...editAuction, title: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">Creator @handle</label><input type="text" required value={editAuction.ownerUsername} onChange={(e) => setEditAuction({ ...editAuction, ownerUsername: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Current Bid Label</label><input type="text" required value={editAuction.currentBidLabel} onChange={(e) => setEditAuction({ ...editAuction, currentBidLabel: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">Pickup Area</label><input type="text" value={editAuction.pickupArea} onChange={(e) => setEditAuction({ ...editAuction, pickupArea: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">IG Media ID</label><input type="text" value={editAuction.igMediaId} onChange={(e) => setEditAuction({ ...editAuction, igMediaId: e.target.value })} className="input-clean font-mono text-xs" /></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Instagram Permalink</label><input type="url" value={editAuction.igPermalink} onChange={(e) => setEditAuction({ ...editAuction, igPermalink: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-2"><label className="field-label">Status</label><select value={editAuction.sold ? 'sold' : 'live'} onChange={(e) => setEditAuction({ ...editAuction, sold: e.target.value === 'sold' })} className="input-clean"><option value="live">LIVE</option><option value="sold">SOLD</option></select></div>
                        <div className="field-group sm:col-span-3"><label className="field-label">Photo Provider</label><select value={editAuction.sourceType} onChange={(e) => setEditAuction({ ...editAuction, sourceType: e.target.value as MediaSourceType })} className="input-clean"><option value="embedded">Keep Current / URL</option><option value="gdrive">Google Drive File ID</option><option value="r2">Cloudflare R2 URL</option></select></div>
                        <div className="field-group sm:col-span-4"><label className="field-label">Photo Source or Direct URL</label><input type="text" value={editAuction.sourceIdOrUrl || editAuction.imageUrl} onChange={(e) => setEditAuction({ ...editAuction, sourceIdOrUrl: editAuction.sourceType === 'embedded' ? '' : e.target.value, imageUrl: e.target.value })} className="input-clean" /></div>
                        <div className="field-group sm:col-span-5"><label className="field-label">Hashtags</label><input type="text" value={editAuction.tagsText} onChange={(e) => setEditAuction({ ...editAuction, tagsText: e.target.value })} className="input-clean" /></div>
                        <div className="sm:col-span-12 flex items-center justify-end gap-2 pt-1">
                          <button type="button" onClick={() => { setEditingAuctionId(null); setEditAuction(null); }} className="btn-arch py-2 px-3.5">CANCEL</button>
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

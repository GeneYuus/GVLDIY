// components/calendar/MonthFlyerCalendar.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { ShowCalendarEvent } from '@/types/archive';
import {
  sanitizeSafeHref,
  sanitizeScopedFlyerCss,
} from '@/lib/security/sanitize';

interface MonthFlyerCalendarProps {
  events: ShowCalendarEvent[];
  submissionEmail: string;
  initialMonthKey?: string;
  initialEventId?: string;
  onSelectionChange?: (monthKey: string, eventId: string | null) => void;
  onCopyShareLink?: (params: {
    tab: 'calendar';
    month: string;
    item: string;
    key: string;
  }) => void;
  copiedLinkKey?: string | null;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function isValidMonthKey(val: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(val);
}

function shiftYearMonth(monthKey: string, deltaMonths: number): string {
  const match = monthKey.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const baseYear = match ? Number(match[1]) : 2026;
  const baseMonthIdx = match ? Number(match[2]) - 1 : 10; // Nov fallback

  const shifted = new Date(Date.UTC(baseYear, baseMonthIdx + deltaMonths, 1));
  const clampedYear = Math.max(1970, Math.min(2099, shifted.getUTCFullYear()));
  const nextMonth = shifted.getUTCMonth() + 1;
  return `${String(clampedYear).padStart(4, '0')}-${String(nextMonth).padStart(
    2,
    '0'
  )}`;
}

function computeMonthMeta(monthKey: string): {
  shortLabel: string;
  longLabel: string;
  daysInMonth: number;
  startOffset: number;
} {
  const match = monthKey.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const year = match ? Number(match[1]) : 2026;
  const month = match ? Number(match[2]) : 11;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startOffset = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return {
    shortLabel: `${SHORT_MONTHS[month - 1]} ${year}`,
    longLabel: `${LONG_MONTHS[month - 1]} ${year}`,
    daysInMonth,
    startOffset,
  };
}

export default function MonthFlyerCalendar({
  events,
  submissionEmail,
  initialMonthKey,
  initialEventId,
  onSelectionChange,
  onCopyShareLink,
  copiedLinkKey,
}: MonthFlyerCalendarProps) {
  const scheduledMonths = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (isValidMonthKey(ev.monthKey)) {
        set.add(ev.monthKey);
      }
    }
    return Array.from(set).sort();
  }, [events]);

  const deepLinkedEvent = initialEventId
    ? events.find((e) => e.id === initialEventId)
    : undefined;

  const fallbackMonth = scheduledMonths[0] || '2026-11';
  const resolvedInitialMonth =
    (deepLinkedEvent && isValidMonthKey(deepLinkedEvent.monthKey)
      ? deepLinkedEvent.monthKey
      : undefined) ||
    (initialMonthKey && isValidMonthKey(initialMonthKey)
      ? initialMonthKey
      : undefined) ||
    fallbackMonth;

  const [calMonth, setCalMonth] = useState<string>(resolvedInitialMonth);
  const activeMonth = isValidMonthKey(calMonth) ? calMonth : fallbackMonth;

  const monthEvents = useMemo(
    () =>
      events
        .filter((e) => e.monthKey === activeMonth)
        .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.id.localeCompare(b.id)),
    [events, activeMonth]
  );

  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    deepLinkedEvent?.id || monthEvents[0]?.id || null
  );

  const { longLabel, daysInMonth, startOffset } = computeMonthMeta(activeMonth);

  const activeShow =
    monthEvents.find((e) => e.id === selectedEventId) || monthEvents[0] || null;

  const selectedDayShows = useMemo(
    () =>
      activeShow
        ? monthEvents.filter((e) => e.dayOfMonth === activeShow.dayOfMonth)
        : [],
    [monthEvents, activeShow]
  );

  const handleSwitchMonth = (nextMonthKey: string) => {
    if (!isValidMonthKey(nextMonthKey)) return;
    setCalMonth(nextMonthKey);
    const matching = events
      .filter((e) => e.monthKey === nextMonthKey)
      .sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.id.localeCompare(b.id));
    const nextId = matching[0]?.id || null;
    setSelectedEventId(nextId);
    onSelectionChange?.(nextMonthKey, nextId);
  };

  const handleSelectDayCell = (dayShows: ShowCalendarEvent[]) => {
    if (dayShows.length === 0) return;
    if (dayShows.length === 1) {
      const nextId = dayShows[0].id;
      setSelectedEventId(nextId);
      onSelectionChange?.(activeMonth, nextId);
      return;
    }
    const currentIdx = activeShow
      ? dayShows.findIndex((s) => s.id === activeShow.id)
      : -1;
    const nextId =
      currentIdx === -1
        ? dayShows[0].id
        : dayShows[(currentIdx + 1) % dayShows.length].id;
    setSelectedEventId(nextId);
    onSelectionChange?.(activeMonth, nextId);
  };

  const flyerClass = activeShow
    ? activeShow.flyerStyle === 'concrete-stencil'
      ? 'flyer-concrete-stencil'
      : activeShow.flyerStyle === 'riso-zine'
      ? 'flyer-riso-zine'
      : 'flyer-punk-xerox'
    : 'flyer-punk-xerox';

  const safeShowScopeId = activeShow
    ? `flyer-scope-${activeShow.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
    : '';

  const sanitizedFlyerCss = activeShow?.scopedCustomCss
    ? sanitizeScopedFlyerCss(activeShow.scopedCustomCss)
    : undefined;

  const safeSubmissionHref = sanitizeSafeHref(
    `mailto:${String(submissionEmail || '').trim()}?subject=DIY%20Show%20Flyer%20Submission`
  );

  const prevMonthKey = shiftYearMonth(activeMonth, -1);
  const nextMonthKey = shiftYearMonth(activeMonth, 1);

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-kicker">05 / 08 · Shows &amp; Concrete Workdays</div>
          <h2 className="sec-title">Calendar</h2>
        </div>
        {safeSubmissionHref ? (
          <a href={safeSubmissionHref} className="typo-action typo-action-accent">
            <span>+ Submit Show Flyer</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="typo-action opacity-50 cursor-not-allowed select-none"
          >
            + Submit Show Flyer
          </button>
        )}
      </div>

      {/* Unrestricted Any-Month / Any-Year Navigation Bar + Scheduled Show-Month Shortcuts */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="btn-arch tabular-nums"
            onClick={() => handleSwitchMonth(prevMonthKey)}
            aria-label={`Previous month (${computeMonthMeta(prevMonthKey).longLabel})`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="font-mono text-xs sm:text-sm font-bold text-[var(--ink-primary)] px-2 tabular-nums min-w-[138px] text-center">
            {longLabel}
          </span>

          <button
            type="button"
            className="btn-arch tabular-nums"
            onClick={() => handleSwitchMonth(nextMonthKey)}
            aria-label={`Next month (${computeMonthMeta(nextMonthKey).longLabel})`}
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {scheduledMonths.length > 0 && (
          <div className="inline-flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[var(--tracking-kicker)] text-[var(--ink-mono)]">
              Scheduled:
            </span>
            {scheduledMonths.map((m, idx) => {
              const { shortLabel } = computeMonthMeta(m);
              const isSelected = m === activeMonth;
              return (
                <React.Fragment key={m}>
                  {idx > 0 && (
                    <span
                      className="text-[var(--mute)] font-mono text-xs"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    className={`typo-action tabular-nums ${
                      isSelected ? 'active' : ''
                    }`}
                    onClick={() => handleSwitchMonth(m)}
                  >
                    {shortLabel}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div className="cal-wrap">
        <div className="cal-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => (
            <div key={w} className="cal-dow">
              {w}
            </div>
          ))}

          {Array.from({ length: startOffset }).map((_, b) => (
            <div key={`blank-${b}`} className="cal-cell opacity-35" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const d = idx + 1;
            const dayShows = monthEvents.filter((e) => e.dayOfMonth === d);
            const ev = dayShows[0];
            const isSel =
              activeShow && dayShows.some((s) => s.id === activeShow.id);
            const selectedInCell =
              (isSel && dayShows.find((s) => s.id === activeShow?.id)) || ev;
            return (
              <div
                key={`day-${d}`}
                className={`cal-cell tabular-nums ${ev ? 'has-show' : ''} ${
                  isSel ? 'selected-day' : ''
                }`}
                onClick={() => {
                  if (dayShows.length > 0) handleSelectDayCell(dayShows);
                }}
              >
                <div className={ev ? 'font-bold' : 'font-normal'}>{d}</div>
                {selectedInCell && (
                  <div className="show-pip">
                    {dayShows.length > 1
                      ? `${selectedInCell.venue} +${dayShows.length - 1}`
                      : selectedInCell.venue}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4px Mechanical Show Switcher Keys When 2+ Bills Share the Same Date */}
      {activeShow && selectedDayShows.length > 1 && (
        <div
          className="mt-4 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={`Shows scheduled on ${activeShow.isoDate}`}
        >
          <span className="font-mono text-[11px] uppercase tracking-[var(--tracking-kicker)] text-[var(--ink-mono)] tabular-nums mr-1">
            {activeShow.isoDate} ({selectedDayShows.length} Shows):
          </span>
          {selectedDayShows.map((showItem, sIdx) => {
            const isCurrentShow = showItem.id === activeShow.id;
            return (
              <button
                key={showItem.id}
                type="button"
                aria-pressed={isCurrentShow}
                onClick={() => {
                  setSelectedEventId(showItem.id);
                  onSelectionChange?.(activeMonth, showItem.id);
                }}
                className={`btn-arch tabular-nums ${
                  isCurrentShow ? 'active' : ''
                }`}
              >
                <span>
                  {String(sIdx + 1).padStart(2, '0')} ·{' '}
                  {showItem.venue.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {activeShow ? (
        <div
          id={safeShowScopeId}
          className={`flyer-unfurl ${flyerClass}`}
          key={activeShow.id}
        >
          {sanitizedFlyerCss && safeShowScopeId && (
            <style>{`#${safeShowScopeId} { ${sanitizedFlyerCss} }`}</style>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-90 border-b border-dashed border-current pb-2.5 mb-3 tabular-nums">
            <span>{activeShow.isoDate}</span>
            <div className="inline-flex flex-wrap items-center gap-2.5">
              <span>{activeShow.doorsInfo}</span>
              {onCopyShareLink && (
                <button
                  type="button"
                  onClick={() =>
                    onCopyShareLink({
                      tab: 'calendar',
                      month: activeMonth,
                      item: activeShow.id,
                      key: `cal:${activeShow.id}`,
                    })
                  }
                  className={`btn-arch !py-1 !px-2.5 !text-[10.5px] font-mono tabular-nums whitespace-nowrap ${
                    copiedLinkKey === `cal:${activeShow.id}` ? 'active' : ''
                  }`}
                >
                  {copiedLinkKey === `cal:${activeShow.id}`
                    ? '[ COPIED ]'
                    : '[ COPY LINK ]'}
                </button>
              )}
            </div>
          </div>
          <h3 className="flyer-title mb-2 text-lg sm:text-xl">
            {activeShow.title}
          </h3>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold mb-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{activeShow.venue}</span>
          </div>
          <div className="text-xs opacity-90 leading-relaxed">
            {activeShow.flyerHeadlineNote}
          </div>
          {activeShow.tags && activeShow.tags.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-dashed border-current/25 font-mono text-[11px] opacity-80">
              {activeShow.tags.join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 p-5 border border-dashed border-[var(--grid-hairline-strong)] bg-[var(--plate-surface)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xs font-semibold text-[var(--ink-primary)] tabular-nums">
              No DIY flyers archived for {longLabel} yet
            </div>
            <p className="m-0 mt-1 text-xs text-[var(--ink-2)]">
              Booking a floor show, benefit gig, or concrete pour workday in {longLabel}? Send the flyer to list it on the public grid.
            </p>
          </div>
          {safeSubmissionHref && (
            <a href={safeSubmissionHref} className="btn-arch">
              <span>Send {longLabel} Flyer</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

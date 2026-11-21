// components/calendar/MonthFlyerCalendar.tsx
'use client';

import React, { useState } from 'react';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { ShowCalendarEvent } from '@/types/archive';

interface MonthFlyerCalendarProps {
  events: ShowCalendarEvent[];
  submissionEmail: string;
}

export default function MonthFlyerCalendar({
  events,
  submissionEmail,
}: MonthFlyerCalendarProps) {
  const [calMonth, setCalMonth] = useState<'2026-11' | '2026-12'>('2026-11');
  const monthEvents = events.filter((e) => e.monthKey === calMonth);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    monthEvents[0]?.id || null
  );

  const isNov = calMonth === '2026-11';
  const daysInMonth = isNov ? 30 : 31;
  const startOffset = isNov ? 0 : 2;
  const monthLabel = isNov ? 'November 2026' : 'December 2026';

  const activeShow =
    monthEvents.find((e) => e.id === selectedEventId) || monthEvents[0] || null;

  const handleSwitchMonth = (m: '2026-11' | '2026-12') => {
    setCalMonth(m);
    const firstInMonth = events.find((e) => e.monthKey === m);
    setSelectedEventId(firstInMonth ? firstInMonth.id : null);
  };

  const flyerClass = activeShow
    ? activeShow.flyerStyle === 'concrete-stencil'
      ? 'flyer-concrete-stencil'
      : activeShow.flyerStyle === 'riso-zine'
      ? 'flyer-riso-zine'
      : 'flyer-punk-xerox'
    : 'flyer-punk-xerox';

  return (
    <div>
      <div className="sec-head">
        <div>
          <div className="sec-kicker">05 / 08 · Shows &amp; Concrete Workdays</div>
          <h2 className="sec-title">Calendar</h2>
        </div>
        <a
          href={`mailto:${submissionEmail}?subject=DIY%20Show%20Flyer%20Submission`}
          className="typo-action typo-action-accent"
        >
          <span>+ Submit Show Flyer</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-4">
          <button
            type="button"
            aria-pressed={isNov}
            className={`typo-action tabular-nums ${isNov ? 'active' : ''}`}
            onClick={() => handleSwitchMonth('2026-11')}
          >
            Nov 2026
          </button>
          <span className="text-[var(--mute)] font-mono text-xs" aria-hidden="true">
            /
          </span>
          <button
            type="button"
            aria-pressed={!isNov}
            className={`typo-action tabular-nums ${!isNov ? 'active' : ''}`}
            onClick={() => handleSwitchMonth('2026-12')}
          >
            Dec 2026
          </button>
        </div>
        <span className="font-mono text-xs font-bold text-[var(--ink-2)] tabular-nums">
          {monthLabel}
        </span>
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
            const ev = monthEvents.find((e) => e.dayOfMonth === d);
            const isSel = activeShow && ev && activeShow.id === ev.id;
            return (
              <div
                key={`day-${d}`}
                className={`cal-cell tabular-nums ${ev ? 'has-show' : ''} ${
                  isSel ? 'selected-day' : ''
                }`}
                onClick={() => {
                  if (ev) setSelectedEventId(ev.id);
                }}
              >
                <div className={ev ? 'font-bold' : 'font-normal'}>{d}</div>
                {ev && <div className="show-pip">{ev.venue}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {activeShow && (
        <div className={`flyer-unfurl ${flyerClass}`} key={activeShow.id}>
          <div className="flex flex-wrap justify-between gap-2 text-xs opacity-85 border-b border-dashed border-current pb-2 mb-3 tabular-nums">
            <span>{activeShow.isoDate}</span>
            <span>{activeShow.doorsInfo}</span>
          </div>
          <h3 className="m-0 mb-2 text-xl font-bold tracking-tight">
            {activeShow.title}
          </h3>
          <div className="inline-flex items-center gap-1.5 text-sm font-semibold mb-2">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span>{activeShow.venue}</span>
          </div>
          <div className="text-xs opacity-90 leading-relaxed">
            {activeShow.flyerHeadlineNote}
          </div>
        </div>
      )}
    </div>
  );
}

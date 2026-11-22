// lib/puck/puck.config.tsx
import React from 'react';
import type { Config, Slot } from '@puckeditor/core';
import { ArrowUpRight } from 'lucide-react';
import { MediaSourceType } from '@/types/archive';
import { resolveMediaUrl } from '@/lib/media/resolveMediaUrl';
import { sanitizeSafeHref } from '@/lib/security/sanitize';

export type ArchivePuckProps = {
  LiquidGlassBanner: {
    eyebrow: string;
    headline: string;
    description: string;
    ctaLabel: string;
    ctaUrl: string;
    accentStyle: 'neutral' | 'sienna' | 'sage' | 'ice';
  };
  ArchivalMediaCard: {
    kicker: string;
    heading: string;
    body: string;
    sourceType: MediaSourceType;
    mediaSource: string;
    aspectRatio: '16:9' | '4:3' | '3:2';
    paddingPreset: 'cozy' | 'stage';
  };
  MixedMediaFlyerBlock: {
    headerMeta: string;
    lineupTitle: string;
    venue: string;
    flyerStyle: 'punk-xerox' | 'concrete-stencil' | 'riso-zine';
    notes: string;
  };
  MemorialSpotlightBlock: {
    spotName: string;
    activeYears: string;
    neighborhood: string;
    sourceType: MediaSourceType;
    photoSource: string;
    tributeBody: string;
  };
  TwoColumnLayout: {
    gap: '16px' | '20px' | '24px';
    leftColumn: Slot;
    rightColumn: Slot;
  };
  SandboxedHtmlZineBlock: {
    title: string;
    heightPx: number;
    rawHtml: string;
  };
};

const ACCENT_HEX: Record<
  ArchivePuckProps['LiquidGlassBanner']['accentStyle'],
  { text: string; border: string; cta: string }
> = {
  neutral: {
    text: 'var(--accent)',
    border: 'var(--glass-border-strong)',
    cta: 'var(--cta-bright)',
  },
  sienna: {
    text: '#D95D18',
    border: 'rgba(217, 93, 24, 0.34)',
    cta: '#FF5900',
  },
  sage: {
    text: '#1B8057',
    border: 'rgba(27, 128, 87, 0.34)',
    cta: '#149A62',
  },
  ice: {
    text: '#1A5FB4',
    border: 'rgba(26, 95, 180, 0.34)',
    cta: '#1E6FD9',
  },
};

export const puckConfig: Config<ArchivePuckProps> = {
  categories: {
    banners: {
      title: 'Banners & Callouts',
      components: ['LiquidGlassBanner'],
    },
    media: {
      title: 'Archival Media & Flyers',
      components: ['ArchivalMediaCard', 'MixedMediaFlyerBlock'],
    },
    editorial: {
      title: 'Memorials & Sandboxed Zines',
      components: ['MemorialSpotlightBlock', 'SandboxedHtmlZineBlock'],
    },
    layout: {
      title: 'Multi-Column Slots',
      components: ['TwoColumnLayout'],
    },
  },
  components: {
    LiquidGlassBanner: {
      label: 'Frosted Editorial Banner',
      defaultProps: {
        eyebrow: 'CURATOR DISPATCH',
        headline: 'Poe Mill Concrete Zine: 15 Years of Skater-Poured Transitions',
        description:
          'Field notes, 35mm contact sheets, and mix workdays from Greenville’s longest-running DIY concrete foundation.',
        ctaLabel: 'Read Full Zine',
        ctaUrl: '/p/poe-mill-concrete-history',
        accentStyle: 'sienna',
      },
      fields: {
        eyebrow: { type: 'text', label: 'Kicker Line' },
        headline: { type: 'text', label: 'Headline' },
        description: { type: 'textarea', label: 'Concise Description' },
        ctaLabel: { type: 'text', label: 'CTA Button Label (Optional)' },
        ctaUrl: { type: 'text', label: 'CTA Link URL (e.g. /p/slug)' },
        accentStyle: {
          type: 'select',
          label: 'Accent Tone',
          options: [
            { label: 'Theme Default', value: 'neutral' },
            { label: 'Fall Sienna', value: 'sienna' },
            { label: 'Spring Sage', value: 'sage' },
            { label: 'Winter Ice', value: 'ice' },
          ],
        },
      },
      render: ({
        eyebrow,
        headline,
        description,
        ctaLabel,
        ctaUrl,
        accentStyle,
      }) => {
        const tone = ACCENT_HEX[accentStyle] || ACCENT_HEX.neutral;
        const safeHref = ctaUrl ? sanitizeSafeHref(ctaUrl) : null;
        const isExternalHttp =
          safeHref !== null && /^https?:\/\//i.test(safeHref);

        return (
          <section
            className="glass-panel p-5 sm:p-6 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            style={{ borderColor: tone.border }}
          >
            <div className="min-w-0 max-w-2xl">
              {eyebrow && (
                <div
                  className="font-mono text-[11px] font-semibold tracking-wide mb-1"
                  style={{ color: tone.text }}
                >
                  {eyebrow}
                </div>
              )}
              <h3 className="m-0 text-base sm:text-lg font-bold tracking-tight text-balance">
                {headline}
              </h3>
              {description && (
                <p className="mt-1.5 mb-0 text-sm text-[var(--ink-2)] leading-relaxed">
                  {description}
                </p>
              )}
            </div>

            {ctaLabel && safeHref ? (
              <a
                href={safeHref}
                target={isExternalHttp ? '_blank' : undefined}
                rel={isExternalHttp ? 'noopener noreferrer' : undefined}
                className="btn-arch shrink-0 self-start sm:self-center text-white border-transparent"
                style={{ backgroundColor: tone.cta }}
              >
                <span>{ctaLabel}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            ) : ctaLabel && ctaUrl ? (
              <button
                type="button"
                disabled
                className="btn-arch shrink-0 self-start sm:self-center opacity-50 cursor-not-allowed select-none"
              >
                <span>{ctaLabel}</span>
              </button>
            ) : null}
          </section>
        );
      },
    },

    ArchivalMediaCard: {
      label: 'Archival Media Card',
      defaultProps: {
        kicker: 'Poe Mill · 35mm Scan',
        heading: 'Bag-Mixed Quarter Pipe Pour Before Dusk',
        body: 'Quick-set buckets, wheelbarrows, and generator worklights along the West Greenville slab.',
        sourceType: 'gdrive',
        mediaSource: '1PoeMillConcreteScan2025',
        aspectRatio: '16:9',
        paddingPreset: 'cozy',
      },
      fields: {
        kicker: { type: 'text', label: 'Metadata Kicker' },
        heading: { type: 'text', label: 'Card Heading' },
        body: { type: 'textarea', label: 'Body Copy' },
        sourceType: {
          type: 'select',
          label: 'Media Provider',
          options: [
            { label: 'Google Drive File ID / Link', value: 'gdrive' },
            { label: 'Cloudflare R2 / Direct URL', value: 'r2' },
            { label: 'Embedded Data / Local Path', value: 'embedded' },
          ],
        },
        mediaSource: {
          type: 'text',
          label: 'Google Drive File ID/Link or Image URL',
        },
        aspectRatio: {
          type: 'radio',
          label: 'Aspect Ratio',
          options: [
            { label: '16:9', value: '16:9' },
            { label: '4:3', value: '4:3' },
            { label: '3:2', value: '3:2' },
          ],
        },
        paddingPreset: {
          type: 'radio',
          label: 'Body Padding',
          options: [
            { label: 'Cozy (15px 18px)', value: 'cozy' },
            { label: 'Stage (24px)', value: 'stage' },
          ],
        },
      },
      render: ({
        kicker,
        heading,
        body,
        sourceType,
        mediaSource,
        aspectRatio,
        paddingPreset,
      }) => {
        const resolvedSrc = resolveMediaUrl(sourceType, mediaSource, '');
        const ratioClass =
          aspectRatio === '4:3'
            ? 'aspect-[4/3]'
            : aspectRatio === '3:2'
            ? 'aspect-[3/2]'
            : 'aspect-video';
        const padClass = paddingPreset === 'stage' ? 'p-6' : 'px-[18px] py-[15px]';

        return (
          <article className="puck-plate-frame mb-5">
            <div>
              <div
                className={`w-full ${ratioClass} bg-[#11151D] border-b border-[var(--grid-hairline)] overflow-hidden flex items-center justify-center`}
              >
                {resolvedSrc ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={resolvedSrc}
                    alt={heading || 'Archival plate'}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-full object-cover block"
                  />
                ) : (
                  <span className="font-mono text-xs text-slate-400 px-4 text-center">
                    {heading || 'Archival Media Plate'}
                  </span>
                )}
              </div>
              <div className={padClass}>
                {kicker && (
                  <div className="font-mono text-xs text-[var(--mute)] mb-1">
                    {kicker}
                  </div>
                )}
                <h3 className="m-0 text-base font-bold tracking-tight">
                  {heading}
                </h3>
                {body && (
                  <p className="mt-1.5 mb-0 text-sm text-[var(--ink-2)] leading-relaxed">
                    {body}
                  </p>
                )}
              </div>
            </div>
          </article>
        );
      },
    },

    MixedMediaFlyerBlock: {
      label: 'Mixed-Media Show Flyer',
      defaultProps: {
        headerMeta: 'FRI NOV 21 · DOORS 7:30 PM · $8 PWYC',
        lineupTitle: 'ROCCO AND HIS BONES / CURLY BLUE / VERNON TAPE PREMIERE',
        venue: 'The Barn · Greenville, SC',
        flyerStyle: 'punk-xerox',
        notes: 'Respect neighbors on Poinsett · All ages · Bring quick-set bags for Sunday patch day.',
      },
      fields: {
        headerMeta: { type: 'text', label: 'Date · Doors · Cover Line' },
        lineupTitle: { type: 'text', label: 'Lineup Headline' },
        venue: { type: 'text', label: 'Venue / Location' },
        flyerStyle: {
          type: 'select',
          label: 'Flyer Print Aesthetic',
          options: [
            { label: 'Punk Xerox (High-Contrast Ink)', value: 'punk-xerox' },
            { label: 'Concrete Stencil (Dashed Slab)', value: 'concrete-stencil' },
            { label: 'Riso Zine (Warm Paper & Soy Red)', value: 'riso-zine' },
          ],
        },
        notes: { type: 'textarea', label: 'Show & Etiquette Notes' },
      },
      render: ({ headerMeta, lineupTitle, venue, flyerStyle, notes }) => {
        const presetCls =
          flyerStyle === 'concrete-stencil'
            ? 'flyer-concrete-stencil'
            : flyerStyle === 'riso-zine'
            ? 'flyer-riso-zine'
            : 'flyer-punk-xerox';

        return (
          <div className={`${presetCls} mb-5`}>
            <div className="font-mono text-xs opacity-80 tabular-nums mb-1.5">
              {headerMeta}
            </div>
            <h3 className="m-0 text-lg sm:text-xl font-bold tracking-tight text-balance">
              {lineupTitle}
            </h3>
            <div className="font-mono text-xs font-semibold mt-1 opacity-90">
              {venue}
            </div>
            {notes && (
              <p className="mt-3 mb-0 text-sm leading-relaxed opacity-90">
                {notes}
              </p>
            )}
          </div>
        );
      },
    },

    MemorialSpotlightBlock: {
      label: 'Memorial Venue Spotlight',
      defaultProps: {
        spotName: 'Original West Greenville Mill Slab',
        activeYears: '2011 – 2016',
        neighborhood: 'Poe Mill · West Greenville, SC',
        sourceType: 'gdrive',
        photoSource: '1PoeMillEarlyFoundation2012',
        tributeBody:
          'Before municipal park budgets existed in the Upstate, local skaters hauled water jugs and 80-lb concrete bags onto cracked mill brick to shape the first DIY quarter-pipe.',
      },
      fields: {
        spotName: { type: 'text', label: 'Venue or Skate Spot Name' },
        activeYears: { type: 'text', label: 'Active Years / Closed Date' },
        neighborhood: { type: 'text', label: 'Neighborhood / City' },
        sourceType: {
          type: 'select',
          label: 'Photo Provider',
          options: [
            { label: 'Google Drive File ID / Link', value: 'gdrive' },
            { label: 'Cloudflare R2 / Direct URL', value: 'r2' },
            { label: 'Embedded Data / Local Path', value: 'embedded' },
          ],
        },
        photoSource: { type: 'text', label: 'Photo File ID or URL' },
        tributeBody: { type: 'textarea', label: 'Tribute Narrative' },
      },
      render: ({
        spotName,
        activeYears,
        neighborhood,
        sourceType,
        photoSource,
        tributeBody,
      }) => {
        const resolvedImg = resolveMediaUrl(sourceType, photoSource, '');
        return (
          <article className="memorial-block memorial-block-standalone mb-5">
            <div className="bg-[#11151D] min-h-[188px] flex items-center justify-center overflow-hidden">
              {resolvedImg ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={resolvedImg}
                  alt={spotName}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="memorial-img"
                />
              ) : (
                <span className="font-mono text-xs text-slate-400 px-4 text-center">
                  {spotName}
                </span>
              )}
            </div>
            <div className="memorial-body">
              <div className="font-mono text-xs text-[var(--mute)] tabular-nums">
                {activeYears} · {neighborhood}
              </div>
              <h3 className="m-0 text-lg font-bold tracking-tight">
                {spotName}
              </h3>
              <p className="m-0 text-sm text-[var(--ink-2)] leading-relaxed">
                {tributeBody}
              </p>
            </div>
          </article>
        );
      },
    },

    TwoColumnLayout: {
      label: 'Two-Column Slot Layout',
      defaultProps: {
        gap: '20px',
        leftColumn: [],
        rightColumn: [],
      },
      fields: {
        gap: {
          type: 'select',
          label: 'Column Gutter',
          options: [
            { label: '16px Compact', value: '16px' },
            { label: '20px Balanced', value: '20px' },
            { label: '24px Wide', value: '24px' },
          ],
        },
        leftColumn: {
          type: 'slot',
          label: 'Left Column',
          disallow: ['TwoColumnLayout'],
        },
        rightColumn: {
          type: 'slot',
          label: 'Right Column',
          disallow: ['TwoColumnLayout'],
        },
      },
      render: ({ gap, leftColumn: LeftColumn, rightColumn: RightColumn }) => {
        return (
          <div
            className="grid grid-cols-1 md:grid-cols-2 items-start mb-5"
            style={{ gap: gap || '20px' }}
          >
            <div className="min-w-0">
              <LeftColumn />
            </div>
            <div className="min-w-0">
              <RightColumn />
            </div>
          </div>
        );
      },
    },

    SandboxedHtmlZineBlock: {
      label: 'Sandboxed HTML Zine Frame',
      defaultProps: {
        title: 'Custom Zine Flyer Insert',
        heightPx: 210,
        rawHtml: `<!doctype html>
<html>
<head>
<style>
  body {
    margin: 0;
    padding: 20px 22px;
    background: #12151c;
    color: #f4f1e8;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .kicker { color: #ff5900; font-size: 11px; font-weight: 700; letter-spacing: 0.06em; }
  h2 { margin: 6px 0 8px; font-size: 18px; letter-spacing: -0.02em; }
  p { margin: 0; font-size: 13px; line-height: 1.5; color: #cbd5e1; }
</style>
</head>
<body>
  <div class="kicker">WORKDAY BULLETIN · SANDBOXED ZINE</div>
  <h2>Bring 80-lb Quikrete, Trowels &amp; Push Brooms — Sunday 10:00 AM</h2>
  <p>Zero scripts or external stylesheets escape this isolated zine frame. Curators can paste exported hand-coded flyers safely.</p>
</body>
</html>`,
      },
      fields: {
        title: { type: 'text', label: 'Frame Title (Accessibility)' },
        heightPx: {
          type: 'number',
          label: 'Frame Height (px)',
          min: 120,
          max: 1200,
        },
        rawHtml: {
          type: 'textarea',
          label: 'Isolated HTML / CSS Markup',
        },
      },
      render: ({ title, heightPx, rawHtml }) => {
        const safeHeight = Math.max(120, Math.min(1200, Number(heightPx) || 210));
        return (
          <div className="mb-5 border border-[var(--grid-hairline-strong)] overflow-hidden bg-[#12151C]">
            <iframe
              title={title || 'Sandboxed HTML Zine'}
              sandbox=""
              srcDoc={rawHtml}
              style={{ height: `${safeHeight}px` }}
              className="w-full border-none block"
            />
          </div>
        );
      },
    },
  },
};

import { WidgetCard, type IndexReading } from '@/components/widget-card';
import { seasonLabel, shortDate } from '@/lib/enso';
import { getEnsoStatus } from '@/lib/data/status';
import { getRoni, latestRoni } from '@/lib/data/roni';
import { BOM_RNINO_EL_NINO_THRESHOLD, getBomRnino, latestBomRnino } from '@/lib/data/bom-rnino';
import { site } from '@/lib/site';

export const revalidate = 3600;

export const metadata = {
  title: `${site.name} widget`,
  robots: { index: false, follow: false },
};

/**
 * The embeddable widget (iframe target, frameable by any origin — see
 * next.config.mjs). Compact status card: CPC's Alert System status, live value
 * and verdict, gauge and the mandatory "Powered by" backlink. `?theme=dark`
 * forces dark mode.
 *
 * Carries the same THREE numbers as the elninolive.com dashboard: the
 * conventional weekly reading, seasonal RONI (the official classification) and
 * the weekly relative reading (BOM) — third-party embeds must not tell a
 * different story than the site itself, since already-embedded copies can't be
 * retro-fixed.
 *
 * The three readings are tabs, in that order; the panel shows the selected one
 * in full and the gauge follows it with that index's own threshold
 * (components/widget-card.tsx). It opens on the conventional index, the one the
 * gauge has always shown.
 *
 * Constraints this layout is built around:
 *   1. The published snippet hardcodes height=230 — already-embedded copies
 *      cannot be resized, so everything has to fit the existing 360×230 box.
 *      The gauge renders 1:1 at its natural 168px width.
 *   2. The intensity word ("very strong") describes the CONVENTIONAL index and
 *      is shown only when that index is selected, never for RONI: RONI +0.5 =
 *      "very strong" would be methodologically wrong. For the same reason only
 *      the conventional index gets the intensity gauge; BoM's relative index
 *      and RONI get a threshold-only gauge, since neither agency classifies
 *      them as weak/moderate/strong. The four-week direction is likewise
 *      computed from the conventional weekly series and shown only with it.
 */
/**
 * RdBu colour for CPC's Alert System status: the full red/blue for an Advisory
 * (an event under way), the medium ones for a Watch (one favoured); "Not Active"
 * gets none. Pulled 35% towards the ink below, like the gauge verdict, so the
 * full red reads on the dark theme too.
 */
function advisoryColor(status: string): string | undefined {
  const cold = /ni[ñn]a/i.test(status);
  if (/advisory/i.test(status)) return cold ? '#2166AC' : '#B2182B';
  if (/watch/i.test(status)) return cold ? '#4393C3' : '#D6604D';
  return undefined;
}

export default async function WidgetEmbedPage(
  props: {
    searchParams: Promise<{ theme?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const [status, roni, bom] = await Promise.all([getEnsoStatus(), getRoni(), getBomRnino()]);
  const s = status.data;
  const r = latestRoni(roni.data);
  const b = latestBomRnino(bom.data);
  const dark = searchParams.theme === 'dark';

  const readings: IndexReading[] = [
    // Conventional weekly — the only index with NOAA's intensity bands.
    {
      key: 'nino34',
      name: 'NOAA Niño 3.4 conventional',
      caption: 'NOAA Niño 3.4',
      value: s.nino34Anom,
      period: `week of ${shortDate(s.weekCentered)}`,
      threshold: 0.5,
      mode: 'intensity',
      direction: s.direction,
    },
    // Seasonal RONI — the official classification value.
    {
      key: 'roni',
      name: 'NOAA RONI',
      caption: 'NOAA RONI',
      value: r.value,
      period: seasonLabel(r.season, r.year),
      threshold: 0.5,
      mode: 'threshold',
    },
    // Weekly relative — the live like-with-like signal.
    {
      key: 'bom',
      name: 'BOM relative Niño 3.4',
      caption: 'BOM relative Niño 3.4',
      value: b.value,
      period: `week to ${shortDate(b.weekEnd)}`,
      threshold: BOM_RNINO_EL_NINO_THRESHOLD,
      mode: 'threshold',
    },
  ];

  return (
    // Both themes are FORCED: `.dark` scopes the dark tokens, `.theme-light`
    // re-scopes the light ones. The embedder's choice (?theme=dark or not)
    // decides, never the end visitor's OS preference.
    <div className={dark ? 'dark' : 'theme-light'}>
      <div className="flex min-h-screen items-stretch bg-bg p-3 text-ink">
        <div className="flex w-full flex-col">
          {/* Card-level, above the tabs: CPC's judgement, not a reading of any one index. */}
          <p className="mb-1 text-[10px] font-semibold leading-tight text-ink-muted">
            ENSO Alert System Status:{' '}
            <span
              style={{
                color: advisoryColor(s.advisory)
                  ? `color-mix(in srgb, ${advisoryColor(s.advisory)} 65%, rgb(var(--c-ink)))`
                  : undefined,
              }}
            >
              {s.advisory}
            </span>
          </p>
          <WidgetCard readings={readings} initialKey="nino34">
            <a
              href={`${site.url}/`}
              target="_blank"
              rel="noopener"
              className="text-[10px] font-medium text-ink-muted underline decoration-line underline-offset-2 hover:text-ink"
            >
              {site.widgetAttribution} → live dashboard
            </a>
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}

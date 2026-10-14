'use client';

import { useState, type ReactNode } from 'react';
import { CountUp } from '@/components/count-up';
import { Gauge } from '@/components/gauge';
import { verdictFor, type GaugeMode } from '@/lib/enso';
import type { Direction } from '@/lib/data/types';

/** One of the three headline readings, with everything the gauge needs to show it. */
export interface IndexReading {
  key: string;
  /** Agency + index, e.g. "BOM relative Niño 3.4". */
  name: string;
  /** Short form for the tab and the gauge's accessible name, e.g. "NOAA RONI". */
  caption: string;
  value: number;
  /** What the reading covers: "week to 11 Oct", "Jul–Sep 2026". */
  period: string;
  /** The agency's own El Niño threshold for THIS index (La Niña is its mirror), °C. */
  threshold: number;
  mode: GaugeMode;
  /** Four-week trend, where the index has one (the conventional weekly reading). */
  direction?: Direction;
}

/**
 * The card body: a tab per reading, then the selected reading large on the
 * left — value, verdict, what it is — and its gauge, with that index's own mode
 * and threshold, on the right; the footer (the backlink) spans the bottom.
 * Every value is server-rendered, so the card reads correctly before hydration;
 * only switching tabs needs JavaScript.
 */
export function WidgetCard({
  readings,
  initialKey,
  children,
}: {
  readings: IndexReading[];
  initialKey: string;
  /** Footer of the card (the mandatory backlink). */
  children?: ReactNode;
}) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selected = readings.find((r) => r.key === selectedKey) ?? readings[0];
  const verdict = verdictFor(selected.value, selected.mode, selected.threshold);
  const verdictColor = `color-mix(in srgb, ${verdict.color} 65%, rgb(var(--c-ink)))`;
  const tabId = (key: string) => `index-tab-${key}`;

  // Arrow keys move between tabs, as a tablist is expected to do.
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = readings[(i + step + readings.length) % readings.length];
    setSelectedKey(next.key);
    document.getElementById(tabId(next.key))?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label="Index shown on the gauge" className="flex gap-1 border-b border-line">
        {readings.map((r, i) => {
          const isSelected = r.key === selected.key;
          return (
            <button
              key={r.key}
              id={tabId(r.key)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls="index-panel"
              tabIndex={isSelected ? 0 : -1}
              onClick={() => setSelectedKey(r.key)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px whitespace-nowrap rounded-t-md border-b-2 px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                isSelected
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-muted hover:bg-surface2/60 hover:text-ink'
              }`}
            >
              {r.caption}
            </button>
          );
        })}
      </div>

      <div
        id="index-panel"
        role="tabpanel"
        aria-labelledby={tabId(selected.key)}
        className="mt-1 flex flex-1 items-start justify-between gap-2"
      >
        <div className="min-w-0 flex-1">
          {/* The value and its verdict take the colour of the ring sector the needle
              lands in, pulled 35% towards the ink so the pale RdBu bands still read
              on the background. key= remounts the count-up so it runs again for the
              newly selected reading. */}
          <p className="tnum mt-1 text-[26px] font-semibold leading-none" style={{ color: verdictColor }}>
            <CountUp
              key={selected.key}
              value={selected.value}
              decimals={1}
              prefix={selected.value > 0 ? '+' : ''}
              suffix="°C"
            />
          </p>
          <p className="mt-1.5 text-[11px] font-semibold leading-tight" style={{ color: verdictColor }}>
            {verdict.words}
          </p>
          {selected.direction && selected.direction !== 'steady' ? (
            <p className="text-[11px] font-semibold leading-tight text-ink-muted">{selected.direction}</p>
          ) : null}
          <p className="mt-1 text-[9px] leading-tight text-ink-faint">
            {selected.name}
            <br />
            {selected.period}
          </p>
        </div>
        <Gauge
          value={selected.value}
          mode={selected.mode}
          threshold={selected.threshold}
          caption={selected.caption}
        />
      </div>

      <div className="mt-auto">{children}</div>
    </div>
  );
}

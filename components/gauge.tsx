'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAnom, gaugeMax, gaugeSectorsFor, verdictFor, type GaugeMode } from '@/lib/enso';

/**
 * Geometry, in SVG user units. The SVG is rendered 1:1 (the wrapper is exactly
 * WIDTH px wide), so a unit here is a CSS pixel and the 9px labels stay 9px.
 */
const R_OUTER = 70;
const R_INNER = 58; // a thin ring
/** Half-sweep of the arc: the scale runs from −SWEEP (left) to +SWEEP (right) of
 *  straight up — a half wheel, its ends level with the hub. */
const SWEEP = 90;
const TICK_R = R_OUTER + 4; // the ticks run from the ring out to here
const NUMERAL_R = TICK_R + 5; // centre line of the 5pt numerals, which run along the ring
/** Baseline of the phase labels, inside the ring: their glyphs rise outwards from
 *  here (9px, cap height ~6.5px) and stop a few px short of the arrow above them. */
const PHASE_R = R_INNER - 16;
const SIDE_ROOM = 14; // outside the ring: the numerals' height
const TOP_ROOM = 14;
const CX = R_OUTER + SIDE_ROOM;
const CY = R_OUTER + TOP_ROOM;
const HUB_R = 8;
/** The needle stops short of the phase labels' baseline. */
const NEEDLE_LEN = PHASE_R - 5;
const GAUGE_WIDTH = 2 * CX;
// Lowest point: the lower half of the end numerals ("−3.5°C" runs vertically there).
const GAUGE_HEIGHT = CY + 16;

interface GaugeProps {
  value: number;
  mode: GaugeMode;
  /** El Niño threshold (La Niña is its mirror), °C. Drawn as a sector edge in
   *  threshold mode; in intensity mode the bands fix it at 0.5. */
  threshold: number;
  /** Which index the needle shows, for the accessible name, e.g. "NOAA Niño 3.4". */
  caption: string;
}

/** Angle (degrees from straight up, negative = left/La Niña) for `value` on a
 *  -max…+max scale. Clamped only as a last guard — gaugeMax keeps the reading
 *  inside the scale, and an off-scale reading is flagged, never hidden. */
function angleFor(value: number, max: number): number {
  const v = Math.min(max, Math.max(-max, value));
  return (v / max) * SWEEP;
}

function point(angleDeg: number, radius: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + radius * Math.cos(rad), CY + radius * Math.sin(rad)];
}

const f = (n: number) => n.toFixed(2);

/** Closed annular sector between two angles, from R_INNER out to R_OUTER. */
function sectorPath(from: number, to: number): string {
  const [ox1, oy1] = point(from, R_OUTER);
  const [ox2, oy2] = point(to, R_OUTER);
  const [ix1, iy1] = point(from, R_INNER);
  const [ix2, iy2] = point(to, R_INNER);
  const large = to - from > 180 ? 1 : 0;
  return [
    `M ${f(ox1)} ${f(oy1)}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${f(ox2)} ${f(oy2)}`,
    `L ${f(ix2)} ${f(iy2)}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${f(ix1)} ${f(iy1)}`,
    'Z',
  ].join(' ');
}

/** Open arc from −SWEEP to +SWEEP at PHASE_R, clockwise, concentric with the ring,
 *  for the curved phase labels. A point at `angle` sits at offset
 *  (angle + SWEEP) / (2·SWEEP) along it. */
function phaseArcPath(): string {
  const [x1, y1] = point(-SWEEP, PHASE_R);
  const [x2, y2] = point(SWEEP, PHASE_R);
  return `M ${f(x1)} ${f(y1)} A ${PHASE_R} ${PHASE_R} 0 1 1 ${f(x2)} ${f(y2)}`;
}

const arcOffset = (angle: number) => `${(((angle + SWEEP) / (2 * SWEEP)) * 100).toFixed(2)}%`;

/** Degrees of arc that `length` px cover at radius `r`. */
const degreesAt = (length: number, r: number) => (length / r) * (180 / Math.PI);

/** The arrows run just inside the ring, along its slices, above the labels. */
const ARROW_R = R_INNER - 6;
/** How far an arrow runs past the end of its word: about 1.5 em of the 9px label. */
const ARROW_OVERSHOOT = 13;
/** Stem weight of regular Inter at 9px, so the arrow reads as part of the label. */
const ARROW_STROKE = 0.9;

/** Arc of `lengthPx` at ARROW_R from `fromAngle`, `dir` −1 anticlockwise
 *  (La Niña) or +1 clockwise (El Niño). The arrowhead marker sits at its end. */
function arrowPath(fromAngle: number, dir: -1 | 1, lengthPx: number): string {
  const toAngle = fromAngle + dir * degreesAt(lengthPx, ARROW_R);
  const [x1, y1] = point(fromAngle, ARROW_R);
  const [x2, y2] = point(toAngle, ARROW_R);
  return `M ${f(x1)} ${f(y1)} A ${ARROW_R} ${ARROW_R} 0 0 ${dir === 1 ? 1 : 0} ${f(x2)} ${f(y2)}`;
}

/**
 * Needle: a filled hub circle plus a cone whose two sides leave the circle
 * tangentially and meet at the tip, short of the ring. Built pointing
 * straight up; the group rotation aims it.
 */
function needlePath(): string {
  const alpha = Math.acos(HUB_R / NEEDLE_LEN); // centre angle to the tangent points
  const tx = HUB_R * Math.sin(alpha);
  const ty = -HUB_R * Math.cos(alpha);
  return `M ${f(CX)} ${f(CY - NEEDLE_LEN)} L ${f(CX + tx)} ${f(CY + ty)} L ${f(CX - tx)} ${f(CY + ty)} Z`;
}

/** "−1.5", "+2"; the unit is spelled out on the two ends of the scale. */
function formatNumeral(v: number, max: number): string {
  const sign = v < 0 ? '−' : v > 0 ? '+' : '';
  return `${sign}${Math.abs(v)}${Math.abs(v) === max ? '°C' : ''}`;
}

/**
 * Gauge for one ENSO index: a thin half ring on the ColorBrewer RdBu scale,
 * La Niña blues on the left, El Niño reds on the right, numbered only where
 * sectors meet. Inside the ring, "La Niña" ends at the La Niña threshold and
 * "El Niño" starts at the El Niño one, each under a curved arrow towards the
 * stronger values. The needle animates from 0 to the current value on load
 * (skipped under prefers-reduced-motion) and glides to the new value when the
 * index changes.
 */
export function Gauge({ value, mode, threshold, caption }: GaugeProps) {
  const max = gaugeMax(value);
  const offScale = Math.abs(value) > max;
  const [angle, setAngle] = useState(angleFor(0, max));
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setAnimate(!reduced);
    // Next frame so the transition actually runs from 0.
    const frame = requestAnimationFrame(() => setAngle(angleFor(value, max)));
    return () => cancelAnimationFrame(frame);
  }, [value, max]);

  // The labels' lengths in px along their arc, measured once the font is in (SSR
  // uses a close estimate; the arrows shift by a pixel or two after hydration at most).
  const coldLabelRef = useRef<SVGTextElement>(null);
  const warmLabelRef = useRef<SVGTextElement>(null);
  const [labelPx, setLabelPx] = useState({ cold: 33, warm: 32 });
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !coldLabelRef.current || !warmLabelRef.current) return;
      setLabelPx({
        cold: coldLabelRef.current.getComputedTextLength(),
        warm: warmLabelRef.current.getComputedTextLength(),
      });
    };
    measure();
    document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, []);

  const sectors = gaugeSectorsFor(mode, threshold, max);
  // Numerals only where sectors meet, plus the two ends: never at zero.
  const edges = [...sectors.map((s) => s.min), max];
  // (Sectors sit edge to edge with no separators, so the numerals mark the boundaries.)
  const neutral = sectors.find((s) => s.phase === 'neutral') ?? sectors[1];
  const coldAngle = angleFor(neutral.min, max);
  const warmAngle = angleFor(neutral.max, max);
  const { words } = verdictFor(value, mode, threshold);
  const scaleWords =
    mode === 'intensity'
      ? 'very strong, strong, moderate, weak, neutral, weak, moderate, strong, very strong'
      : `La Niña below −${threshold}, neutral, El Niño above +${threshold}`;

  return (
    <div
      role="img"
      aria-label={`${caption} gauge: ${formatAnom(value)}, ${words}, on a scale from −${max} (La Niña) to +${max} (El Niño) of ${scaleWords}${offScale ? ' — beyond the end of the scale' : ''}`}
      style={{ width: GAUGE_WIDTH }}
      className="shrink-0"
    >
      <svg viewBox={`0 0 ${GAUGE_WIDTH} ${GAUGE_HEIGHT}`} width={GAUGE_WIDTH} height={GAUGE_HEIGHT}>
        {/* Coloured ring sectors, flat and edge to edge */}
        {sectors.map((sector) => (
          <path
            key={sector.key}
            d={sectorPath(angleFor(sector.min, max), angleFor(sector.max, max))}
            fill={sector.color}
          />
        ))}
        {/* Phase labels on a curved baseline inside the ring: "La Niña" ends at the
            La Niña threshold, "El Niño" starts at the El Niño one, each under a
            curved arrow pointing towards the stronger values. The path runs
            clockwise from −SWEEP to +SWEEP so the glyphs stand outwards. */}
        <defs>
          <path id="gauge-phase-arc" d={phaseArcPath()} fill="none" />
          {/* Filled triangular arrowhead; `orient="auto"` turns it along the arc's
              tangent at its end. */}
          <marker id="gauge-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto">
            <path d="M 0 0.5 L 10 5 L 0 9.5 Z" fill="rgb(var(--c-ink-muted))" />
          </marker>
        </defs>
        <text ref={coldLabelRef} className="fill-[rgb(var(--c-ink-muted))] text-[9px]">
          <textPath href="#gauge-phase-arc" startOffset={arcOffset(coldAngle)} textAnchor="end">
            La Niña
          </textPath>
        </text>
        <text ref={warmLabelRef} className="fill-[rgb(var(--c-ink-muted))] text-[9px]">
          <textPath href="#gauge-phase-arc" startOffset={arcOffset(warmAngle)} textAnchor="start">
            El Niño
          </textPath>
        </text>
        {/* Curved arrows just inside the ring, above each label: from the threshold,
            along the slices, and one em past the word towards the stronger values,
            as a hairline arc (the weight of the 8pt glyph stems) with a filled head. */}
        <path
          d={arrowPath(coldAngle, -1, labelPx.cold + ARROW_OVERSHOOT)}
          fill="none"
          stroke="rgb(var(--c-ink-muted))"
          strokeWidth={ARROW_STROKE}
          strokeLinecap="round"
          markerEnd="url(#gauge-arrowhead)"
        />
        <path
          d={arrowPath(warmAngle, 1, labelPx.warm + ARROW_OVERSHOOT)}
          fill="none"
          stroke="rgb(var(--c-ink-muted))"
          strokeWidth={ARROW_STROKE}
          strokeLinecap="round"
          markerEnd="url(#gauge-arrowhead)"
        />
        {/* Ticks and numerals at the sector edges, just outside the ring; the numerals
            are centred on the edge and turned to run along the ring, tops outward. */}
        {edges.map((v) => {
          const a = angleFor(v, max);
          const [x1, y1] = point(a, R_OUTER + 1);
          const [x2, y2] = point(a, TICK_R);
          const [tx, ty] = point(a, NUMERAL_R);
          return (
            <g key={v}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(var(--c-ink-faint))" strokeWidth={1} />
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${f(a)} ${f(tx)} ${f(ty)})`}
                className="tnum fill-[rgb(var(--c-ink-faint))] text-[5pt]"
              >
                {formatNumeral(v, max)}
              </text>
            </g>
          );
        })}
        {/* Needle: hub + tangent cone, dark grey on light, light grey on dark (ink-muted) */}
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: animate ? 'transform 1.1s cubic-bezier(0.34, 1.3, 0.5, 1)' : 'none',
          }}
        >
          <path d={needlePath()} fill="rgb(var(--c-ink-muted))" />
          <circle cx={CX} cy={CY} r={HUB_R} fill="rgb(var(--c-ink-muted))" />
          <circle cx={CX} cy={CY} r={2.5} fill="rgb(var(--c-bg))" />
        </g>
        {offScale ? (
          // Last-resort flag: gaugeMax should never let this happen, but a needle
          // silently parked on the end stop is exactly the bug this replaced.
          <text
            x={CX}
            y={CY - R_INNER * 0.5}
            textAnchor="middle"
            className="fill-[rgb(var(--c-ink))] text-[9px] font-semibold"
          >
            ▲ off scale · {formatAnom(value)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

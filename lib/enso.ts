import type { EnsoPhase, Intensity } from './data/types';

/**
 * Intensity bands for Niño 3.4 anomalies (°C), as used across the gauge,
 * charts and copy: Neutral < 0.5 · Weak 0.5–1 · Moderate 1–1.5 · Strong 1.5–2 ·
 * Very strong ≥ 2. Colours are ColorBrewer RdBu (9-class): the four reds for
 * El Niño, the four blues (LA_NINA_COLORS) for La Niña; neutral is a light grey
 * a little darker than the palest red and blue beside it, so it reads as a band
 * of its own rather than as background.
 */
export const INTENSITY_BANDS: {
  key: Intensity;
  label: string;
  min: number;
  max: number;
  color: string;
}[] = [
  { key: 'neutral', label: 'Neutral', min: 0, max: 0.5, color: '#D0D0D0' },
  { key: 'weak', label: 'Weak', min: 0.5, max: 1, color: '#FDDBC7' },
  { key: 'moderate', label: 'Moderate', min: 1, max: 1.5, color: '#F4A582' },
  { key: 'strong', label: 'Strong', min: 1.5, max: 2, color: '#D6604D' },
  { key: 'very-strong', label: 'Very strong', min: 2, max: 3, color: '#B2182B' },
];

export function intensityFor(anom: number): Intensity {
  const a = Math.abs(anom);
  if (a < 0.5) return 'neutral';
  if (a < 1) return 'weak';
  if (a < 1.5) return 'moderate';
  if (a < 2) return 'strong';
  return 'very-strong';
}

export const INTENSITY_LABELS: Record<Intensity, string> = {
  neutral: 'Neutral',
  weak: 'Weak',
  moderate: 'Moderate',
  strong: 'Strong',
  'very-strong': 'Very strong',
};

/** One coloured sector of the gauge ring, min…max °C. */
export interface GaugeSector {
  key: string;
  phase: EnsoPhase;
  min: number;
  max: number;
  color: string;
}

/** The four RdBu blues, mirroring the INTENSITY_BANDS reds. */
const LA_NINA_COLORS: Record<Exclude<Intensity, 'neutral'>, string> = {
  weak: '#D1E5F0',
  moderate: '#92C5DE',
  strong: '#4393C3',
  'very-strong': '#2166AC',
};

/**
 * Sectors of the symmetric intensity gauge, left to right: La Niña (strongest
 * first), the shared Neutral sector astride zero, then El Niño.
 */
const GAUGE_SECTORS: GaugeSector[] = [
  ...INTENSITY_BANDS.filter((b) => b.key !== 'neutral')
    .map((b): GaugeSector => ({
      key: `la-nina-${b.key}`,
      phase: 'la-nina',
      min: -b.max,
      max: -b.min,
      color: LA_NINA_COLORS[b.key as Exclude<Intensity, 'neutral'>],
    }))
    .reverse(),
  { key: 'neutral', phase: 'neutral', min: -0.5, max: 0.5, color: INTENSITY_BANDS[0].color },
  ...INTENSITY_BANDS.filter((b) => b.key !== 'neutral').map(
    (b): GaugeSector => ({ key: `el-nino-${b.key}`, phase: 'el-nino', min: b.min, max: b.max, color: b.color })
  ),
];

/**
 * 'intensity': NOAA's weak/moderate/strong/very strong bands on both sides (only
 * the conventional Niño 3.4 is classified this way). 'threshold': three sectors,
 * La Niña / Neutral / El Niño, split at ±threshold — for indices whose agency
 * defines a threshold but no intensity scale (BoM relative Niño 3.4, RONI).
 */
export type GaugeMode = 'intensity' | 'threshold';

/** ColorBrewer RdBu 3-class red and blue for the threshold-mode ring, with the same neutral grey. */
const RDBU_3 = { blue: '#67A9CF', neutral: INTENSITY_BANDS[0].color, red: '#EF8A62' };

/**
 * The ring's sectors for a mode, on a −max…+max scale: in intensity mode the
 * nine GAUGE_SECTORS, in threshold mode La Niña / Neutral / El Niño split at
 * ±threshold. The two outermost sectors run to the end of the scale.
 */
export function gaugeSectorsFor(mode: GaugeMode, threshold: number, max: number): GaugeSector[] {
  if (mode === 'intensity') {
    return GAUGE_SECTORS.map((s) => ({
      ...s,
      min: s.min === -3 ? -max : s.min,
      max: s.max === 3 ? max : s.max,
    }));
  }
  return [
    { key: 'cold', phase: 'la-nina', min: -max, max: -threshold, color: RDBU_3.blue },
    { key: 'neutral', phase: 'neutral', min: -threshold, max: threshold, color: RDBU_3.neutral },
    { key: 'warm', phase: 'el-nino', min: threshold, max, color: RDBU_3.red },
  ];
}

const PHASE_WORD: Record<EnsoPhase, string> = {
  'el-nino': 'El Niño',
  'la-nina': 'La Niña',
  neutral: 'Neutral',
};

/**
 * The verdict for a reading of an index: the words to print — "Very strong
 * El Niño" in intensity mode, just "El Niño" / "La Niña" / "Neutral" in threshold
 * mode, which has no intensity scale — and the colour of the ring sector the
 * needle lands in. Edges belong to the sector further from zero (+0.5 is weak
 * El Niño, −0.5 weak La Niña; +1 is moderate), matching intensityFor.
 */
export function verdictFor(value: number, mode: GaugeMode, threshold: number): { words: string; color: string } {
  const sectors = gaugeSectorsFor(mode, threshold, gaugeMax(value));
  const sector =
    sectors.find((s) =>
      s.phase === 'neutral'
        ? value > s.min && value < s.max
        : s.phase === 'el-nino'
          ? value >= s.min && value < s.max
          : value > s.min && value <= s.max
    ) ?? sectors[Math.floor(sectors.length / 2)];
  const words =
    sector.phase !== 'neutral' && mode === 'intensity'
      ? `${INTENSITY_LABELS[intensityFor(value)]} ${PHASE_WORD[sector.phase]}`
      : PHASE_WORD[sector.phase];
  return { words, color: sector.color };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Three-month season code → first and last month, e.g. "JAS" → "Jul–Sep". */
const SEASON_MONTHS: Record<string, string> = {
  DJF: 'Dec–Feb',
  JFM: 'Jan–Mar',
  FMA: 'Feb–Apr',
  MAM: 'Mar–May',
  AMJ: 'Apr–Jun',
  MJJ: 'May–Jul',
  JJA: 'Jun–Aug',
  JAS: 'Jul–Sep',
  ASO: 'Aug–Oct',
  SON: 'Sep–Nov',
  OND: 'Oct–Dec',
  NDJ: 'Nov–Jan',
};

/** "JAS", 2026 → "Jul–Sep 2026" (the year is the season's centre month's, as CPC labels it). */
export function seasonLabel(code: string, year: number): string {
  return `${SEASON_MONTHS[code] ?? code} ${year}`;
}

/** ISO date → "11 Oct" (no locale/timezone round trip: the date is already a calendar day). */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_ABBR[m - 1] ?? ''}`.trim();
}

/** Format an anomaly with explicit sign, e.g. "+1.7°C". */
export function formatAnom(anom: number, digits = 1): string {
  const sign = anom > 0 ? '+' : '';
  return `${sign}${anom.toFixed(digits)}°C`;
}

/**
 * End of the intensity scale for a reading, on either side: the gauge runs from
 * -gaugeMax to +gaugeMax. A fixed 3.0 end would pin the needle at the end stop for
 * readings beyond it (the weekly series reached +3.1 in September 2026), hiding that
 * the value went past the scale. So: never below 3; otherwise the next 0.5 STRICTLY
 * above |value|, so the needle never sits on the end stop (+3.0 → 3.5, -3.1 → 3.5,
 * +3.6 → 4.0; 2.4 → 3).
 */
export function gaugeMax(value: number): number {
  return Math.max(3, Math.ceil((Math.abs(value) + 0.01) * 2) / 2);
}

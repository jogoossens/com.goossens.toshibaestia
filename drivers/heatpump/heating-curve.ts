/**
 * The flow temperature the weather compensation curve asks for at the current outdoor temperature.
 *
 * Register 40062 (undocumented, measured 2026-10-12 and 2026-11-01 on an R32 AIO) is the zone 1 flow
 * target the unit holds right now: the curve's value in automatic mode, the fixed setpoint otherwise.
 * It follows the heating mode in 40003 even while zone 1 is off (cooling: its own setpoint), so the
 * curve can be read without the unit heating. After a change it lags up to ~30 s and can step towards
 * the new value (35 → 34 → 32).
 *
 * So 40062 counts as the curve only while heating is selected with automatic mode on and nothing
 * shifting it (night setback, SG Ready), and only once settled: the poll that finds that state is
 * skipped, then the same value on two polls in a row counts ("live").
 *
 * Live values are kept per whole outdoor degree, at most one per clock hour and the last
 * OCCASIONS_KEPT of them. A degree's value is their median, so one odd hour (a shift the app can't
 * see) changes nothing, and a curve changed on the remote takes over once it was seen in most of a
 * degree's recent hours. Between learnt degrees the curve is interpolated; outside them it is unknown,
 * because the curve is flat beyond its end points and extrapolating a slope would be a guess.
 *
 * Pure logic — device.ts keeps the occasions in the device store.
 */

/** [hour number (ms since epoch / 3 600 000), flow target °C] */
export type CurveOccasion = [number, number];

/** Whole outdoor °C → that degree's recent occasions, oldest first. */
export type CurveOccasions = Record<string, CurveOccasion[]>;

/** [whole outdoor °C, flow target °C] */
export type CurvePoint = [number, number];

export type CurveSource = 'live' | 'learnt' | 'unknown';

/** Why 40062 isn't the curve right now; null while it is. */
export type CurveBlocker = 'no_reading' | 'cooling' | 'auto_off' | 'night_setback' | 'sg_ready' | null;

export interface CurvePoll {
  outdoorC: number | null;
  /** Register 40062, scaled; null when the read failed or was invalid. */
  targetC: number | null;
  heating: boolean;
  autoTemp: boolean;
  nightSetback: boolean;
  /** SG Ready "System Forced ON" raises the target (DN AC). */
  sgForcedOn: boolean;
  /** Hour number of this poll. */
  hour: number;
}

export interface CurveValue {
  celsius: number | null;
  source: CurveSource;
}

/** Occasions kept per degree: an odd one is outvoted, a changed curve takes over after three. */
export const OCCASIONS_KEPT = 5;

/** Occasions older than this are dropped: about one heating season and a bit. */
export const OCCASION_MAX_AGE_HOURS = 400 * 24;

/** Two occasions further apart than this don't make a value yet; a third decides. */
const AGREE_K = 1;

/** Plausible flow targets; anything else is a bad read. */
const MIN_TARGET_C = 5;
const MAX_TARGET_C = 65;

export function validTarget(celsius: number | null): number | null {
  return celsius != null && celsius >= MIN_TARGET_C && celsius <= MAX_TARGET_C ? celsius : null;
}

export function curveBlocker(p: CurvePoll): CurveBlocker {
  if (validTarget(p.targetC) == null || p.outdoorC == null) return 'no_reading';
  if (!p.heating) return 'cooling';
  if (!p.autoTemp) return 'auto_off';
  if (p.nightSetback) return 'night_setback';
  if (p.sgForcedOn) return 'sg_ready';
  return null;
}

/** A degree's value from its occasions: the median, once two agree within 1 K. */
export function degreeValue(occasions: CurveOccasion[]): number | null {
  const values = occasions.map(([, v]) => v).sort((a, b) => a - b);
  const n = values.length;
  if (n < 2) return null;
  if (n % 2 === 1) return values[(n - 1) / 2];
  const [low, high] = [values[n / 2 - 1], values[n / 2]];
  return high - low <= AGREE_K ? (low + high) / 2 : null;
}

/** Interpolated curve value at an outdoor temperature, or null outside the learnt degrees. */
export function interpolate(points: CurvePoint[], outdoorC: number): number | null {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const exact = sorted.find(([t]) => t === outdoorC);
  if (exact) return exact[1];
  const below = sorted.filter(([t]) => t < outdoorC).pop();
  const above = sorted.find(([t]) => t > outdoorC);
  if (!below || !above) return null;
  const share = (outdoorC - below[0]) / (above[0] - below[0]);
  return Math.round((below[1] + share * (above[1] - below[1])) * 10) / 10;
}

export class HeatingCurve {
  private occasionsByDegree: Map<number, CurveOccasion[]>;
  private pending: { degree: number; targetC: number } | null = null;
  private onCurve = false;
  private live: number | null = null;
  /** Why the last poll didn't count; null while it did. */
  blocker: CurveBlocker = 'no_reading';

  constructor(occasions: CurveOccasions = {}) {
    this.occasionsByDegree = new Map(Object.entries(occasions).map(([degree, list]) => [Number(degree), list]));
  }

  /** For the device store. */
  get occasions(): CurveOccasions {
    return Object.fromEntries([...this.occasionsByDegree.entries()].map(([degree, list]) => [String(degree), list]));
  }

  /** Degrees with a value, coldest first. */
  get points(): CurvePoint[] {
    return [...this.occasionsByDegree.entries()]
      .map(([degree, list]): [number, number | null] => [degree, degreeValue(list)])
      .filter((p): p is CurvePoint => p[1] != null)
      .sort((a, b) => a[0] - b[0]);
  }

  /** Feed one poll. Returns true when the occasions changed (store them). */
  update(p: CurvePoll): boolean {
    this.live = null;
    this.blocker = curveBlocker(p);
    const wasOnCurve = this.onCurve;
    this.onCurve = this.blocker == null;
    if (!this.onCurve || !wasOnCurve) {
      // The first poll on the curve may still show the old target: never use it.
      this.pending = null;
      return this.dropOld(p.hour);
    }
    const target = p.targetC as number;
    const degree = Math.round(p.outdoorC as number);
    // Settled = the same degree and target on two polls in a row, both after the first poll on the curve.
    const settled = this.pending?.degree === degree && this.pending.targetC === target;
    this.pending = { degree, targetC: target };
    if (!settled) return this.dropOld(p.hour);

    this.live = target;
    const list = this.occasionsByDegree.get(degree) ?? [];
    if (list.some(([hour]) => hour === p.hour)) return this.dropOld(p.hour);
    this.occasionsByDegree.set(degree, [...list, [p.hour, target] as CurveOccasion].slice(-OCCASIONS_KEPT));
    this.dropOld(p.hour);
    return true;
  }

  /** The curve's flow temperature at this outdoor temperature. */
  value(outdoorC: number | null): CurveValue {
    if (this.live != null) return { celsius: this.live, source: 'live' };
    if (outdoorC == null) return { celsius: null, source: 'unknown' };
    const celsius = interpolate(this.points, Math.round(outdoorC));
    return celsius == null ? { celsius: null, source: 'unknown' } : { celsius, source: 'learnt' };
  }

  /** Forget occasions older than OCCASION_MAX_AGE_HOURS. Returns true when any were dropped. */
  private dropOld(hour: number): boolean {
    let changed = false;
    for (const [degree, list] of this.occasionsByDegree) {
      const kept = list.filter(([h]) => h > hour - OCCASION_MAX_AGE_HOURS);
      if (kept.length === list.length) continue;
      changed = true;
      if (kept.length) this.occasionsByDegree.set(degree, kept);
      else this.occasionsByDegree.delete(degree);
    }
    return changed;
  }
}

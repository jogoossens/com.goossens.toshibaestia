/**
 * Retry pacing for registers outside the documented map (EEU-006), read in their own request so the
 * main poll never depends on them. Two kinds of failure, never "give up until restart":
 *
 * - The unit refuses the register (Modbus exception 1–3: illegal function, address or value): it
 *   doesn't have it. Asked again once a day, in case the unit or its firmware changes.
 * - Anything else (timeout, dropped socket, gateway exception 10/11): passing. The next poll tries
 *   again; from the second failure in a row polls are skipped for 2, 4, 8 … up to 60 minutes.
 *
 * A success resets both.
 */

const MINUTE_MS = 60_000;
const MAX_PAUSE_MS = 60 * MINUTE_MS;
const REFUSED_PAUSE_MS = 24 * 60 * MINUTE_MS;

/** Modbus exception codes that mean "this unit doesn't have it". */
const REFUSAL_CODES = new Set([1, 2, 3]);

export function isRefusal(err: unknown): boolean {
  const code = (err as { modbusCode?: unknown } | null)?.modbusCode;
  return typeof code === 'number' && REFUSAL_CODES.has(code);
}

export class OptionalRead {
  private failures = 0;
  private nextTryMs = 0;
  private refused = false;

  /** True when this poll should read the registers. */
  due(nowMs: number): boolean {
    return nowMs >= this.nextTryMs;
  }

  /** True while the unit refuses the registers (as far as the last attempt goes). */
  get refusedByUnit(): boolean {
    return this.refused;
  }

  succeeded(): void {
    this.failures = 0;
    this.nextTryMs = 0;
    this.refused = false;
  }

  /** Book a failed read. Returns a line worth logging when the state changes, else null. */
  failed(err: unknown, nowMs: number): string | null {
    const message = err instanceof Error ? err.message : String(err);
    if (isRefusal(err)) {
      const first = !this.refused;
      this.refused = true;
      this.failures = 0;
      this.nextTryMs = nowMs + REFUSED_PAUSE_MS;
      return first ? `refused by the unit (${message}); asking again once a day` : null;
    }
    this.refused = false;
    this.failures += 1;
    if (this.failures < 2) return null;
    const pauseMs = Math.min(MAX_PAUSE_MS, 2 ** (this.failures - 1) * MINUTE_MS);
    this.nextTryMs = nowMs + pauseMs;
    return `${this.failures} failed reads in a row (${message}); next try in ${Math.round(pauseMs / MINUTE_MS)} min`;
  }
}

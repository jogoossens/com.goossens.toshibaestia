/* eslint-disable node/no-unsupported-features/es-syntax */
/**
 * Weather-curve learning from register 40062.
 *
 * Fixture r32s1-1101-curve-2026-10.csv: an R32 1 Series 11 kW All-In-One polled every ~15 s
 * (12–19 Oct 2026), only the stretches around automatic mode (40007) with 12 polls on either side.
 * The curve was set to 23 °C flow at 20 °C outside and warmer, shifted +4 K on the remote, so it
 * asks 27 °C; the fixed setpoints around it were 20, 32 and 35 °C, cooling 16 °C. Empty rows are
 * failed reads and are skipped, as a failed poll is in the app.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {
  HeatingCurve, CurvePoll, CurvePoint, CurveOccasion, OCCASION_MAX_AGE_HOURS, degreeValue, interpolate, validTarget,
} from '../drivers/heatpump/heating-curve';

const poll = (outdoorC: number | null, targetC: number | null, hour = 0, extra: Partial<CurvePoll> = {}): CurvePoll => ({
  outdoorC, targetC, heating: true, autoTemp: true, nightSetback: false, sgForcedOn: false, hour, ...extra,
});

/** Three polls in one hour: skipped (first on the curve), pending, settled. */
function settle(curve: HeatingCurve, outdoorC: number, targetC: number, hour: number): void {
  curve.update(poll(outdoorC, targetC, hour, { autoTemp: false }));
  for (let i = 0; i < 3; i += 1) curve.update(poll(outdoorC, targetC, hour));
}

function fixture(): CurvePoll[] {
  const lines = fs.readFileSync(path.join(__dirname, 'fixtures', 'r32s1-1101-curve-2026-10.csv'), 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const r = Object.fromEntries(line.split(',').map((v, i) => [head[i], v]));
    if (r.r40062 === '' || r.r40001 === '') return null;
    const temp = (v: string) => (v === '' || Number(v) === -32768 ? null : Number(v));
    return {
      outdoorC: temp(r.r40019),
      targetC: temp(r.r40062),
      heating: r.r40003 === '1',
      autoTemp: r.r40007 === '1',
      nightSetback: r.r40008 === '1',
      sgForcedOn: false,
      hour: Math.floor(Date.parse(r.t) / 3600e3),
    };
  }).filter((p): p is CurvePoll => p != null);
}

for (const step of [1, 2, 4]) {
  test(`recorded week, every ${step * 15} s: only the curve value is ever live or kept`, () => {
    const curve = new HeatingCurve();
    const live: number[] = [];
    for (const p of fixture().filter((_, i) => i % step === 0)) {
      curve.update(p);
      const v = curve.value(p.outdoorC);
      if (v.source === 'live') live.push(v.celsius as number);
    }
    assert.ok(live.length > 100 / step, `live ${live.length}`);
    assert.deepEqual([...new Set(live)], [27]);
    const kept = Object.values(curve.occasions).flat();
    assert.ok(kept.length >= 3, `kept ${kept.length}`);
    for (const [, target] of kept) assert.equal(target, 27);
  });
}

test('the zone may be off: heating selected with automatic mode on is enough (seen 2026-11-01: 31 °C at 12 °C)', () => {
  const curve = new HeatingCurve();
  settle(curve, 12, 31, 1);
  assert.deepEqual(curve.value(12), { celsius: 31, source: 'live' });
  assert.equal(curve.blocker, null);
});

test('nothing is kept while 40062 is not the curve, and the reason is known', () => {
  const curve = new HeatingCurve();
  const cases: Array<[Partial<CurvePoll>, string]> = [
    [{ autoTemp: false }, 'auto_off'], [{ heating: false }, 'cooling'], [{ nightSetback: true }, 'night_setback'],
    [{ sgForcedOn: true }, 'sg_ready'], [{ targetC: null }, 'no_reading'], [{ outdoorC: null }, 'no_reading'],
  ];
  for (const [extra, blocker] of cases) {
    for (let i = 0; i < 5; i += 1) curve.update(poll(10, 32, i, extra));
    assert.equal(curve.blocker, blocker);
  }
  assert.deepEqual(curve.occasions, {});
  assert.deepEqual(curve.value(10), { celsius: null, source: 'unknown' });
});

test('the first poll on the curve is skipped, then two equal polls count', () => {
  const curve = new HeatingCurve();
  curve.update(poll(10, 35, 0, { autoTemp: false }));
  assert.equal(curve.update(poll(10, 35, 0)), false); // just switched: still the fixed setpoint
  assert.equal(curve.update(poll(10, 32, 0)), false); // first value on the curve
  assert.equal(curve.update(poll(10, 32, 0)), true); // settled
  assert.deepEqual(curve.value(10), { celsius: 32, source: 'live' });
  assert.equal(curve.update(poll(10, 32, 0)), false); // same hour: one occasion per hour
  assert.deepEqual(curve.occasions, { 10: [[0, 32]] });
});

test('a degree needs two hours that agree; then it answers with automatic mode off', () => {
  const curve = new HeatingCurve();
  settle(curve, 10, 32, 1);
  curve.update(poll(10, 35, 1, { autoTemp: false }));
  assert.deepEqual(curve.value(10), { celsius: null, source: 'unknown' }); // one hour is not enough
  settle(curve, 10, 32, 2);
  curve.update(poll(10, 35, 2, { autoTemp: false }));
  assert.deepEqual(curve.value(10), { celsius: 32, source: 'learnt' });
});

test('one odd hour changes nothing', () => {
  const curve = new HeatingCurve();
  for (const [hour, target] of [[1, 32], [2, 32], [3, 37], [4, 32], [5, 32]]) settle(curve, 10, target, hour);
  assert.deepEqual(curve.points, [[10, 32]]);
});

test('a curve changed on the remote takes over after three hours at that degree', () => {
  const curve = new HeatingCurve();
  for (const hour of [1, 2, 3, 4, 5]) settle(curve, 10, 32, hour);
  for (const hour of [6, 7]) settle(curve, 10, 34, hour);
  assert.deepEqual(curve.points, [[10, 32]]); // 32 32 32 34 34
  settle(curve, 10, 34, 8);
  assert.deepEqual(curve.points, [[10, 34]]); // 32 32 34 34 34
});

test('learnt degrees: exact, interpolated, unknown outside', () => {
  const learnt: Record<string, CurveOccasion[]> = {
    0: [[1, 36], [2, 36]], 10: [[1, 32], [2, 32]], 20: [[1, 27], [2, 27]],
  };
  const curve = new HeatingCurve(learnt);
  assert.deepEqual(curve.value(10), { celsius: 32, source: 'learnt' });
  assert.deepEqual(curve.value(5), { celsius: 34, source: 'learnt' });
  assert.deepEqual(curve.value(12.4), { celsius: 31, source: 'learnt' });
  assert.deepEqual(curve.value(-3), { celsius: null, source: 'unknown' });
  assert.deepEqual(curve.value(24), { celsius: null, source: 'unknown' });
  assert.deepEqual(curve.value(null), { celsius: null, source: 'unknown' });
});

test('occasions older than a season and a bit are forgotten', () => {
  const curve = new HeatingCurve({ 10: [[0, 32], [1, 32]] });
  assert.equal(curve.update(poll(10, 35, OCCASION_MAX_AGE_HOURS + 1, { autoTemp: false })), true);
  assert.deepEqual(curve.occasions, {});
});

test('degreeValue', () => {
  assert.equal(degreeValue([]), null);
  assert.equal(degreeValue([[0, 32]]), null);
  assert.equal(degreeValue([[0, 32], [1, 33]]), 32.5);
  assert.equal(degreeValue([[0, 32], [1, 37]]), null); // disagree: a third decides
  assert.equal(degreeValue([[0, 32], [1, 37], [2, 32]]), 32);
});

test('bad reads are ignored', () => {
  assert.equal(validTarget(-32768), null);
  assert.equal(validTarget(0), null);
  assert.equal(validTarget(99), null);
  assert.equal(validTarget(35), 35);
});

test('interpolate', () => {
  const points: CurvePoint[] = [[20, 27], [0, 36]];
  assert.equal(interpolate(points, 10), 31.5);
  assert.equal(interpolate(points, 20), 27);
  assert.equal(interpolate(points, 21), null);
  assert.equal(interpolate([], 10), null);
});

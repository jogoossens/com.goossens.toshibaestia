/* eslint-disable node/no-unsupported-features/es-syntax */
/** Retry pacing for the undocumented registers: never "give up until restart". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OptionalRead, isRefusal } from '../modbus/optional-read';

const MIN = 60_000;
const timeout = new Error('Timed out');
const refusal = Object.assign(new Error('Modbus exception 2: Illegal data address'), { modbusCode: 2 });
const gatewayDown = Object.assign(new Error('Modbus exception 11: Gateway target device failed to respond'), { modbusCode: 11 });

test('a single passing failure: the next poll tries again', () => {
  const gate = new OptionalRead();
  assert.equal(gate.failed(timeout, 0), null);
  assert.equal(gate.due(1), true);
});

test('repeated failures pause 2, 4, 8 … up to 60 minutes, and a success resets', () => {
  const gate = new OptionalRead();
  let now = 0;
  const pauses: number[] = [];
  gate.failed(timeout, now);
  for (let i = 0; i < 8; i += 1) {
    gate.failed(gatewayDown, now);
    let wait = 0;
    while (!gate.due(now + wait)) wait += MIN;
    pauses.push(wait / MIN);
    now += wait;
  }
  assert.deepEqual(pauses, [2, 4, 8, 16, 32, 60, 60, 60]);
  gate.succeeded();
  assert.equal(gate.due(now), true);
  assert.equal(gate.failed(timeout, now), null); // counting starts over
});

test('a unit that refuses the register is asked once a day, logged once', () => {
  const gate = new OptionalRead();
  assert.match(gate.failed(refusal, 0) ?? '', /once a day/);
  assert.equal(gate.refusedByUnit, true);
  assert.equal(gate.due(23 * 60 * MIN), false);
  assert.equal(gate.due(24 * 60 * MIN), true);
  assert.equal(gate.failed(refusal, 24 * 60 * MIN), null);
  gate.succeeded();
  assert.equal(gate.refusedByUnit, false);
});

test('only Modbus exceptions 1–3 are refusals', () => {
  assert.equal(isRefusal(refusal), true);
  assert.equal(isRefusal(Object.assign(new Error(''), { modbusCode: 1 })), true);
  assert.equal(isRefusal(gatewayDown), false);
  assert.equal(isRefusal(timeout), false);
  assert.equal(isRefusal(null), false);
});

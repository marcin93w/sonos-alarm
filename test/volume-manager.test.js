import test from "node:test";
import assert from "node:assert/strict";
import { Alarm } from "../src/alarm.js";

const alarms = [
  new Alarm('1', true, ['groupId'], 4, ['MO', 'TU', 'TH', 'FR'], new Date('1970-01-01T09:00:00Z')),
  new Alarm('2', true, ['groupId'], 4, ['WE'], new Date('1970-01-01T08:00:00Z')),
  new Alarm('3', true, ['groupId'], 4, ['SU', 'SA'], new Date('1970-01-01T09:30:00Z')),
  new Alarm('4', false, ['groupId'], 4, ['SU', 'SA'], new Date('1970-01-01T06:30:00Z')),
]

test("Alarm.adjustVolume starts with VOLUME_MIN", () => {
  const nowMs = Date.UTC(2026, 0, 26, 9, 1, 0); // Monday, 2026-01-26T08:01:00Z // MO, 9:01 AM CET
  const changed = alarms[0].adjustVolume(nowMs, 1, 15);
  
  assert.equal(changed, true);
  assert.equal(alarms[0].volume, 1);
});

test("Alarm.adjustVolume reaches VOLUME_MAX after hour", () => {
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0); // Monday, 2026-01-26T09:00:00Z // MO, 10:00 AM CET
  const changed = alarms[0].adjustVolume(nowMs, 1, 15);
  
  assert.equal(changed, true);
  assert.equal(alarms[0].volume, 15);
});

test("Alarm.adjustVolume reaches mid volume after half an hour", () => {
  const nowMs = Date.UTC(2026, 0, 26, 9, 30, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:30 AM CET
  const changed = alarms[0].adjustVolume(nowMs, 1, 10);
  
  assert.equal(changed, true);
  assert.equal(alarms[0].volume, 6);
});

test("Alarm.adjustVolume returns false when volume is not changed", () => {
  alarms[0].volume = 4;

  const nowMs = Date.UTC(2026, 0, 26, 9, 20, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:20 AM CET
  const changed = alarms[0].adjustVolume(nowMs, 1, 10);
  
  assert.equal(alarms[0].volume, 4);
  assert.equal(changed, false);
});

test("Alarm.adjustVolume returns false when alarm is disabled", () => {
  const disabledAlarm = new Alarm('5', false, ['groupId'], 4, ['MO'], new Date('1970-01-01T09:00:00Z'));
  const nowMs = Date.UTC(2026, 0, 26, 9, 5, 0);

  const changed = disabledAlarm.adjustVolume(nowMs, 1, 10);

  assert.equal(disabledAlarm.volume, 4);
  assert.equal(changed, false);
});

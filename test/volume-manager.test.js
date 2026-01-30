import test from "node:test";
import assert from "node:assert/strict";
import { VolumeManager } from "../src/volume-manager.js";
import { Alarm } from "../src/alarm.js";

const alarms = [
  new Alarm('1', true, ['groupId'], 4, ['MO', 'TU', 'TH', 'FR'], new Date('1970-01-01T09:00:00Z')),
  new Alarm('2', true, ['groupId'], 4, ['WE'], new Date('1970-01-01T08:00:00Z')),
  new Alarm('3', true, ['groupId'], 4, ['SU', 'SA'], new Date('1970-01-01T09:30:00Z')),
  new Alarm('4', false, ['groupId'], 4, ['SU', 'SA'], new Date('1970-01-01T06:30:00Z')),
]

test("VolumeManager - Alarm should start with VOLUME_MIN", () => {
  const manager = new VolumeManager(alarms, 1, 15);
  
  const nowMs = Date.UTC(2026, 0, 26, 9, 1, 0); // Monday, 2026-01-26T08:01:00Z // MO, 9:01 AM CET
  const volumes = manager.calculateVolumes(nowMs);
  
  assert.equal(volumes['groupId'], 1);
  assert.equal(alarms[0].volume, 1);
});

test("VolumeManager - Alarm should go to VOLUME_MAX after hour", () => {
  const manager = new VolumeManager(alarms, 1, 15);
  
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0); // Monday, 2026-01-26T09:00:00Z // MO, 10:00 AM CET
  const volumes = manager.calculateVolumes(nowMs);
  
  assert.equal(volumes['groupId'], 15);
  assert.equal(alarms[0].volume, 15);
});

test("VolumeManager - Alarm should go to mid volume after half an hour", () => {
  const manager = new VolumeManager(alarms, 1, 10);
  
  const nowMs = Date.UTC(2026, 0, 26, 9, 30, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:30 AM CET
  const volumes = manager.calculateVolumes(nowMs);
  
  assert.equal(volumes['groupId'], 6);
  assert.equal(alarms[0].volume, 6);
});

test("VolumeManager - Should return nothing when volume is not changed", () => {
  const manager = new VolumeManager(alarms, 1, 10);
  alarms[0].volume = 4

  const nowMs = Date.UTC(2026, 0, 26, 9, 20, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:20 AM CET
  const volumes = manager.calculateVolumes(nowMs);
  
  assert.equal(alarms[0].volume, 4);
  assert.equal(Object.keys(volumes).length, 0);
});

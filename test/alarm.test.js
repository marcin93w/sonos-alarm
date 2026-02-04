import test from "node:test";
import assert from "node:assert/strict";
import { Alarm } from "../src/alarm.js";
import { ALARM_CONFIG_DEFAULTS } from "../src/alarm-config-store.js";

const alarm = {
  "_objectType": "alarm",
  "description": {
      "_objectType": "alarmDescription",
      "recurrence": {
          "_objectType": "recurrenceRule",
          "frequency": "WEEKLY",
          "days": [
              "MO",
              "TU",
              "TH",
              "FR"
          ]
      },
      "startTime": "1970-01-01T09:07:00Z",
      "totalDuration": "PT1H0M0S",
      "content": {
          "_objectType": "content",
          "type": "playlist",
          "id": {
              "_objectType": "universalMusicObjectId",
              "serviceId": "9",
              "objectId": "spotify:playlist:37i9dQZF1EIgtj4OvJCT7Q",
              "accountId": "sn_2"
          }
      },
      "actuator": {
          "_objectType": "actuator",
          "target": "PLAYER",
          "id": "RINCON_542A1B595D5001400",
          "volume": 9
      },
      "playMode": "SHUFFLE"
  },
  "alarmId": "126",
  "enabled": true,
  "state": "ALARM_PENDING"
};

const groups = [{
  "_objectType": "group",
  "id": "RINCON_542A1B595D5001400:542642962",
  "name": "Głośnik",
  "coordinatorId": "RINCON_542A1B595D5001400",
  "playbackState": "PLAYBACK_STATE_PAUSED",
  "playerIds": [
      "RINCON_542A1B595D5001400"
  ]
}];

const defaultConfig = { rampEnabled: true, maxVolume: 15, rampDuration: 60 };

function createRampAlarm({
  alarmId = "1",
  enabled = true,
  volume = 4,
  initialVolume,
  recurrenceDays = ["MO", "TU", "TH", "FR"],
  startTime = "1970-01-01T09:00:00Z",
} = {}) {
  return new Alarm(
    alarmId,
    enabled,
    ["groupId"],
    "",
    volume,
    initialVolume ?? volume,
    recurrenceDays,
    new Date(startTime)
  );
}

test("Alarm.fromSonosAlarm maps core fields", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);

  assert.ok(result instanceof Alarm);
  assert.equal(result.alarmId, "126");
  assert.equal(result.enabled, true);
  assert.equal(result.volume, 9);
  assert.equal(result.initialVolume, 9);
  assert.equal(result.groupNames, "Głośnik");
  assert.deepEqual(result.recurrenceDays, ["MO", "TU", "TH", "FR"]);
});

test("Alarm.fromSonosAlarm maps start time correctly to UTC", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);

  assert.equal(result.startTime.getUTCHours(), 8);
  assert.equal(result.startTime.getUTCMinutes(), 7);
});

test("Alarm.fromSonosAlarm maps groups correctly", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);

  assert.deepEqual(result.groupIds, ["RINCON_542A1B595D5001400:542642962"]);
  assert.equal(result.groupNames, "Głośnik");
});

test("Alarm.adjustVolume computes volume based on minutes since start", () => {
  // Test time: 2026-01-30T09:17:00 CET (10 min after alarm start at 09:07)
  const testTimeMs = Date.UTC(2026, 0, 30, 8, 17, 0);
  const result = Alarm.fromSonosAlarm(alarm, groups, testTimeMs);
  const changed = result.adjustVolume(testTimeMs, defaultConfig);

  assert.equal(changed, true);
  assert.equal(result.volume, 10); // 9 + (15-9)*(10/60) = 10
});

test("Alarm.adjustVolume computes volume based on minutes since start during daylight saving", () => {
  // Test time: 2026-06-30T09:17:00 CEST (10 min after alarm start at 09:07)
  const testTimeMs = Date.UTC(2026, 5, 30, 7, 17, 0);
  const result = Alarm.fromSonosAlarm(alarm, groups, testTimeMs);
  const changed = result.adjustVolume(testTimeMs, defaultConfig);

  assert.equal(changed, true);
  assert.equal(result.volume, 10); // 9 + (15-9)*(10/60) = 10
});

test("Alarm.adjustVolume returns false when alarm is not enabled", () => {
  const result = createRampAlarm({ alarmId: "5", enabled: false });
  const testTimeMs = Date.UTC(2026, 0, 26, 9, 5, 0);
  const changed = result.adjustVolume(testTimeMs, { rampEnabled: true, maxVolume: 10, rampDuration: 60 });

  assert.equal(changed, false);
  assert.equal(result.volume, 4);
});

test("Alarm.adjustVolume returns false for days when alarm is not occuring", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-28T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 28, 8, 10, 0);
  const changed = result.adjustVolume(testTimeMs, defaultConfig);

  assert.equal(changed, false);
  assert.equal(result.volume, 9);
});

test("Alarm.adjustVolume returns false for when alarm run more than 1 hour ago", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-30T10:10:00 CET (more than 1 hour after start)
  const testTimeMs = Date.UTC(2026, 0, 30, 9, 10, 0);
  const changed = result.adjustVolume(testTimeMs, defaultConfig);

  assert.equal(changed, false);
  assert.equal(result.volume, 9);
});

test("Alarm.adjustVolume runs every day when recurrence days are empty", () => {
  const result = createRampAlarm({ recurrenceDays: [] });
  // Test time: 2026-01-29T10:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 29, 9, 10, 0);
  const changed = result.adjustVolume(testTimeMs, defaultConfig);

  assert.equal(changed, true);
  assert.equal(result.volume, 6); // 4 + (15-4)*(10/60) ≈ 5.83 → 6
});

test("Alarm.adjustVolume starts with initialVolume", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 0, 0);
  const changed = result.adjustVolume(nowMs, defaultConfig);

  assert.equal(changed, false);
  assert.equal(result.volume, 4); // initialVolume = 4, no change at t=0
});

test("Alarm.adjustVolume reaches VOLUME_MAX after hour", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0);
  const changed = result.adjustVolume(nowMs, defaultConfig);

  assert.equal(changed, true);
  assert.equal(result.volume, 15);
});

test("Alarm.adjustVolume reaches mid volume after half an hour", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 30, 0);
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 10, rampDuration: 60 });

  assert.equal(changed, true);
  assert.equal(result.volume, 7); // 4 + (10-4)*0.5 = 7
});

test("Alarm.adjustVolume returns false when volume is not changed", () => {
  const result = createRampAlarm();
  result.volume = 6;

  const nowMs = Date.UTC(2026, 0, 26, 9, 20, 0);
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 10, rampDuration: 60 });

  assert.equal(result.volume, 6); // 4 + (10-4)*(20/60) = 6
  assert.equal(changed, false);
});

test("Alarm.adjustVolume returns false when rampEnabled is false", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 10, 0);
  const changed = result.adjustVolume(nowMs, { rampEnabled: false, maxVolume: 15, rampDuration: 60 });

  assert.equal(changed, false);
  assert.equal(result.volume, 4);
});

test("Alarm.adjustVolume reaches max at custom duration (30 min)", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 30, 0);
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 20, rampDuration: 30 });

  assert.equal(changed, true);
  assert.equal(result.volume, 20);
});

test("Alarm.adjustVolume returns false past custom duration", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 31, 0);
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 20, rampDuration: 30 });

  assert.equal(changed, false);
});

test("Alarm.adjustVolume mid-ramp interpolation with custom duration", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 15, 0); // 15 min into 30 min ramp = halfway
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 21, rampDuration: 30 });

  assert.equal(changed, true);
  assert.equal(result.volume, 13); // 4 + (21-4)*0.5 = 12.5 → 13
});

test("Alarm.adjustVolume custom maxVolume reaches target at 60 min", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0); // 60 min
  const changed = result.adjustVolume(nowMs, { rampEnabled: true, maxVolume: 50, rampDuration: 60 });

  assert.equal(changed, true);
  assert.equal(result.volume, 50);
});

test("Alarm.adjustVolume default config (no arg) behaves same as defaults", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0);
  const changed = result.adjustVolume(nowMs);

  assert.equal(changed, true);
  assert.equal(result.volume, ALARM_CONFIG_DEFAULTS.maxVolume);
});

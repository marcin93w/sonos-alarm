import test from "node:test";
import assert from "node:assert/strict";
import { Alarm } from "../src/alarm.js";

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

function createRampAlarm({
  alarmId = "1",
  enabled = true,
  volume = 4,
  recurrenceDays = ["MO", "TU", "TH", "FR"],
  startTime = "1970-01-01T09:00:00Z",
} = {}) {
  return new Alarm(
    alarmId,
    enabled,
    ["groupId"],
    volume,
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
  assert.deepEqual(result.recurrenceDays, ["MO", "TU", "TH", "FR"]);
});

test("Alarm.fromSonosAlarm maps start time correctly", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);

  assert.equal(result.startTime.getHours(), 9);
  assert.equal(result.startTime.getMinutes(), 7);
});

test("Alarm.fromSonosAlarm maps groups correctly", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);

  assert.deepEqual(result.groupIds, ["RINCON_542A1B595D5001400:542642962"]);
});

test("Alarm.adjustVolume computes volume based on minutes since start", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-30T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 30, 8, 10, 0);
  const changed = result.adjustVolume(testTimeMs, 1, 15);

  assert.equal(changed, true);
  assert.equal(result.volume, 2);
});

test("Alarm.adjustVolume returns false when alarm is not enabled", () => {
  const result = createRampAlarm({ alarmId: "5", enabled: false });
  const testTimeMs = Date.UTC(2026, 0, 26, 9, 5, 0);
  const changed = result.adjustVolume(testTimeMs, 1, 10);

  assert.equal(changed, false);
  assert.equal(result.volume, 4);
});

test("Alarm.adjustVolume returns false for days when alarm is not occuring", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-28T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 28, 8, 10, 0);
  const changed = result.adjustVolume(testTimeMs, 1, 15);

  assert.equal(changed, false);
  assert.equal(result.volume, 9);
});

test("Alarm.adjustVolume starts with VOLUME_MIN", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 1, 0); // Monday, 2026-01-26T08:01:00Z // MO, 9:01 AM CET
  const changed = result.adjustVolume(nowMs, 1, 15);

  assert.equal(changed, true);
  assert.equal(result.volume, 1);
});

test("Alarm.adjustVolume reaches VOLUME_MAX after hour", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 10, 0, 0); // Monday, 2026-01-26T09:00:00Z // MO, 10:00 AM CET
  const changed = result.adjustVolume(nowMs, 1, 15);

  assert.equal(changed, true);
  assert.equal(result.volume, 15);
});

test("Alarm.adjustVolume reaches mid volume after half an hour", () => {
  const result = createRampAlarm();
  const nowMs = Date.UTC(2026, 0, 26, 9, 30, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:30 AM CET
  const changed = result.adjustVolume(nowMs, 1, 10);

  assert.equal(changed, true);
  assert.equal(result.volume, 6);
});

test("Alarm.adjustVolume returns false when volume is not changed", () => {
  const result = createRampAlarm();
  result.volume = 4;

  const nowMs = Date.UTC(2026, 0, 26, 9, 20, 0); // Monday, 2026-01-26T09:01:00Z // MO, 9:20 AM CET
  const changed = result.adjustVolume(nowMs, 1, 10);

  assert.equal(result.volume, 4);
  assert.equal(changed, false);
});

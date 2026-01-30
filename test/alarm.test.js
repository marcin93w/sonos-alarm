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

test("Alarm.calculateMinutesFromStart computes minutes correctly", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-30T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 30, 8, 10, 0);
  const minutes = result.calculateMinutesFromStart(testTimeMs);

  assert.equal(minutes, 3);
});

test("Alarm.calculateMinutesFromStart returns null if alarm is not enabled", () => {
  const disabledAlarm = { ...alarm, enabled: false };
  const result = Alarm.fromSonosAlarm(disabledAlarm, groups);
  // Test time: 2026-01-30T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 30, 8, 10, 0);
  const minutes = result.calculateMinutesFromStart(testTimeMs);

  assert.equal(minutes, null);
});

test("Alarm.calculateMinutesFromStart computes minutes correctly for days when alarm is not occuring", () => {
  const result = Alarm.fromSonosAlarm(alarm, groups);
  // Test time: 2026-01-28T09:10:00 CET
  const testTimeMs = Date.UTC(2026, 0, 28, 8, 10, 0);
  const minutes = result.calculateMinutesFromStart(testTimeMs);

  assert.equal(minutes, 1443); // 3 minutes + 24h = 1443 minutes
});

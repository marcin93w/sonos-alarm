import { ALARM_CONFIG_DEFAULTS } from "./alarm-config-store.js";

class Alarm {
    constructor(alarmId, enabled, groupIds, groupNames, volume, initialVolume, recurrenceDays, startTime) {
        this.alarmId = alarmId;
        this.enabled = enabled;
        this.groupIds = groupIds;
        this.groupNames = groupNames;
        this.volume = volume;
        this.initialVolume = initialVolume;
        this.recurrenceDays = recurrenceDays;
        this.startTime = startTime;
    }

    static fromJSON(obj) {
        return new Alarm(
            obj.alarmId,
            obj.enabled,
            obj.groupIds,
            obj.groupNames || "",
            obj.volume,
            obj.initialVolume,
            obj.recurrenceDays,
            new Date(obj.startTime)
        );
    }

    toJSON() {
        return {
            alarmId: this.alarmId,
            enabled: this.enabled,
            groupIds: this.groupIds,
            groupNames: this.groupNames,
            volume: this.volume,
            initialVolume: this.initialVolume,
            recurrenceDays: this.recurrenceDays,
            startTime: this.startTime.toISOString(),
        };
    }

    static fromSonosAlarm(alarm, groups, nowMs = Date.now()) {
        const alarmId = alarm.alarmId || (() => { throw new Error("Alarm must have an alarmId"); })();
        const enabled = Boolean(alarm.enabled);
        const volume = parseInt(alarm.description.actuator.volume || (() => { throw new Error("Alarm actuator must have a volume"); })());
        const recurrenceDays = alarm.description?.recurrence?.days || [];
        const startTime = Alarm.#convertSonosCETTimeToUTC(alarm.description.startTime, nowMs);
        const { groupIds, groupNames } = Alarm.#findGroupsForAlarm(alarm, groups);
        return new Alarm(alarmId, enabled, groupIds, groupNames, volume, volume, recurrenceDays, startTime);
    }

    static #convertSonosCETTimeToUTC(sonosTimeStr, referenceMs) {
        const referenceDate = new Date(referenceMs);
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Paris",
            year: "numeric", month: "numeric", day: "numeric",
            hour: "numeric", minute: "numeric", second: "numeric",
            hour12: false,
        }).formatToParts(referenceDate);
        const get = (type) => parseInt(parts.find(p => p.type === type).value);
        const cetAsUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
        const offsetMs = cetAsUtcMs - referenceDate.getTime();
        return new Date(new Date(sonosTimeStr).getTime() - offsetMs);
    }
        
    static #findGroupsForAlarm(alarm, groups) {
        const actuatorId = alarm.description.actuator.id || (() => { throw new Error("Alarm actuator must have an id"); })();

        const ids = [];
        const names = [];
        for (const group of groups) {
            const memberIds = [group.id, group.coordinatorId, ...(group.playerIds || [])].filter(Boolean);
            if (memberIds.includes(actuatorId) && group.id) {
                ids.push(group.id);
                names.push(group.name || group.id);
            }
        }
        return { groupIds: ids, groupNames: names.join(", ") };
    }

    adjustVolume(nowMs, config = ALARM_CONFIG_DEFAULTS) {
        if (!config.rampEnabled) return false;

        const minutes = this.#calculateMinutesFromStart(nowMs);

        if (minutes === null || minutes === undefined) return false;
        if (minutes < 0 || minutes > config.rampDuration) return false;

        const volume = Alarm.#volumeForMinutes(minutes, this.initialVolume, config.maxVolume, config.rampDuration);
        if (this.volume === volume) {
            return false;
        }
        this.volume = volume;
        return true;
    }

    #calculateMinutesFromStart(nowMs) {
        if (!this.enabled) return null;

        const daysSinceLastStart = this.#calculateDaysSinceLastOccurrence(nowMs);
        const minutesSinceLastStart = this.#calculateMinutesSinceSameDayOccurrence(nowMs);

        return minutesSinceLastStart + (daysSinceLastStart * 24 * 60);
    }

    #calculateDaysSinceLastOccurrence(nowMs) {
        const now = new Date(nowMs);

        if (!this.recurrenceDays || this.recurrenceDays.length === 0) {
            return null;
        }

        const dayMap = {
            'SU': 0,
            'MO': 1,
            'TU': 2,
            'WE': 3,
            'TH': 4,
            'FR': 5,
            'SA': 6
        };

        const today = now.getUTCDay();
        let daysSince = 0;

        for (let i = 0; i < 7; i++) {
            const checkDay = (today - i + 7) % 7;
            const checkDayStr = Object.keys(dayMap).find(key => dayMap[key] === checkDay);
            if (this.recurrenceDays.includes(checkDayStr)) {
                daysSince = i;
                break;
            }
        }

        return daysSince;
    }

    #calculateMinutesSinceSameDayOccurrence(nowMs) {
        const now = new Date(nowMs);
        const hours = this.startTime.getUTCHours();
        const minutes = this.startTime.getUTCMinutes();
        const seconds = this.startTime.getUTCSeconds();
        
        let occurrenceMs = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            hours,
            minutes,
            seconds
        );
        
        if (occurrenceMs > nowMs) {
            occurrenceMs -= 24 * 60 * 60 * 1000;
        }
        
        return Math.floor((nowMs - occurrenceMs) / 60000);
    }

    static #volumeForMinutes(minutes, initialVolume, volumeMax, rampDuration) {
        const clamped = Math.max(0, Math.min(rampDuration, minutes));
        if (clamped === 0) return initialVolume;
        if (clamped === rampDuration) return volumeMax;
        const ratio = clamped / rampDuration;
        const volume = initialVolume + (volumeMax - initialVolume) * ratio;
        return Math.round(volume);
    }
}

export { Alarm };

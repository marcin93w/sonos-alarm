const VOLUME_MIN = 1;
const VOLUME_MAX = 15;

class Alarm {
    constructor(alarmId, enabled, groupIds, volume, recurrenceDays, startTime) {
        this.alarmId = alarmId;
        this.enabled = enabled;
        this.groupIds = groupIds;
        this.volume = volume;
        this.recurrenceDays = recurrenceDays;
        this.startTime = startTime;
    }

    static fromJSON(obj) {
        return new Alarm(
            obj.alarmId,
            obj.enabled,
            obj.groupIds,
            obj.volume,
            obj.recurrenceDays,
            new Date(obj.startTime)
        );
    }

    toJSON() {
        return {
            alarmId: this.alarmId,
            enabled: this.enabled,
            groupIds: this.groupIds,
            volume: this.volume,
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
        const groupIds = Alarm.#findGroupIdsForAlarm(alarm, groups);
        return new Alarm(alarmId, enabled, groupIds, volume, recurrenceDays, startTime);
    }

    static #convertSonosCETTimeToUTC(sonosTimeStr, referenceMs) {
        const referenceDate = new Date(referenceMs);
        referenceDate.setMilliseconds(0);

        const timeDifference = new Date(referenceDate.toLocaleString("en-US", { timeZone: "Europe/Paris" })) - referenceDate;
        
        return new Date(new Date(sonosTimeStr) - timeDifference);
    }
        
    static #findGroupIdsForAlarm(alarm, groups) {
        const actuatorId = alarm.description.actuator.id || (() => { throw new Error("Alarm actuator must have an id"); })();
        
        const ids = new Set();
        for (const group of groups) {
            const groupIds = [group.id, group.coordinatorId, ...(group.playerIds || [])].filter(Boolean);
            if (groupIds.includes(actuatorId) && group.id) {
                ids.add(group.id);
            }
        }
        return Array.from(ids);
    }

    adjustVolume(nowMs, volumeMin = VOLUME_MIN, volumeMax = VOLUME_MAX) {
        const minutes = this.#calculateMinutesFromStart(nowMs);

        if (minutes === null || minutes === undefined) return false;
        if (minutes < 0 || minutes > 60) return false;

        const volume = Alarm.#volumeForMinutes(minutes, volumeMin, volumeMax);
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

    static #volumeForMinutes(minutes, volumeMin, volumeMax) {
        const clamped = Math.max(0, Math.min(60, minutes));
        if (clamped === 0) return volumeMin;
        if (clamped === 60) return volumeMax;
        const ratio = clamped / 60;
        const volume = volumeMin + (volumeMax - volumeMin) * ratio;
        return Math.round(volume);
    }
}

export { Alarm };

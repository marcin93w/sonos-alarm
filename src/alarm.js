class Alarm {
    constructor(alarmId, enabled, groupIds, volume, recurrenceDays, startTime) {
        this.alarmId = alarmId;
        this.enabled = enabled;
        this.groupIds = groupIds;
        this.volume = volume;
        this.recurrenceDays = recurrenceDays;
        this.startTime = startTime;
    }

    static fromSonosAlarm(alarm, groups) {
        const alarmId = alarm.alarmId || (() => { throw new Error("Alarm must have an alarmId"); })();
        const enabled = Boolean(alarm.enabled);
        const volume = parseInt(alarm.description.actuator.volume || (() => { throw new Error("Alarm actuator must have a volume"); })());
        const recurrenceDays = alarm.description?.recurrence?.days || [];
        const parsedStartTime = new Date(alarm.description.startTime);
        const startTime = new Date(0);
        if (!Number.isNaN(parsedStartTime.getTime())) {
            startTime.setHours(
                parsedStartTime.getUTCHours(),
                parsedStartTime.getUTCMinutes(),
                parsedStartTime.getUTCSeconds()
            );
        }
        const groupIds = Alarm.findGroupIdsForAlarm(alarm, groups);
        return new Alarm(alarmId, enabled, groupIds, volume, recurrenceDays, startTime);
    }
    
    static findGroupIdsForAlarm(alarm, groups) {
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

    calculateMinutesFromStart(nowMs) {
        if (!this.enabled) return null;

        const daysSinceLastStart = this._calculateDaysSinceLastOccurrence(nowMs);
        const minutesSinceLastStart = this._calculateMinutesSinceSameDayOccurrence(nowMs);

        return minutesSinceLastStart + (daysSinceLastStart * 24 * 60);
    }

    setVolume(newVolume) {
        this.volume = newVolume;
    }

    _calculateDaysSinceLastOccurrence(nowMs) {
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

    _calculateMinutesSinceSameDayOccurrence(nowMs) {
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
}

export { Alarm };

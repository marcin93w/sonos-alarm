const VOLUME_MIN = 1;
const VOLUME_MAX = 15;

class VolumeManager {
  constructor(alarms, volumeMin = VOLUME_MIN, volumeMax = VOLUME_MAX) {
    this.alarms = Array.isArray(alarms) ? alarms : [];
    this.volumeMin = volumeMin;
    this.volumeMax = volumeMax;
  }

  calculateVolumes(now) {
    var groupsToUpdate = {};

    for (const alarm of this.alarms) {
      const minutes = alarm.calculateMinutesFromStart(now);
      if (minutes < 0 || minutes > 60) continue;
      const volume = this.volumeForMinutes(minutes);
      if (alarm.volume !== volume) {
        alarm.setVolume(volume);
        for (const groupId of alarm.groupIds) {
          groupsToUpdate[groupId] = volume;
        }
      }
    }

    return groupsToUpdate;
  }

  volumeForMinutes(minutes) {
    const clamped = Math.max(0, Math.min(60, minutes));
    if (clamped === 0) return this.volumeMin;
    if (clamped === 60) return this.volumeMax;
    const ratio = clamped / 60;
    const volume = this.volumeMin + (this.volumeMax - this.volumeMin) * ratio;
    return Math.round(volume);
  }
}

export { VolumeManager };

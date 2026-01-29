class AlarmStore {
  async getAlarms() {
    throw new Error("Not implemented");
  }
  async saveAlarms(_alarms) {
    throw new Error("Not implemented");
  }
  async shouldRefresh(_ttlMs) {
    throw new Error("Not implemented");
  }
  async clear() {
    throw new Error("Not implemented");
  }
}

class MemoryAlarmStore extends AlarmStore {
  ttlMs = 8 * 60 * 60 * 1000; // 8 hours
  lastSavedDate = new Date(0);

  constructor() {
    super();
    this.alarms = null;
  }
  async getAlarms() {
    return this.alarms;
  }
  async saveAlarms(alarms) {
    this.alarms = alarms;
    this.lastSavedDate = new Date();
  }
  async clear() {
    this.alarms = null;
    this.lastSavedDate = new Date(0);
  }
  async shouldRefresh(ttlMs = this.ttlMs) {
    if (!this.alarms) return true;
    const now = new Date();
    return now - this.lastSavedDate > ttlMs;
  }
}

function buildAlarmStore(_env, _logger) {
  return new MemoryAlarmStore();
}

export { AlarmStore, MemoryAlarmStore, buildAlarmStore };

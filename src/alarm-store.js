import { Alarm } from "./alarm.js";

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
  ttlMs = 6 * 60 * 60 * 1000; // 6 hours
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

class KvAlarmStore extends AlarmStore {
  constructor(kv, userId, ttlMs = 6 * 60 * 60 * 1000) {
    super();
    this.kv = kv;
    this.key = `user:${userId}:alarms`;
    this.ttlMs = ttlMs;
  }

  async getAlarms() {
    const data = await this.kv.get(this.key, { type: "json" });
    if (!data?.alarms) return null;
    return data.alarms.map((a) => Alarm.fromJSON(a));
  }

  async saveAlarms(alarms) {
    const data = {
      alarms: alarms.map((a) => a.toJSON()),
      savedAt: Date.now(),
    };
    await this.kv.put(this.key, JSON.stringify(data));
  }

  async shouldRefresh(ttlMs = this.ttlMs) {
    const data = await this.kv.get(this.key, { type: "json" });
    if (!data?.alarms) return true;
    return Date.now() - data.savedAt > ttlMs;
  }

  async clear() {
    await this.kv.delete(this.key);
  }
}

function buildAlarmStore(env, _logger, userId) {
  if (env.TOKEN_KV && userId) {
    return new KvAlarmStore(env.TOKEN_KV, userId);
  }
  return new MemoryAlarmStore();
}

export { AlarmStore, MemoryAlarmStore, KvAlarmStore, buildAlarmStore };

class TimezoneStore {
  async getTimezone() {
    throw new Error("Not implemented");
  }
  async saveTimezone(_timezone) {
    throw new Error("Not implemented");
  }
}

class MemoryTimezoneStore extends TimezoneStore {
  constructor() {
    super();
    this.timezone = null;
  }

  async getTimezone() {
    return this.timezone;
  }

  async saveTimezone(timezone) {
    this.timezone = timezone;
  }
}

class KvTimezoneStore extends TimezoneStore {
  constructor(kv, userId) {
    super();
    this.kv = kv;
    this.key = `user:${userId}:timezone`;
  }

  async getTimezone() {
    return this.kv.get(this.key);
  }

  async saveTimezone(timezone) {
    await this.kv.put(this.key, timezone);
  }
}

function buildTimezoneStore(env, userId) {
  if (env.TOKEN_KV && userId) {
    return new KvTimezoneStore(env.TOKEN_KV, userId);
  }
  return new MemoryTimezoneStore();
}

export {
  TimezoneStore,
  MemoryTimezoneStore,
  KvTimezoneStore,
  buildTimezoneStore,
};

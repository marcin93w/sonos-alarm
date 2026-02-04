const ALARM_CONFIG_DEFAULTS = { rampEnabled: true, maxVolume: 15, rampDuration: 60 };

class AlarmConfigStore {
  async getConfigs() {
    throw new Error("Not implemented");
  }
  async getConfig(_alarmId) {
    throw new Error("Not implemented");
  }
  async saveConfig(_alarmId, _config) {
    throw new Error("Not implemented");
  }
}

class MemoryAlarmConfigStore extends AlarmConfigStore {
  constructor() {
    super();
    this.configs = {};
  }

  async getConfigs() {
    return this.configs;
  }

  async getConfig(alarmId) {
    return { ...ALARM_CONFIG_DEFAULTS, ...this.configs[alarmId] };
  }

  async saveConfig(alarmId, config) {
    this.configs[alarmId] = config;
  }
}

class KvAlarmConfigStore extends AlarmConfigStore {
  constructor(kv, userId) {
    super();
    this.kv = kv;
    this.key = `user:${userId}:alarm-config`;
  }

  async #load() {
    return (await this.kv.get(this.key, { type: "json" })) || {};
  }

  async getConfigs() {
    return this.#load();
  }

  async getConfig(alarmId) {
    const configs = await this.#load();
    return { ...ALARM_CONFIG_DEFAULTS, ...configs[alarmId] };
  }

  async saveConfig(alarmId, config) {
    const configs = await this.#load();
    configs[alarmId] = config;
    await this.kv.put(this.key, JSON.stringify(configs));
  }
}

function buildAlarmConfigStore(env, userId) {
  if (env.TOKEN_KV && userId) {
    return new KvAlarmConfigStore(env.TOKEN_KV, userId);
  }
  return new MemoryAlarmConfigStore();
}

export {
  ALARM_CONFIG_DEFAULTS,
  AlarmConfigStore,
  MemoryAlarmConfigStore,
  KvAlarmConfigStore,
  buildAlarmConfigStore,
};

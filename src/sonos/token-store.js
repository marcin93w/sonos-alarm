class TokenStore {
  async getTokenSet() {
    throw new Error("Not implemented");
  }
  async saveTokenSet(_tokenSet) {
    throw new Error("Not implemented");
  }
  async clear() {
    throw new Error("Not implemented");
  }
}

class MemoryTokenStore extends TokenStore {
  constructor() {
    super();
    this.tokenSet = null;
  }
  async getTokenSet() {
    return this.tokenSet;
  }
  async saveTokenSet(tokenSet) {
    this.tokenSet = tokenSet;
  }
  async clear() {
    this.tokenSet = null;
  }
}

class KvTokenStore extends TokenStore {
  constructor(kvNamespace, key) {
    super();
    this.kv = kvNamespace;
    this.key = key;
  }
  async getTokenSet() {
    return this.kv.get(this.key, { type: "json" });
  }
  async saveTokenSet(tokenSet) {
    await this.kv.put(this.key, JSON.stringify(tokenSet));
  }
  async clear() {
    await this.kv.delete(this.key);
  }
}

function buildTokenStore(env, logger, userId) {
  if (env.TOKEN_KV) {
    return new KvTokenStore(env.TOKEN_KV, `user:${userId}:token`);
  }
  logger("warn", "TOKEN_KV not configured, using memory token store");
  return new MemoryTokenStore();
}

export { TokenStore, MemoryTokenStore, KvTokenStore, buildTokenStore };

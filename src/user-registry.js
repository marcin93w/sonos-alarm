const REGISTRY_KEY = "users:registry";

class UserRegistry {
  constructor(kv) {
    this.kv = kv;
  }

  async getAllUserIds() {
    const data = await this.kv.get(REGISTRY_KEY, { type: "json" });
    return data?.userIds || [];
  }

  async registerUser(userId) {
    const userIds = await this.getAllUserIds();
    if (!userIds.includes(userId)) {
      userIds.push(userId);
      await this.kv.put(REGISTRY_KEY, JSON.stringify({ userIds }));
    }
  }
}

export { UserRegistry };

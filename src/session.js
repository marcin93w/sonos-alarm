const COOKIE_NAME = "sid";
const COOKIE_MAX_AGE = 10 * 365 * 24 * 60 * 60; // ~10 years

class SessionManager {
  constructor(kv) {
    this.kv = kv;
  }

  getSessionId(request) {
    const cookie = request.headers.get("Cookie") || "";
    const match = cookie.match(/(?:^|;\s*)sid=([^\s;]+)/);
    return match ? match[1] : null;
  }

  async getUserId(request) {
    const sessionId = this.getSessionId(request);
    if (!sessionId) return null;
    const session = await this.kv.get(`session:${sessionId}`, { type: "json" });
    return session?.userId || null;
  }

  async createSession(userId) {
    const sessionId = crypto.randomUUID();
    await this.kv.put(
      `session:${sessionId}`,
      JSON.stringify({ userId, createdAt: Date.now() })
    );
    return sessionId;
  }

  buildSetCookieHeader(sessionId) {
    return `${COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
  }

  static clearCookieHeader() {
    return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
  }
}

export { SessionManager };

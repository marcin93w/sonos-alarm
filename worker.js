const DEFAULT_OAUTH_BASE = "https://api.sonos.com";
const DEFAULT_API_BASE = "https://api.ws.sonos.com/control/api/v1";

const REDACTED = "[REDACTED]";

/**
 * @typedef {Object} TokenSet
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_at
 * @property {string} [token_type]
 * @property {string} [scope]
 */

/**
 * @typedef {Object} Household
 * @property {string} [id]
 * @property {string} [householdId]
 */

/**
 * @typedef {Object} GroupVolume
 * @property {number} volume
 */

/**
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} [name]
 * @property {GroupVolume} [groupVolume]
 * @property {string} [coordinatorId]
 */

/**
 * @typedef {Object} Player
 * @property {string} id
 * @property {string} [name]
 * @property {string} [model]
 */

class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

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
  constructor(kvNamespace) {
    super();
    this.kv = kvNamespace;
    this.key = "sonos:token";
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

class HttpClient {
  constructor({ timeoutMs = 8000, retries = 2, logger }) {
    this.timeoutMs = timeoutMs;
    this.retries = retries;
    this.logger = logger;
  }

  async request(url, options = {}) {
    let attempt = 0;
    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        if (
          response.status >= 500 ||
          response.status === 429 ||
          response.status === 408
        ) {
          if (attempt <= this.retries) {
            await this.delay(200 * attempt);
            continue;
          }
        }
        return response;
      } catch (err) {
        if (attempt <= this.retries) {
          this.logger?.("warn", "request failed, retrying", {
            error: err?.message || String(err),
          });
          await this.delay(200 * attempt);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class SonosClient {
  constructor(config) {
    this.oauthBase = config.oauthBase || DEFAULT_OAUTH_BASE;
    this.apiBase = config.apiBase || DEFAULT_API_BASE;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenStore = config.tokenStore;
    this.http = config.httpClient;
    this.logger = config.logger;
  }

  async authenticateWithAuthCode(code, redirectUri) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const tokenSet = await this.requestToken(body);
    await this.tokenStore.saveTokenSet(tokenSet);
    return tokenSet;
  }

  async refreshAccessToken() {
    const existing = await this.tokenStore.getTokenSet();
    if (!existing?.refresh_token) {
      throw new Error("Missing refresh token");
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: existing.refresh_token,
    });
    const tokenSet = await this.requestToken(body, existing.refresh_token);
    await this.tokenStore.saveTokenSet(tokenSet);
    return tokenSet;
  }

  async getHouseholds() {
    const response = await this.authedRequest(`${this.apiBase}/households`);
    const data = await this.ensureJson(response, "getHouseholds");
    return data.households || [];
  }

  async getGroups(householdId) {
    const response = await this.authedRequest(
      `${this.apiBase}/households/${householdId}/groups`
    );
    const data = await this.ensureJson(response, "getGroups");
    return data.groups || [];
  }

  async setVolume(groupId, percent) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new Error("Volume must be between 0 and 100");
    }
    const payload = JSON.stringify({ volume: percent });
    const response = await this.authedRequest(
      `${this.apiBase}/groups/${groupId}/groupVolume`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: payload,
      }
    );
    await this.ensureOk(response, "setVolume");
    return true;
  }

  async volumeUp(groupId, step = 5) {
    return this.adjustVolume(groupId, Math.abs(step));
  }

  async volumeDown(groupId, step = 5) {
    return this.adjustVolume(groupId, -Math.abs(step));
  }

  async adjustVolume(groupId, delta) {
    const group = await this.getGroupState(groupId);
    const current = group?.groupVolume?.volume ?? 0;
    const next = Math.max(0, Math.min(100, current + delta));
    await this.setVolume(groupId, next);
    return next;
  }

  async getGroupState(groupId) {
    const households = await this.getHouseholds();
    for (const household of households) {
      const groups = await this.getGroups(household.id || household.householdId);
      const match = groups.find((group) => group.id === groupId);
      if (match) return match;
    }
    throw new Error("Group not found");
  }

  async getValidAccessToken() {
    const tokenSet = await this.tokenStore.getTokenSet();
    if (!tokenSet) {
      throw new Error("Not authenticated");
    }
    const now = Math.floor(Date.now() / 1000);
    if (tokenSet.expires_at && tokenSet.expires_at > now + 30) {
      return tokenSet.access_token;
    }
    const refreshed = await this.refreshAccessToken();
    return refreshed.access_token;
  }

  async authedRequest(url, options = {}) {
    const token = await this.getValidAccessToken();
    let response = await this.http.request(url, {
      ...options,
      headers: {
        ...this.authHeaders(token),
        ...(options.headers || {}),
      },
    });
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      response = await this.http.request(url, {
        ...options,
        headers: {
          ...this.authHeaders(refreshed.access_token),
          ...(options.headers || {}),
        },
      });
    }
    return response;
  }

  async requestToken(body, fallbackRefreshToken) {
    const response = await this.http.request(
      `${this.oauthBase}/login/v3/oauth/access`,
      {
        method: "POST",
        headers: {
          Authorization: this.basicAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data?.error === "invalid_grant") {
        await this.tokenStore.clear();
        throw new HttpError("Refresh token revoked", response.status, data);
      }
      throw new HttpError("Token request failed", response.status, data);
    }
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: data.access_token,
      refresh_token:
        data.refresh_token || data.refreshToken || fallbackRefreshToken,
      expires_at: now + (data.expires_in || 0),
      token_type: data.token_type,
      scope: data.scope,
    };
  }

  async ensureOk(response, action) {
    if (response.ok) return;
    const body = await response.text().catch(() => "");
    throw new HttpError(`${action} failed`, response.status, body);
  }

  async ensureJson(response, action) {
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(`${action} failed`, response.status, body);
    }
    return response.json();
  }

  authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
  }

  basicAuthHeader() {
    const encoded = btoa(`${this.clientId}:${this.clientSecret}`);
    return `Basic ${encoded}`;
  }
}

function createLogger() {
  return (level, message, meta = {}) => {
    const sanitized = redactSecrets(meta);
    const payload = Object.keys(sanitized).length ? sanitized : undefined;
    if (payload) {
      console[level](`[sonos] ${message}`, payload);
    } else {
      console[level](`[sonos] ${message}`);
    }
  };
}

function redactSecrets(meta) {
  const cloned = { ...meta };
  for (const key of Object.keys(cloned)) {
    if (/(token|secret|authorization|password)/i.test(key)) {
      cloned[key] = REDACTED;
    }
  }
  return cloned;
}

function buildTokenStore(env, logger) {
  if (env.TOKEN_KV) {
    return new KvTokenStore(env.TOKEN_KV);
  }
  logger("warn", "TOKEN_KV not configured, using memory token store");
  return new MemoryTokenStore();
}

function createSonosClient(env) {
  const logger = createLogger();
  if (!env.SONOS_CLIENT_ID || !env.SONOS_CLIENT_SECRET) {
    throw new Error("SONOS_CLIENT_ID and SONOS_CLIENT_SECRET are required");
  }
  const httpClient = new HttpClient({
    timeoutMs: Number(env.HTTP_TIMEOUT_MS) || 8000,
    retries: Number(env.HTTP_RETRIES) || 2,
    logger,
  });
  const tokenStore = buildTokenStore(env, logger);
  return new SonosClient({
    oauthBase: env.SONOS_OAUTH_BASE || DEFAULT_OAUTH_BASE,
    apiBase: env.SONOS_API_BASE || DEFAULT_API_BASE,
    clientId: env.SONOS_CLIENT_ID,
    clientSecret: env.SONOS_CLIENT_SECRET,
    tokenStore,
    httpClient,
    logger,
  });
}

export { SonosClient, HttpClient, MemoryTokenStore, KvTokenStore };

export default {
  async fetch(request, env, ctx) {
    const logger = createLogger();
    const url = new URL(request.url);
    const client = createSonosClient(env);

    if (url.pathname === "/auth/start") {
      const redirectUri =
        env.SONOS_REDIRECT_URI || `${url.origin}/auth/callback`;
      const params = new URLSearchParams({
        client_id: env.SONOS_CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "playback-control-all",
        state: "state123"
      });
      const authUrl = `${DEFAULT_OAUTH_BASE}/login/v3/oauth?${params.toString()}`;
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code", { status: 400 });
      }
      const redirectUri =
        env.SONOS_REDIRECT_URI || `${url.origin}/auth/callback`;
      try {
        await client.authenticateWithAuthCode(code, redirectUri);
        return new Response("Authenticated. You can close this window.", {
          status: 200,
        });
      } catch (err) {
        logger("error", "auth failed", { error: err?.message || String(err) });
        return new Response("Authentication failed", { status: 500 });
      }
    }

    return new Response("OK", { status: 200 });
  },
  async scheduled(event, env, ctx) {
    const logger = createLogger();
    try {
      const client = createSonosClient(env);
      logger("info", "scheduled run", { time: new Date().toISOString() });
      ctx.waitUntil(
        client
          .getHouseholds()
          .then((households) => {
            logger("info", "households discovered", {
              count: households.length,
            });
          })
          .catch((err) => {
            logger("error", "scheduled check failed", { error: err.message });
          })
      );
    } catch (err) {
      logger("error", "scheduled init failed", {
        error: err?.message || String(err),
      });
    }
  },
};

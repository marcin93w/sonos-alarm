import { DEFAULT_OAUTH_BASE, DEFAULT_API_BASE } from "./logger.js";
import { HttpError } from "./http.js";

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

/**
 * @typedef {Object} Alarm
 * @property {string|number} [alarmId]
 * @property {boolean} [enabled]
 * @property {string} [state]
 * @property {Object} [description]
 * @property {Object} [description.actuator]
 * @property {string} [description.actuator.id]
 * @property {string} [description.actuator.target]
 * @property {number} [description.actuator.volume]
 * @property {string} [description.startTime]
 */

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

  async getHouseholdAlarms(householdId) {
    const response = await this.authedRequest(
      `${this.apiBase}/households/${householdId}/alarms`
    );
    const data = await this.ensureJson(response, "getHouseholdAlarms");
    this.logger("debug", "Alarms data", { data });
    if (Array.isArray(data?.alarms)) return data.alarms;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data)) return data;
    return [];
  }

  getGroupAlarmsFromList(alarms, group) {
    if (!Array.isArray(alarms) || !group) return [];
    const groupIds = new Set(
      [group.id, group.coordinatorId, ...(group.playerIds || [])].filter(Boolean)
    );
    return alarms.filter((alarm) => {
      if (!alarm || typeof alarm !== "object") return false;
      const actuatorId =
        alarm?.description?.actuator?.id ||
        alarm?.description?.actuatorId ||
        alarm?.actuatorId;
      if (actuatorId && groupIds.has(actuatorId)) return true;
      return false;
    });
  }

  async getGroupAlarms(householdId, group) {
    const alarms = await this.getHouseholdAlarms(householdId);
    return this.getGroupAlarmsFromList(alarms, group);
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

export { SonosClient };

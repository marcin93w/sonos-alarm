import { SonosClient } from "./sonos/client.js";
import { HttpClient } from "./sonos/http.js";
import { buildAlarmStore } from "./alarm-store.js";
import { buildTokenStore, MemoryTokenStore } from "./sonos/token-store.js";
import { createLogger } from "./logger.js";
import { Alarm } from "./alarm.js";
import { SessionManager } from "./session.js";
import { UserRegistry } from "./user-registry.js";

function createSonosClient(env, logger, tokenStore) {
  if (!env.SONOS_CLIENT_ID || !env.SONOS_CLIENT_SECRET) {
    throw new Error("SONOS_CLIENT_ID and SONOS_CLIENT_SECRET are required");
  }
  const httpClient = new HttpClient({
    timeoutMs: Number(env.HTTP_TIMEOUT_MS) || 8000,
    retries: Number(env.HTTP_RETRIES) || 2,
    logger,
  });
  return new SonosClient({
    oauthBase: env.SONOS_OAUTH_BASE,
    apiBase: env.SONOS_API_BASE,
    clientId: env.SONOS_CLIENT_ID,
    clientSecret: env.SONOS_CLIENT_SECRET,
    tokenStore,
    httpClient,
  });
}

function createSonosClientForUser(env, logger, userId) {
  const tokenStore = buildTokenStore(env, logger, userId);
  return createSonosClient(env, logger, tokenStore);
}

async function refreshAlarmsForUser(env, logger, userId, store, force = false) {
  const shouldRefresh = await store.shouldRefresh();
  if (!shouldRefresh && !force) {
    return;
  }

  const client = createSonosClientForUser(env, logger, userId);

  const households = await client.getHouseholds();
  const first = households[0] || (() => { throw new Error("No households found"); })();
  const householdId = first.id || first.householdId;

  const alarmsData = await client.getHouseholdAlarms(householdId);
  const groupsData = await client.getGroups(householdId);
  const alarms = alarmsData.map((alarm) => Alarm.fromSonosAlarm(alarm, groupsData));
  await store.saveAlarms(alarms);

  logger("info", "alarms refreshed", { userId, householdId, count: alarms.length });
}

async function adjustVolumeLevelsForUser(env, logger, userId, store) {
  const alarms = await store.getAlarms();
  if (!alarms || alarms.length === 0) return;

  const client = createSonosClientForUser(env, logger, userId);
  const nowMs = Date.now();

  for (const alarm of alarms) {
    const volumeChanged = alarm.adjustVolume(nowMs);
    if (!volumeChanged) continue;

    logger("info", "adjusting alarm volume", { userId, alarmId: alarm.alarmId, newVolume: alarm.volume });
    for (const groupId of alarm.groupIds) {
      await client.setVolume(groupId, alarm.volume);
    }
  }

  await store.saveAlarms(alarms);
}

export { SonosClient, HttpClient };

export default {
  async fetch(request, env, ctx) {
    const logger = createLogger();
    const url = new URL(request.url);
    const sessions = new SessionManager(env.TOKEN_KV);

    if (url.pathname === "/auth/status") {
      const userId = await sessions.getUserId(request);
      if (!userId) {
        return Response.json({ authenticated: false });
      }
      const client = createSonosClientForUser(env, logger, userId);
      return Response.json({ authenticated: await client.isAuthenticated() });
    }

    if (url.pathname === "/auth/start") {
      const tempStore = new MemoryTokenStore();
      const client = createSonosClient(env, logger, tempStore);
      return Response.redirect(client.getAuthUrl(env), 302);
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");

      // Exchange code using a temporary in-memory token store
      const tempStore = new MemoryTokenStore();
      const tempClient = createSonosClient(env, logger, tempStore);
      const tokenSet = await tempClient.authenticateWithAuthCode(code, env);

      // Derive userId from household
      const households = await tempClient.getHouseholds();
      const first = households[0];
      if (!first) {
        return new Response("No Sonos households found.", { status: 400 });
      }
      const userId = first.id || first.householdId;

      // Save tokens under user-specific key
      const userTokenStore = buildTokenStore(env, logger, userId);
      await userTokenStore.saveTokenSet(tokenSet);

      // Register user for cron processing
      const registry = new UserRegistry(env.TOKEN_KV);
      await registry.registerUser(userId);

      // Create session and redirect with cookie
      const sessionId = await sessions.createSession(userId);
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": sessions.buildSetCookieHeader(sessionId),
        },
      });
    }

    if (url.pathname === "/auth/logout") {
      const sessionId = sessions.getSessionId(request);
      if (sessionId) {
        await env.TOKEN_KV.delete(`session:${sessionId}`);
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/",
          "Set-Cookie": SessionManager.clearCookieHeader(),
        },
      });
    }

    if (url.pathname === "/alarms") {
      const userId = await sessions.getUserId(request);
      if (!userId) {
        return Response.json({ error: "Not authenticated" }, { status: 401 });
      }

      const store = buildAlarmStore(env, logger, userId);
      await refreshAlarmsForUser(env, logger, userId, store, true);
      const alarms = await store.getAlarms();

      return Response.json(alarms || []);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const logger = createLogger();
    const registry = new UserRegistry(env.TOKEN_KV);
    const userIds = await registry.getAllUserIds();

    logger("info", "scheduled run", { time: new Date().toISOString(), userCount: userIds.length });

    for (const userId of userIds) {
      try {
        const store = buildAlarmStore(env, logger, userId);
        await refreshAlarmsForUser(env, logger, userId, store);
        await adjustVolumeLevelsForUser(env, logger, userId, store);
      } catch (err) {
        logger("error", "scheduled processing failed for user", {
          userId,
          error: err?.message || String(err),
        });
      }
    }
  },
};

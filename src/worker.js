import { SonosClient } from "./sonos/client.js";
import { HttpClient } from "./sonos/http.js";
import { buildAlarmStore } from "./alarm-store.js";
import { buildTokenStore } from "./sonos/token-store.js";
import { createLogger } from "./logger.js";
import { Alarm } from "./alarm.js";

let alarmStore;

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
    oauthBase: env.SONOS_OAUTH_BASE,
    apiBase: env.SONOS_API_BASE,
    clientId: env.SONOS_CLIENT_ID,
    clientSecret: env.SONOS_CLIENT_SECRET,
    tokenStore,
    httpClient
  });
}

function getAlarmStore(env, logger) {
  if (!alarmStore) {
    alarmStore = buildAlarmStore(env, logger);
  }
  return alarmStore;
}

async function refreshAlarms(env, logger, force = false) {
  const store = getAlarmStore(env, logger);
  const shouldRefresh = await store.shouldRefresh();
  if (!shouldRefresh && !force) {
    return { refreshed: false };
  }
  
  const client = createSonosClient(env);
  
  const households = await client.getHouseholds();
  const first = households[0] || (() => { throw new Error("No households found"); })();
  const householdId = first.id || first.householdId;
  
  const alarmsData = await client.getHouseholdAlarms(householdId);
  const groupsData = await client.getGroups(householdId);
  const alarms = alarmsData.map((alarm) => Alarm.fromSonosAlarm(alarm, groupsData));
  await store.saveAlarms(alarms);

  logger("info", "alarms refreshed", { householdId, count: alarms.length });
}

async function adjustVolumeLevels(env, logger) {
  const alarmStore = getAlarmStore(env, logger);
  const alarms = await alarmStore.getAlarms();

  const client = createSonosClient(env);

  const nowMs = Date.now();
  
  for (const alarm of alarms) {
    const volumeChanged = alarm.adjustVolume(nowMs);
    if (!volumeChanged) continue;

    logger("info", "adjusting alarm volume", { alarmId: alarm.alarmId, newVolume: alarm.volume });
    for (const groupId of alarm.groupIds) {
      await client.setVolume(groupId, alarm.volume);
    }
  }
  
  await alarmStore.saveAlarms(alarms);
}

export { SonosClient, HttpClient };

export default {
  async fetch(request, env, ctx) {
    const logger = createLogger();
    const url = new URL(request.url);

    if (url.pathname === "/auth/status") {
      const tokenStore = buildTokenStore(env, logger);
      const tokenSet = await tokenStore.getTokenSet();
      const hasToken = Boolean(tokenSet?.access_token);
      const hasRefreshToken = Boolean(tokenSet?.refresh_token);
      return new Response(
        JSON.stringify({
          authenticated: hasToken && hasRefreshToken
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        }
      );
    }

    if (url.pathname === "/auth/start") {
      const client = createSonosClient(env);
      return Response.redirect(client.getAuthUrl(env), 302);
    }

    if (url.pathname === "/auth/callback") {
      const client = createSonosClient(env);
      const code = url.searchParams.get("code");

      await client.authenticateWithAuthCode(code, env);
      return new Response("Authenticated. You can close this window.", {
        status: 200,
      });
    }

    if (url.pathname === "/alarms") {
      await refreshAlarms(env, logger, true);
      const alarmStore = getAlarmStore(env, logger);
      const alarms = await alarmStore.getAlarms();

      return new Response(JSON.stringify(alarms), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    const logger = createLogger();
    try {
      logger("info", "scheduled run", { time: new Date().toISOString() });
      await refreshAlarms(env, logger);
      await adjustVolumeLevels(env, logger);
    } catch (err) {
      logger("error", "scheduled init failed", {
        error: err?.message || String(err),
      });
    }
  },
};

import { SonosClient } from "./sonos/client.js";
import { HttpClient } from "./sonos/http.js";
import { buildAlarmStore } from "./sonos/alarm-store.js";
import { buildTokenStore } from "./sonos/token-store.js";
import { DEFAULT_OAUTH_BASE, DEFAULT_API_BASE, createLogger } from "./sonos/logger.js";

let alarmStore;
const VOLUME_MIN = 1;
const VOLUME_MAX = 15;

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

function getAlarmStore(env, logger) {
  if (!alarmStore) {
    alarmStore = buildAlarmStore(env, logger);
  }
  return alarmStore;
}

function getLastOccurrenceMs(startTime, nowMs) {
  const parsed = new Date(startTime);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date(nowMs);
  const hours = parsed.getUTCHours();
  const minutes = parsed.getUTCMinutes();
  const seconds = parsed.getUTCSeconds();
  let occurrenceMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    seconds
  );
  if (occurrenceMs > nowMs) {
    occurrenceMs -= 24 * 60 * 60 * 1000;
  }
  return occurrenceMs;
}

function minutesSinceLastStart(startTimes, nowMs) {
  let lastMs = null;
  for (const startTime of startTimes) {
    const occurrenceMs = getLastOccurrenceMs(startTime, nowMs);
    if (occurrenceMs === null) continue;
    if (lastMs === null || occurrenceMs > lastMs) lastMs = occurrenceMs;
  }
  if (lastMs === null) return null;
  return Math.floor((nowMs - lastMs) / 60000);
}

function volumeForMinutes(minutes) {
  const clamped = Math.max(0, Math.min(60, minutes));
  if (clamped === 0) return VOLUME_MIN;
  if (clamped === 60) return VOLUME_MAX;
  const ratio = clamped / 60;
  const volume = VOLUME_MIN + (VOLUME_MAX - VOLUME_MIN) * ratio;
  return Math.round(volume);
}

async function adjustVolumeLevels(env, logger) {
  const alarmStore = getAlarmStore(env, logger);
  const stored = await alarmStore.getAlarms();
  const alarmsList = Array.isArray(stored?.alarms)
    ? stored.alarms
    : Array.isArray(stored)
      ? stored
      : [];
  if (!alarmsList.length) {
    logger("info", "adjust volume skipped, no alarms data");
    return { adjusted: 0 };
  }
  const client = createSonosClient(env);
  let householdId = stored?.householdId;
  if (!householdId) {
    const households = await client.getHouseholds();
    const first = households[0];
    if (!first) {
      logger("warn", "no households found for volume adjust");
      return { adjusted: 0 };
    }
    householdId = first.id || first.householdId;
  }
  const groups = await client.getGroups(householdId);
  const nowMs = Date.now();
  let adjusted = 0;
  for (const group of groups) {
    if (!group?.id) continue;
    const groupAlarms = client.getGroupAlarmsFromList(alarmsList, group);
    const startTimes = groupAlarms
      .filter((alarm) => alarm?.enabled)
      .map((alarm) => alarm?.description?.startTime)
      .filter(Boolean);
    if (!startTimes.length) continue;
    const minutes = minutesSinceLastStart(startTimes, nowMs);
    if (minutes === null) continue;
    const volume = volumeForMinutes(minutes);
    await client.setVolume(group.id, volume);
    adjusted += 1;
  }
  return { adjusted };
}

async function refreshAlarms(env, logger) {
  const alarms = getAlarmStore(env, logger);
  const shouldRefresh = await alarms.shouldRefresh();
  if (!shouldRefresh) {
    logger("info", "alarms refresh skipped");
    return { refreshed: false };
  }
  const client = createSonosClient(env);
  const households = await client.getHouseholds();
  const first = households[0];
  if (!first) {
    logger("warn", "no households found for alarms refresh");
    return { refreshed: false };
  }
  const householdId = first.id || first.householdId;
  const alarmsData = await client.getHouseholdAlarms(householdId);
  await alarms.saveAlarms({ householdId, alarms: alarmsData });
  const count = Array.isArray(alarmsData) ? alarmsData.length : 0;
  logger("info", "alarms refreshed", { householdId, count });
  return { refreshed: true, householdId, count };
}

async function adjustVolumeLevels(env, logger) {

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
      const redirectUri =
        env.SONOS_REDIRECT_URI || `${url.origin}/auth/callback`;
      const params = new URLSearchParams({
        client_id: env.SONOS_CLIENT_ID,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "playback-control-all",
        state: "none",
      });
      const authUrl = `${DEFAULT_OAUTH_BASE}/login/v3/oauth?${params.toString()}`;
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/auth/callback") {
      const client = createSonosClient(env);
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

    if (url.pathname === "/sonos/groups") {
      const client = createSonosClient(env);
      try {
        const households = await client.getHouseholds();
        const first = households[0];
        if (!first) {
          return new Response(JSON.stringify({ groups: [] }), {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        }
        const householdId = first.id || first.householdId;
        const groups = await client.getGroups(householdId);
        let alarms = [];
        let alarmsError;
        try {
          alarms = await client.getHouseholdAlarms(householdId);
        } catch (err) {
          alarmsError = err?.message || String(err);
          logger("warn", "get alarms failed", { error: alarmsError });
        }
        const groupsWithAlarms = groups.map((group) => ({
          ...group,
          alarms: client.getGroupAlarmsFromList(alarms, group),
        }));
        const payload = { groups: groupsWithAlarms, householdId };
        if (alarmsError) payload.alarmsError = alarmsError;
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        });
      } catch (err) {
        logger("error", "get groups failed", { error: err?.message || String(err) });
        return new Response("Failed to fetch groups", { status: 500 });
      }
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

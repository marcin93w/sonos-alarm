import { SonosClient } from "./sonos/client.js";
import { HttpClient } from "./sonos/http.js";
import { buildTokenStore } from "./sonos/token-store.js";
import { DEFAULT_OAUTH_BASE, DEFAULT_API_BASE, createLogger } from "./sonos/logger.js";

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

export { SonosClient, HttpClient };

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
        state: "none",
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

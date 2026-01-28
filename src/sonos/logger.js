const DEFAULT_OAUTH_BASE = "https://api.sonos.com";
const DEFAULT_API_BASE = "https://api.ws.sonos.com/control/api/v1";

const REDACTED = "[REDACTED]";

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

export { DEFAULT_OAUTH_BASE, DEFAULT_API_BASE, createLogger };

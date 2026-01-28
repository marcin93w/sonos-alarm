class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
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

export { HttpClient, HttpError };

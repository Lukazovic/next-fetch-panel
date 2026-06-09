import type { LogEntry } from "./store";

/**
 * Edit these lists to control which values are hidden in the panel.
 * Matching is case-insensitive for headers; exact for URL params and body keys.
 */
export const redactConfig = {
  urlParams: ["api_key", "apikey", "secret", "token", "access_token", "password", "key"],
  headers: ["authorization", "x-api-key", "x-secret", "x-auth-token"],
  bodyKeys: ["password", "secret", "token", "api_key", "apiKey", "accessToken", "access_token"],
};

const REDACTED = "[REDACTED]";

function redactUrl(url: string, params: string[]): string {
  try {
    const u = new URL(url);
    for (const key of params) {
      if (u.searchParams.has(key)) u.searchParams.set(key, REDACTED);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function redactHeaders(
  headers: Record<string, string>,
  names: string[]
): Record<string, string> {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = lower.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

function redactBody(body: string | null, keys: string[]): string | null {
  if (!body) return body;
  try {
    const parsed = JSON.parse(body);
    for (const key of keys) {
      if (key in parsed) parsed[key] = REDACTED;
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body;
  }
}

export function redactEntry(entry: LogEntry): LogEntry {
  return {
    ...entry,
    url: redactUrl(entry.url, redactConfig.urlParams),
    requestHeaders: redactHeaders(entry.requestHeaders, redactConfig.headers),
    responseHeaders: redactHeaders(entry.responseHeaders, redactConfig.headers),
    requestBody: redactBody(entry.requestBody, redactConfig.bodyKeys),
    responseBody: redactBody(entry.responseBody, redactConfig.bodyKeys),
  };
}

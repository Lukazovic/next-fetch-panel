import type { LogEntry } from "./store";

export type RedactConfig = {
  urlParams: string[];
  headers: string[];
  bodyKeys: string[];
};

/**
 * Default redaction patterns. Pass as a base when extending:
 *   redact: (defaults) => ({ ...defaults, urlParams: [...defaults.urlParams, "my_key"] })
 */
export const defaultRedactConfig: RedactConfig = {
  urlParams: ["api_key", "apikey", "secret", "token", "access_token", "password", "key"],
  headers: ["authorization", "x-api-key", "x-secret", "x-auth-token"],
  bodyKeys: ["password", "secret", "token", "api_key", "apiKey", "accessToken", "access_token"],
};

/**
 * Specifies how redaction should be configured.
 *
 * Plain object — replaces the default list for each provided category:
 *   { urlParams: ["my_key"] }           // only "my_key" redacted in URL params
 *   { headers: [] }                     // no headers redacted
 *
 * Function — receives defaults, return the final config (extend or selectively override):
 *   (d) => ({ ...d, urlParams: [...d.urlParams, "my_key"] })   // add to defaults
 *   (d) => ({ ...d, headers: d.headers.filter(h => h !== "authorization") }) // remove one
 */
export type RedactInput =
  | Partial<RedactConfig>
  | ((defaults: RedactConfig) => Partial<RedactConfig>);

export function resolveRedactConfig(input?: RedactInput): RedactConfig {
  if (!input) return defaultRedactConfig;
  const partial = typeof input === "function" ? input(defaultRedactConfig) : input;
  return {
    urlParams: partial.urlParams ?? defaultRedactConfig.urlParams,
    headers: partial.headers ?? defaultRedactConfig.headers,
    bodyKeys: partial.bodyKeys ?? defaultRedactConfig.bodyKeys,
  };
}

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

export function redactEntry(entry: LogEntry, config: RedactConfig = defaultRedactConfig): LogEntry {
  return {
    ...entry,
    url: redactUrl(entry.url, config.urlParams),
    requestHeaders: redactHeaders(entry.requestHeaders, config.headers),
    responseHeaders: redactHeaders(entry.responseHeaders, config.headers),
    requestBody: redactBody(entry.requestBody, config.bodyKeys),
    responseBody: redactBody(entry.responseBody, config.bodyKeys),
  };
}

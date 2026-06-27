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

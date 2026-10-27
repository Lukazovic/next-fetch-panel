export const MOCKS_COOKIE = "__nfp_mocks";
// Browsers cap a cookie at ~4 KB including its name and attributes.
export const MOCKS_COOKIE_MAX_LENGTH = 3_800;
export const ANY_METHOD = "*";
export const NETWORK_ERROR_MESSAGE = "fetch failed";

// `new Response()` throws a RangeError outside 200–599.
export const MOCK_MIN_STATUS = 200;
export const MOCK_MAX_STATUS = 599;

export type MockAction =
  | { type: "response"; status: number; body?: string }
  | { type: "network-error" };

export type MockRule = {
  id: string;
  /** HTTP method, or "*" to match any method. */
  method: string;
  /** The rule matches when the request URL contains this string. */
  urlIncludes: string;
  delayMs?: number;
  action: MockAction;
};

function isValidAction(action: unknown): action is MockAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "network-error") return true;
  return (
    a.type === "response" &&
    Number.isInteger(a.status) &&
    (a.status as number) >= MOCK_MIN_STATUS &&
    (a.status as number) <= MOCK_MAX_STATUS &&
    (a.body === undefined || typeof a.body === "string")
  );
}

function isValidRule(rule: unknown): rule is MockRule {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.method === "string" &&
    typeof r.urlIncludes === "string" &&
    r.urlIncludes.length > 0 &&
    (r.delayMs === undefined || (typeof r.delayMs === "number" && r.delayMs >= 0)) &&
    isValidAction(r.action)
  );
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function serializeMocks(rules: MockRule[]): string {
  return encodeURIComponent(JSON.stringify(rules));
}

/**
 * Parses the mocks cookie. Accepts both the raw encoded value (document.cookie)
 * and an already-decoded one (Next.js cookies()). Invalid rules are dropped —
 * the cookie is client-controlled, so nothing in it is trusted.
 */
export function parseMocks(raw: string | null | undefined): MockRule[] {
  if (!raw) return [];
  let parsed = tryParseJson(raw);
  if (parsed === undefined) {
    try {
      parsed = tryParseJson(decodeURIComponent(raw));
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter(isValidRule) : [];
}

export function findMock(rules: MockRule[], method: string, url: string): MockRule | undefined {
  const upperMethod = method.toUpperCase();
  return rules.find(
    (rule) =>
      (rule.method === ANY_METHOD || rule.method.toUpperCase() === upperMethod) &&
      url.includes(rule.urlIncludes)
  );
}

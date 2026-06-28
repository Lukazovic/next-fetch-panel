/**
 * Converts any supported headers representation to a plain Record<string, string>.
 * Accepts: Headers (Web Fetch API), string[][] (fetch init), Record<string, unknown>
 * (axios internals where values may be non-string), or null/undefined.
 * Non-string values are silently skipped.
 */
export function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {};
    headers.forEach((v, k) => {
      obj[k] = v;
    });
    return obj;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

/**
 * Converts an unknown value to a size-capped JSON string.
 * Returns null for null/undefined or when JSON serialization fails.
 */
export function stringify(data: unknown, bodyLimit: number): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data.slice(0, bodyLimit);
  try {
    return JSON.stringify(data).slice(0, bodyLimit);
  } catch {
    return null;
  }
}

/**
 * Returns true when a stringify result is at or above the body limit,
 * meaning the original value was likely truncated.
 */
export function wasTruncated(result: string | null, bodyLimit: number): boolean {
  return result !== null && result.length >= bodyLimit;
}

/**
 * Reads the body from a fetch RequestInit and returns a size-capped string.
 * Binary body types (Blob, ArrayBuffer, FormData) are represented as "[binary]".
 */
type ExtractRequestBodyResult = {
  body: string | null;
  truncated: boolean;
};

export function extractRequestBody(
  init: RequestInit | undefined,
  bodyLimit: number
): ExtractRequestBodyResult {
  const raw = init?.body;
  if (raw == null) return { body: null, truncated: false };
  if (typeof raw === "string")
    return { body: raw.slice(0, bodyLimit), truncated: raw.length > bodyLimit };
  if (raw instanceof URLSearchParams) {
    const s = raw.toString();
    return { body: s.slice(0, bodyLimit), truncated: s.length > bodyLimit };
  }
  return { body: "[binary]", truncated: false };
}

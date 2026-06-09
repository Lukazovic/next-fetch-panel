const BODY_LIMIT = 50_000;

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {};
    headers.forEach((v, k) => { obj[k] = v; });
    return obj;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

function extractRequestBody(init?: RequestInit): string | null {
  const body = init?.body;
  if (body == null) return null;
  if (typeof body === "string") return body.slice(0, BODY_LIMIT);
  if (body instanceof URLSearchParams) return body.toString().slice(0, BODY_LIMIT);
  return "[binary]";
}

// Cached reference — imported once, called per-request to read from the current ALS context.
let nextHeaders: typeof import("next/headers")["headers"] | null = null;

async function getSessionId(): Promise<string | null> {
  try {
    if (!nextHeaders) {
      const mod = await import("next/headers");
      nextHeaders = mod.headers;
    }
    return (await nextHeaders()).get("x-dev-sid");
  } catch {
    // Called outside a Next.js request context (startup, background tasks, etc.)
    return null;
  }
}

/**
 * Patches globalThis.fetch to capture server-side requests.
 * Call this inside your own register() if you already have one:
 *
 *   export async function register() {
 *     registerOTel("my-app")   // your existing setup
 *     await registerDevPanel() // add the panel
 *   }
 *
 * For simple use with no other setup:
 *   export { register } from "./server-network-panel/patch"
 */
export async function registerDevPanel() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { devLogStore } = await import("./store");
  const { redactEntry } = await import("./redact");

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const ts = Date.now();
    const id = `${ts}-${Math.random().toString(36).slice(2, 8)}`;
    const requestHeaders = headersToObject(init?.headers);
    const requestBody = extractRequestBody(init);

    // Read session ID from the current request's async context before starting the timer.
    const sessionId = await getSessionId();
    const start = performance.now();

    try {
      const response = await originalFetch(input, init);
      const duration = Math.round(performance.now() - start);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => { responseHeaders[k] = v; });

      // clone to read body without consuming the original stream
      response.clone().text().then(
        (text) => devLogStore.push(redactEntry({
          id, url, method, ts, duration, error: undefined,
          status: response.status, statusText: response.statusText,
          requestHeaders, responseHeaders,
          requestBody, responseBody: text.slice(0, BODY_LIMIT),
          sessionId,
        })),
        () => devLogStore.push(redactEntry({
          id, url, method, ts, duration, error: undefined,
          status: response.status, statusText: response.statusText,
          requestHeaders, responseHeaders,
          requestBody, responseBody: null,
          sessionId,
        })),
      );

      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      const error = err instanceof Error ? err.message : String(err);
      devLogStore.push(redactEntry({
        id, url, method, ts, duration, error,
        status: null, statusText: null,
        requestHeaders, responseHeaders: {},
        requestBody, responseBody: null,
        sessionId,
      }));
      throw err;
    }
  };
}

// For the simple re-export case: export { register } from "./server-network-panel/patch"
export { registerDevPanel as register };

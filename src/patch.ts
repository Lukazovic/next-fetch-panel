import type { RedactInput } from "./domain/redaction/redact";
import { BODY_LIMIT } from "./store/log-store";
import { SESSION_COOKIE, SESSION_HEADER } from "./domain/session";

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const obj: Record<string, string> = {};
    headers.forEach((v, k) => {
      obj[k] = v;
    });
    return obj;
  }
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

function extractRequestBody(
  init: RequestInit | undefined,
  bodyLimit: number
): { body: string | null; truncated: boolean } {
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

// Cached references — imported once, called per-request to read from the current ALS context.
let nextHeaders: (typeof import("next/headers"))["headers"] | null = null;
let nextCookies: (typeof import("next/headers"))["cookies"] | null = null;

async function getSessionId(): Promise<string | null> {
  try {
    if (!nextHeaders) {
      const mod = await import("next/headers");
      nextHeaders = mod.headers;
      nextCookies = mod.cookies;
    }
    // Header set by middleware; cookie fallback covers routes excluded from the matcher.
    return (
      (await nextHeaders()).get(SESSION_HEADER) ??
      (await nextCookies!()).get(SESSION_COOKIE)?.value ??
      null
    );
  } catch {
    // Called outside a Next.js request context (startup, background tasks, etc.)
    return null;
  }
}

/**
 * Patches globalThis.fetch to capture server-side requests made via native fetch.
 *
 * Call this inside your own register() if you already have one:
 *
 *   export async function register() {
 *     registerOTel("my-app")   // your existing setup
 *     await registerDevPanel() // add the panel
 *   }
 *
 * For simple use with no other setup:
 *   export { register } from "next-fetch-panel/patch"
 *
 * Note: if you use axios and it caches the original fetch reference before this
 * patch runs (e.g. with adapter: 'fetch'), use createDevPanelAxiosInterceptors()
 * from "next-fetch-panel/interceptor" instead. No adapter change is required —
 * the interceptors work with any axios adapter.
 *
 * Redaction options:
 *   // extend defaults — add keys on top of the built-in list
 *   await registerDevPanel({ redact: (d) => ({ ...d, urlParams: [...d.urlParams, "my_key"] }) })
 *
 *   // override a category entirely
 *   await registerDevPanel({ redact: { headers: ["x-my-secret"] } })
 *
 *   // disable a category
 *   await registerDevPanel({ redact: { headers: [] } })
 */
export async function registerDevPanel(options?: {
  redact?: RedactInput;
  enabled?: boolean;
  bodyLimit?: number;
  bufferSize?: number;
}) {
  if (options?.enabled === false) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Guard against double-patching (e.g. HMR re-running instrumentation.ts in dev mode).
  if ((globalThis.fetch as typeof globalThis.fetch & { __nfp?: boolean }).__nfp) return;

  const { devLogStore } = await import("./store/log-store");
  const { redactEntry, resolveRedactConfig } = await import("./domain/redaction/redact");

  const redactConfig = resolveRedactConfig(options?.redact);
  const bodyLimit = options?.bodyLimit ?? BODY_LIMIT;

  if (options?.bufferSize !== undefined) devLogStore.configure({ bufferSize: options.bufferSize });

  const originalFetch = globalThis.fetch;

  globalThis.fetch = Object.assign(
    async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      // Skip Next.js / React internal fetches to avoid interfering with RSC and error overlays.
      if (
        url.includes("/__nextjs") ||
        url.includes("/_next/") ||
        url.includes("/api/dev-network")
      ) {
        return originalFetch(input, init);
      }

      const method = (init?.method ?? "GET").toUpperCase();
      const timestamp = Date.now();
      const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
      const requestHeaders = headersToObject(init?.headers);
      const { body: requestBody, truncated: requestBodyTruncated } = extractRequestBody(
        init,
        bodyLimit
      );

      // Read session ID from the current request's async context before starting the timer.
      const sessionId = await getSessionId();
      const start = performance.now();

      try {
        const response = await originalFetch(input, init);
        const duration = Math.round(performance.now() - start);

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          responseHeaders[k] = v;
        });

        // clone to read body without consuming the original stream
        response
          .clone()
          .text()
          .then(
            (text) =>
              devLogStore.push(
                redactEntry(
                  {
                    id,
                    url,
                    method,
                    timestamp,
                    duration,
                    error: undefined,
                    status: response.status,
                    statusText: response.statusText,
                    requestHeaders,
                    responseHeaders,
                    requestBody,
                    responseBody: text.slice(0, bodyLimit),
                    requestBodyTruncated,
                    responseBodyTruncated: text.length > bodyLimit,
                    sessionId,
                  },
                  redactConfig
                )
              ),
            () =>
              devLogStore.push(
                redactEntry(
                  {
                    id,
                    url,
                    method,
                    timestamp,
                    duration,
                    error: undefined,
                    status: response.status,
                    statusText: response.statusText,
                    requestHeaders,
                    responseHeaders,
                    requestBody,
                    responseBody: null,
                    requestBodyTruncated,
                    responseBodyTruncated: false,
                    sessionId,
                  },
                  redactConfig
                )
              )
          );

        return response;
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        const error = err instanceof Error ? err.message : String(err);
        devLogStore.push(
          redactEntry(
            {
              id,
              url,
              method,
              timestamp,
              duration,
              error,
              status: null,
              statusText: null,
              requestHeaders,
              responseHeaders: {},
              requestBody,
              responseBody: null,
              requestBodyTruncated,
              responseBodyTruncated: false,
              sessionId,
            },
            redactConfig
          )
        );
        throw err;
      }
    },
    { __nfp: true }
  );
}

// For the simple re-export case: export { register } from "./server-network-panel/patch"
export { registerDevPanel as register };

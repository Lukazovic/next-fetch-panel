import {
  type RedactInput,
  BODY_LIMIT,
  SESSION_COOKIE,
  SESSION_HEADER,
  DEV_NETWORK_ROUTE,
  NETWORK_ERROR_MESSAGE,
  findMock,
  type MockRule,
} from "../domain";
import { normalizeHeaders, extractRequestBody } from "./helpers/http";
import { buildMockResponse, delay, readMockRules } from "./helpers/mocks";

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
 *
 * Mocks (QA / dev only — see README "Mocking responses"):
 *   await registerDevPanel({ allowMocks: process.env.NFP_ALLOW_MOCKS === "true" })
 */
export async function registerDevPanel(options?: {
  redact?: RedactInput;
  enabled?: boolean;
  bodyLimit?: number;
  bufferSize?: number;
  /**
   * Lets the panel mock responses (status, body, network error, delay) for the
   * current browser session. Off by default — never enable it in production.
   */
  allowMocks?: boolean;
}) {
  if (options?.enabled === false) return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Guard against double-patching (e.g. HMR re-running instrumentation.ts in dev mode).
  if ((globalThis.fetch as typeof globalThis.fetch & { __nfp?: boolean }).__nfp) return;

  const { devLogStore } = await import("../store");
  const { redactEntry, resolveRedactConfig } = await import("../domain");

  const redactConfig = resolveRedactConfig(options?.redact);
  const bodyLimit = options?.bodyLimit ?? BODY_LIMIT;

  if (options?.bufferSize !== undefined) devLogStore.configure({ bufferSize: options.bufferSize });

  const originalFetch = globalThis.fetch;

  globalThis.fetch = Object.assign(
    async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      // Skip Next.js / React internal fetches to avoid interfering with RSC and error overlays.
      if (url.includes("/__nextjs") || url.includes("/_next/") || url.includes(DEV_NETWORK_ROUTE)) {
        return originalFetch(input, init);
      }

      const method = (init?.method ?? "GET").toUpperCase();
      const timestamp = Date.now();
      const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
      const requestHeaders = normalizeHeaders(init?.headers);
      const { body: requestBody, truncated: requestBodyTruncated } = extractRequestBody(
        init,
        bodyLimit
      );

      // Read session ID from the current request's async context before starting the timer.
      const sessionId = await getSessionId();
      const mockRule = options?.allowMocks
        ? findMock(await readMockRules(), method, url)
        : undefined;
      const mocked = mockRule ? true : undefined;
      const start = performance.now();

      try {
        const response = mockRule ? await applyMock(mockRule) : await originalFetch(input, init);
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
                    mocked,
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
                    mocked,
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
              mocked,
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

async function applyMock(rule: MockRule): Promise<Response> {
  await delay(rule.delayMs);
  // Same error type and message undici throws for a real network failure.
  if (rule.action.type === "network-error") throw new TypeError(NETWORK_ERROR_MESSAGE);
  return buildMockResponse(rule.action);
}

// For the simple re-export case: export { register } from "./server-network-panel/patch"
export { registerDevPanel as register };

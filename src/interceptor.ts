import { devLogStore } from "./store";
import { redactEntry, resolveRedactConfig, type RedactInput } from "./redact";

const BODY_LIMIT = 50_000;

// Cached after first import — module resolution is async but the reference is reused.
let nextHeaders: typeof import("next/headers")["headers"] | null = null;

function stringify(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return data.slice(0, BODY_LIMIT);
  try {
    return JSON.stringify(data).slice(0, BODY_LIMIT);
  } catch {
    return null;
  }
}

function flattenHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

async function push(
  entry: {
    url: string;
    method: string;
    ts: number;
    duration: number;
    status: number | null;
    statusText?: string | null;
    error?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string | null;
    responseBody?: string | null;
  },
  config: import("./redact").RedactConfig
) {
  let sessionId: string | null = null;
  try {
    if (!nextHeaders) {
      const mod = await import("next/headers");
      nextHeaders = mod.headers;
    }
    sessionId = (await nextHeaders()).get("x-dev-sid");
  } catch {}

  try {
    devLogStore.push(
      redactEntry({
        id: `${entry.ts}-${Math.random().toString(36).slice(2, 8)}`,
        url: entry.url,
        method: entry.method.toUpperCase(),
        ts: entry.ts,
        duration: entry.duration,
        status: entry.status,
        statusText: entry.statusText ?? null,
        error: entry.error,
        requestHeaders: entry.requestHeaders ?? {},
        responseHeaders: entry.responseHeaders ?? {},
        requestBody: entry.requestBody ?? null,
        responseBody: entry.responseBody ?? null,
        sessionId,
      }, config)
    );
  } catch {}
}

type Timing = { startTime: number; ts: number; url: string };

function resolveUrl(config: Record<string, unknown>): string {
  const base = String(config.baseURL ?? "").replace(/\/$/, "");
  const path = String(config.url ?? "");
  const fullPath = path.startsWith("http") ? path : base ? `${base}/${path.replace(/^\//, "")}` : path;
  if (!fullPath) return "";

  const params = config.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return fullPath;

  try {
    const qs = new URLSearchParams(
      Object.entries(params as Record<string, unknown>)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return qs ? `${fullPath}?${qs}` : fullPath;
  } catch {
    return fullPath;
  }
}

/**
 * Creates a pair of axios interceptors that log server-side requests to the
 * dev panel. Use this instead of (or alongside) the globalThis.fetch patch when
 * your HTTP client caches the original fetch reference before instrumentation runs,
 * or when you simply prefer not to patch globals.
 *
 * No axios configuration change is needed — `adapter: 'fetch'` is NOT required.
 * The interceptors work with any axios adapter (the default XHR/http adapter is fine).
 *
 * Register BEFORE your existing interceptors using synchronous require() so
 * the response interceptor sees the raw AxiosResponse (before any transformation):
 *
 *   if (typeof window === "undefined") {
 *     try {
 *       const { createDevPanelAxiosInterceptors } = require("next-fetch-panel/interceptor")
 *       const { request, response, error } = createDevPanelAxiosInterceptors()
 *       axiosClient.interceptors.request.use(request)
 *       axiosClient.interceptors.response.use(response, error)
 *     } catch {}
 *   }
 *
 * Redaction options:
 *   createDevPanelAxiosInterceptors({ redact: (d) => ({ ...d, bodyKeys: [...d.bodyKeys, "my_field"] }) })
 *   createDevPanelAxiosInterceptors({ redact: { headers: [] } })  // disable header redaction
 */
export function createDevPanelAxiosInterceptors(options?: { redact?: RedactInput; enabled?: boolean }) {
  if (options?.enabled === false) {
    return {
      request: <T>(config: T) => config,
      response: <T>(res: T) => Promise.resolve(res),
      error: (err: unknown) => Promise.reject(err),
    };
  }

  const redactConfig = resolveRedactConfig(options?.redact);
  const timings = new WeakMap<object, Timing>();

  function request<T extends object>(config: T): T {
    timings.set(config, { startTime: performance.now(), ts: Date.now(), url: resolveUrl(config as Record<string, unknown>) });
    return config;
  }

  async function response<T>(res: T): Promise<T> {
    // res may not be a full AxiosResponse if a previous interceptor transformed it
    if (!res || typeof res !== "object") return res;

    const r = res as Record<string, unknown>;
    const config = r.config;
    if (!config || typeof config !== "object") return res;

    const t = timings.get(config as object);
    if (t) {
      timings.delete(config as object);
      await push({
        url: t.url,
        method: String((config as Record<string, unknown>).method ?? "GET"),
        ts: t.ts,
        duration: Math.round(performance.now() - t.startTime),
        status: (r.status as number) ?? null,
        statusText: r.statusText as string | null,
        requestHeaders: flattenHeaders((config as Record<string, unknown>).headers),
        responseHeaders: flattenHeaders(r.headers),
        requestBody: stringify((config as Record<string, unknown>).data),
        responseBody: stringify(r.data),
      }, redactConfig);
    }
    return res;
  }

  async function error(err: unknown): Promise<never> {
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const config = e.config;
      if (config && typeof config === "object") {
        const t = timings.get(config as object);
        if (t) {
          timings.delete(config as object);
          const errResponse = e.response as Record<string, unknown> | undefined;
          await push({
            url: t.url,
            method: String((config as Record<string, unknown>).method ?? "GET"),
            ts: t.ts,
            duration: Math.round(performance.now() - t.startTime),
            status: (errResponse?.status as number) ?? null,
            statusText: errResponse?.statusText as string | null,
            error: e.message as string | undefined,
            requestHeaders: flattenHeaders((config as Record<string, unknown>).headers),
            responseHeaders: flattenHeaders(errResponse?.headers),
            requestBody: stringify((config as Record<string, unknown>).data),
            responseBody: stringify(errResponse?.data),
          }, redactConfig);
        }
      }
    }
    throw err;
  }

  return { request, response, error };
}

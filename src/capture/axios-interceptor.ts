import { devLogStore } from "../store";
import {
  BODY_LIMIT as DEFAULT_BODY_LIMIT,
  redactEntry,
  resolveRedactConfig,
  type RedactInput,
  SESSION_COOKIE,
  SESSION_HEADER,
  findMock,
  type MockRule,
} from "../domain";
import { normalizeHeaders, stringify, wasTruncated } from "./helpers/http";
import { delay, mockContentType, readMockRules } from "./helpers/mocks";

// Mirror axios's own AxiosError codes/messages so app error handling treats
// mocked responses exactly like real ones (axios.isAxiosError checks isAxiosError).
const AXIOS_ERR_NETWORK = "ERR_NETWORK";
const AXIOS_ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
const AXIOS_ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
const AXIOS_NETWORK_ERROR_MESSAGE = "Network Error";
const HTTP_SERVER_ERROR_MIN = 500;

// Cached after first import — module resolution is async but the reference is reused.
let nextHeaders: (typeof import("next/headers"))["headers"] | null = null;
let nextCookies: (typeof import("next/headers"))["cookies"] | null = null;

async function push(
  entry: {
    url: string;
    method: string;
    timestamp: number;
    duration: number;
    status: number | null;
    statusText?: string | null;
    error?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string | null;
    responseBody?: string | null;
    requestBodyTruncated?: boolean;
    responseBodyTruncated?: boolean;
    mocked?: boolean;
  },
  config: import("../domain").RedactConfig
) {
  let sessionId: string | null = null;
  try {
    if (!nextHeaders) {
      const mod = await import("next/headers");
      nextHeaders = mod.headers;
      nextCookies = mod.cookies;
    }
    sessionId =
      (await nextHeaders()).get(SESSION_HEADER) ??
      (await nextCookies!()).get(SESSION_COOKIE)?.value ??
      null;
  } catch {}

  try {
    devLogStore.push(
      redactEntry(
        {
          id: `${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          url: entry.url,
          method: entry.method.toUpperCase(),
          timestamp: entry.timestamp,
          duration: entry.duration,
          status: entry.status,
          statusText: entry.statusText ?? null,
          error: entry.error,
          requestHeaders: entry.requestHeaders ?? {},
          responseHeaders: entry.responseHeaders ?? {},
          requestBody: entry.requestBody ?? null,
          responseBody: entry.responseBody ?? null,
          requestBodyTruncated: entry.requestBodyTruncated,
          responseBodyTruncated: entry.responseBodyTruncated,
          sessionId,
          mocked: entry.mocked,
        },
        config
      )
    );
  } catch {}
}

type Timing = { startTime: number; ts: number; url: string };

type AxiosConfigLike = Record<string, unknown>;

function axiosLikeError(
  message: string,
  code: string,
  config: object,
  response?: Record<string, unknown>
) {
  return Object.assign(new Error(message), {
    name: "AxiosError",
    code,
    config,
    request: {},
    response,
    isAxiosError: true,
  });
}

/**
 * Returns an axios adapter that answers with the rule's response instead of making
 * the request. Status validation mirrors axios's settle(): validateStatus decides
 * between resolve and reject. transformResponse still runs on `data` afterwards.
 */
function createMockAdapter(rule: MockRule) {
  return async function mockAdapter(config: AxiosConfigLike) {
    await delay(rule.delayMs);
    if (rule.action.type === "network-error") {
      throw axiosLikeError(AXIOS_NETWORK_ERROR_MESSAGE, AXIOS_ERR_NETWORK, config);
    }
    const { status, body } = rule.action;
    const response = {
      data: body ?? "",
      status,
      statusText: "",
      headers: body ? { "content-type": mockContentType(body) } : {},
      config,
      request: {},
    };
    const validateStatus = config.validateStatus as ((s: number) => boolean) | null | undefined;
    if (!validateStatus || validateStatus(status)) return response;
    throw axiosLikeError(
      `Request failed with status code ${status}`,
      status >= HTTP_SERVER_ERROR_MIN ? AXIOS_ERR_BAD_RESPONSE : AXIOS_ERR_BAD_REQUEST,
      config,
      response
    );
  };
}

function resolveUrl(config: Record<string, unknown>): string {
  const base = String(config.baseURL ?? "").replace(/\/$/, "");
  const path = String(config.url ?? "");
  const fullPath = path.startsWith("http")
    ? path
    : base
      ? `${base}/${path.replace(/^\//, "")}`
      : path;
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
 *
 * Mocks (QA / dev only — see README "Mocking responses"):
 *   createDevPanelAxiosInterceptors({ allowMocks: process.env.NFP_ALLOW_MOCKS === "true" })
 */
export function createDevPanelAxiosInterceptors(options?: {
  redact?: RedactInput;
  enabled?: boolean;
  bodyLimit?: number;
  /**
   * Lets the panel mock responses (status, body, network error, delay) for the
   * current browser session. Off by default — never enable it in production.
   */
  allowMocks?: boolean;
}) {
  if (options?.enabled === false) {
    return {
      request: <T>(config: T) => config,
      response: <T>(res: T) => Promise.resolve(res),
      error: (err: unknown) => Promise.reject(err),
    };
  }

  const redactConfig = resolveRedactConfig(options?.redact);
  const bodyLimit = options?.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const timings = new WeakMap<object, Timing>();
  const mockedConfigs = new WeakSet<object>();

  async function attachMock<T extends object>(config: T, url: string): Promise<T> {
    const c = config as AxiosConfigLike;
    const rule = findMock(await readMockRules(), String(c.method ?? "GET"), url);
    if (!rule) return config;
    mockedConfigs.add(config);
    c.adapter = createMockAdapter(rule);
    return config;
  }

  // Stays synchronous unless mocks are allowed, so existing setups are unaffected.
  function request<T extends object>(config: T): T | Promise<T> {
    const url = resolveUrl(config as AxiosConfigLike);
    timings.set(config, { startTime: performance.now(), ts: Date.now(), url });
    return options?.allowMocks ? attachMock(config, url) : config;
  }

  function isMocked(config: unknown): true | undefined {
    return config && typeof config === "object" && mockedConfigs.has(config) ? true : undefined;
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
      const reqBody = stringify((config as Record<string, unknown>).data, bodyLimit);
      const resBody = stringify(r.data, bodyLimit);
      await push(
        {
          url: t.url,
          method: String((config as Record<string, unknown>).method ?? "GET"),
          timestamp: t.ts,
          duration: Math.round(performance.now() - t.startTime),
          status: (r.status as number) ?? null,
          statusText: r.statusText as string | null,
          requestHeaders: normalizeHeaders((config as Record<string, unknown>).headers),
          responseHeaders: normalizeHeaders(r.headers),
          requestBody: reqBody,
          responseBody: resBody,
          requestBodyTruncated: wasTruncated(reqBody, bodyLimit),
          responseBodyTruncated: wasTruncated(resBody, bodyLimit),
          mocked: isMocked(config),
        },
        redactConfig
      );
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
          const reqBody = stringify((config as Record<string, unknown>).data, bodyLimit);
          const resBody = stringify(errResponse?.data, bodyLimit);
          await push(
            {
              url: t.url,
              method: String((config as Record<string, unknown>).method ?? "GET"),
              timestamp: t.ts,
              duration: Math.round(performance.now() - t.startTime),
              status: (errResponse?.status as number) ?? null,
              statusText: errResponse?.statusText as string | null,
              error: e.message as string | undefined,
              requestHeaders: normalizeHeaders((config as Record<string, unknown>).headers),
              responseHeaders: normalizeHeaders(errResponse?.headers),
              requestBody: reqBody,
              responseBody: resBody,
              requestBodyTruncated: wasTruncated(reqBody, bodyLimit),
              responseBodyTruncated: wasTruncated(resBody, bodyLimit),
              mocked: isMocked(config),
            },
            redactConfig
          );
        }
      }
    }
    throw err;
  }

  return { request, response, error };
}

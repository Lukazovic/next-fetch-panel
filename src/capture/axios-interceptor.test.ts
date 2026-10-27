import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { headers, cookies } from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { createDevPanelAxiosInterceptors } from "./axios-interceptor";
import { devLogStore } from "../store";
import { MOCKS_COOKIE, serializeMocks, type MockRule } from "../domain";

function makeConfig(url: string, method = "get", extra: Record<string, unknown> = {}) {
  return { url, method, headers: {}, data: null, ...extra };
}

function makeAxiosResponse(config: object, status = 200, data: unknown = { ok: true }) {
  return { config, status, statusText: "OK", headers: {}, data };
}

beforeEach(() => {
  devLogStore.configure({ bufferSize: 0 });
  devLogStore.configure({ bufferSize: 100 });
  vi.mocked(headers).mockResolvedValue(new Headers({ "x-dev-sid": "test-session" }));
  vi.mocked(cookies).mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) } as any);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// enabled: false — all three interceptors become passthrough
// ---------------------------------------------------------------------------

describe("createDevPanelAxiosInterceptors — enabled: false", () => {
  it("request interceptor returns the config unchanged", () => {
    const { request } = createDevPanelAxiosInterceptors({ enabled: false });
    const config = makeConfig("https://api.example.com/users");
    expect(request(config)).toBe(config);
  });

  it("response interceptor resolves with the response unchanged", async () => {
    const { response } = createDevPanelAxiosInterceptors({ enabled: false });
    const res = makeAxiosResponse(makeConfig("https://api.example.com/users"));
    await expect(response(res)).resolves.toBe(res);
  });

  it("error interceptor rejects with the original error", async () => {
    const { error } = createDevPanelAxiosInterceptors({ enabled: false });
    const err = new Error("failed");
    await expect(error(err)).rejects.toBe(err);
  });
});

// ---------------------------------------------------------------------------
// logging — response interceptor
// ---------------------------------------------------------------------------

describe("createDevPanelAxiosInterceptors — response logging", () => {
  it("logs a successful request to the store after the response interceptor runs", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/users"));
    await response(makeAxiosResponse(config, 200, { users: [] }));

    expect(devLogStore.getBuffer()).toHaveLength(1);
    const [entry] = devLogStore.getBuffer();
    expect(entry.url).toBe("https://api.example.com/users");
    expect(entry.method).toBe("GET");
    expect(entry.status).toBe(200);
    expect(entry.sessionId).toBe("test-session");
  });

  it("builds the full URL from baseURL and a relative path", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("items", "get", { baseURL: "https://api.example.com/v2" }));
    await response(makeAxiosResponse(config));

    const [entry] = devLogStore.getBuffer();
    expect(entry.url).toBe("https://api.example.com/v2/items");
  });

  it("appends query params from config.params to the URL", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(
      makeConfig("https://api.example.com/search", "get", { params: { q: "hello", page: 2 } })
    );
    await response(makeAxiosResponse(config));

    const [entry] = devLogStore.getBuffer();
    expect(entry.url).toContain("q=hello");
    expect(entry.url).toContain("page=2");
  });

  it("logs the serialized request body", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const payload = { name: "Alice" };
    const config = request(makeConfig("https://api.example.com/users", "post", { data: payload }));
    await response(makeAxiosResponse(config, 201));

    const [entry] = devLogStore.getBuffer();
    // redactBody re-stringifies valid JSON with indentation, so parse before asserting
    expect(JSON.parse(entry.requestBody!)).toEqual(payload);
  });

  it("logs the serialized response body", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/item"));
    const responseData = { id: 42, name: "Widget" };
    await response(makeAxiosResponse(config, 200, responseData));

    const [entry] = devLogStore.getBuffer();
    expect(JSON.parse(entry.responseBody!)).toEqual(responseData);
  });

  it("does not log when the response has no matching timing (config without request interceptor)", async () => {
    const { response } = createDevPanelAxiosInterceptors();
    // Config not processed by the request interceptor — no entry in WeakMap
    const config = makeConfig("https://api.example.com/untracked");
    await response(makeAxiosResponse(config));

    expect(devLogStore.getBuffer()).toHaveLength(0);
  });

  it("deletes the timing from the WeakMap after a successful response", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/once"));

    await response(makeAxiosResponse(config));
    // Second response with the same config object should not log again
    await response(makeAxiosResponse(config));

    expect(devLogStore.getBuffer()).toHaveLength(1);
  });

  it("tags the entry with the session ID from the x-dev-sid header", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-dev-sid": "interceptor-session" }));

    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/data"));
    await response(makeAxiosResponse(config));

    expect(devLogStore.getBuffer()[0].sessionId).toBe("interceptor-session");
  });

  it("truncates the request body and sets requestBodyTruncated when data exceeds bodyLimit", async () => {
    const bodyLimit = 5;
    const { request, response } = createDevPanelAxiosInterceptors({ bodyLimit });
    const config = request(
      makeConfig("https://api.example.com/data", "post", { data: "abcdefghij" })
    );
    await response(makeAxiosResponse(config));

    const [entry] = devLogStore.getBuffer();
    expect(entry.requestBody).toHaveLength(bodyLimit);
    expect(entry.requestBodyTruncated).toBe(true);
  });

  it("truncates the response body and sets responseBodyTruncated when data exceeds bodyLimit", async () => {
    const bodyLimit = 5;
    const { request, response } = createDevPanelAxiosInterceptors({ bodyLimit });
    const config = request(makeConfig("https://api.example.com/data"));
    await response(makeAxiosResponse(config, 200, "abcdefghij"));

    const [entry] = devLogStore.getBuffer();
    expect(entry.responseBody).toHaveLength(bodyLimit);
    expect(entry.responseBodyTruncated).toBe(true);
  });

  it("stores null for a request body that cannot be serialized to JSON", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const config = request(makeConfig("https://api.example.com/data", "post", { data: circular }));
    await response(makeAxiosResponse(config));

    expect(devLogStore.getBuffer()[0].requestBody).toBeNull();
  });

  it("flattens object response headers to string values", async () => {
    const { request, response } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/data"));
    await response({
      ...makeAxiosResponse(config),
      headers: { "content-type": "application/json", "x-trace": "abc123" },
    });

    const { responseHeaders } = devLogStore.getBuffer()[0];
    expect(responseHeaders["content-type"]).toBe("application/json");
    expect(responseHeaders["x-trace"]).toBe("abc123");
  });
});

// ---------------------------------------------------------------------------
// logging — error interceptor
// ---------------------------------------------------------------------------

describe("createDevPanelAxiosInterceptors — error logging", () => {
  it("logs a failed request and rethrows the error", async () => {
    const { request, error } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/fail"));

    const axiosError = {
      message: "Request failed with status 500",
      config,
      response: { status: 500, statusText: "Internal Server Error", data: null, headers: {} },
    };

    await expect(error(axiosError)).rejects.toBe(axiosError);

    expect(devLogStore.getBuffer()).toHaveLength(1);
    const [entry] = devLogStore.getBuffer();
    expect(entry.status).toBe(500);
    expect(entry.error).toBe("Request failed with status 500");
    expect(entry.url).toBe("https://api.example.com/fail");
  });

  it("logs a network error with null status when there is no response", async () => {
    const { request, error } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/timeout"));

    const axiosError = {
      message: "timeout of 5000ms exceeded",
      config,
      response: undefined,
    };

    await expect(error(axiosError)).rejects.toBe(axiosError);

    expect(devLogStore.getBuffer()).toHaveLength(1);
    expect(devLogStore.getBuffer()[0].status).toBeNull();
    expect(devLogStore.getBuffer()[0].error).toBe("timeout of 5000ms exceeded");
  });

  it("deletes the timing from the WeakMap after an error is logged", async () => {
    const { request, error } = createDevPanelAxiosInterceptors();
    const config = request(makeConfig("https://api.example.com/once"));

    const axiosError = { message: "fail", config };

    await expect(error(axiosError)).rejects.toBeDefined();
    // Second error with the same config should not log again
    await expect(error(axiosError)).rejects.toBeDefined();

    expect(devLogStore.getBuffer()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

type MockAdapter = (config: object) => Promise<Record<string, unknown>>;

function setMocksCookie(rules: MockRule[]) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn((name: string) =>
      name === MOCKS_COOKIE ? { value: serializeMocks(rules) } : undefined
    ),
  } as any);
}

const errorRule: MockRule = {
  id: "r1",
  method: "GET",
  urlIncludes: "/users",
  action: { type: "response", status: 503, body: '{"error":"unavailable"}' },
};

// axios's default: only 2xx resolves.
function validateStatus(status: number) {
  return status >= 200 && status < 300;
}

describe("createDevPanelAxiosInterceptors — mocks", () => {
  it("sets a mock adapter on configs that match a rule", async () => {
    setMocksCookie([errorRule]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });

    const config = await request(makeConfig("https://api.example.com/users"));

    expect(typeof (config as Record<string, unknown>).adapter).toBe("function");
  });

  it("leaves configs that match no rule untouched", async () => {
    setMocksCookie([errorRule]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });

    const config = await request(makeConfig("https://api.example.com/orders"));

    expect((config as Record<string, unknown>).adapter).toBeUndefined();
  });

  it("does not read the mocks cookie when allowMocks is not set", async () => {
    setMocksCookie([errorRule]);
    const { request } = createDevPanelAxiosInterceptors();

    const config = request(makeConfig("https://api.example.com/users"));

    expect((config as Record<string, unknown>).adapter).toBeUndefined();
  });

  it("mock adapter rejects with an AxiosError-like error when validateStatus fails", async () => {
    setMocksCookie([errorRule]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(
      makeConfig("https://api.example.com/users", "get", { validateStatus })
    );
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    await expect(adapter(config)).rejects.toMatchObject({
      isAxiosError: true,
      code: "ERR_BAD_RESPONSE",
      message: "Request failed with status code 503",
      config,
      response: {
        status: 503,
        data: '{"error":"unavailable"}',
        headers: { "content-type": "application/json" },
      },
    });
  });

  it("uses ERR_BAD_REQUEST for 4xx statuses", async () => {
    setMocksCookie([{ ...errorRule, action: { type: "response", status: 404 } }]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(
      makeConfig("https://api.example.com/users", "get", { validateStatus })
    );
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    await expect(adapter(config)).rejects.toMatchObject({ code: "ERR_BAD_REQUEST" });
  });

  it("mock adapter resolves when validateStatus accepts the status", async () => {
    setMocksCookie([
      { ...errorRule, action: { type: "response", status: 200, body: '{"ok":true}' } },
    ]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(
      makeConfig("https://api.example.com/users", "get", { validateStatus })
    );
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    await expect(adapter(config)).resolves.toMatchObject({
      status: 200,
      data: '{"ok":true}',
      config,
    });
  });

  it("mock adapter rejects with ERR_NETWORK and no response for a network-error rule", async () => {
    setMocksCookie([{ ...errorRule, action: { type: "network-error" } }]);
    const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(makeConfig("https://api.example.com/users"));
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    const err = await adapter(config).catch((e: unknown) => e);
    expect(err).toMatchObject({
      isAxiosError: true,
      code: "ERR_NETWORK",
      message: "Network Error",
    });
    expect((err as Record<string, unknown>).response).toBeUndefined();
  });

  it("logs a mocked error response with mocked: true", async () => {
    setMocksCookie([errorRule]);
    const { request, error } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(
      makeConfig("https://api.example.com/users", "get", { validateStatus })
    );
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    const err = await adapter(config).catch((e: unknown) => e);
    await expect(error(err)).rejects.toBe(err);

    const [entry] = devLogStore.getBuffer();
    expect(entry.mocked).toBe(true);
    expect(entry.status).toBe(503);
  });

  it("logs a mocked success response with mocked: true", async () => {
    setMocksCookie([{ ...errorRule, action: { type: "response", status: 200 } }]);
    const { request, response } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(makeConfig("https://api.example.com/users"));
    const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

    await response(await adapter(config));

    const [entry] = devLogStore.getBuffer();
    expect(entry.mocked).toBe(true);
    expect(entry.status).toBe(200);
  });

  it("does not mark real responses as mocked", async () => {
    setMocksCookie([errorRule]);
    const { request, response } = createDevPanelAxiosInterceptors({ allowMocks: true });
    const config = await request(makeConfig("https://api.example.com/orders"));

    await response(makeAxiosResponse(config));

    expect(devLogStore.getBuffer()[0].mocked).toBeUndefined();
  });

  it("waits delayMs before the mock adapter settles", async () => {
    vi.useFakeTimers();
    try {
      setMocksCookie([{ ...errorRule, delayMs: 1_000, action: { type: "response", status: 200 } }]);
      const { request } = createDevPanelAxiosInterceptors({ allowMocks: true });
      const config = await request(makeConfig("https://api.example.com/users"));
      const adapter = (config as Record<string, unknown>).adapter as MockAdapter;

      let settled = false;
      const pending = adapter(config).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { headers, cookies } from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { createDevPanelAxiosInterceptors } from "./interceptor";
import { devLogStore } from "./store";

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

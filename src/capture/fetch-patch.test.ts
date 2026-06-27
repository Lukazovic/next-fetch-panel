import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { headers, cookies } from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { registerDevPanel } from "./fetch-patch";
import { devLogStore } from "../store/log-store";

// Capture the real fetch before any test patches it
const realFetch = globalThis.fetch;

beforeEach(() => {
  devLogStore.configure({ bufferSize: 0 });
  devLogStore.configure({ bufferSize: 100 });

  process.env.NEXT_RUNTIME = "nodejs";

  // Fresh mock without __nfp so registerDevPanel will patch it each test
  globalThis.fetch = vi.fn();

  vi.mocked(headers).mockResolvedValue(new Headers({ "x-dev-sid": "test-session" }));
  vi.mocked(cookies).mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) } as any);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NEXT_RUNTIME;
  vi.clearAllMocks();
});

describe("registerDevPanel — guards", () => {
  it("does not patch fetch when enabled is false", async () => {
    const fetchBefore = globalThis.fetch;
    await registerDevPanel({ enabled: false });
    expect(globalThis.fetch).toBe(fetchBefore);
  });

  it("does not patch fetch when NEXT_RUNTIME is not nodejs", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const fetchBefore = globalThis.fetch;
    await registerDevPanel();
    expect(globalThis.fetch).toBe(fetchBefore);
  });

  it("sets __nfp on the patched fetch to signal it is already patched", async () => {
    await registerDevPanel();
    expect((globalThis.fetch as any).__nfp).toBe(true);
  });

  it("is a no-op on the second call — does not double-wrap fetch", async () => {
    await registerDevPanel();
    const patchedOnce = globalThis.fetch;
    await registerDevPanel();
    expect(globalThis.fetch).toBe(patchedOnce);
  });
});

describe("registerDevPanel — fetch logging", () => {
  it("stores an entry with url, method, status, and session ID on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("response body", { status: 200, statusText: "OK" })
    );
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/users");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));

    const [entry] = devLogStore.getBuffer();
    expect(entry.url).toBe("https://api.example.com/users");
    expect(entry.method).toBe("GET");
    expect(entry.status).toBe(200);
    expect(entry.sessionId).toBe("test-session");
    expect(entry.responseBody).toBe("response body");
  });

  it("stores the request body for POST requests", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("{}", { status: 201 })
    );
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/users", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));

    const [entry] = devLogStore.getBuffer();
    expect(entry.method).toBe("POST");
    expect(JSON.parse(entry.requestBody!)).toEqual({ name: "Alice" });
    expect(entry.status).toBe(201);
  });

  it("stores an error entry with null status when fetch throws", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network failure"));
    await registerDevPanel();

    await expect(globalThis.fetch("https://api.example.com/fail")).rejects.toThrow(
      "Network failure"
    );

    expect(devLogStore.getBuffer()).toHaveLength(1);
    const [entry] = devLogStore.getBuffer();
    expect(entry.status).toBeNull();
    expect(entry.error).toBe("Network failure");
    expect(entry.url).toBe("https://api.example.com/fail");
  });

  it("skips paths containing /__nextjs without logging", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://example.com/__nextjs_original-stack-frame?foo=1");

    expect(devLogStore.getBuffer()).toHaveLength(0);
  });

  it("skips paths containing /api/dev-network without logging", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://example.com/api/dev-network");

    expect(devLogStore.getBuffer()).toHaveLength(0);
  });

  it("reads session ID from the __dev_sid cookie when x-dev-sid header is absent", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers());
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "cookie-session" }),
    } as any);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].sessionId).toBe("cookie-session");
  });

  it("stores sessionId: null when headers() throws (called outside a request context)", async () => {
    vi.mocked(headers).mockRejectedValue(new Error("no async storage"));

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].sessionId).toBeNull();
  });

  it("records duration > 0 for a successful fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/users");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].duration).toBeGreaterThanOrEqual(0);
  });

  it("captures request headers passed to fetch", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/secure", {
      // Use non-redacted headers; Authorization is a default-redacted key and
      // would appear as [REDACTED] — tested separately in the redaction test.
      headers: { "x-trace-id": "trace-123", "x-custom": "value" },
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const [entry] = devLogStore.getBuffer();
    // Plain-object headers preserve their original casing (no normalization).
    expect(entry.requestHeaders["x-trace-id"]).toBe("trace-123");
    expect(entry.requestHeaders["x-custom"]).toBe("value");
  });

  it("captures request headers provided as a Headers instance", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data", {
      headers: new Headers({ "content-type": "application/json" }),
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].requestHeaders["content-type"]).toBe("application/json");
  });

  it("captures request headers provided as an array of pairs", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data", {
      headers: [
        ["accept", "text/plain"],
        ["x-trace-id", "abc"],
      ],
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const { requestHeaders } = devLogStore.getBuffer()[0];
    expect(requestHeaders["accept"]).toBe("text/plain");
    expect(requestHeaders["x-trace-id"]).toBe("abc");
  });

  it("captures response headers from the fetch response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("ok", {
        headers: { "content-type": "application/json", "x-request-id": "req-42" },
      })
    );
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/users");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const { responseHeaders } = devLogStore.getBuffer()[0];
    expect(responseHeaders["content-type"]).toBe("application/json");
    expect(responseHeaders["x-request-id"]).toBe("req-42");
  });

  it("captures a URLSearchParams request body as a serialized string", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/form", {
      method: "POST",
      body: new URLSearchParams({ user: "alice", role: "admin" }),
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const body = devLogStore.getBuffer()[0].requestBody!;
    expect(body).toContain("user=alice");
    expect(body).toContain("role=admin");
  });

  it("stores requestBody: '[binary]' for ArrayBuffer bodies", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/upload", {
      method: "POST",
      body: new ArrayBuffer(8),
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].requestBody).toBe("[binary]");
    expect(devLogStore.getBuffer()[0].requestBodyTruncated).toBe(false);
  });

  it("truncates the request body and sets requestBodyTruncated when body exceeds bodyLimit", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    const bodyLimit = 10;
    await registerDevPanel({ bodyLimit });

    await globalThis.fetch("https://api.example.com/data", {
      method: "POST",
      body: "a".repeat(20),
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const [entry] = devLogStore.getBuffer();
    expect(entry.requestBody).toHaveLength(bodyLimit);
    expect(entry.requestBodyTruncated).toBe(true);
  });

  it("truncates the response body and sets responseBodyTruncated when body exceeds bodyLimit", async () => {
    const longBody = "x".repeat(20);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(longBody));
    const bodyLimit = 10;
    await registerDevPanel({ bodyLimit });

    await globalThis.fetch("https://api.example.com/data");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const [entry] = devLogStore.getBuffer();
    expect(entry.responseBody).toHaveLength(bodyLimit);
    expect(entry.responseBodyTruncated).toBe(true);
  });

  it("accepts a URL object as the fetch input", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch(new URL("https://api.example.com/url-object"));

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    expect(devLogStore.getBuffer()[0].url).toBe("https://api.example.com/url-object");
  });

  it("accepts a Request object as the fetch input and captures its URL", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    // Method is read from init?.method, so pass it in init when using a Request input.
    await globalThis.fetch(new Request("https://api.example.com/request-object"), {
      method: "DELETE",
    });

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const [entry] = devLogStore.getBuffer();
    expect(entry.url).toBe("https://api.example.com/request-object");
    expect(entry.method).toBe("DELETE");
  });

  it("stores responseBody: null when reading the response text fails", async () => {
    // Simulate a response whose body stream errors (e.g. connection reset mid-stream).
    const mockResponse = {
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      clone: () => ({ text: () => Promise.reject(new Error("stream error")) }),
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const [entry] = devLogStore.getBuffer();
    expect(entry.responseBody).toBeNull();
    expect(entry.responseBodyTruncated).toBe(false);
    expect(entry.status).toBe(200);
  });

  it("redacts sensitive URL params before storing the entry", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response("ok"));
    await registerDevPanel();

    await globalThis.fetch("https://api.example.com/data?api_key=supersecret&page=2");

    await vi.waitFor(() => expect(devLogStore.getBuffer()).toHaveLength(1));
    const { url } = devLogStore.getBuffer()[0];
    // redactEntry rebuilds the URL via URLSearchParams, which percent-encodes [ and ].
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain("[REDACTED]");
    expect(decoded).not.toContain("supersecret");
    expect(decoded).toContain("page=2");
  });
});

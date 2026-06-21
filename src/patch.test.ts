import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { headers, cookies } from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { registerDevPanel } from "./patch";
import { devLogStore } from "./store";

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
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network failure")
    );
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
});

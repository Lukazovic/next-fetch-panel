import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { headers, cookies } from "next/headers";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
  cookies: vi.fn(),
}));

import { createDevPanelRoute, createDevPanelSnapshot } from "./route";
import { devLogStore, type LogEntry } from "./store/log-store";

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 10,
    timestamp: Date.now(),
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "test-session",
    ...overrides,
  };
}

const decoder = new TextDecoder();

beforeEach(() => {
  vi.useFakeTimers();
  devLogStore.configure({ bufferSize: 0 });
  devLogStore.configure({ bufferSize: 100 });
  vi.mocked(headers).mockResolvedValue(new Headers({ "x-dev-sid": "test-session" }));
  vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createDevPanelRoute — SSE
// ---------------------------------------------------------------------------

describe("createDevPanelRoute — SSE", () => {
  it("returns 404 when enabled is false", async () => {
    const GET = createDevPanelRoute({ enabled: false });
    const response = await GET(new Request("https://app.com/api/dev-network"));
    expect(response.status).toBe(404);
  });

  it("returns the guard response when the guard blocks the request", async () => {
    const GET = createDevPanelRoute({
      guard: () => new Response("Forbidden", { status: 403 }),
    });
    const response = await GET(new Request("https://app.com/api/dev-network"));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("sends ': connected' as the first SSE chunk", async () => {
    const GET = createDevPanelRoute();
    const response = await GET(new Request("https://app.com/api/dev-network"));

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(decoder.decode(value)).toBe(": connected\n\n");

    await reader.cancel();
  });

  it("streams entries pushed to the store for the matching session", async () => {
    const GET = createDevPanelRoute();
    const response = await GET(new Request("https://app.com/api/dev-network"));
    const reader = response.body!.getReader();

    // Consume the initial connected chunk
    await reader.read();

    const entry = makeEntry({ sessionId: "test-session" });
    devLogStore.push(entry);

    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain(`"id":"${entry.id}"`);
    expect(text.startsWith(`id: ${entry.id}\n`)).toBe(true);

    await reader.cancel();
  });

  it("does not stream entries that belong to a different session", async () => {
    const GET = createDevPanelRoute();
    const response = await GET(new Request("https://app.com/api/dev-network"));
    const reader = response.body!.getReader();

    await reader.read(); // connected

    // Other-session entry should be silently dropped
    devLogStore.push(makeEntry({ sessionId: "other-session", id: "skip-me" }));
    // Own-session entry should be streamed
    const ours = makeEntry({ sessionId: "test-session", id: "send-me" });
    devLogStore.push(ours);

    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain("send-me");
    expect(text).not.toContain("skip-me");

    await reader.cancel();
  });

  it("replays buffered entries since last-event-id on reconnect", async () => {
    const e1 = makeEntry({ sessionId: "test-session", id: "entry-1" });
    const e2 = makeEntry({ sessionId: "test-session", id: "entry-2" });
    const e3 = makeEntry({ sessionId: "test-session", id: "entry-3" });
    devLogStore.push(e1);
    devLogStore.push(e2);
    devLogStore.push(e3);

    const GET = createDevPanelRoute();
    const request = new Request("https://app.com/api/dev-network", {
      headers: { "last-event-id": "entry-1" },
    });
    const response = await GET(request);
    const reader = response.body!.getReader();

    // connected
    const { value: v0 } = await reader.read();
    expect(decoder.decode(v0)).toBe(": connected\n\n");

    // e2
    const { value: v1 } = await reader.read();
    expect(decoder.decode(v1)).toContain("entry-2");

    // e3
    const { value: v2 } = await reader.read();
    expect(decoder.decode(v2)).toContain("entry-3");

    await reader.cancel();
  });

  it("calls unsubscribe when the stream is cancelled", async () => {
    const unsubSpy = vi.fn();
    vi.spyOn(devLogStore, "subscribe").mockReturnValue(unsubSpy);

    const GET = createDevPanelRoute();
    const response = await GET(new Request("https://app.com/api/dev-network"));

    await response.body!.cancel();

    expect(unsubSpy).toHaveBeenCalledOnce();
  });

  it("calls clearInterval when the stream is cancelled", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    const GET = createDevPanelRoute();
    const response = await GET(new Request("https://app.com/api/dev-network"));

    await response.body!.cancel();

    expect(clearSpy).toHaveBeenCalled();
  });

  it("replays the full session buffer when Last-Event-ID is unrecognized", async () => {
    const e1 = makeEntry({ sessionId: "test-session", id: "entry-1" });
    const e2 = makeEntry({ sessionId: "test-session", id: "entry-2" });
    devLogStore.push(e1);
    devLogStore.push(e2);

    const GET = createDevPanelRoute();
    const request = new Request("https://app.com/api/dev-network", {
      headers: { "last-event-id": "id-that-does-not-exist" },
    });
    const response = await GET(request);
    const reader = response.body!.getReader();

    await reader.read(); // ": connected"

    // Both entries replayed because the ID was not found in the buffer
    const { value: v1 } = await reader.read();
    expect(decoder.decode(v1)).toContain("entry-1");

    const { value: v2 } = await reader.read();
    expect(decoder.decode(v2)).toContain("entry-2");

    await reader.cancel();
  });
});

// ---------------------------------------------------------------------------
// createDevPanelSnapshot
// ---------------------------------------------------------------------------

describe("createDevPanelSnapshot", () => {
  it("returns 404 when enabled is false", async () => {
    const GET = createDevPanelSnapshot({ enabled: false });
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    expect(response.status).toBe(404);
  });

  it("returns the guard response when the guard blocks the request", async () => {
    const GET = createDevPanelSnapshot({
      guard: () => new Response("Forbidden", { status: 403 }),
    });
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    expect(response.status).toBe(403);
  });

  it("returns entries for the matching session as JSON", async () => {
    const e1 = makeEntry({ sessionId: "test-session", id: "mine-1" });
    const e2 = makeEntry({ sessionId: "other-session", id: "not-mine" });
    const e3 = makeEntry({ sessionId: "test-session", id: "mine-2" });
    devLogStore.push(e1);
    devLogStore.push(e2);
    devLogStore.push(e3);

    const GET = createDevPanelSnapshot();
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    const body = await response.json();

    expect(body.entries).toHaveLength(2);
    expect(body.entries.map((e: LogEntry) => e.id)).toEqual(["mine-1", "mine-2"]);
  });

  it("excludes entries that belong to a different session", async () => {
    devLogStore.push(makeEntry({ sessionId: "other-session" }));

    const GET = createDevPanelSnapshot();
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    const body = await response.json();

    expect(body.entries).toHaveLength(0);
  });

  it("returns an empty entries array when no session ID is available", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers()); // no x-dev-sid
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as any); // no cookie

    devLogStore.push(makeEntry({ sessionId: "test-session" }));

    const GET = createDevPanelSnapshot();
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    const body = await response.json();

    expect(body.entries).toHaveLength(0);
  });

  it("does not return null-session entries even when the request has no session ID", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers());
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as any);

    // Entry recorded outside any request context (e.g. background server task)
    devLogStore.push(makeEntry({ sessionId: null }));

    const GET = createDevPanelSnapshot();
    const response = await GET(new Request("https://app.com/api/dev-network/snapshot"));
    const body = await response.json();

    // null must not match null — prevents leaking background requests into any session
    expect(body.entries).toHaveLength(0);
  });
});

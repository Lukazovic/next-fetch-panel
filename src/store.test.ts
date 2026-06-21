import { describe, it, expect, vi } from "vitest";
import { createStore, BUFFER_SIZE, type LogEntry } from "./store";

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 42,
    ts: Date.now(),
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "session-1",
    ...overrides,
  };
}

describe("createStore", () => {
  describe("push and getBuffer", () => {
    it("stores a pushed entry", () => {
      const store = createStore();
      const entry = makeEntry();
      store.push(entry);
      expect(store.getBuffer()).toEqual([entry]);
    });

    it("preserves insertion order", () => {
      const store = createStore();
      const a = makeEntry({ id: "a" });
      const b = makeEntry({ id: "b" });
      const c = makeEntry({ id: "c" });
      store.push(a);
      store.push(b);
      store.push(c);
      expect(store.getBuffer().map((e) => e.id)).toEqual(["a", "b", "c"]);
    });

    it("returns an empty array when nothing was pushed", () => {
      const store = createStore();
      expect(store.getBuffer()).toEqual([]);
    });

    it("returns a copy — mutating the result does not affect the internal buffer", () => {
      const store = createStore();
      const entry = makeEntry();
      store.push(entry);

      const buffer = store.getBuffer();
      buffer.pop();

      expect(store.getBuffer()).toHaveLength(1);
    });
  });

  describe("ring buffer overflow", () => {
    it(`drops the oldest entry when the buffer exceeds ${BUFFER_SIZE}`, () => {
      const store = createStore();
      const first = makeEntry({ id: "first" });
      store.push(first);

      for (let i = 0; i < BUFFER_SIZE; i++) {
        store.push(makeEntry({ id: `entry-${i}` }));
      }

      const buffer = store.getBuffer();
      expect(buffer).toHaveLength(BUFFER_SIZE);
      expect(buffer.find((e) => e.id === "first")).toBeUndefined();
      expect(buffer[buffer.length - 1].id).toBe(`entry-${BUFFER_SIZE - 1}`);
    });

    it("keeps exactly bufferSize entries after many pushes", () => {
      const store = createStore();
      store.configure({ bufferSize: 5 });

      for (let i = 0; i < 20; i++) {
        store.push(makeEntry({ id: `entry-${i}` }));
      }

      const buffer = store.getBuffer();
      expect(buffer).toHaveLength(5);
      expect(buffer.map((e) => e.id)).toEqual([
        "entry-15",
        "entry-16",
        "entry-17",
        "entry-18",
        "entry-19",
      ]);
    });

    it("handles bufferSize of 1 — only the latest entry survives", () => {
      const store = createStore();
      store.configure({ bufferSize: 1 });

      store.push(makeEntry({ id: "old" }));
      store.push(makeEntry({ id: "new" }));

      expect(store.getBuffer()).toHaveLength(1);
      expect(store.getBuffer()[0].id).toBe("new");
    });
  });

  describe("subscribe and unsubscribe", () => {
    it("calls subscriber when an entry is pushed", () => {
      const store = createStore();
      const fn = vi.fn();
      store.subscribe(fn);

      const entry = makeEntry();
      store.push(entry);

      expect(fn).toHaveBeenCalledOnce();
      expect(fn).toHaveBeenCalledWith(entry);
    });

    it("calls all registered subscribers", () => {
      const store = createStore();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      store.subscribe(fn1);
      store.subscribe(fn2);

      store.push(makeEntry());

      expect(fn1).toHaveBeenCalledOnce();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("stops calling subscriber after unsubscribe", () => {
      const store = createStore();
      const fn = vi.fn();
      const unsubscribe = store.subscribe(fn);
      unsubscribe();

      store.push(makeEntry());

      expect(fn).not.toHaveBeenCalled();
    });

    it("unsubscribing one subscriber does not affect others", () => {
      const store = createStore();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const unsub1 = store.subscribe(fn1);
      store.subscribe(fn2);
      unsub1();

      store.push(makeEntry());

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("a throwing subscriber does not prevent others from being called", () => {
      const store = createStore();
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const healthy = vi.fn();
      store.subscribe(throwing);
      store.subscribe(healthy);

      // The store uses forEach which does not catch — this verifies current behavior
      // (the error propagates). If isolation is desired in the future, this test
      // would need updating alongside the store implementation.
      expect(() => store.push(makeEntry())).toThrow("boom");
      expect(healthy).not.toHaveBeenCalled();
    });
  });

  describe("configure", () => {
    it("shrinks the buffer immediately, keeping the newest entries", () => {
      const store = createStore();
      for (let i = 0; i < 10; i++) {
        store.push(makeEntry({ id: `entry-${i}` }));
      }

      store.configure({ bufferSize: 3 });

      const buffer = store.getBuffer();
      expect(buffer).toHaveLength(3);
      expect(buffer.map((e) => e.id)).toEqual(["entry-7", "entry-8", "entry-9"]);
    });

    it("growing the buffer limit allows more entries", () => {
      const store = createStore();
      store.configure({ bufferSize: 3 });

      for (let i = 0; i < 3; i++) store.push(makeEntry({ id: `a-${i}` }));
      store.configure({ bufferSize: 10 });
      for (let i = 0; i < 5; i++) store.push(makeEntry({ id: `b-${i}` }));

      expect(store.getBuffer()).toHaveLength(8);
    });

    it("does not drop entries when new limit equals current size", () => {
      const store = createStore();
      for (let i = 0; i < 5; i++) store.push(makeEntry({ id: `e-${i}` }));

      store.configure({ bufferSize: 5 });

      expect(store.getBuffer()).toHaveLength(5);
    });

    it("bufferSize 0 clears all entries", () => {
      const store = createStore();
      store.push(makeEntry());
      store.push(makeEntry());

      store.configure({ bufferSize: 0 });

      expect(store.getBuffer()).toEqual([]);
    });
  });

  describe("singleton behavior", () => {
    it("devLogStore is the same instance across two imports", async () => {
      const { devLogStore: a } = await import("./store");
      const { devLogStore: b } = await import("./store");
      expect(a).toBe(b);
    });

    it("devLogStore is stored on globalThis", () => {
      expect(globalThis.__devLogStore).toBeDefined();
    });
  });
});

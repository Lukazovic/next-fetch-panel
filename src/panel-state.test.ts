import { describe, it, expect, vi, beforeEach } from "vitest";

// panel-state.ts holds module-level mutable state (_isOpen, listeners).
// Reset modules before each test so every test starts with a fresh instance.
async function fresh() {
  vi.resetModules();
  const { panelState } = await import("./panel-state");
  return panelState;
}

describe("panelState", () => {
  describe("initial state", () => {
    it("starts closed", async () => {
      const state = await fresh();
      expect(state.getSnapshot()).toBe(false);
    });
  });

  describe("open", () => {
    it("sets state to true", async () => {
      const state = await fresh();
      state.open();
      expect(state.getSnapshot()).toBe(true);
    });

    it("notifies subscribers", async () => {
      const state = await fresh();
      const fn = vi.fn();
      state.subscribe(fn);
      state.open();
      expect(fn).toHaveBeenCalledOnce();
    });

    it("does nothing when already open", async () => {
      const state = await fresh();
      const fn = vi.fn();
      state.open();
      state.subscribe(fn);
      state.open();
      expect(fn).not.toHaveBeenCalled();
      expect(state.getSnapshot()).toBe(true);
    });
  });

  describe("close", () => {
    it("sets state to false", async () => {
      const state = await fresh();
      state.open();
      state.close();
      expect(state.getSnapshot()).toBe(false);
    });

    it("notifies subscribers", async () => {
      const state = await fresh();
      state.open();
      const fn = vi.fn();
      state.subscribe(fn);
      state.close();
      expect(fn).toHaveBeenCalledOnce();
    });

    it("does nothing when already closed", async () => {
      const state = await fresh();
      const fn = vi.fn();
      state.subscribe(fn);
      state.close();
      expect(fn).not.toHaveBeenCalled();
      expect(state.getSnapshot()).toBe(false);
    });
  });

  describe("toggle", () => {
    it("flips false to true", async () => {
      const state = await fresh();
      state.toggle();
      expect(state.getSnapshot()).toBe(true);
    });

    it("flips true to false", async () => {
      const state = await fresh();
      state.open();
      state.toggle();
      expect(state.getSnapshot()).toBe(false);
    });

    it("notifies subscribers on every call", async () => {
      const state = await fresh();
      const fn = vi.fn();
      state.subscribe(fn);
      state.toggle();
      state.toggle();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("stops notifying after unsubscribe", async () => {
      const state = await fresh();
      const fn = vi.fn();
      const unsub = state.subscribe(fn);
      unsub();
      state.open();
      expect(fn).not.toHaveBeenCalled();
    });

    it("unsubscribing one listener does not affect others", async () => {
      const state = await fresh();
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const unsub1 = state.subscribe(fn1);
      state.subscribe(fn2);
      unsub1();
      state.open();
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledOnce();
    });

    it("calling unsubscribe twice is safe", async () => {
      const state = await fresh();
      const fn = vi.fn();
      const unsub = state.subscribe(fn);
      unsub();
      expect(() => unsub()).not.toThrow();
    });
  });
});

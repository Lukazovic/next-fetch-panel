// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelConfig } from "./usePanelConfig";
import { DEFAULT_CONFIG, STORAGE_KEY } from "../panel.config";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePanelConfig", () => {
  it("returns DEFAULT_CONFIG when localStorage is empty", () => {
    const { result } = renderHook(() => usePanelConfig());
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("merges a saved partial config with DEFAULT_CONFIG on mount", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorScheme: "dark" }));
    const { result } = renderHook(() => usePanelConfig());
    expect(result.current.config).toEqual({ ...DEFAULT_CONFIG, colorScheme: "dark" });
  });

  it("update writes the new config to localStorage", () => {
    const { result } = renderHook(() => usePanelConfig());
    act(() => {
      result.current.update({ colorScheme: "dark" });
    });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.colorScheme).toBe("dark");
  });

  it("update reflects the new value in config state", () => {
    const { result } = renderHook(() => usePanelConfig());
    act(() => {
      result.current.update({ width: 1200 });
    });
    expect(result.current.config.width).toBe(1200);
  });

  it("update is referentially stable across re-renders", () => {
    const { result, rerender } = renderHook(() => usePanelConfig());
    const updateBefore = result.current.update;
    rerender();
    expect(result.current.update).toBe(updateBefore);
  });

  it("falls back to DEFAULT_CONFIG without throwing when localStorage value is corrupted", () => {
    localStorage.setItem(STORAGE_KEY, "{ invalid json }");
    const { result } = renderHook(() => usePanelConfig());
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });
});

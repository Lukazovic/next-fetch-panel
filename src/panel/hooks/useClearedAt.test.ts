// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useClearedAt } from "./useClearedAt";
import { CLEARED_AT_KEY } from "../panel.constants";

beforeEach(() => {
  localStorage.clear();
});

describe("useClearedAt", () => {
  it("initializes ref to 0 when localStorage is empty", () => {
    const { result } = renderHook(() => useClearedAt());
    expect(result.current.clearedAtRef.current).toBe(0);
  });

  it("initializes ref from localStorage when a timestamp is stored", () => {
    const ts = 1_700_000_000_000;
    localStorage.setItem(CLEARED_AT_KEY, String(ts));
    const { result } = renderHook(() => useClearedAt());
    expect(result.current.clearedAtRef.current).toBe(ts);
  });

  it("persistClearedAt updates clearedAtRef.current", () => {
    const { result } = renderHook(() => useClearedAt());
    const ts = 1_750_000_000_000;
    act(() => {
      result.current.persistClearedAt(ts);
    });
    expect(result.current.clearedAtRef.current).toBe(ts);
  });

  it("persistClearedAt writes the timestamp to localStorage", () => {
    const { result } = renderHook(() => useClearedAt());
    const ts = 1_750_000_000_000;
    act(() => {
      result.current.persistClearedAt(ts);
    });
    expect(localStorage.getItem(CLEARED_AT_KEY)).toBe(String(ts));
  });
});

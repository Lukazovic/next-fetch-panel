// @vitest-environment jsdom

import { vi, describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEffectiveTheme } from "./useEffectiveTheme";

type FakeMQ = {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchChange: (newMatches: boolean) => void;
};

function mockMatchMedia(initiallyDark: boolean): FakeMQ {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mq: FakeMQ = {
    matches: initiallyDark,
    addEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.push(handler);
    }),
    removeEventListener: vi.fn((_: string, handler: (e: MediaQueryListEvent) => void) => {
      const idx = listeners.indexOf(handler);
      if (idx !== -1) listeners.splice(idx, 1);
    }),
    dispatchChange: (newMatches: boolean) => {
      listeners.forEach((h) => h({ matches: newMatches } as MediaQueryListEvent));
    },
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mq)
  );
  return mq;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEffectiveTheme", () => {
  it('returns "light" when colorScheme is "light" regardless of system preference', () => {
    mockMatchMedia(true); // system is dark — should be ignored
    const { result } = renderHook(() => useEffectiveTheme("light"));
    expect(result.current).toBe("light");
  });

  it('returns "dark" when colorScheme is "dark" regardless of system preference', () => {
    mockMatchMedia(false); // system is light — should be ignored
    const { result } = renderHook(() => useEffectiveTheme("dark"));
    expect(result.current).toBe("dark");
  });

  it('returns "light" when colorScheme is "system" and system prefers light', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useEffectiveTheme("system"));
    expect(result.current).toBe("light");
  });

  it('returns "dark" when colorScheme is "system" and system prefers dark', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useEffectiveTheme("system"));
    expect(result.current).toBe("dark");
  });

  it('reacts to system theme changes when colorScheme is "system"', () => {
    const mq = mockMatchMedia(false); // starts light
    const { result } = renderHook(() => useEffectiveTheme("system"));
    expect(result.current).toBe("light");

    act(() => {
      mq.dispatchChange(true); // system switches to dark
    });
    expect(result.current).toBe("dark");

    act(() => {
      mq.dispatchChange(false); // system switches back to light
    });
    expect(result.current).toBe("light");
  });

  it('does not add a media query listener when colorScheme is "light"', () => {
    const mq = mockMatchMedia(true);
    renderHook(() => useEffectiveTheme("light"));
    expect(mq.addEventListener).not.toHaveBeenCalled();
  });

  it('does not add a media query listener when colorScheme is "dark"', () => {
    const mq = mockMatchMedia(false);
    renderHook(() => useEffectiveTheme("dark"));
    expect(mq.addEventListener).not.toHaveBeenCalled();
  });

  it("removes the media query listener on unmount", () => {
    const mq = mockMatchMedia(false);
    const { unmount } = renderHook(() => useEffectiveTheme("system"));
    expect(mq.removeEventListener).not.toHaveBeenCalled();
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledOnce();
  });
});

// @vitest-environment jsdom

import { vi, describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { createRef } from "react";
import { PanelInner } from "./PanelInner";
import type { LogEntry } from "../../domain";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.getAnimations = () => [];
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  URL.createObjectURL = vi.fn().mockReturnValue("blob:mock");
  URL.revokeObjectURL = vi.fn();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let entryCounter = 0;

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  entryCounter += 1;
  return {
    id: `entry-${entryCounter}`,
    url: `https://example.com/api/resource-${entryCounter}`,
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 100,
    timestamp: 1000,
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "s1",
    ...overrides,
  };
}

function renderInner(
  overrides: {
    entries?: LogEntry[];
    selected?: LogEntry | null;
    setSelected?: (e: LogEntry | null) => void;
    onClear?: () => void;
    onOpenSettings?: () => void;
    onClose?: () => void;
    detailSize?: number;
    onDetailSizeChange?: (size: number) => void;
  } = {}
) {
  const bottomRef = createRef<HTMLDivElement>();
  const props = {
    entries: [] as LogEntry[],
    selected: null as LogEntry | null,
    setSelected: vi.fn(),
    onClear: vi.fn(),
    onOpenSettings: vi.fn(),
    onClose: vi.fn(),
    bottomRef,
    detailSize: 40,
    onDetailSizeChange: vi.fn(),
    ...overrides,
  };
  const user = userEvent.setup();
  render(<PanelInner {...props} />);
  return { user, ...props };
}

// ---------------------------------------------------------------------------
// Empty and filter states
// ---------------------------------------------------------------------------

describe("PanelInner — empty and filter states", () => {
  it("renders 'No requests yet' when entries is empty", () => {
    renderInner();
    expect(screen.getByText("No requests yet")).toBeDefined();
  });

  it("renders 'No requests match the filter' when entries exist but none match the filter string", async () => {
    const entry = makeEntry({ url: "https://example.com/api/users" });
    const { user } = renderInner({ entries: [entry] });
    await user.type(screen.getByRole("textbox"), "nonexistent-path");
    expect(screen.getByText("No requests match the filter")).toBeDefined();
  });

  it("renders one row per entry", () => {
    const entries = [makeEntry(), makeEntry(), makeEntry()];
    renderInner({ entries });
    entries.forEach((e) => {
      expect(screen.getByText(e.url)).toBeDefined();
    });
  });

  it("URL filter hides entries whose URL does not contain the filter string (case-insensitive)", async () => {
    const visible = makeEntry({ url: "https://example.com/api/orders" });
    const hidden = makeEntry({ url: "https://example.com/api/users" });
    const { user } = renderInner({ entries: [visible, hidden] });
    await user.type(screen.getByRole("textbox"), "ORDERS");
    expect(screen.getByText(visible.url)).toBeDefined();
    expect(screen.queryByText(hidden.url)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Filter-based deselection
// ---------------------------------------------------------------------------

describe("PanelInner — deselection when filtered", () => {
  it("calls setSelected(null) when the selected entry is filtered out", () => {
    const entry = makeEntry({ url: "https://example.com/api/items" });
    const setSelected = vi.fn();
    renderInner({ entries: [entry], selected: entry, setSelected });
    // Use fireEvent to bypass any focus interactions from the DetailPanel's Tabs
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzz-no-match" } });
    expect(setSelected).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Row selection
// ---------------------------------------------------------------------------

describe("PanelInner — row selection", () => {
  it("clicking an entry row calls setSelected with that entry", async () => {
    const entry = makeEntry();
    const setSelected = vi.fn();
    const { user } = renderInner({ entries: [entry], setSelected });
    await user.click(screen.getByText(entry.url));
    expect(setSelected).toHaveBeenCalledWith(entry);
  });

  it("clicking a selected row again calls setSelected(null)", async () => {
    const entry = makeEntry();
    const setSelected = vi.fn();
    const { user } = renderInner({ entries: [entry], selected: entry, setSelected });
    // entry.url also appears in DetailPanel's general tab — scope to tbody
    const tbody = document.querySelector("tbody")!;
    await user.click(within(tbody).getByText(entry.url));
    expect(setSelected).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Toolbar actions
// ---------------------------------------------------------------------------

describe("PanelInner — toolbar actions", () => {
  it("clicking 'Clear' calls onClear", async () => {
    const onClear = vi.fn();
    const { user } = renderInner({ onClear });
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("clicking the close button calls onClose", async () => {
    const onClose = vi.fn();
    const { user } = renderInner({ onClose });
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking the settings icon calls onOpenSettings", async () => {
    const onOpenSettings = vi.fn();
    const { user } = renderInner({ onOpenSettings });
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});

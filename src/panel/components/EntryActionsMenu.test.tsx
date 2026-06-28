// @vitest-environment jsdom

import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelThemeContext } from "../PanelThemeContext";
import { EntryActionsMenu } from "./EntryActionsMenu";
import type { LogEntry } from "../../domain";

// ---------------------------------------------------------------------------
// Browser API stubs (Base UI menu needs these in jsdom)
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Provide a plain writable clipboard object so vi.spyOn can replace writeText
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: async (_text: string) => {} },
    configurable: true,
    writable: true,
  });
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
});

beforeEach(() => {
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: "test-id",
    url: "https://example.com/api/users",
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 100,
    timestamp: 1000,
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "test-session",
    ...overrides,
  };
}

function renderMenu(entry: LogEntry) {
  const user = userEvent.setup();
  render(
    <PanelThemeContext.Provider value="nfp-theme-light">
      <EntryActionsMenu entry={entry} />
    </PanelThemeContext.Provider>
  );
  return user;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EntryActionsMenu", () => {
  it("renders the trigger button by default", () => {
    renderMenu(makeEntry());
    expect(screen.getByTitle("Actions")).toBeDefined();
  });

  it("trigger starts without green (copied) styling", () => {
    renderMenu(makeEntry());
    expect(screen.getByTitle("Actions").className).not.toContain("text-green-500");
  });

  it('clicking "Copy as cURL" calls clipboard.writeText with the cURL string', async () => {
    const user = renderMenu(makeEntry());
    await user.click(screen.getByTitle("Actions"));
    await user.click(await screen.findByText("Copy as cURL"));
    expect(vi.mocked(navigator.clipboard.writeText)).toHaveBeenCalledWith(
      expect.stringContaining("curl -X GET")
    );
  });

  it("trigger turns green immediately after copying", async () => {
    const user = renderMenu(makeEntry());
    await user.click(screen.getByTitle("Actions"));
    await user.click(await screen.findByText("Copy as cURL"));
    expect(screen.getByTitle("Actions").className).toContain("text-green-500");
  });

  it("copied styling reverts to default after 1500ms", async () => {
    const user = renderMenu(makeEntry());
    await user.click(screen.getByTitle("Actions"));
    await user.click(await screen.findByText("Copy as cURL"));

    expect(screen.getByTitle("Actions").className).toContain("text-green-500");

    await waitFor(
      () => expect(screen.getByTitle("Actions").className).not.toContain("text-green-500"),
      { timeout: 2000 }
    );
  }, 3000);

  it('"Download response body" is shown when responseBody is not null', async () => {
    const user = renderMenu(makeEntry({ responseBody: '{"ok":true}' }));
    await user.click(screen.getByTitle("Actions"));
    expect(await screen.findByText("Download response body")).toBeDefined();
  });

  it('"Download response body" is hidden when responseBody is null', async () => {
    const user = renderMenu(makeEntry({ responseBody: null }));
    await user.click(screen.getByTitle("Actions"));
    await screen.findByText("Copy as cURL");
    expect(screen.queryByText("Download response body")).toBeNull();
  });

  it('"Download request body" is hidden when requestBody is "[binary]"', async () => {
    const user = renderMenu(makeEntry({ requestBody: "[binary]" }));
    await user.click(screen.getByTitle("Actions"));
    await screen.findByText("Copy as cURL");
    expect(screen.queryByText("Download request body")).toBeNull();
  });
});

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, within, act, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import DevNetworkPanel from "./Panel";
import { panelState } from "./panel-state";
import type { LogEntry } from "./store";

// ---------------------------------------------------------------------------
// EventSource mock
// ---------------------------------------------------------------------------

const eventSourceInstances: MockEventSource[] = [];

class MockEventSource {
  static CLOSED = 2;
  static CONNECTING = 0;
  static OPEN = 1;

  readyState = 0;
  url: string;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    eventSourceInstances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// react-resizable-panels uses ResizeObserver for layout — replace with
// minimal wrappers that pass children through.
vi.mock("react-resizable-panels", async () => {
  const R = await import("react");
  return {
    Group: ({ children }: { children: React.ReactNode }) =>
      R.createElement("div", { "data-rp": "group" }, children),
    Panel: ({ children }: { children: React.ReactNode }) =>
      R.createElement("div", { "data-rp": "panel" }, children),
    Separator: () => null,
    useGroupRef: () => R.useRef(null),
  };
});

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

beforeAll(() => {
  Object.defineProperty(window, "EventSource", {
    value: MockEventSource,
    writable: true,
    configurable: true,
  });

  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/fake");
  URL.revokeObjectURL = vi.fn();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });

  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.getAnimations = () => [];

  // Vitest 4 uses Reflect.construct(implementation, ...) when new.target is set.
  // Arrow function implementations are not constructable, so we need a real class.
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  eventSourceInstances.length = 0;
  localStorage.clear();
  panelState.close();
  vi.clearAllMocks();
  // Re-apply clipboard mock after clearAllMocks
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

// RTL's afterEach cleanup is not auto-registered in Vitest unless globals:true
// is set, so we call cleanup() explicitly.
afterEach(() => {
  cleanup();
  panelState.close();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: crypto.randomUUID(),
    url: "https://api.example.com/users",
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 42,
    ts: Date.now(), // must be > 0 so it isn't filtered by the clearedAt guard
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "s1",
    ...overrides,
  };
}

function pushEntry(entry: LogEntry) {
  act(() => {
    eventSourceInstances[0]?.onmessage?.(
      new MessageEvent("message", { data: JSON.stringify(entry) })
    );
  });
}

function renderPanel(props?: Partial<React.ComponentProps<typeof DevNetworkPanel>>) {
  return render(<DevNetworkPanel {...props} />);
}

function openPanel() {
  act(() => panelState.open());
}

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — toggle button", () => {
  it("renders the toggle button when showToggleButton is true", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /Server Network/i })).toBeInTheDocument();
  });

  it("shows a badge with the entry count on the toggle button", () => {
    renderPanel();
    pushEntry(makeEntry());
    pushEntry(makeEntry());
    const btn = screen.getByRole("button", { name: /Server Network/i });
    expect(btn.textContent).toContain("2");
  });

  it("does not render the toggle button when showToggleButton is false", () => {
    renderPanel({ showToggleButton: false });
    expect(screen.queryByRole("button", { name: /Server Network/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Open / close
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — open/close", () => {
  it("opens the panel when the toggle button is clicked", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /Server Network/i }));
    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
  });

  it("hides the toggle button while the panel is open", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");
    expect(screen.queryByRole("button", { name: /Server Network/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SSE entry rendering
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — SSE entries", () => {
  it("renders a row with method, status, and URL after an SSE message arrives", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ url: "https://api.example.com/users", method: "GET", status: 200 }));

    expect(screen.getByText("https://api.example.com/users")).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("renders multiple entries in insertion order", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ id: "a", url: "https://api.example.com/a" }));
    pushEntry(makeEntry({ id: "b", url: "https://api.example.com/b" }));

    expect(screen.getByText("https://api.example.com/a")).toBeInTheDocument();
    expect(screen.getByText("https://api.example.com/b")).toBeInTheDocument();
  });

  it("deduplicates entries with the same ID", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    const entry = makeEntry({ id: "dup" });
    pushEntry(entry);
    pushEntry(entry); // same id — should be ignored

    // header row + 1 data row = 2 rows total
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("displays ERR when status is null (network error)", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ status: null, statusText: null, error: "Network failure" }));

    expect(screen.getByText("ERR")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — filter", () => {
  async function renderWithTwoEntries() {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");
    pushEntry(makeEntry({ id: "1", url: "https://api.example.com/users" }));
    pushEntry(makeEntry({ id: "2", url: "https://api.example.com/posts" }));
    return screen.getByPlaceholderText("Filter by URL...");
  }

  it("narrows the list when text is typed in the filter input", async () => {
    const input = await renderWithTwoEntries();
    fireEvent.change(input, { target: { value: "users" } });

    expect(screen.getByText("https://api.example.com/users")).toBeInTheDocument();
    expect(screen.queryByText("https://api.example.com/posts")).toBeNull();
  });

  it("shows a filtered count when results are narrowed", async () => {
    const input = await renderWithTwoEntries();
    fireEvent.change(input, { target: { value: "users" } });

    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });

  it("restores all entries after the clear (×) button is clicked", async () => {
    const input = await renderWithTwoEntries();
    fireEvent.change(input, { target: { value: "users" } });
    expect(screen.queryByText("https://api.example.com/posts")).toBeNull();

    // The × button lives inside the same flex container as the input
    const filterContainer = input.closest("div")!;
    await userEvent.click(within(filterContainer).getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("https://api.example.com/posts")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — detail pane", () => {
  it("opens the detail pane when a row is clicked", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ url: "https://api.example.com/item" }));

    await userEvent.click(screen.getByText("https://api.example.com/item"));

    // Detail pane shows tabs: general, headers, payload, response
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /general/i })).toBeInTheDocument();
    });
  });

  it("closes the detail pane when the selected row is clicked again", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ url: "https://api.example.com/item" }));

    const urlCell = screen.getByText("https://api.example.com/item");

    // Open detail — ✕ close button appears
    await userEvent.click(urlCell);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "✕" })).toBeInTheDocument();
    });

    // Close detail — click the same cell; ✕ button disappears
    await userEvent.click(urlCell);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "✕" })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Clear
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — clear button", () => {
  it("removes all entries from the list when clear is clicked", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ id: "c1" }));
    pushEntry(makeEntry({ id: "c2" }));
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2

    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(await screen.findByText("No requests yet")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Settings dialog
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — settings dialog", () => {
  function getSettingsButton() {
    // Header contains [settings-icon-btn] [clear-text-btn] [close-icon-btn]
    const clearBtn = screen.getByRole("button", { name: /clear/i });
    const [settingsBtn] = within(clearBtn.parentElement!).getAllByRole("button");
    return settingsBtn;
  }

  it("opens the settings dialog when the gear button is clicked", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    await userEvent.click(getSettingsButton());

    expect(await screen.findByText("Panel Settings")).toBeInTheDocument();
  });

  it("switches the theme to dark when the Dark option is clicked in settings", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    await userEvent.click(getSettingsButton());
    await screen.findByText("Panel Settings");

    await userEvent.click(screen.getByRole("button", { name: /^dark$/i }));

    await waitFor(() => {
      expect(document.querySelectorAll(".nfp-theme-dark").length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// cURL copy
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — Copy as cURL", () => {
  it("calls navigator.clipboard.writeText with a curl string", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry({ method: "GET", url: "https://api.example.com/users" }));

    const triggerBtn = screen.getByTitle("Actions");
    await userEvent.click(triggerBtn);

    const copyItem = await screen.findByText(/Copy as cURL/i);
    await userEvent.click(copyItem);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      const [curlStr] = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(curlStr).toContain("curl -X GET");
      expect(curlStr).toContain("https://api.example.com/users");
    });
  });

  it("shows a green check icon on the trigger for 1.5 s then reverts", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(makeEntry());

    await userEvent.click(screen.getByTitle("Actions"));
    await userEvent.click(await screen.findByText(/Copy as cURL/i));

    // Trigger turns green immediately after copying
    await waitFor(() => {
      expect(screen.getByTitle("Actions").classList.contains("text-green-500")).toBe(true);
    });

    // After 1.5 s the indicator resets automatically
    await waitFor(
      () => expect(screen.getByTitle("Actions").classList.contains("text-green-500")).toBe(false),
      { timeout: 2_000 }
    );
  }, 5_000);
});

// ---------------------------------------------------------------------------
// Auto-scroll
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — auto-scroll", () => {
  it("scrolls to the bottom when new entries arrive and the viewport is near the bottom", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    // In jsdom all scroll dimensions default to 0, so distanceFromBottom = 0 < 100 px threshold
    pushEntry(makeEntry());

    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  it("does not auto-scroll when the viewport is scrolled away from the bottom", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    // Simulate the user scrolling up: set scrollHeight=500, clientHeight=300, scrollTop stays 0
    // → distanceFromBottom = 500 - 0 - 300 = 200 ≥ 100 px threshold → no auto-scroll
    document.querySelectorAll('[data-slot="scroll-area-viewport"]').forEach((el) => {
      Object.defineProperty(el, "scrollHeight", { value: 500, configurable: true });
      Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
    });

    (window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>).mockClear();
    pushEntry(makeEntry());

    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SSE reconnect
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — SSE reconnect", () => {
  it("creates a new EventSource after CLOSED error + retry delay", () => {
    vi.useFakeTimers();
    try {
      renderPanel();

      expect(eventSourceInstances).toHaveLength(1);
      const first = eventSourceInstances[0];

      act(() => {
        first.readyState = MockEventSource.CLOSED;
        first.onerror?.(new Event("error"));
      });

      act(() => vi.advanceTimersByTime(1_000));

      expect(eventSourceInstances).toHaveLength(2);
      expect(eventSourceInstances[1].url).toBe("/api/dev-network");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Truncation warning
// ---------------------------------------------------------------------------

describe("DevNetworkPanel — truncation warning", () => {
  it("shows a request body truncation notice in the General tab", async () => {
    renderPanel();
    openPanel();
    await screen.findByText("No requests yet");

    pushEntry(
      makeEntry({
        requestBodyTruncated: true,
        requestBody: "x".repeat(100),
      })
    );

    await userEvent.click(screen.getByText("https://api.example.com/users"));

    await waitFor(() => {
      expect(screen.getByText("Request body truncated")).toBeInTheDocument();
    });
  });
});

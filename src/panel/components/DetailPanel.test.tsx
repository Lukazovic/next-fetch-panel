// @vitest-environment jsdom

import { vi, describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeaderList, BodyTruncatedNotice, BodyViewer, DetailPanel } from "./DetailPanel";
import { BODY_LIMIT } from "../../domain";
import type { LogEntry } from "../../domain";

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    duration: 142,
    timestamp: 1000,
    requestHeaders: { authorization: "Bearer token" },
    responseHeaders: { "content-type": "application/json" },
    requestBody: null,
    responseBody: null,
    sessionId: "s1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HeaderList
// ---------------------------------------------------------------------------

describe("HeaderList", () => {
  it('renders "No headers" when headers is empty', () => {
    render(<HeaderList headers={{}} />);
    expect(screen.getByText("No headers")).toBeDefined();
  });

  it('renders "No headers" when headers is undefined', () => {
    render(<HeaderList headers={undefined} />);
    expect(screen.getByText("No headers")).toBeDefined();
  });

  it("renders a row for each header key-value pair", () => {
    render(<HeaderList headers={{ "content-type": "application/json", "x-custom": "value" }} />);
    expect(screen.getByText("content-type")).toBeDefined();
    expect(screen.getByText("application/json")).toBeDefined();
    expect(screen.getByText("x-custom")).toBeDefined();
    expect(screen.getByText("value")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BodyTruncatedNotice
// ---------------------------------------------------------------------------

describe("BodyTruncatedNotice", () => {
  it("shows only captured size when contentLength is not provided", () => {
    render(<BodyTruncatedNotice kind="Request" captured={1024} />);
    expect(screen.getByText(/1\.0 KB were captured/)).toBeDefined();
    expect(screen.queryByText(/of ~/)).toBeNull();
  });

  it("shows both captured and total sizes when contentLength is provided", () => {
    render(<BodyTruncatedNotice kind="Response" captured={1024} contentLength={10240} />);
    expect(screen.getByText(/1\.0 KB of ~10\.0 KB/)).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BodyViewer
// ---------------------------------------------------------------------------

describe("BodyViewer", () => {
  it("renders the emptyLabel when body is null", () => {
    render(<BodyViewer body={null} contentType={null} emptyLabel="No request body" />);
    expect(screen.getByText("No request body")).toBeDefined();
  });

  it("renders body as-is for non-JSON text", () => {
    render(<BodyViewer body="hello world" contentType="text/plain" emptyLabel="empty" />);
    expect(screen.getByText("hello world")).toBeDefined();
  });

  it("pretty-prints valid JSON", () => {
    render(<BodyViewer body='{"key":"value"}' contentType="application/json" emptyLabel="empty" />);
    expect(screen.getByText(/"key"/)).toBeDefined();
  });

  it("shows the large-body guard when body length is at or above BODY_LIMIT", () => {
    const bigBody = "x".repeat(BODY_LIMIT);
    render(<BodyViewer body={bigBody} contentType="text/plain" emptyLabel="empty" />);
    expect(screen.getByText(/Body is large/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Render anyway" })).toBeDefined();
  });

  it("reveals the body after clicking 'Render anyway'", async () => {
    const user = userEvent.setup();
    const bigBody = "x".repeat(BODY_LIMIT);
    render(<BodyViewer body={bigBody} contentType="text/plain" emptyLabel="empty" />);
    await user.click(screen.getByRole("button", { name: "Render anyway" }));
    expect(screen.queryByText(/Body is large/)).toBeNull();
  });

  it("shows a Download button when downloadName is provided and body is large", () => {
    const bigBody = "x".repeat(BODY_LIMIT);
    render(
      <BodyViewer
        body={bigBody}
        contentType="text/plain"
        emptyLabel="empty"
        downloadName="response"
      />
    );
    expect(screen.getByRole("button", { name: "Download" })).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DetailPanel
// ---------------------------------------------------------------------------

describe("DetailPanel", () => {
  it("displays the URL pathname in the header", () => {
    render(<DetailPanel entry={makeEntry()} onClose={() => {}} />);
    expect(screen.getByText("/api/users")).toBeDefined();
  });

  it("defaults to the general tab — Request URL label is visible", () => {
    render(<DetailPanel entry={makeEntry()} onClose={() => {}} />);
    expect(screen.getByText("Request URL")).toBeDefined();
  });

  it("general tab shows method, status, and duration", () => {
    render(<DetailPanel entry={makeEntry()} onClose={() => {}} />);
    expect(screen.getByText("GET")).toBeDefined();
    expect(screen.getByText("200 OK")).toBeDefined();
    expect(screen.getByText("142ms")).toBeDefined();
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DetailPanel entry={makeEntry()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "✕" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('"headers" tab shows request and response header sections', async () => {
    const user = userEvent.setup();
    render(
      <DetailPanel
        entry={makeEntry({
          requestHeaders: { authorization: "Bearer token" },
          responseHeaders: { "content-type": "application/json" },
        })}
        onClose={() => {}}
      />
    );
    await user.click(screen.getByText("headers"));
    expect(await screen.findByText("Response Headers")).toBeDefined();
    expect(screen.getByText("Request Headers")).toBeDefined();
  });

  it('"payload" tab shows the request body viewer', async () => {
    const user = userEvent.setup();
    render(<DetailPanel entry={makeEntry()} onClose={() => {}} />);
    await user.click(screen.getByText("payload"));
    expect(await screen.findByText("No request body")).toBeDefined();
  });

  it('"response" tab shows the response body viewer', async () => {
    const user = userEvent.setup();
    render(<DetailPanel entry={makeEntry()} onClose={() => {}} />);
    await user.click(screen.getByText("response"));
    expect(await screen.findByText("No response body")).toBeDefined();
  });
});

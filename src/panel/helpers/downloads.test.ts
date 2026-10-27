// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { LogEntry } from "../../domain";
import { downloadBody, downloadEntry } from "./downloads";

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

// ---------------------------------------------------------------------------
// downloadBody
// ---------------------------------------------------------------------------

describe("downloadBody", () => {
  let clickMock: ReturnType<typeof vi.fn>;
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clickMock = vi.fn();
    anchor = { href: "", download: "", click: clickMock };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets a .json extension for content starting with {", () => {
    downloadBody('{"key":"value"}', "response");
    expect(anchor.download).toBe("response.json");
    expect(clickMock).toHaveBeenCalledOnce();
  });

  it("sets a .json extension for content starting with [", () => {
    downloadBody("[1, 2, 3]", "array-data");
    expect(anchor.download).toBe("array-data.json");
  });

  it("sets a .txt extension for plain text content", () => {
    downloadBody("hello world", "output");
    expect(anchor.download).toBe("output.txt");
  });

  it("pretty-prints JSON content", async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:captured";
    });

    downloadBody('{"key":"value"}', "response");

    expect(await capturedBlob!.text()).toBe('{\n  "key": "value"\n}');
  });

  it("writes plain text content unchanged", async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:captured";
    });

    downloadBody("hello world", "output");

    expect(await capturedBlob!.text()).toBe("hello world");
  });

  it("calls URL.revokeObjectURL after the download to avoid memory leaks", () => {
    downloadBody("content", "file");
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:mock");
  });
});

// ---------------------------------------------------------------------------
// downloadEntry
// ---------------------------------------------------------------------------

describe("downloadEntry", () => {
  let clickMock: ReturnType<typeof vi.fn>;
  let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    clickMock = vi.fn();
    anchor = { href: "", download: "", click: clickMock };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the last path segment of the URL as the filename stem", () => {
    downloadEntry(makeEntry({ url: "https://example.com/api/users" }));
    expect(anchor.download).toBe("users-entry.json");
  });

  it("falls back to 'entry' as the stem when the URL cannot be parsed", () => {
    downloadEntry(makeEntry({ url: "not-a-valid-url" }));
    expect(anchor.download).toBe("entry-entry.json");
  });

  it("triggers the file download", () => {
    downloadEntry(makeEntry());
    expect(clickMock).toHaveBeenCalledOnce();
  });

  it("calls URL.revokeObjectURL after the download to avoid memory leaks", () => {
    downloadEntry(makeEntry());
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith("blob:mock");
  });

  it("writes the JSON-serialized entry as the Blob content", async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:captured";
    });

    const entry = makeEntry();
    downloadEntry(entry);

    const text = await capturedBlob!.text();
    expect(JSON.parse(text)).toEqual(entry);
  });

  it("nests JSON bodies as objects in the downloaded entry", async () => {
    let capturedBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      capturedBlob = blob as Blob;
      return "blob:captured";
    });

    downloadEntry(makeEntry({ responseBody: '{"ok":true}' }));

    const parsed = JSON.parse(await capturedBlob!.text());
    expect(parsed.responseBody).toEqual({ ok: true });
  });
});

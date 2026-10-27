import { describe, it, expect } from "vitest";
import type { LogEntry } from "../../domain";
import {
  methodClass,
  statusClass,
  durationBarColor,
  formatTs,
  formatBytes,
  tryPrettyJson,
  toCurl,
  serializeEntry,
} from "./formatters";

// ---------------------------------------------------------------------------
// methodClass
// ---------------------------------------------------------------------------

describe("methodClass", () => {
  it("returns the blue class for GET", () => {
    expect(methodClass("GET")).toBe("text-blue-400");
  });

  it("returns the violet class for POST", () => {
    expect(methodClass("POST")).toBe("text-violet-400");
  });

  it("returns the red class for DELETE", () => {
    expect(methodClass("DELETE")).toBe("text-red-400");
  });

  it("returns the orange class for PUT", () => {
    expect(methodClass("PUT")).toBe("text-orange-400");
  });

  it("returns the orange class for PATCH", () => {
    expect(methodClass("PATCH")).toBe("text-orange-400");
  });

  it("returns the slate fallback for an unknown method", () => {
    expect(methodClass("CONNECT")).toBe("text-slate-400");
    expect(methodClass("")).toBe("text-slate-400");
  });
});

// ---------------------------------------------------------------------------
// statusClass
// ---------------------------------------------------------------------------

describe("statusClass", () => {
  it("returns green for a 2xx status", () => {
    expect(statusClass(200)).toBe("text-green-400");
    expect(statusClass(201)).toBe("text-green-400");
    expect(statusClass(299)).toBe("text-green-400");
  });

  it("returns amber for a 3xx status", () => {
    expect(statusClass(301)).toBe("text-amber-400");
    expect(statusClass(304)).toBe("text-amber-400");
  });

  it("returns red for a 4xx or 5xx status", () => {
    expect(statusClass(404)).toBe("text-red-400");
    expect(statusClass(500)).toBe("text-red-400");
  });

  it("returns red for a null status (network error)", () => {
    expect(statusClass(null)).toBe("text-red-400");
  });

  it("returns red when an error string is present, regardless of status", () => {
    expect(statusClass(200, "timeout")).toBe("text-red-400");
    expect(statusClass(null, "connection refused")).toBe("text-red-400");
  });
});

// ---------------------------------------------------------------------------
// durationBarColor
// ---------------------------------------------------------------------------

describe("durationBarColor", () => {
  it("returns green for durations under 200ms", () => {
    expect(durationBarColor(0)).toBe("bg-green-500");
    expect(durationBarColor(199)).toBe("bg-green-500");
  });

  it("returns amber for durations between 200ms and 999ms", () => {
    expect(durationBarColor(200)).toBe("bg-amber-500");
    expect(durationBarColor(999)).toBe("bg-amber-500");
  });

  it("returns red for durations of 1000ms or more", () => {
    expect(durationBarColor(1000)).toBe("bg-red-500");
    expect(durationBarColor(5000)).toBe("bg-red-500");
  });
});

// ---------------------------------------------------------------------------
// formatTs
// ---------------------------------------------------------------------------

describe("formatTs", () => {
  it("returns a string in HH:MM:SS.mmm format", () => {
    // Test the shape only — exact value depends on the local timezone.
    expect(formatTs(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it("returns a string in HH:MM:SS.mmm format for a historical timestamp", () => {
    // Midnight 2020-01-01 UTC = 1577836800000
    expect(formatTs(1577836800000)).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});

// ---------------------------------------------------------------------------
// formatBytes
// ---------------------------------------------------------------------------

describe("formatBytes", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats values in the KB range", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats values in the MB range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });
});

// ---------------------------------------------------------------------------
// tryPrettyJson
// ---------------------------------------------------------------------------

describe("tryPrettyJson", () => {
  it("pretty-prints a valid JSON object", () => {
    const result = tryPrettyJson('{"a":1}');
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it("pretty-prints a valid JSON array", () => {
    const result = tryPrettyJson("[1,2]");
    expect(result).toBe("[\n  1,\n  2\n]");
  });

  it("returns the original string when JSON parsing fails", () => {
    expect(tryPrettyJson("not json")).toBe("not json");
    expect(tryPrettyJson("{bad}")).toBe("{bad}");
  });

  it("returns a plain string unchanged", () => {
    expect(tryPrettyJson("hello world")).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// toCurl
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: "test-id",
    url: "https://example.com/api",
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

describe("toCurl", () => {
  it("produces a one-line curl command for a GET with no body or headers", () => {
    const curl = toCurl(makeEntry());
    expect(curl).toBe("curl -X GET 'https://example.com/api'");
  });

  it("includes -H flags for each request header", () => {
    const curl = toCurl(
      makeEntry({ requestHeaders: { authorization: "Bearer token", accept: "application/json" } })
    );
    expect(curl).toContain("-H 'authorization: Bearer token'");
    expect(curl).toContain("-H 'accept: application/json'");
  });

  it("includes --data-raw for a POST with a body", () => {
    const curl = toCurl(makeEntry({ method: "POST", requestBody: '{"key":"value"}' }));
    expect(curl).toContain("curl -X POST");
    expect(curl).toContain('--data-raw \'{"key":"value"}\'');
  });

  it("omits --data-raw when requestBody is null", () => {
    const curl = toCurl(makeEntry({ method: "POST", requestBody: null }));
    expect(curl).not.toContain("--data-raw");
  });

  it('omits --data-raw when requestBody is "[binary]"', () => {
    const curl = toCurl(makeEntry({ method: "POST", requestBody: "[binary]" }));
    expect(curl).not.toContain("--data-raw");
  });

  it("escapes single quotes in the URL", () => {
    const curl = toCurl(makeEntry({ url: "https://example.com/it's" }));
    expect(curl).toContain("'https://example.com/it'\\''s'");
  });

  it("escapes single quotes in header values", () => {
    const curl = toCurl(makeEntry({ requestHeaders: { "x-name": "it's here" } }));
    expect(curl).toContain("-H 'x-name: it'\\''s here'");
  });
});

// ---------------------------------------------------------------------------
// serializeEntry
// ---------------------------------------------------------------------------

describe("serializeEntry", () => {
  it("nests JSON bodies as objects instead of escaped strings", () => {
    const text = serializeEntry(
      makeEntry({ requestBody: '{"name":"Ana"}', responseBody: '[{"id":1}]' })
    );
    const parsed = JSON.parse(text);
    expect(parsed.requestBody).toEqual({ name: "Ana" });
    expect(parsed.responseBody).toEqual([{ id: 1 }]);
    expect(text).not.toContain('\\"');
  });

  it("keeps non-JSON bodies as strings", () => {
    const parsed = JSON.parse(serializeEntry(makeEntry({ responseBody: "<html></html>" })));
    expect(parsed.responseBody).toBe("<html></html>");
  });

  it("keeps bodies that look like JSON but fail to parse (e.g. truncated) as strings", () => {
    const parsed = JSON.parse(serializeEntry(makeEntry({ responseBody: '{"a":1, "b"' })));
    expect(parsed.responseBody).toBe('{"a":1, "b"');
  });

  it("keeps scalar-looking bodies as strings instead of turning them into numbers", () => {
    const parsed = JSON.parse(serializeEntry(makeEntry({ responseBody: "123" })));
    expect(parsed.responseBody).toBe("123");
  });

  it("keeps null bodies as null and preserves the other fields", () => {
    const entry = makeEntry();
    expect(JSON.parse(serializeEntry(entry))).toEqual(entry);
  });

  it("indents the output with 2 spaces", () => {
    expect(serializeEntry(makeEntry())).toContain('\n  "id": "test-id"');
  });
});

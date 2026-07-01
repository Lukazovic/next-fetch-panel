import { describe, it, expect } from "vitest";
import { normalizeHeaders, stringify, wasTruncated, extractRequestBody } from "./http";

// ---------------------------------------------------------------------------
// normalizeHeaders
// ---------------------------------------------------------------------------

describe("normalizeHeaders", () => {
  it("returns {} for undefined", () => {
    expect(normalizeHeaders(undefined)).toEqual({});
  });

  it("returns {} for null", () => {
    expect(normalizeHeaders(null)).toEqual({});
  });

  it("converts a Headers instance correctly", () => {
    const h = new Headers({ "content-type": "application/json", "x-token": "abc" });
    expect(normalizeHeaders(h)).toEqual({
      "content-type": "application/json",
      "x-token": "abc",
    });
  });

  it("converts an array of string pairs correctly", () => {
    const h: [string, string][] = [
      ["content-type", "text/html"],
      ["x-custom", "value"],
    ];
    expect(normalizeHeaders(h)).toEqual({ "content-type": "text/html", "x-custom": "value" });
  });

  it("passes through a plain string record", () => {
    const h = { authorization: "Bearer token", accept: "application/json" };
    expect(normalizeHeaders(h)).toEqual(h);
  });

  it("skips non-string values in a mixed object (axios-style headers)", () => {
    const h = { "x-count": 42, "x-valid": "yes", "x-flag": true } as Record<string, unknown>;
    expect(normalizeHeaders(h)).toEqual({ "x-valid": "yes" });
  });
});

// ---------------------------------------------------------------------------
// stringify
// ---------------------------------------------------------------------------

describe("stringify", () => {
  it("returns null for null", () => {
    expect(stringify(null, 100)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(stringify(undefined, 100)).toBeNull();
  });

  it("returns a string intact when under the limit", () => {
    expect(stringify("hello", 100)).toBe("hello");
  });

  it("truncates a string at exactly the body limit", () => {
    expect(stringify("abcde", 3)).toBe("abc");
  });

  it("JSON-serializes a plain object", () => {
    expect(stringify({ a: 1 }, 100)).toBe('{"a":1}');
  });

  it("truncates a serialized object at the body limit", () => {
    expect(stringify({ a: 1, b: 2 }, 5)).toBe('{"a":');
  });

  it("returns null when JSON.stringify throws (circular reference)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(stringify(circular, 100)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// wasTruncated
// ---------------------------------------------------------------------------

describe("wasTruncated", () => {
  it("returns false for null", () => {
    expect(wasTruncated(null, 100)).toBe(false);
  });

  it("returns false for a string shorter than the limit", () => {
    expect(wasTruncated("hello", 100)).toBe(false);
  });

  it("returns true for a string at exactly the limit", () => {
    expect(wasTruncated("abcde", 5)).toBe(true);
  });

  it("returns true for a string longer than the limit", () => {
    expect(wasTruncated("abcdef", 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractRequestBody
// ---------------------------------------------------------------------------

describe("extractRequestBody", () => {
  it("returns null body for undefined init", () => {
    expect(extractRequestBody(undefined, 100)).toEqual({ body: null, truncated: false });
  });

  it("returns null body when init has no body property", () => {
    expect(extractRequestBody({}, 100)).toEqual({ body: null, truncated: false });
  });

  it("returns a string body intact when under the limit", () => {
    expect(extractRequestBody({ body: "hello" }, 100)).toEqual({
      body: "hello",
      truncated: false,
    });
  });

  it("truncates a string body at the limit and sets truncated to true", () => {
    expect(extractRequestBody({ body: "abcde" }, 3)).toEqual({ body: "abc", truncated: true });
  });

  it("serializes URLSearchParams and returns it intact when under the limit", () => {
    const params = new URLSearchParams({ key: "value" });
    expect(extractRequestBody({ body: params }, 100)).toEqual({
      body: "key=value",
      truncated: false,
    });
  });

  it("truncates URLSearchParams output at the limit", () => {
    const params = new URLSearchParams({ key: "value" });
    expect(extractRequestBody({ body: params }, 3)).toEqual({ body: "key", truncated: true });
  });

  it('returns "[binary]" for a Blob body', () => {
    expect(extractRequestBody({ body: new Blob(["data"]) }, 100)).toEqual({
      body: "[binary]",
      truncated: false,
    });
  });

  it('returns "[binary]" for an ArrayBuffer body', () => {
    expect(extractRequestBody({ body: new ArrayBuffer(8) }, 100)).toEqual({
      body: "[binary]",
      truncated: false,
    });
  });

  it('returns "[binary]" for a FormData body', () => {
    expect(extractRequestBody({ body: new FormData() }, 100)).toEqual({
      body: "[binary]",
      truncated: false,
    });
  });
});

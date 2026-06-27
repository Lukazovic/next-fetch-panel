import { describe, it, expect } from "vitest";
import { redactEntry, resolveRedactConfig, defaultRedactConfig, type RedactConfig } from "./redact";
import type { LogEntry } from "../log-entry";

function makeEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    id: "test-id",
    url: "https://example.com/api",
    method: "GET",
    status: 200,
    statusText: "OK",
    duration: 10,
    timestamp: Date.now(),
    requestHeaders: {},
    responseHeaders: {},
    requestBody: null,
    responseBody: null,
    sessionId: "session-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// redactEntry — URL
// ---------------------------------------------------------------------------

describe("redactEntry — URL params", () => {
  it("redacts a listed URL param", () => {
    const entry = makeEntry({ url: "https://example.com/?api_key=secret123" });
    expect(redactEntry(entry).url).toBe("https://example.com/?api_key=%5BREDACTED%5D");
  });

  it("preserves unlisted URL params", () => {
    const entry = makeEntry({ url: "https://example.com/?foo=bar&api_key=x" });
    const result = redactEntry(entry).url;
    expect(new URL(result).searchParams.get("foo")).toBe("bar");
  });

  it("redacts duplicate params with the same key — collapses to one [REDACTED]", () => {
    // URLSearchParams.set() replaces all values for a key with a single value,
    // so ?token=a&token=b becomes ?token=[REDACTED] (one entry, not two).
    const entry = makeEntry({ url: "https://example.com/?token=a&token=b" });
    const params = new URL(redactEntry(entry).url).searchParams.getAll("token");
    expect(params).toEqual(["[REDACTED]"]);
  });

  it("leaves the URL unchanged when no params match", () => {
    const url = "https://example.com/?page=2";
    const entry = makeEntry({ url });
    expect(redactEntry(entry).url).toBe(url);
  });

  it("returns the original string for an invalid URL instead of throwing", () => {
    const url = "not-a-valid-url";
    const entry = makeEntry({ url });
    expect(redactEntry(entry).url).toBe(url);
  });

  it("redacts with a custom urlParams list", () => {
    const entry = makeEntry({ url: "https://example.com/?shop_token=abc&api_key=xyz" });
    const config: RedactConfig = { ...defaultRedactConfig, urlParams: ["shop_token"] };
    const result = new URL(redactEntry(entry, config).url);
    expect(result.searchParams.get("shop_token")).toBe("[REDACTED]");
    expect(result.searchParams.get("api_key")).toBe("xyz");
  });
});

// ---------------------------------------------------------------------------
// redactEntry — headers
// ---------------------------------------------------------------------------

describe("redactEntry — headers", () => {
  it("redacts a listed request header", () => {
    const entry = makeEntry({ requestHeaders: { authorization: "Bearer token123" } });
    expect(redactEntry(entry).requestHeaders.authorization).toBe("[REDACTED]");
  });

  it("redacts a listed response header", () => {
    const entry = makeEntry({ responseHeaders: { "x-api-key": "secret" } });
    expect(redactEntry(entry).responseHeaders["x-api-key"]).toBe("[REDACTED]");
  });

  it("matches headers case-insensitively", () => {
    const entry = makeEntry({ requestHeaders: { Authorization: "Bearer x", AUTHORIZATION: "y" } });
    const result = redactEntry(entry).requestHeaders;
    expect(result["Authorization"]).toBe("[REDACTED]");
    expect(result["AUTHORIZATION"]).toBe("[REDACTED]");
  });

  it("preserves unlisted headers", () => {
    const entry = makeEntry({ requestHeaders: { "content-type": "application/json" } });
    expect(redactEntry(entry).requestHeaders["content-type"]).toBe("application/json");
  });

  it("does not redact headers when the list is empty", () => {
    const entry = makeEntry({ requestHeaders: { authorization: "Bearer x" } });
    const config: RedactConfig = { ...defaultRedactConfig, headers: [] };
    expect(redactEntry(entry, config).requestHeaders.authorization).toBe("Bearer x");
  });

  it("does not mutate the original entry's headers", () => {
    const requestHeaders = { authorization: "secret" };
    const entry = makeEntry({ requestHeaders });
    redactEntry(entry);
    expect(requestHeaders.authorization).toBe("secret");
  });
});

// ---------------------------------------------------------------------------
// redactEntry — body
// ---------------------------------------------------------------------------

describe("redactEntry — body", () => {
  it("redacts a listed key in a JSON request body", () => {
    const entry = makeEntry({ requestBody: JSON.stringify({ password: "abc", name: "joe" }) });
    const body = JSON.parse(redactEntry(entry).requestBody!);
    expect(body.password).toBe("[REDACTED]");
    expect(body.name).toBe("joe");
  });

  it("redacts a listed key in a JSON response body", () => {
    const entry = makeEntry({ responseBody: JSON.stringify({ token: "xyz" }) });
    const body = JSON.parse(redactEntry(entry).responseBody!);
    expect(body.token).toBe("[REDACTED]");
  });

  it("does NOT redact nested keys — only top-level", () => {
    const entry = makeEntry({
      requestBody: JSON.stringify({ user: { password: "nested" } }),
    });
    const body = JSON.parse(redactEntry(entry).requestBody!);
    expect(body.user.password).toBe("nested");
  });

  it("returns a non-JSON body unchanged", () => {
    const raw = "name=joe&password=abc";
    const entry = makeEntry({ requestBody: raw });
    expect(redactEntry(entry).requestBody).toBe(raw);
  });

  it("returns null body as null", () => {
    const entry = makeEntry({ requestBody: null, responseBody: null });
    const result = redactEntry(entry);
    expect(result.requestBody).toBeNull();
    expect(result.responseBody).toBeNull();
  });

  it("returns empty string body unchanged", () => {
    const entry = makeEntry({ requestBody: "" });
    expect(redactEntry(entry).requestBody).toBe("");
  });

  it("handles a body where the key exists but the value is null", () => {
    const entry = makeEntry({ requestBody: JSON.stringify({ password: null }) });
    const body = JSON.parse(redactEntry(entry).requestBody!);
    expect(body.password).toBe("[REDACTED]");
  });

  it("does not redact body keys when the list is empty", () => {
    const payload = { password: "abc" };
    const entry = makeEntry({ requestBody: JSON.stringify(payload) });
    const config: RedactConfig = { ...defaultRedactConfig, bodyKeys: [] };
    const body = JSON.parse(redactEntry(entry, config).requestBody!);
    expect(body.password).toBe("abc");
  });

  it("does not mutate the original entry", () => {
    const requestBody = JSON.stringify({ password: "secret" });
    const entry = makeEntry({ requestBody });
    redactEntry(entry);
    expect(entry.requestBody).toBe(requestBody);
  });
});

// ---------------------------------------------------------------------------
// resolveRedactConfig
// ---------------------------------------------------------------------------

describe("resolveRedactConfig", () => {
  it("returns the defaults when called with no argument", () => {
    expect(resolveRedactConfig()).toEqual(defaultRedactConfig);
  });

  it("merges a partial object — missing categories fall back to defaults", () => {
    const config = resolveRedactConfig({ urlParams: ["shop_token"] });
    expect(config.urlParams).toEqual(["shop_token"]);
    expect(config.headers).toEqual(defaultRedactConfig.headers);
    expect(config.bodyKeys).toEqual(defaultRedactConfig.bodyKeys);
  });

  it("overrides a category entirely when provided", () => {
    const config = resolveRedactConfig({ headers: [] });
    expect(config.headers).toEqual([]);
    expect(config.urlParams).toEqual(defaultRedactConfig.urlParams);
  });

  it("accepts a function that extends defaults", () => {
    const config = resolveRedactConfig((d) => ({
      ...d,
      urlParams: [...d.urlParams, "shop_token"],
    }));
    expect(config.urlParams).toContain("shop_token");
    expect(config.urlParams).toContain("api_key");
  });

  it("accepts a function that selectively removes a default", () => {
    const config = resolveRedactConfig((d) => ({
      ...d,
      headers: d.headers.filter((h) => h !== "authorization"),
    }));
    expect(config.headers).not.toContain("authorization");
    expect(config.headers).toContain("x-api-key");
  });
});

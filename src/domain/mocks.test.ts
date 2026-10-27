import { describe, it, expect } from "vitest";
import {
  findMock,
  parseMocks,
  serializeMocks,
  MOCKS_COOKIE_MAX_LENGTH,
  type MockRule,
} from "./mocks";

function makeRule(overrides?: Partial<MockRule>): MockRule {
  return {
    id: "rule-1",
    method: "GET",
    urlIncludes: "/users",
    action: { type: "response", status: 500, body: '{"error":"boom"}' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// serializeMocks / parseMocks
// ---------------------------------------------------------------------------

describe("serializeMocks / parseMocks", () => {
  it("round-trips a list of rules", () => {
    const rules = [
      makeRule(),
      makeRule({ id: "rule-2", method: "*", action: { type: "network-error" }, delayMs: 300 }),
    ];
    expect(parseMocks(serializeMocks(rules))).toEqual(rules);
  });

  it("produces a cookie-safe value (no ; , spaces or quotes)", () => {
    const value = serializeMocks([makeRule({ urlIncludes: "/a b;c,d" })]);
    expect(value).not.toMatch(/[;, "]/);
  });

  it("also parses a value that was already URL-decoded (as Next.js cookies() returns it)", () => {
    const rules = [makeRule()];
    expect(parseMocks(JSON.stringify(rules))).toEqual(rules);
  });

  it("returns an empty list for missing or malformed values", () => {
    expect(parseMocks(undefined)).toEqual([]);
    expect(parseMocks(null)).toEqual([]);
    expect(parseMocks("")).toEqual([]);
    expect(parseMocks("not json")).toEqual([]);
    expect(parseMocks('{"not":"an array"}')).toEqual([]);
  });

  it("drops invalid rules and keeps valid ones", () => {
    const raw = JSON.stringify([
      makeRule(),
      { id: "no-action", method: "GET", urlIncludes: "/x" },
      makeRule({ id: "empty-url", urlIncludes: "" }),
      makeRule({ id: "bad-status", action: { type: "response", status: 99 } }),
      makeRule({ id: "too-high", action: { type: "response", status: 600 } }),
      makeRule({ id: "float", action: { type: "response", status: 500.5 } }),
      makeRule({ id: "neg-delay", delayMs: -1 }),
    ]);
    expect(parseMocks(raw).map((r) => r.id)).toEqual(["rule-1"]);
  });

  it("exposes a max cookie length below the 4 KB browser limit", () => {
    expect(MOCKS_COOKIE_MAX_LENGTH).toBeLessThan(4_096);
  });
});

// ---------------------------------------------------------------------------
// findMock
// ---------------------------------------------------------------------------

describe("findMock", () => {
  it("matches when the method matches and the URL contains urlIncludes", () => {
    const rule = makeRule();
    expect(findMock([rule], "GET", "https://api.example.com/users?page=2")).toBe(rule);
  });

  it("compares methods case-insensitively", () => {
    const rule = makeRule({ method: "post" });
    expect(findMock([rule], "POST", "https://api.example.com/users")).toBe(rule);
  });

  it("matches any method when the rule method is *", () => {
    const rule = makeRule({ method: "*" });
    expect(findMock([rule], "DELETE", "https://api.example.com/users")).toBe(rule);
  });

  it("does not match a different method", () => {
    expect(findMock([makeRule()], "POST", "https://api.example.com/users")).toBeUndefined();
  });

  it("does not match a URL that does not contain urlIncludes", () => {
    expect(findMock([makeRule()], "GET", "https://api.example.com/orders")).toBeUndefined();
  });

  it("returns the first matching rule", () => {
    const first = makeRule({ id: "first" });
    const second = makeRule({ id: "second" });
    expect(findMock([first, second], "GET", "https://api.example.com/users")).toBe(first);
  });
});

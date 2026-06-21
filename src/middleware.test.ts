import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.hoisted runs before the module factory so these vi.fn() instances are
// available inside the vi.mock() closure below.
const { mockNext, mockRedirect, mockCookiesSet } = vi.hoisted(() => ({
  mockNext: vi.fn(),
  mockRedirect: vi.fn(),
  mockCookiesSet: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse extends Response {
    readonly cookies = { set: mockCookiesSet };

    constructor() {
      super(null);
    }

    static next(opts?: { request?: { headers?: Headers } }) {
      mockNext(opts);
      return new MockNextResponse();
    }

    static redirect(url: URL | string) {
      mockRedirect(url);
      return new MockNextResponse();
    }
  }

  class MockNextRequest extends Request {
    readonly cookies: { get(name: string): { value: string } | undefined };

    constructor(url: string, init?: RequestInit & { cookieJar?: Record<string, string> }) {
      const { cookieJar = {}, ...rest } = init ?? {};
      super(url, rest);
      this.cookies = {
        get: (name: string) => (name in cookieJar ? { value: cookieJar[name] } : undefined),
      };
    }
  }

  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

import { withDevPanel } from "./middleware";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withDevPanel", () => {
  it("generates a new UUID when no __dev_sid cookie is present", async () => {
    const middleware = withDevPanel();
    await middleware(new NextRequest("https://example.com/"));

    const call = mockNext.mock.calls[0][0] as { request: { headers: Headers } };
    const sid = call?.request?.headers?.get("x-dev-sid");

    expect(typeof sid).toBe("string");
    expect(sid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("sets the __dev_sid cookie on the response", async () => {
    const middleware = withDevPanel();
    await middleware(new NextRequest("https://example.com/"));

    expect(mockCookiesSet).toHaveBeenCalledWith(
      "__dev_sid",
      expect.any(String),
      expect.objectContaining({ sameSite: "lax", path: "/", maxAge: expect.any(Number) })
    );
  });

  it("forwards the session ID as x-dev-sid in the request headers", async () => {
    const middleware = withDevPanel();
    await middleware(new NextRequest("https://example.com/"));

    const call = mockNext.mock.calls[0][0] as { request: { headers: Headers } };
    expect(call?.request?.headers?.get("x-dev-sid")).toBeTruthy();
  });

  it("reuses an existing __dev_sid cookie value", async () => {
    const existingId = "existing-session-abc";
    const middleware = withDevPanel();
    const request = new NextRequest("https://example.com/", {
      cookieJar: { __dev_sid: existingId },
    });
    await middleware(request);

    const call = mockNext.mock.calls[0][0] as { request: { headers: Headers } };
    expect(call?.request?.headers?.get("x-dev-sid")).toBe(existingId);
  });

  it("does NOT set the cookie again when __dev_sid already exists", async () => {
    const middleware = withDevPanel();
    const request = new NextRequest("https://example.com/", {
      cookieJar: { __dev_sid: "already-set" },
    });
    await middleware(request);

    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it("respects a user handler that returns a redirect and still sets the cookie", async () => {
    const handler = vi.fn(async () => {
      // Return a MockNextResponse (extends Response) so instanceof Response is true
      mockRedirect("/login");
      const { NextResponse } = await import("next/server");
      return NextResponse.redirect("/login");
    });

    const middleware = withDevPanel(handler as any);
    await middleware(new NextRequest("https://example.com/protected"));

    // The handler was called
    expect(handler).toHaveBeenCalledOnce();
    // Cookie should still be set on the redirect response (no existing cookie)
    expect(mockCookiesSet).toHaveBeenCalledWith("__dev_sid", expect.any(String), expect.any(Object));
  });

  it("skips session logic when enabled is false but still calls NextResponse.next()", async () => {
    const middleware = withDevPanel(undefined, { enabled: false });
    await middleware(new NextRequest("https://example.com/"));

    expect(mockNext).toHaveBeenCalledOnce();
    expect(mockCookiesSet).not.toHaveBeenCalled();
  });

  it("exports a default matcher config that excludes static assets", () => {
    const { config } = withDevPanel();
    expect(config.matcher).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
    const pattern = config.matcher[0];
    // Static asset paths should be excluded
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("_next/image");
  });
});

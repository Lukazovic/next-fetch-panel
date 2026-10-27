import { MOCKS_COOKIE, parseMocks, type MockAction, type MockRule } from "../../domain";

type ResponseAction = Extract<MockAction, { type: "response" }>;

// Cached after first import — module resolution is async but the reference is reused.
let nextCookies: (typeof import("next/headers"))["cookies"] | null = null;

/**
 * Reads the mock rules from the current request's cookie. Rules live in a cookie
 * rather than in server memory so they reach whichever instance handles the request.
 */
export async function readMockRules(): Promise<MockRule[]> {
  try {
    if (!nextCookies) nextCookies = (await import("next/headers")).cookies;
    return parseMocks((await nextCookies()).get(MOCKS_COOKIE)?.value);
  } catch {
    // Called outside a Next.js request context (startup, background tasks, etc.)
    return [];
  }
}

export function mockContentType(body: string): string {
  const trimmed = body.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "application/json" : "text/plain";
}

export function buildMockResponse(action: ResponseAction): Response {
  const headers = action.body ? { "content-type": mockContentType(action.body) } : undefined;
  return new Response(action.body ?? null, { status: action.status, headers });
}

export function delay(ms: number | undefined): Promise<void> {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

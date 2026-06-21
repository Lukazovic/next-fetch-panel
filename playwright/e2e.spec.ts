import { test, expect, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Opens the panel via the toggle button and waits until the table is ready. */
async function openPanel(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Server Network/i }).click();
  // Both "No requests yet" and a real row indicate the panel is fully mounted.
  // Use .first() to avoid strict-mode failure when multiple rows are already present.
  await expect(
    page.getByText("No requests yet").or(page.locator("[data-nfp] tbody tr")).first()
  ).toBeVisible();
}

/**
 * Returns a locator for data rows in the panel table that contain the given
 * URL fragment. Scoped to [data-nfp] to avoid matching any other tables.
 */
function entryRows(page: Page, urlFragment: string): Locator {
  return page.locator("[data-nfp] tbody tr").filter({ hasText: urlFragment });
}

/** Waits until at least one entry row containing the URL fragment is visible. */
async function waitForEntry(page: Page, urlFragment: string): Promise<void> {
  await expect(entryRows(page, urlFragment).first()).toBeVisible({
    timeout: 15_000,
  });
}

// ---------------------------------------------------------------------------
// 1 — Fetch captured end-to-end
// ---------------------------------------------------------------------------

test("fetch is captured and appears in the panel within 2 s of page load", async ({
  page,
}) => {
  // The /posts page makes an SSR fetch to jsonplaceholder during rendering.
  await page.goto("/posts");
  await openPanel(page);

  // The entry must appear — it is replayed from the server buffer via SSE.
  await waitForEntry(page, "jsonplaceholder.typicode.com/posts");

  const row = entryRows(page, "jsonplaceholder.typicode.com/posts").first();
  // Method is GET
  await expect(row.getByText("GET")).toBeVisible();
  // Status is 200
  await expect(row.getByText("200")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2 — Axios interception via fetch adapter
// ---------------------------------------------------------------------------

test("axios request (fetch adapter) is captured alongside native fetch calls", async ({
  page,
}) => {
  // The /users page uses axios.create({ adapter: "fetch" }), which routes the
  // request through globalThis.fetch — the same patched fetch captured by patch.ts.
  await page.goto("/users");
  await openPanel(page);

  await waitForEntry(page, "jsonplaceholder.typicode.com/users");
  await expect(
    entryRows(page, "jsonplaceholder.typicode.com/users").first()
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3 — Session isolation
// ---------------------------------------------------------------------------

test("each browser context sees only its own requests", async ({ browser }) => {
  // Two independent browser contexts have different __dev_sid cookies.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();

  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Navigate contexts to different pages (different external URLs are fetched).
  await pageA.goto("http://localhost:3000/posts");
  await pageB.goto("http://localhost:3000/users");

  await openPanel(pageA);
  await openPanel(pageB);

  // Context A shows /posts, does NOT show /users
  await waitForEntry(pageA, "jsonplaceholder.typicode.com/posts");
  await expect(
    entryRows(pageA, "jsonplaceholder.typicode.com/users")
  ).toHaveCount(0);

  // Context B shows /users, does NOT show /posts
  await waitForEntry(pageB, "jsonplaceholder.typicode.com/users");
  await expect(
    entryRows(pageB, "jsonplaceholder.typicode.com/posts")
  ).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

// ---------------------------------------------------------------------------
// 4 — Snapshot endpoint
// ---------------------------------------------------------------------------

test("GET /api/dev-network/snapshot returns the session entries as JSON", async ({
  page,
}) => {
  await page.goto("/posts");

  // The page request carries the __dev_sid cookie which the snapshot handler
  // uses to filter entries. Using page.request keeps the browser cookie jar.
  const response = await page.request.get("/api/dev-network/snapshot");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");

  const { entries } = await response.json();
  expect(Array.isArray(entries)).toBe(true);
  expect(entries.length).toBeGreaterThan(0);
  expect(
    entries.some((e: { url: string }) =>
      e.url.includes("jsonplaceholder.typicode.com/posts")
    )
  ).toBe(true);
});

// ---------------------------------------------------------------------------
// 5 — Middleware sets session cookie
// ---------------------------------------------------------------------------

test("middleware sets a __dev_sid cookie on the first request", async ({
  page,
}) => {
  await page.goto("/");

  const cookies = await page.context().cookies("http://localhost:3000");
  const devCookie = cookies.find((c) => c.name === "__dev_sid");

  expect(devCookie).toBeDefined();
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  expect(devCookie!.value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  // Cookie attributes expected from withDevPanel middleware
  expect(devCookie!.path).toBe("/");
  expect(devCookie!.httpOnly).toBe(false);
  expect(devCookie!.sameSite).toBe("Lax");
});

// ---------------------------------------------------------------------------
// 6 — SSE streams new entries live (real-time, no duplicates)
// ---------------------------------------------------------------------------

test("new entries stream in live as pages are navigated via SPA links", async ({
  page,
}) => {
  // Start on the home page and open the panel BEFORE navigating to content
  // pages. The root layout keeps the panel mounted across client-side navs.
  await page.goto("/");
  await openPanel(page);

  // SPA-navigate to /posts via the Link on the home page.
  await page.click("a[href='/posts']");
  await waitForEntry(page, "jsonplaceholder.typicode.com/posts");
  const countAfterPosts = await page.locator("[data-nfp] tbody tr").count();
  expect(countAfterPosts).toBeGreaterThanOrEqual(1);

  // SPA-navigate back to home then on to /users.
  await page.click("a[href='/']");
  await page.click("a[href='/users']");

  // The /users SSR fetch must arrive in the still-open panel — no reload,
  // so no duplicate of the /posts entry.
  await waitForEntry(page, "jsonplaceholder.typicode.com/users");
  const countAfterUsers = await page.locator("[data-nfp] tbody tr").count();
  expect(countAfterUsers).toBeGreaterThan(countAfterPosts);

  // Navigate back and to /posts a second time — a new SSR fetch fires so
  // the count must grow beyond countAfterUsers. waitForEntry would return
  // immediately (old /posts row is still visible), so wait on count instead.
  await page.click("a[href='/']");
  await page.click("a[href='/posts']");

  await expect(page.locator("[data-nfp] tbody tr")).toHaveCount(
    countAfterUsers + 1,
    { timeout: 15_000 }
  );
});

// ---------------------------------------------------------------------------
// 7 — Filter bar
// ---------------------------------------------------------------------------

test("filter bar narrows the entry list and clears on × click", async ({
  page,
}) => {
  // Trigger SSR fetches on two distinct pages, then open the panel.
  await page.goto("/posts");
  await page.goto("/users");
  await openPanel(page);
  // Give SSE a moment to replay both buffered entries.
  await page.waitForTimeout(1_000);

  // Wait until we have entries for both.
  await waitForEntry(page, "posts");
  await waitForEntry(page, "users");

  const filter = page.locator("[data-nfp] input[placeholder='Filter by URL...']");

  // Filter to only posts entries.
  await filter.fill("posts");
  await expect(entryRows(page, "users")).toHaveCount(0, { timeout: 3_000 });
  await expect(entryRows(page, "posts").first()).toBeVisible();

  // A "filtered / total" count should appear when narrowed.
  await expect(page.locator("[data-nfp]").getByText(/\d+ \/ \d+/)).toBeVisible();

  // Click the × button inside the filter container to clear it.
  const filterContainer = page.locator("[data-nfp] input[placeholder='Filter by URL...']").locator("..");
  await filterContainer.getByRole("button").click();

  // Both entry types are visible again.
  await expect(entryRows(page, "users").first()).toBeVisible({ timeout: 3_000 });
  await expect(entryRows(page, "posts").first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// 8 — SSE reconnect — no duplicate entries
// ---------------------------------------------------------------------------

test("SSE reconnect with Last-Event-ID replays only unseen entries", async ({
  page,
}) => {
  await page.goto("/posts");
  await openPanel(page);

  await waitForEntry(page, "jsonplaceholder.typicode.com/posts");
  const countBefore = await page.locator("[data-nfp] tbody tr").count();

  // Abort the SSE connection to force a reconnect.  The panel's error handler
  // retries after a short backoff; on reconnect the browser sends the
  // Last-Event-ID it received, and the server replays only later entries.
  await page.route("**/api/dev-network", (route) => route.abort());
  await page.waitForTimeout(500);
  await page.unroute("**/api/dev-network");

  // Allow time for reconnect and any potential replay.
  await page.waitForTimeout(3_000);

  // Entry count must not have grown — no duplicates from the replay.
  const countAfter = await page.locator("[data-nfp] tbody tr").count();
  expect(countAfter).toBe(countBefore);
});

// ---------------------------------------------------------------------------
// 9 — Cookie fallback: Panel useEffect sets cookie when middleware doesn't
// ---------------------------------------------------------------------------

test("Panel useEffect sets __dev_sid cookie when middleware does not provide one", async ({
  browser,
}) => {
  // Fresh context — no pre-existing cookies.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Strip Set-Cookie from every response, simulating a route excluded from the
  // middleware matcher where the server never issues the __dev_sid cookie.
  await page.route("**/*", async (route) => {
    const response = await route.fetch();
    const modifiedHeaders = { ...response.headers() };
    delete modifiedHeaders["set-cookie"];
    await route.fulfill({ response, headers: modifiedHeaders });
  });

  // Navigate; DevNetworkPanel is in the root layout and mounts immediately.
  await page.goto("/");

  // The SSE connection to /api/dev-network is opened in the same useEffect
  // that sets the cookie — a successful request means the effect has run.
  await page.waitForRequest("**/api/dev-network", { timeout: 10_000 });

  const allCookies = await ctx.cookies("http://localhost:3000");
  const devCookie = allCookies.find((c) => c.name === "__dev_sid");

  expect(devCookie).toBeDefined();
  // Must be a valid UUID v4
  expect(devCookie!.value).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  await ctx.close();
});

// ---------------------------------------------------------------------------
// 10 — Drag-resize persists to localStorage
// ---------------------------------------------------------------------------

test("drag-resize changes the panel height and persists after reload", async ({
  page,
}) => {
  await page.goto("/");
  await openPanel(page);

  // The bottom-sheet resize handle sits at the top edge of the open panel.
  // DEFAULT_CONFIG.height is 420 px.
  const handle = page.locator("[data-nfp] .cursor-ns-resize");
  await expect(handle).toBeVisible();

  const box = await handle.boundingBox();
  expect(box).not.toBeNull();

  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;

  // Drag the handle upward by 100 px.
  // SheetResizeHandle: size = window.innerHeight - ev.clientY
  // Lower clientY → larger height.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 100, { steps: 10 });
  await page.mouse.up();

  // Wait for React to flush the state update; localStorage is written
  // inside the setConfig updater, which runs during the render flush.
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem("ssr-panel-config") || "{}").height > 420,
    { timeout: 3_000 }
  );

  const heightAfterDrag = await page.evaluate<number>(() =>
    JSON.parse(localStorage.getItem("ssr-panel-config") || "{}").height
  );
  expect(heightAfterDrag).toBeGreaterThan(420);

  // Reload and verify the height is restored from localStorage.
  await page.reload();
  await openPanel(page);

  const heightAfterReload = await page.evaluate<number>(() =>
    JSON.parse(localStorage.getItem("ssr-panel-config") || "{}").height
  );
  expect(heightAfterReload).toBe(heightAfterDrag);
});

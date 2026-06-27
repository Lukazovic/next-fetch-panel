import { describe, it, expect } from "vitest";
import { SESSION_COOKIE, SESSION_HEADER } from "./session";

describe("session constants", () => {
  it("SESSION_COOKIE matches the literal used in middleware and Panel", () => {
    expect(SESSION_COOKIE).toBe("__dev_sid");
  });

  it("SESSION_HEADER matches the literal used in route and middleware", () => {
    expect(SESSION_HEADER).toBe("x-dev-sid");
  });
});

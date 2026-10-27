import { useCallback, useState } from "react";
import {
  MOCKS_COOKIE,
  MOCKS_COOKIE_MAX_LENGTH,
  parseMocks,
  serializeMocks,
  type MockRule,
} from "../../domain";

type UseMocksResult = {
  rules: MockRule[];
  /** Returns false (and stores nothing) when the rules would not fit in the cookie. */
  addRule: (rule: MockRule) => boolean;
  removeRule: (id: string) => void;
};

function readCookie(): MockRule[] {
  const prefix = `${MOCKS_COOKIE}=`;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(prefix))
    ?.slice(prefix.length);
  return parseMocks(raw);
}

// Session cookie (no max-age): rules disappear when the browser closes, so a
// forgotten mock can't keep breaking a QA environment indefinitely.
function writeCookie(value: string | null) {
  document.cookie = value
    ? `${MOCKS_COOKIE}=${value}; path=/; samesite=lax`
    : `${MOCKS_COOKIE}=; path=/; max-age=0`;
}

export function useMocks(): UseMocksResult {
  const [rules, setRules] = useState<MockRule[]>(readCookie);

  const addRule = useCallback((rule: MockRule) => {
    const next = [...readCookie(), rule];
    const value = serializeMocks(next);
    if (value.length > MOCKS_COOKIE_MAX_LENGTH) return false;
    writeCookie(value);
    setRules(next);
    return true;
  }, []);

  const removeRule = useCallback((id: string) => {
    const next = readCookie().filter((r) => r.id !== id);
    writeCookie(next.length > 0 ? serializeMocks(next) : null);
    setRules(next);
  }, []);

  return { rules, addRule, removeRule };
}

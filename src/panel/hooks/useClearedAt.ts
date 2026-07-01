import { useRef, useCallback } from "react";
import { CLEARED_AT_KEY } from "../panel.constants";

type UseClearedAtResult = {
  clearedAtRef: React.MutableRefObject<number>;
  persistClearedAt: (ts: number) => void;
};

export function useClearedAt(): UseClearedAtResult {
  const clearedAtRef = useRef<number>(Number(localStorage.getItem(CLEARED_AT_KEY)) || 0);

  const persistClearedAt = useCallback((ts: number) => {
    clearedAtRef.current = ts;
    localStorage.setItem(CLEARED_AT_KEY, String(ts));
  }, []);

  return { clearedAtRef, persistClearedAt };
}

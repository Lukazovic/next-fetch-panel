import { useState, useCallback } from "react";
import type { PanelConfig } from "../panel.config";
import { DEFAULT_CONFIG, STORAGE_KEY } from "../panel.config";

export function usePanelConfig(): {
  config: PanelConfig;
  update: (patch: Partial<PanelConfig>) => void;
} {
  const [config, setConfig] = useState<PanelConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_CONFIG;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    return DEFAULT_CONFIG;
  });

  const update = useCallback((patch: Partial<PanelConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { config, update };
}

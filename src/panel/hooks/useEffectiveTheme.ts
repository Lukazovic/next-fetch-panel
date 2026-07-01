import { useState, useEffect } from "react";
import type { ColorScheme } from "../panel.config";

export function useEffectiveTheme(colorScheme: ColorScheme): "light" | "dark" {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  useEffect(() => {
    if (colorScheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [colorScheme]);

  if (colorScheme !== "system") return colorScheme;
  return systemDark ? "dark" : "light";
}

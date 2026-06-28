export type ButtonPosition =
  | "bottom-right"
  | "bottom-center"
  | "bottom-left"
  | "top-right"
  | "top-center"
  | "top-left";

export const BUTTON_POSITION_CLASSES: Record<ButtonPosition, string> = {
  "bottom-right": "bottom-4 right-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "top-left": "top-4 left-4",
};

export const FIXED_PANEL_POSITION_CLASSES: Record<ButtonPosition, string> = {
  "bottom-right": "bottom-14 right-4",
  "bottom-center": "bottom-14 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-14 left-4",
  "top-right": "top-14 right-4",
  "top-center": "top-14 left-1/2 -translate-x-1/2",
  "top-left": "top-14 left-4",
};

export const METHOD_COLORS: Record<string, string> = {
  GET: "text-blue-400",
  POST: "text-violet-400",
  PUT: "text-orange-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
};

export const PANEL_STYLES_ID = "next-fetch-panel-styles";
export const THEME_CLASS_LIGHT = "nfp-theme-light";
export const THEME_CLASS_DARK = "nfp-theme-dark dark";

export function buildThemeClass(isDark: boolean): string {
  return isDark ? THEME_CLASS_DARK : THEME_CLASS_LIGHT;
}

export const CLEARED_AT_KEY = "next-fetch-panel-cleared-at";
export const SCROLL_AREA_VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]';
export const SCROLL_BOTTOM_THRESHOLD_PX = 100;
export const FIXED_MIN_WIDTH_PX = 320;
export const FIXED_MIN_HEIGHT_PX = 200;
export const FIXED_MAX_WIDTH_FRACTION = 0.95;
export const FIXED_MAX_HEIGHT_FRACTION = 0.9;

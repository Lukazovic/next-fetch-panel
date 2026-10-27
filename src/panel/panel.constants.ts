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
export const SHEET_MAX_SIZE_FRACTION = 0.9;
export const SHEET_MIN_SIZE_PX = 200;
export const DURATION_BAR_MAX_MS = 2000;
export const MAIN_PANEL_ID = "main";
export const DETAIL_PANEL_ID = "detail";
export const PANEL_MIN_SIZE_PCT = 10;
export const SSE_RETRY_INITIAL_MS = 1_000;
export const SSE_RETRY_MAX_MS = 30_000;
export const COPY_FEEDBACK_MS = 1_500;
export const DURATION_FAST_MS = 200;
export const DURATION_SLOW_MS = 1_000;
export const BYTES_PER_KB = 1_024;
export const HTTP_REDIRECT_STATUS = 300;
export const HTTP_ERROR_STATUS = 400;
export const MOCK_DEFAULT_STATUS = 500;

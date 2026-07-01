export type PanelMode = "sheet" | "fixed";
export type SheetSide = "bottom" | "right" | "left" | "top";
export type ColorScheme = "system" | "light" | "dark";

export type PanelConfig = {
  mode: PanelMode;
  sheetSide: SheetSide;
  sheetModal: boolean;
  width: number;
  height: number;
  colorScheme: ColorScheme;
  detailSize: number;
};

export const DEFAULT_CONFIG: PanelConfig = {
  mode: "sheet",
  sheetSide: "bottom",
  sheetModal: false,
  width: 820,
  height: 420,
  colorScheme: "system",
  detailSize: 40,
};

export const STORAGE_KEY = "ssr-panel-config";

// @vitest-environment jsdom

import { vi, describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "./SettingsDialog";
import { DEFAULT_CONFIG } from "../panel.config";
import type { PanelConfig } from "../panel.config";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.getAnimations = () => [];
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function renderDialog(overrides?: Partial<PanelConfig>) {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  const update = vi.fn();
  const handleOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <SettingsDialog
      config={config}
      update={update}
      open={true}
      onOpenChange={handleOpenChange}
      theme="light"
    />
  );
  return { user, update, handleOpenChange };
}

// ---------------------------------------------------------------------------
// Color scheme
// ---------------------------------------------------------------------------

describe("SettingsDialog — color scheme", () => {
  it("renders all three color scheme options", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "System" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Light" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Dark" })).toBeDefined();
  });

  it("clicking a color scheme option calls update with the correct value", async () => {
    const { user, update } = renderDialog({ colorScheme: "system" });
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(update).toHaveBeenCalledWith({ colorScheme: "dark" });
  });

  it("the active color scheme option has primary styling", () => {
    renderDialog({ colorScheme: "light" });
    const lightBtn = screen.getByRole("button", { name: "Light" });
    expect(lightBtn.className).toContain("bg-primary");
  });

  it("inactive color scheme options have muted styling", () => {
    renderDialog({ colorScheme: "light" });
    const systemBtn = screen.getByRole("button", { name: "System" });
    expect(systemBtn.className).toContain("bg-transparent");
  });
});

// ---------------------------------------------------------------------------
// Display mode
// ---------------------------------------------------------------------------

describe("SettingsDialog — display mode", () => {
  it("renders both display mode options", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Sheet" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Fixed modal" })).toBeDefined();
  });

  it("clicking 'Fixed modal' calls update with mode: 'fixed'", async () => {
    const { user, update } = renderDialog({ mode: "sheet" });
    await user.click(screen.getByRole("button", { name: "Fixed modal" }));
    expect(update).toHaveBeenCalledWith({ mode: "fixed" });
  });

  it("clicking 'Sheet' calls update with mode: 'sheet'", async () => {
    const { user, update } = renderDialog({ mode: "fixed" });
    await user.click(screen.getByRole("button", { name: "Sheet" }));
    expect(update).toHaveBeenCalledWith({ mode: "sheet" });
  });
});

// ---------------------------------------------------------------------------
// Sheet-specific options
// ---------------------------------------------------------------------------

describe("SettingsDialog — sheet-specific options", () => {
  it("shows Sheet side and Page interaction sections when mode is sheet", () => {
    renderDialog({ mode: "sheet" });
    expect(screen.getByText("Sheet side")).toBeDefined();
    expect(screen.getByText("Page interaction")).toBeDefined();
  });

  it("hides Sheet side and Page interaction when mode is fixed", () => {
    renderDialog({ mode: "fixed" });
    expect(screen.queryByText("Sheet side")).toBeNull();
    expect(screen.queryByText("Page interaction")).toBeNull();
  });

  it("renders all four sheet side options when mode is sheet", () => {
    renderDialog({ mode: "sheet" });
    expect(screen.getByRole("button", { name: "Bottom" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Right" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Top" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Left" })).toBeDefined();
  });

  it("clicking a sheet side option calls update with the correct value", async () => {
    const { user, update } = renderDialog({ mode: "sheet", sheetSide: "bottom" });
    await user.click(screen.getByRole("button", { name: "Right" }));
    expect(update).toHaveBeenCalledWith({ sheetSide: "right" });
  });
});

// ---------------------------------------------------------------------------
// Close button
// ---------------------------------------------------------------------------

describe("SettingsDialog — close button", () => {
  it("renders the Close button", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
  });

  it("clicking Close calls onOpenChange with false", async () => {
    const { user, handleOpenChange } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Close" }));
    // base-ui Dialog calls onOpenChange(open, eventInfo) — only the first arg matters
    const [[open]] = handleOpenChange.mock.calls;
    expect(open).toBe(false);
  });
});

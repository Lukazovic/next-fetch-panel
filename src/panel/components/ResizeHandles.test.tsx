// @vitest-environment jsdom

import { vi, describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import { SheetResizeHandle, FixedResizeHandle } from "./ResizeHandles";
import { FIXED_MIN_WIDTH_PX, FIXED_MIN_HEIGHT_PX } from "../panel.constants";

beforeAll(() => {
  // Pin viewport so the arithmetic in the components is deterministic
  Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 768, writable: true, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePanelRef(rect: Partial<DOMRect> = {}): React.RefObject<HTMLDivElement> {
  const defaults = { top: 100, bottom: 600, left: 200, right: 1000, width: 800, height: 500 };
  return {
    current: {
      getBoundingClientRect: () => ({ ...defaults, ...rect }) as DOMRect,
    } as HTMLDivElement,
  };
}

function handle(container: HTMLElement): HTMLElement {
  return container.firstChild as HTMLElement;
}

// ---------------------------------------------------------------------------
// SheetResizeHandle
// ---------------------------------------------------------------------------

describe("SheetResizeHandle", () => {
  it("renders with cursor-ns-resize for bottom side", () => {
    const { container } = render(<SheetResizeHandle side="bottom" onResize={() => {}} />);
    expect(handle(container).className).toContain("cursor-ns-resize");
  });

  it("renders with cursor-ns-resize for top side", () => {
    const { container } = render(<SheetResizeHandle side="top" onResize={() => {}} />);
    expect(handle(container).className).toContain("cursor-ns-resize");
  });

  it("renders with cursor-ew-resize for left side", () => {
    const { container } = render(<SheetResizeHandle side="left" onResize={() => {}} />);
    expect(handle(container).className).toContain("cursor-ew-resize");
  });

  it("renders with cursor-ew-resize for right side", () => {
    const { container } = render(<SheetResizeHandle side="right" onResize={() => {}} />);
    expect(handle(container).className).toContain("cursor-ew-resize");
  });

  it("fires onResize with the correct pixel size when the pointer moves (bottom)", () => {
    const onResize = vi.fn();
    const { container } = render(<SheetResizeHandle side="bottom" onResize={onResize} />);

    fireEvent.pointerDown(handle(container), { clientX: 0, clientY: 400 });
    // bottom: size = innerHeight(768) - clientY(300) = 468
    fireEvent.pointerMove(window, { clientX: 0, clientY: 300 });

    expect(onResize).toHaveBeenCalledWith(468);
  });

  it("fires onResize with the correct pixel size when the pointer moves (right)", () => {
    const onResize = vi.fn();
    const { container } = render(<SheetResizeHandle side="right" onResize={onResize} />);

    fireEvent.pointerDown(handle(container), { clientX: 800, clientY: 0 });
    // right: size = innerWidth(1024) - clientX(500) = 524
    fireEvent.pointerMove(window, { clientX: 500, clientY: 0 });

    expect(onResize).toHaveBeenCalledWith(524);
  });

  it("removes the pointermove and pointerup listeners when the pointer is released", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { container } = render(<SheetResizeHandle side="bottom" onResize={() => {}} />);

    fireEvent.pointerDown(handle(container));
    fireEvent.pointerUp(window);

    expect(removeSpy).toHaveBeenCalledWith("pointermove", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("pointerup", expect.any(Function));
  });
});

// ---------------------------------------------------------------------------
// FixedResizeHandle
// ---------------------------------------------------------------------------

describe("FixedResizeHandle", () => {
  it("renders with top-0 class when direction is top", () => {
    const { container } = render(
      <FixedResizeHandle direction="top" panelRef={makePanelRef()} onResize={() => {}} />
    );
    expect(handle(container).className).toContain("top-0");
  });

  it("renders with bottom-0 class when direction is bottom", () => {
    const { container } = render(
      <FixedResizeHandle direction="bottom" panelRef={makePanelRef()} onResize={() => {}} />
    );
    expect(handle(container).className).toContain("bottom-0");
  });

  it("fires onResize with updated (width, height) as the user drags (right)", () => {
    const onResize = vi.fn();
    // rect: left=200, right=1000, top=100, bottom=600, width=800, height=500
    const { container } = render(
      <FixedResizeHandle direction="right" panelRef={makePanelRef()} onResize={onResize} />
    );

    fireEvent.pointerDown(handle(container));
    // right: w = clientX(700) - rect.left(200) = 500; h unchanged = 500
    fireEvent.pointerMove(window, { clientX: 700, clientY: 0 });

    expect(onResize).toHaveBeenCalledWith(500, 500);
  });

  it("clamps width to FIXED_MIN_WIDTH_PX when dragging produces a very small width", () => {
    const onResize = vi.fn();
    const { container } = render(
      <FixedResizeHandle direction="right" panelRef={makePanelRef()} onResize={onResize} />
    );

    fireEvent.pointerDown(handle(container));
    // right: w = clientX(201) - rect.left(200) = 1, clamped to FIXED_MIN_WIDTH_PX
    fireEvent.pointerMove(window, { clientX: 201, clientY: 0 });

    const [width] = onResize.mock.calls[0];
    expect(width).toBe(FIXED_MIN_WIDTH_PX);
  });

  it("clamps height to FIXED_MIN_HEIGHT_PX when dragging produces a very small height", () => {
    const onResize = vi.fn();
    const { container } = render(
      <FixedResizeHandle direction="bottom" panelRef={makePanelRef()} onResize={onResize} />
    );

    fireEvent.pointerDown(handle(container));
    // bottom: h = clientY(101) - rect.top(100) = 1, clamped to FIXED_MIN_HEIGHT_PX
    fireEvent.pointerMove(window, { clientX: 0, clientY: 101 });

    const [, height] = onResize.mock.calls[0];
    expect(height).toBe(FIXED_MIN_HEIGHT_PX);
  });
});

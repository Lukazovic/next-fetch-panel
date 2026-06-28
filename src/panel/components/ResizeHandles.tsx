"use client";

import React from "react";
import { cn } from "../cn";
import type { SheetSide } from "../panel.config";
import {
  FIXED_MIN_WIDTH_PX,
  FIXED_MIN_HEIGHT_PX,
  FIXED_MAX_WIDTH_FRACTION,
  FIXED_MAX_HEIGHT_FRACTION,
} from "../panel.constants";

export function SheetResizeHandle({
  side,
  onResize,
}: {
  side: SheetSide;
  onResize: (size: number) => void;
}) {
  const isHorizontal = side === "bottom" || side === "top";

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    function onMove(ev: PointerEvent) {
      let size: number;
      if (side === "bottom") size = window.innerHeight - ev.clientY;
      else if (side === "top") size = ev.clientY;
      else if (side === "right") size = window.innerWidth - ev.clientX;
      else size = ev.clientX;
      const max = isHorizontal
        ? Math.round(window.innerHeight * 0.9)
        : Math.round(window.innerWidth * 0.9);
      onResize(Math.min(max, Math.max(200, Math.round(size))));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      className={cn(
        "group/resize shrink-0 flex items-center justify-center select-none touch-none",
        isHorizontal ? "h-2 w-full cursor-ns-resize" : "w-2 self-stretch cursor-ew-resize"
      )}
      onPointerDown={handlePointerDown}
    >
      <div
        className={cn(
          "rounded-full bg-border opacity-0 transition-opacity group-hover/resize:opacity-100",
          isHorizontal ? "h-1 w-8" : "w-1 h-8"
        )}
      />
    </div>
  );
}

export function FixedResizeHandle({
  direction,
  panelRef,
  onResize,
}: {
  direction: "top" | "bottom" | "left" | "right";
  panelRef: React.RefObject<HTMLDivElement | null>;
  onResize: (w: number, h: number) => void;
}) {
  const isHorizontal = direction === "top" || direction === "bottom";

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    function onMove(ev: PointerEvent) {
      const rect = panelRef.current!.getBoundingClientRect();
      let w = rect.width,
        h = rect.height;
      if (direction === "top") h = rect.bottom - ev.clientY;
      else if (direction === "bottom") h = ev.clientY - rect.top;
      else if (direction === "left") w = rect.right - ev.clientX;
      else w = ev.clientX - rect.left;
      onResize(
        Math.min(
          Math.round(window.innerWidth * FIXED_MAX_WIDTH_FRACTION),
          Math.max(FIXED_MIN_WIDTH_PX, Math.round(w))
        ),
        Math.min(
          Math.round(window.innerHeight * FIXED_MAX_HEIGHT_FRACTION),
          Math.max(FIXED_MIN_HEIGHT_PX, Math.round(h))
        )
      );
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div
      className={cn(
        "group/resize absolute z-10 flex items-center justify-center select-none touch-none",
        isHorizontal ? "inset-x-0 h-2 cursor-ns-resize" : "inset-y-0 w-2 cursor-ew-resize",
        direction === "top" && "top-0",
        direction === "bottom" && "bottom-0",
        direction === "left" && "left-0",
        direction === "right" && "right-0"
      )}
      onPointerDown={handlePointerDown}
    >
      <div
        className={cn(
          "rounded-full bg-border opacity-0 transition-opacity group-hover/resize:opacity-100",
          isHorizontal ? "h-1 w-8" : "w-1 h-8"
        )}
      />
    </div>
  );
}

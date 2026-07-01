"use client";

import panelStyles from "./panel.styles";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { panelState } from "../store";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./components/ui/sheet";
import {
  BUFFER_SIZE,
  type LogEntry,
  SESSION_COOKIE,
  DEV_NETWORK_ROUTE,
  SESSION_COOKIE_MAX_AGE,
} from "../domain";

import {
  type ButtonPosition,
  BUTTON_POSITION_CLASSES,
  FIXED_PANEL_POSITION_CLASSES,
  SCROLL_AREA_VIEWPORT_SELECTOR,
  SCROLL_BOTTOM_THRESHOLD_PX,
  PANEL_STYLES_ID,
  buildThemeClass,
  SSE_RETRY_INITIAL_MS,
  SSE_RETRY_MAX_MS,
} from "./panel.constants";

import { usePanelConfig } from "./hooks/usePanelConfig";
import { useEffectiveTheme } from "./hooks/useEffectiveTheme";
import { useClearedAt } from "./hooks/useClearedAt";
import { PanelThemeContext } from "./PanelThemeContext";
import { SheetResizeHandle, FixedResizeHandle } from "./components/ResizeHandles";
import { SettingsDialog } from "./components/SettingsDialog";
import { PanelInner } from "./components/PanelInner";

function noopSubscribe() {
  return () => {};
}
function getClientMounted() {
  return true;
}
function getServerMounted() {
  return false;
}
function getPanelClosedOnServer() {
  return false;
}

type PanelProps = {
  showToggleButton: boolean;
  buttonPosition: ButtonPosition;
  bufferSize: number;
};

function Panel({ showToggleButton, buttonPosition, bufferSize }: PanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const open = useSyncExternalStore(
    panelState.subscribe,
    panelState.getSnapshot,
    getPanelClosedOnServer
  );
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fixedPanelRef = useRef<HTMLDivElement>(null);
  const { clearedAtRef, persistClearedAt } = useClearedAt();
  const seenIdsRef = useRef<Set<string>>(new Set());
  const { config, update } = usePanelConfig();
  const theme = useEffectiveTheme(config.colorScheme);
  const isDark = theme === "dark";

  useEffect(() => {
    if (!document.getElementById(PANEL_STYLES_ID)) {
      const style = document.createElement("style");
      style.id = PANEL_STYLES_ID;
      style.textContent = panelStyles;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    // Fallback: create the session cookie if middleware didn't (e.g. /api/* excluded from matcher).
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_COOKIE}=`))) {
      document.cookie = `${SESSION_COOKIE}=${crypto.randomUUID()}; path=/; samesite=lax; max-age=${SESSION_COOKIE_MAX_AGE}`;
    }

    let current: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = SSE_RETRY_INITIAL_MS;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const es = new EventSource(DEV_NETWORK_ROUTE);
      current = es;

      es.onopen = () => {
        retryDelay = SSE_RETRY_INITIAL_MS;
      };

      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          if (entry.timestamp <= clearedAtRef.current) return;
          if (seenIdsRef.current.has(entry.id)) return;
          seenIdsRef.current.add(entry.id);
          setEntries((prev) => {
            if (prev.some((e) => e.id === entry.id)) return prev;
            const next = [...prev, entry];
            return next.length > bufferSize ? next.slice(-bufferSize) : next;
          });
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        // CLOSED = fatal HTTP error (e.g. 503) — browser won't retry automatically.
        // CONNECTING = browser is already retrying a dropped connection — let it.
        if (es.readyState === EventSource.CLOSED) {
          current = null;
          retryTimeout = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, SSE_RETRY_MAX_MS);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(retryTimeout);
      current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClear() {
    persistClearedAt(Date.now());
    setEntries([]);
    setSelected(null);
  }

  useEffect(() => {
    if (!open || selected) return;
    const bottom = bottomRef.current;
    if (!bottom) return;
    const viewport = bottom.closest(SCROLL_AREA_VIEWPORT_SELECTOR) as HTMLElement | null;
    const distanceFromBottom = viewport
      ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
      : 0;
    if (distanceFromBottom < SCROLL_BOTTOM_THRESHOLD_PX) {
      bottom.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, open, selected]);

  const innerProps = {
    entries,
    selected,
    setSelected,
    onClear: handleClear,
    onOpenSettings: () => setSettingsOpen(true),
    onClose: panelState.close,
    bottomRef,
    detailSize: config.detailSize,
    onDetailSizeChange: (size: number) => update({ detailSize: size }),
  };

  const isHorizontal = config.sheetSide === "bottom" || config.sheetSide === "top";
  const sheetSize = isHorizontal
    ? { height: config.height }
    : { width: config.width, maxWidth: config.width };

  function handleSheetOpenChange(next: boolean) {
    if (next) panelState.open();
    else if (config.sheetModal) panelState.close();
  }

  function handleSheetResize(size: number) {
    if (isHorizontal) update({ height: size });
    else update({ width: size });
  }

  function handleFixedResize(w: number, h: number) {
    update({ width: w, height: h });
  }

  // Scoped theme class sets --nfp-* vars with hardcoded values so they are never
  // affected by the consumer's <html class="dark"> or any other ancestor.
  // The "dark" class is kept alongside for dark: utility selectors.
  const themeClass = buildThemeClass(isDark);

  return (
    <PanelThemeContext.Provider value={themeClass}>
      <SettingsDialog
        config={config}
        update={update}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        theme={theme}
      />

      {config.mode === "sheet" && (
        <Sheet open={open} onOpenChange={handleSheetOpenChange} modal={config.sheetModal}>
          <SheetContent
            side={config.sheetSide}
            showCloseButton={false}
            showOverlay={config.sheetModal}
            data-nfp
            className={cn(
              themeClass,
              "bg-background text-foreground border-border font-mono text-xs gap-0 p-0",
              !isHorizontal && "flex-row"
            )}
            style={sheetSize}
          >
            <SheetTitle className="sr-only">Server Network Panel</SheetTitle>
            <SheetDescription className="sr-only">Real-time SSR fetch inspector</SheetDescription>

            {/* Handle at start edge: top of bottom-sheet, left of right-sheet */}
            {(config.sheetSide === "bottom" || config.sheetSide === "right") && (
              <SheetResizeHandle side={config.sheetSide} onResize={handleSheetResize} />
            )}

            {isHorizontal ? (
              <PanelInner {...innerProps} />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
                <PanelInner {...innerProps} />
              </div>
            )}

            {/* Handle at end edge: bottom of top-sheet, right of left-sheet */}
            {(config.sheetSide === "top" || config.sheetSide === "left") && (
              <SheetResizeHandle side={config.sheetSide} onResize={handleSheetResize} />
            )}
          </SheetContent>
        </Sheet>
      )}

      {config.mode === "fixed" && open && (
        <div
          ref={fixedPanelRef}
          data-nfp
          className={cn(
            themeClass,
            "fixed z-9998 flex flex-col rounded-lg border border-border bg-background text-foreground font-mono text-xs shadow-2xl",
            FIXED_PANEL_POSITION_CLASSES[buttonPosition]
          )}
          style={{ width: config.width, height: config.height }}
        >
          <FixedResizeHandle
            direction="top"
            panelRef={fixedPanelRef}
            onResize={handleFixedResize}
          />
          <FixedResizeHandle
            direction="bottom"
            panelRef={fixedPanelRef}
            onResize={handleFixedResize}
          />
          <FixedResizeHandle
            direction="left"
            panelRef={fixedPanelRef}
            onResize={handleFixedResize}
          />
          <FixedResizeHandle
            direction="right"
            panelRef={fixedPanelRef}
            onResize={handleFixedResize}
          />
          <PanelInner {...innerProps} />
        </div>
      )}

      {showToggleButton && !open && (
        <div data-nfp className={cn(themeClass)}>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "fixed z-9999 font-mono gap-1.5 shadow-md dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800",
              BUTTON_POSITION_CLASSES[buttonPosition]
            )}
            onClick={panelState.open}
          >
            <span className={entries.length > 0 ? "text-green-500" : "text-muted-foreground"}>
              ●
            </span>
            Server Network
            {entries.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 tabular-nums">
                {entries.length}
              </Badge>
            )}
          </Button>
        </div>
      )}
    </PanelThemeContext.Provider>
  );
}

export function useDevNetworkPanel() {
  const isOpen = useSyncExternalStore(
    panelState.subscribe,
    panelState.getSnapshot,
    getPanelClosedOnServer
  );
  return {
    isOpen,
    open: panelState.open,
    close: panelState.close,
    toggle: panelState.toggle,
  };
}

export default function DevNetworkPanel({
  enabled = true,
  showToggleButton = true,
  buttonPosition = "bottom-right",
  bufferSize = BUFFER_SIZE,
}: {
  enabled?: boolean;
  showToggleButton?: boolean;
  buttonPosition?: ButtonPosition;
  bufferSize?: number;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, getClientMounted, getServerMounted);
  if (!enabled || !mounted) return null;
  return createPortal(
    <Panel
      showToggleButton={showToggleButton}
      buttonPosition={buttonPosition}
      bufferSize={bufferSize}
    />,
    document.body
  );
}

"use client";

import panelStyles from "./panel.styles";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { panelState } from "../store";
import { createPortal } from "react-dom";
import { useGroupRef } from "react-resizable-panels";
import { SearchIcon, Settings2Icon, XIcon } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./components/button";
import { Badge } from "./components/badge";
import { ScrollArea } from "./components/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./components/resizable";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./components/sheet";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/dialog";
import { Separator } from "./components/separator";
import { BUFFER_SIZE, type LogEntry, SESSION_COOKIE } from "../domain";

import type { SheetSide, ColorScheme, PanelConfig } from "./panel.config";
import {
  type ButtonPosition,
  BUTTON_POSITION_CLASSES,
  FIXED_PANEL_POSITION_CLASSES,
  CLEARED_AT_KEY,
  SCROLL_AREA_VIEWPORT_SELECTOR,
  SCROLL_BOTTOM_THRESHOLD_PX,
} from "./panel.constants";

import { methodClass, statusClass } from "./helpers/formatters";
import { usePanelConfig } from "./hooks/usePanelConfig";
import { useEffectiveTheme } from "./hooks/useEffectiveTheme";
import { PanelThemeContext } from "./PanelThemeContext";
import { OptionButton } from "./components/OptionButton";
import { EntryActionsMenu } from "./components/EntryActionsMenu";
import { DetailPanel } from "./components/DetailPanel";
import { SheetResizeHandle, FixedResizeHandle } from "./components/ResizeHandles";

function SettingsDialog({
  config,
  update,
  open,
  onOpenChange,
  theme,
}: {
  config: PanelConfig;
  update: (p: Partial<PanelConfig>) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  theme: "light" | "dark";
}) {
  const isDark = theme === "dark";
  const themeClass = isDark ? "nfp-theme-dark dark" : "nfp-theme-light";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-nfp
        style={{ maxWidth: 520 }}
        className={cn(
          themeClass,
          "bg-background text-foreground border-border gap-0 p-0 overflow-hidden"
        )}
        showCloseButton={false}
      >
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <DialogTitle className="text-sm font-semibold text-foreground">
            Panel Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Preferences are saved to localStorage automatically.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-5 px-5 py-4 text-xs">
            <div className="flex flex-col gap-2">
              <p className="font-medium text-foreground">Color scheme</p>
              <div className="flex gap-2">
                {(["system", "light", "dark"] as ColorScheme[]).map((s) => (
                  <OptionButton
                    key={s}
                    active={config.colorScheme === s}
                    onClick={() => update({ colorScheme: s })}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </OptionButton>
                ))}
              </div>
            </div>

            <Separator className="bg-border" />

            <div className="flex flex-col gap-2">
              <p className="font-medium text-foreground">Display mode</p>
              <div className="flex gap-2">
                <OptionButton
                  active={config.mode === "sheet"}
                  onClick={() => update({ mode: "sheet" })}
                >
                  Sheet
                </OptionButton>
                <OptionButton
                  active={config.mode === "fixed"}
                  onClick={() => update({ mode: "fixed" })}
                >
                  Fixed modal
                </OptionButton>
              </div>
            </div>

            {config.mode === "sheet" && (
              <>
                <Separator className="bg-border" />

                <div className="flex flex-col gap-2">
                  <p className="font-medium text-foreground">Sheet side</p>
                  <div className="flex gap-2 flex-wrap">
                    {(["bottom", "right", "top", "left"] as SheetSide[]).map((s) => (
                      <OptionButton
                        key={s}
                        active={config.sheetSide === s}
                        onClick={() => update({ sheetSide: s })}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </OptionButton>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <p className="font-medium text-foreground">Page interaction</p>
                  <div className="flex gap-2">
                    <OptionButton
                      active={!config.sheetModal}
                      onClick={() => update({ sheetModal: false })}
                    >
                      Allow (non-modal)
                    </OptionButton>
                    <OptionButton
                      active={config.sheetModal}
                      onClick={() => update({ sheetModal: true })}
                    >
                      Block (modal)
                    </OptionButton>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Non-modal lets you click the page while the panel is open.
                  </p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end border-t border-border px-5 py-3">
          <DialogClose
            render={
              <Button variant="outline" size="sm">
                Close
              </Button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PanelInner({
  entries,
  selected,
  setSelected,
  onClear,
  onOpenSettings,
  onClose,
  bottomRef,
  detailSize,
  onDetailSizeChange,
}: {
  entries: LogEntry[];
  selected: LogEntry | null;
  setSelected: (e: LogEntry | null) => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  detailSize: number;
  onDetailSizeChange: (size: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const filteredEntries = filter
    ? entries.filter((e) => e.url.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  // Deselect if the selected entry is filtered out
  useEffect(() => {
    if (selected && filter && !selected.url.toLowerCase().includes(filter.toLowerCase())) {
      setSelected(null);
    }
  }, [filter, selected, setSelected]);

  const groupRef = useGroupRef();
  const detailSizeRef = useRef(detailSize);
  const wasSelectedRef = useRef(false);

  useEffect(() => {
    detailSizeRef.current = detailSize;
  }, [detailSize]);

  useEffect(() => {
    if (selected && !wasSelectedRef.current) {
      const sz = detailSizeRef.current;
      const id = setTimeout(() => {
        groupRef.current?.setLayout({ main: 100 - sz, detail: sz });
      }, 0);
      wasSelectedRef.current = true;
      return () => clearTimeout(id);
    }
    if (!selected) wasSelectedRef.current = false;
  }, [selected, groupRef]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-semibold text-foreground">
          Server Network
          {entries.length > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              {filter && filteredEntries.length !== entries.length
                ? `${filteredEntries.length} / ${entries.length}`
                : entries.length}{" "}
              requests
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={onOpenSettings}
          >
            <Settings2Icon />
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={onClear}>
            Clear
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground ml-1"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-center border-b border-border px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 focus-within:ring-1 focus-within:ring-ring/40">
          <SearchIcon className="size-3 shrink-0 text-muted-foreground" />
          <input
            type="text"
            name="nfp-url-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by URL..."
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      </div>

      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1 overflow-hidden"
        groupRef={groupRef}
        onLayoutChanged={(layout) => {
          const sz = (layout as Record<string, number>)["detail"];
          if (sz !== undefined && sz > 0) onDetailSizeChange(sz);
        }}
      >
        <ResizablePanel id="main" minSize={10}>
          <ScrollArea className="h-full">
            <table className="w-full border-collapse">
              <thead>
                <tr className="sticky top-0 z-10 bg-background border-b border-border">
                  {[
                    { label: "Method", cls: "w-[58px] text-left" },
                    { label: "Status", cls: "w-[52px] text-left" },
                    { label: "URL", cls: "text-left" },
                    { label: "Duration", cls: "w-[68px] text-right" },
                    { label: "", cls: "w-[52px]" },
                  ].map(({ label, cls }) => (
                    <th
                      key={label}
                      className={cn(
                        "px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap",
                        cls
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {filter ? "No requests match the filter" : "No requests yet"}
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const isSelected = selected?.id === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        title={entry.error}
                        onClick={() => setSelected(isSelected ? null : entry)}
                        className={cn(
                          "cursor-pointer border-b border-border transition-colors",
                          isSelected
                            ? "bg-primary/15"
                            : entry.error
                              ? "bg-destructive/5 hover:bg-destructive/10"
                              : "hover:bg-muted/40"
                        )}
                      >
                        <td className="px-2.5 py-1.25 whitespace-nowrap">
                          <span
                            className={cn("font-semibold text-[11px]", methodClass(entry.method))}
                          >
                            {entry.method}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.25 whitespace-nowrap">
                          <span
                            className={cn("font-semibold", statusClass(entry.status, entry.error))}
                          >
                            {entry.status ?? "ERR"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.25 max-w-50 overflow-hidden text-ellipsis whitespace-nowrap text-foreground/80">
                          {entry.url}
                        </td>
                        <td className="px-2.5 py-1.25 text-right whitespace-nowrap text-muted-foreground">
                          {entry.duration}ms
                        </td>
                        <td
                          className="px-2 py-1.25 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EntryActionsMenu entry={entry} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <div ref={bottomRef} />
          </ScrollArea>
        </ResizablePanel>

        {selected && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel id="detail" minSize={10}>
              <DetailPanel entry={selected} onClose={() => setSelected(null)} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </>
  );
}

function Panel({
  showToggleButton,
  buttonPosition,
  bufferSize,
}: {
  showToggleButton: boolean;
  buttonPosition: ButtonPosition;
  bufferSize: number;
}) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const open = useSyncExternalStore(panelState.subscribe, panelState.getSnapshot, () => false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fixedPanelRef = useRef<HTMLDivElement>(null);
  const clearedAtRef = useRef<number>(Number(localStorage.getItem(CLEARED_AT_KEY)) || 0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const { config, update } = usePanelConfig();
  const theme = useEffectiveTheme(config.colorScheme);
  const isDark = theme === "dark";

  useEffect(() => {
    const id = "next-fetch-panel-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = panelStyles;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    // Fallback: create the session cookie if middleware didn't (e.g. /api/* excluded from matcher).
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_COOKIE}=`))) {
      document.cookie = `${SESSION_COOKIE}=${crypto.randomUUID()}; path=/; samesite=lax; max-age=31536000`;
    }

    let current: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1_000;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const es = new EventSource("/api/dev-network");
      current = es;

      es.onopen = () => {
        retryDelay = 1_000;
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
            retryDelay = Math.min(retryDelay * 2, 30_000);
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
    const ts = Date.now();
    clearedAtRef.current = ts;
    localStorage.setItem(CLEARED_AT_KEY, String(ts));
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

  // Scoped theme class sets --nfp-* vars with hardcoded values so they are never
  // affected by the consumer's <html class="dark"> or any other ancestor.
  // The "dark" class is kept alongside for dark: utility selectors.
  const themeClass = isDark ? "nfp-theme-dark dark" : "nfp-theme-light";

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
        <Sheet
          open={open}
          onOpenChange={(next) => {
            if (next) panelState.open();
            else if (config.sheetModal) panelState.close();
          }}
          modal={config.sheetModal}
        >
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
              <SheetResizeHandle
                side={config.sheetSide}
                onResize={(size) =>
                  isHorizontal ? update({ height: size }) : update({ width: size })
                }
              />
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
              <SheetResizeHandle
                side={config.sheetSide}
                onResize={(size) =>
                  isHorizontal ? update({ height: size }) : update({ width: size })
                }
              />
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
            onResize={(w, h) => update({ width: w, height: h })}
          />
          <FixedResizeHandle
            direction="bottom"
            panelRef={fixedPanelRef}
            onResize={(w, h) => update({ width: w, height: h })}
          />
          <FixedResizeHandle
            direction="left"
            panelRef={fixedPanelRef}
            onResize={(w, h) => update({ width: w, height: h })}
          />
          <FixedResizeHandle
            direction="right"
            panelRef={fixedPanelRef}
            onResize={(w, h) => update({ width: w, height: h })}
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
  const isOpen = useSyncExternalStore(panelState.subscribe, panelState.getSnapshot, () => false);
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
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
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

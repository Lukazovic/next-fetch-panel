"use client";

import { useEffect, useRef, useState } from "react";
import { useGroupRef } from "react-resizable-panels";
import { SearchIcon, Settings2Icon, XIcon } from "lucide-react";
import { cn } from "../helpers/cn";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import { methodClass, statusClass } from "../helpers/formatters";
import { EntryActionsMenu } from "./EntryActionsMenu";
import { DetailPanel } from "./DetailPanel";
import type { LogEntry } from "../../domain";
import { DETAIL_PANEL_ID, MAIN_PANEL_ID, PANEL_MIN_SIZE_PCT } from "../panel.constants";

type PanelInnerProps = {
  entries: LogEntry[];
  selected: LogEntry | null;
  setSelected: (e: LogEntry | null) => void;
  onClear: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  detailSize: number;
  onDetailSizeChange: (size: number) => void;
};

export function PanelInner({
  entries,
  selected,
  setSelected,
  onClear,
  onOpenSettings,
  onClose,
  bottomRef,
  detailSize,
  onDetailSizeChange,
}: PanelInnerProps) {
  const [filter, setFilter] = useState("");
  const filteredEntries = filter
    ? entries.filter((e) => e.url.toLowerCase().includes(filter.toLowerCase()))
    : entries;

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
        groupRef.current?.setLayout({ [MAIN_PANEL_ID]: 100 - sz, [DETAIL_PANEL_ID]: sz });
      }, 0);
      wasSelectedRef.current = true;
      return () => clearTimeout(id);
    }
    if (!selected) wasSelectedRef.current = false;
  }, [selected, groupRef]);

  function handleLayoutChanged(layout: Record<string, number>) {
    const sz = layout[DETAIL_PANEL_ID];
    if (sz !== undefined && sz > 0) onDetailSizeChange(sz);
  }

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
            aria-label="Settings"
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
            aria-label="Close panel"
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
              aria-label="Clear filter"
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
        onLayoutChanged={handleLayoutChanged}
      >
        <ResizablePanel id="main" minSize={PANEL_MIN_SIZE_PCT}>
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
            <ResizablePanel id={DETAIL_PANEL_ID} minSize={PANEL_MIN_SIZE_PCT}>
              <DetailPanel entry={selected} onClose={() => setSelected(null)} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </>
  );
}

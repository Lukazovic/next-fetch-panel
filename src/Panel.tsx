"use client";

import panelStyles from "./panel.styles";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { panelState } from "./panel-state";
import { createPortal } from "react-dom";
import { useGroupRef } from "react-resizable-panels";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  SearchIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";
import { cn } from "./utils";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Separator } from "./ui/separator";
import { BUFFER_SIZE, BODY_LIMIT, type LogEntry } from "./domain/log-entry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const PanelThemeContext = createContext<string>("nfp-theme-light");

type PanelMode = "sheet" | "fixed";
type SheetSide = "bottom" | "right" | "left" | "top";
type ColorScheme = "system" | "light" | "dark";

type PanelConfig = {
  mode: PanelMode;
  sheetSide: SheetSide;
  sheetModal: boolean;
  width: number;
  height: number;
  colorScheme: ColorScheme;
  detailSize: number;
};

const DEFAULT_CONFIG: PanelConfig = {
  mode: "sheet",
  sheetSide: "bottom",
  sheetModal: false,
  width: 820,
  height: 420,
  colorScheme: "system",
  detailSize: 40,
};

const STORAGE_KEY = "ssr-panel-config";

function usePanelConfig() {
  const [config, setConfig] = useState<PanelConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_CONFIG;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {
      /* ignore */
    }
    return DEFAULT_CONFIG;
  });

  const update = useCallback((patch: Partial<PanelConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { config, update };
}

function useEffectiveTheme(colorScheme: ColorScheme): "light" | "dark" {
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

const METHOD_COLORS: Record<string, string> = {
  GET: "text-blue-400",
  POST: "text-violet-400",
  PUT: "text-orange-400",
  PATCH: "text-orange-400",
  DELETE: "text-red-400",
};

function methodClass(m: string) {
  return METHOD_COLORS[m] ?? "text-slate-400";
}

function statusClass(status: number | null, error?: string) {
  if (error || status === null) return "text-red-400";
  if (status < 300) return "text-green-400";
  if (status < 400) return "text-amber-400";
  return "text-red-400";
}

function durationBarColor(ms: number) {
  if (ms < 200) return "bg-green-500";
  if (ms < 1000) return "bg-amber-500";
  return "bg-red-500";
}

function formatTs(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date(ts));
}

function tryPrettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBody(body: string, filename: string) {
  const isJson = body.trimStart().startsWith("{") || body.trimStart().startsWith("[");
  const blob = new Blob([body], { type: isJson ? "application/json" : "text/plain" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${filename}.${isJson ? "json" : "txt"}`;
  a.click();
  URL.revokeObjectURL(href);
}

function toCurl(entry: LogEntry): string {
  const parts = [`curl -X ${entry.method} '${entry.url.replace(/'/g, "'\\''")}'`];
  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  }
  if (entry.requestBody && entry.requestBody !== "[binary]") {
    parts.push(`  --data-raw '${entry.requestBody.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

function downloadEntry(entry: LogEntry) {
  const blob = new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  let name = "entry";
  try {
    name = new URL(entry.url).pathname.split("/").filter(Boolean).pop() || "entry";
  } catch {}
  a.download = `${name}-entry.json`;
  a.click();
  URL.revokeObjectURL(href);
}

function EntryActionsMenu({ entry }: { entry: LogEntry }) {
  const themeClass = useContext(PanelThemeContext);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  let downloadName = "entry";
  try {
    downloadName = new URL(entry.url).pathname.split("/").filter(Boolean).pop() || "entry";
  } catch {}

  function handleCopyCurl() {
    navigator.clipboard.writeText(toCurl(entry)).then(() => {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Actions"
        className={cn(
          "rounded p-0.5 transition-colors",
          copied ? "text-green-500" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <EllipsisIcon className="size-3.5" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent data-nfp="" className={themeClass}>
        <DropdownMenuItem onClick={handleCopyCurl}>
          <CopyIcon className="size-3 shrink-0" />
          Copy as cURL
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {entry.responseBody && (
          <DropdownMenuItem
            onClick={() => downloadBody(entry.responseBody!, `${downloadName}-response`)}
          >
            <DownloadIcon className="size-3 shrink-0" />
            Download response body
          </DropdownMenuItem>
        )}
        {entry.requestBody && entry.requestBody !== "[binary]" && (
          <DropdownMenuItem
            onClick={() => downloadBody(entry.requestBody!, `${downloadName}-request`)}
          >
            <DownloadIcon className="size-3 shrink-0" />
            Download request body
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => downloadEntry(entry)}>
          <DownloadIcon className="size-3 shrink-0" />
          Download full request data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors border",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

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

function HeaderList({ headers }: { headers: Record<string, string> | undefined | null }) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return <p className="text-muted-foreground text-[11px]">No headers</p>;
  return (
    <div className="flex flex-col divide-y divide-border">
      {entries.map(([k, v]) => (
        <div key={k} className="py-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
            {k}
          </p>
          <p className="text-[11px] text-foreground break-all leading-relaxed">{v}</p>
        </div>
      ))}
    </div>
  );
}

function BodyViewer({
  body,
  contentType,
  emptyLabel,
  downloadName,
}: {
  body: string | null | undefined;
  contentType: string | null;
  emptyLabel: string;
  downloadName?: string;
}) {
  // Track which body string the user has chosen to render — implicitly resets
  // when body changes because the new value won't equal the stored one.
  const [revealedBody, setRevealedBody] = useState<string | null>(null);
  const revealed = revealedBody !== null && revealedBody === body;

  if (!body) return <p className="text-muted-foreground text-[11px]">{emptyLabel}</p>;

  if (body.length >= BODY_LIMIT && !revealed) {
    return (
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[11px] text-muted-foreground">
          Body is large ({formatBytes(body.length)}) and may freeze the panel when rendered.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-[11px] h-7"
            onClick={() => setRevealedBody(body)}
          >
            Render anyway
          </Button>
          {downloadName && (
            <Button
              size="sm"
              variant="outline"
              className="text-[11px] h-7"
              onClick={() => downloadBody(body, downloadName)}
            >
              Download
            </Button>
          )}
        </div>
      </div>
    );
  }

  const isJson =
    contentType?.includes("json") ||
    body.trimStart().startsWith("{") ||
    body.trimStart().startsWith("[");
  return (
    <pre className="text-[11px] text-foreground whitespace-pre-wrap break-all leading-relaxed">
      {isJson ? tryPrettyJson(body) : body}
    </pre>
  );
}

function BodyTruncatedNotice({
  kind,
  captured,
  contentLength,
}: {
  kind: "Request" | "Response";
  captured: number;
  contentLength?: number | null;
}) {
  return (
    <div className="rounded border border-yellow-500/30 bg-yellow-500/5 px-2.5 py-2 flex flex-col gap-1">
      <p className="text-[11px] font-semibold text-yellow-500">{kind} body truncated</p>
      <p className="text-[11px] text-muted-foreground">
        {contentLength != null ? (
          <>
            ~{formatBytes(captured)} of ~{formatBytes(contentLength)} were captured.
          </>
        ) : (
          <>~{formatBytes(captured)} were captured.</>
        )}{" "}
        Increase <code className="font-mono">bodyLimit</code> in your project config to capture
        more.
      </p>
    </div>
  );
}

function DetailPanel({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  let pathname = entry.url;
  try {
    pathname = new URL(entry.url).pathname;
  } catch {
    /* keep full url */
  }
  const downloadName = pathname.split("/").filter(Boolean).pop() || "response";

  return (
    <div className="flex flex-col h-full overflow-hidden border-border">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-2.5 py-1.5 gap-2">
        <span className="truncate text-[11px] font-semibold text-foreground" title={entry.url}>
          {pathname}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground"
          onClick={onClose}
        >
          ✕
        </Button>
      </div>

      <Tabs defaultValue="general" className="flex flex-col flex-1 overflow-hidden gap-0">
        <TabsList
          variant="line"
          className="shrink-0 w-full justify-start rounded-none border-b border-border bg-transparent h-auto px-1 overflow-x-auto scrollbar-none"
        >
          {(["general", "headers", "payload", "response"] as const).map((v) => (
            <TabsTrigger
              key={v}
              value={v}
              className="text-[11px] capitalize px-2.5 py-1.5 rounded-none text-muted-foreground data-active:text-foreground data-active:font-semibold"
            >
              {v}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 overflow-hidden min-h-0">
          <TabsContent value="general" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-3 p-3 text-[11px]">
                {entry.responseBodyTruncated && (
                  <BodyTruncatedNotice
                    kind="Response"
                    captured={entry.responseBody?.length ?? 0}
                    contentLength={
                      Number.isFinite(Number(entry.responseHeaders?.["content-length"]))
                        ? Number(entry.responseHeaders!["content-length"])
                        : null
                    }
                  />
                )}
                {entry.requestBodyTruncated && (
                  <BodyTruncatedNotice kind="Request" captured={entry.requestBody?.length ?? 0} />
                )}
                {(
                  [
                    ["Request URL", entry.url],
                    ["Request Method", entry.method],
                    [
                      "Status Code",
                      entry.status != null
                        ? `${entry.status}${entry.statusText ? " " + entry.statusText : ""}`
                        : "—",
                    ],
                    ["Started at", formatTs(entry.timestamp)],
                    ["Duration", `${entry.duration}ms`],
                    ...(entry.error ? [["Error", entry.error]] : []),
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-muted-foreground mb-0.5">{label}</p>
                    <p
                      className={cn(
                        "break-all leading-relaxed",
                        label === "Status Code"
                          ? statusClass(entry.status, entry.error)
                          : label === "Error"
                            ? "text-red-400"
                            : "text-foreground"
                      )}
                    >
                      {value}
                    </p>
                  </div>
                ))}
                <div>
                  <p className="text-muted-foreground mb-1.5">Duration bar</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", durationBarColor(entry.duration))}
                      style={{ width: `${Math.min((entry.duration / 2000) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">scale: 0–2000ms</p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="headers" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="flex flex-col gap-4 p-3">
                {[
                  ["Response Headers", entry.responseHeaders],
                  ["Request Headers", entry.requestHeaders],
                ].map(([label, hdrs]) => (
                  <div key={label as string}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                      {label as string}
                    </p>
                    <HeaderList headers={hdrs as Record<string, string>} />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="payload" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-3">
                <BodyViewer
                  body={entry.requestBody}
                  contentType={entry.requestHeaders?.["content-type"] ?? null}
                  emptyLabel="No request body"
                  downloadName={downloadName}
                />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="response" className="h-full m-0">
            <ScrollArea className="h-full">
              <div className="p-3">
                <BodyViewer
                  body={entry.responseBody}
                  contentType={entry.responseHeaders?.["content-type"] ?? null}
                  emptyLabel="No response body"
                  downloadName={downloadName}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </div>
      </Tabs>
    </div>
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

const CLEARED_AT_KEY = "next-fetch-panel-cleared-at";
const SCROLL_AREA_VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]';
const SCROLL_BOTTOM_THRESHOLD_PX = 100;
const FIXED_MIN_WIDTH_PX = 320;
const FIXED_MIN_HEIGHT_PX = 200;
const FIXED_MAX_WIDTH_FRACTION = 0.95;
const FIXED_MAX_HEIGHT_FRACTION = 0.9;

function SheetResizeHandle({
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

function FixedResizeHandle({
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
      let w = rect.width;
      let h = rect.height;

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

export type ButtonPosition =
  | "bottom-right"
  | "bottom-center"
  | "bottom-left"
  | "top-right"
  | "top-center"
  | "top-left";

const BUTTON_POSITION_CLASSES: Record<ButtonPosition, string> = {
  "bottom-right": "bottom-4 right-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "top-left": "top-4 left-4",
};

const FIXED_PANEL_POSITION_CLASSES: Record<ButtonPosition, string> = {
  "bottom-right": "bottom-14 right-4",
  "bottom-center": "bottom-14 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-14 left-4",
  "top-right": "top-14 right-4",
  "top-center": "top-14 left-1/2 -translate-x-1/2",
  "top-left": "top-14 left-4",
};

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
    if (!document.cookie.split("; ").some((c) => c.startsWith("__dev_sid="))) {
      document.cookie = `__dev_sid=${crypto.randomUUID()}; path=/; samesite=lax; max-age=31536000`;
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

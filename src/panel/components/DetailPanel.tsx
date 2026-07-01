"use client";

import { useState } from "react";
import { cn } from "../helpers/cn";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { BODY_LIMIT, type LogEntry } from "../../domain";
import { DURATION_BAR_MAX_MS } from "../panel.constants";
import {
  formatBytes,
  formatTs,
  tryPrettyJson,
  statusClass,
  durationBarColor,
} from "../helpers/formatters";
import { downloadBody } from "../helpers/downloads";

type HeaderListProps = {
  headers: Record<string, string> | undefined | null;
};

export function HeaderList({ headers }: HeaderListProps) {
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

type BodyTruncatedNoticeProps = {
  kind: "Request" | "Response";
  captured: number;
  contentLength?: number | null;
};

export function BodyTruncatedNotice({ kind, captured, contentLength }: BodyTruncatedNoticeProps) {
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

type BodyViewerProps = {
  body: string | null | undefined;
  contentType: string | null;
  emptyLabel: string;
  downloadName?: string;
};

export function BodyViewer({ body, contentType, emptyLabel, downloadName }: BodyViewerProps) {
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

type DetailPanelProps = {
  entry: LogEntry;
  onClose: () => void;
};

export function DetailPanel({ entry, onClose }: DetailPanelProps) {
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
                      style={{
                        width: `${Math.min((entry.duration / DURATION_BAR_MAX_MS) * 100, 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    scale: 0–{DURATION_BAR_MAX_MS}ms
                  </p>
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

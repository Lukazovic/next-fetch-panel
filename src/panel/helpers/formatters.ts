import type { LogEntry } from "../../domain";
import {
  METHOD_COLORS,
  DURATION_FAST_MS,
  DURATION_SLOW_MS,
  BYTES_PER_KB,
  HTTP_REDIRECT_STATUS,
  HTTP_ERROR_STATUS,
} from "../panel.constants";
import { BINARY_BODY } from "../../capture/helpers/http";

export function methodClass(m: string): string {
  return METHOD_COLORS[m] ?? "text-slate-400";
}

export function statusClass(status: number | null, error?: string): string {
  if (error || status === null) return "text-red-400";
  if (status < HTTP_REDIRECT_STATUS) return "text-green-400";
  if (status < HTTP_ERROR_STATUS) return "text-amber-400";
  return "text-red-400";
}

export function durationBarColor(ms: number): string {
  if (ms < DURATION_FAST_MS) return "bg-green-500";
  if (ms < DURATION_SLOW_MS) return "bg-amber-500";
  return "bg-red-500";
}

export function formatTs(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date(ts));
}

export function formatBytes(n: number): string {
  if (n < BYTES_PER_KB) return `${n} B`;
  if (n < BYTES_PER_KB * BYTES_PER_KB) return `${(n / BYTES_PER_KB).toFixed(1)} KB`;
  return `${(n / (BYTES_PER_KB * BYTES_PER_KB)).toFixed(1)} MB`;
}

export function tryPrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function parseJsonBody(body: string | null | undefined): unknown {
  if (!body) return body;
  const trimmed = body.trimStart();
  // Only objects/arrays — a body like "123" or "true" must stay a string.
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * Serializes an entry for export (copy / download). JSON bodies are nested as
 * objects so they read naturally instead of as escaped one-line strings.
 */
export function serializeEntry(entry: LogEntry): string {
  return JSON.stringify(
    {
      ...entry,
      requestBody: parseJsonBody(entry.requestBody),
      responseBody: parseJsonBody(entry.responseBody),
    },
    null,
    2
  );
}

export function toCurl(entry: LogEntry): string {
  const parts = [`curl -X ${entry.method} '${entry.url.replace(/'/g, "'\\''")}'`];
  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  }
  if (entry.requestBody && entry.requestBody !== BINARY_BODY) {
    parts.push(`  --data-raw '${entry.requestBody.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

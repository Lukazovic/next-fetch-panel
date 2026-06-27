import type { LogEntry } from "../../domain";
import { METHOD_COLORS } from "../panel.constants";

export function methodClass(m: string): string {
  return METHOD_COLORS[m] ?? "text-slate-400";
}

export function statusClass(status: number | null, error?: string): string {
  if (error || status === null) return "text-red-400";
  if (status < 300) return "text-green-400";
  if (status < 400) return "text-amber-400";
  return "text-red-400";
}

export function durationBarColor(ms: number): string {
  if (ms < 200) return "bg-green-500";
  if (ms < 1000) return "bg-amber-500";
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
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function tryPrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function toCurl(entry: LogEntry): string {
  const parts = [`curl -X ${entry.method} '${entry.url.replace(/'/g, "'\\''")}'`];
  for (const [k, v] of Object.entries(entry.requestHeaders ?? {})) {
    parts.push(`  -H '${k}: ${v.replace(/'/g, "'\\''")}'`);
  }
  if (entry.requestBody && entry.requestBody !== "[binary]") {
    parts.push(`  --data-raw '${entry.requestBody.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}

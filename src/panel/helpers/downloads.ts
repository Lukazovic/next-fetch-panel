import type { LogEntry } from "../../domain";

export function downloadBody(body: string, filename: string): void {
  const isJson = body.trimStart().startsWith("{") || body.trimStart().startsWith("[");
  const blob = new Blob([body], { type: isJson ? "application/json" : "text/plain" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${filename}.${isJson ? "json" : "txt"}`;
  a.click();
  URL.revokeObjectURL(href);
}

export function downloadEntry(entry: LogEntry): void {
  const blob = new Blob([JSON.stringify(entry, null, 2)], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  let name = "entry";
  try {
    name = new URL(entry.url).pathname.split("/").filter(Boolean).pop() || "entry";
  } catch {
    /* keep default */
  }
  a.download = `${name}-entry.json`;
  a.click();
  URL.revokeObjectURL(href);
}

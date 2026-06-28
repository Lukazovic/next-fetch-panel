"use client";

import { useContext, useState, useRef, useEffect } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, EllipsisIcon } from "lucide-react";
import { cn } from "../cn";
import { PanelThemeContext } from "../PanelThemeContext";
import { toCurl } from "../helpers/formatters";
import { downloadBody, downloadEntry } from "../helpers/downloads";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { LogEntry } from "../../domain";

export function EntryActionsMenu({ entry }: { entry: LogEntry }) {
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

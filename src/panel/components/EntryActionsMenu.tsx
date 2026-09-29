"use client";

import { useContext, useState, useRef, useEffect } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, EllipsisIcon } from "lucide-react";
import { cn } from "../helpers/cn";
import { PanelThemeContext } from "../PanelThemeContext";
import { toCurl, tryPrettyJson } from "../helpers/formatters";
import { downloadBody, downloadEntry } from "../helpers/downloads";
import { BINARY_BODY } from "../../capture/helpers/http";
import { COPY_FEEDBACK_MS } from "../panel.constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { LogEntry } from "../../domain";

type EntryActionsMenuProps = {
  entry: LogEntry;
};

export function EntryActionsMenu({ entry }: EntryActionsMenuProps) {
  const themeClass = useContext(PanelThemeContext);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  let downloadName = "entry";
  try {
    downloadName = new URL(entry.url).pathname.split("/").filter(Boolean).pop() || "entry";
  } catch {}

  const hasResponseBody = Boolean(entry.responseBody);
  const hasRequestBody = Boolean(entry.requestBody) && entry.requestBody !== BINARY_BODY;

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
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
        <DropdownMenuItem onClick={() => copy(toCurl(entry))}>
          <CopyIcon className="size-3 shrink-0" />
          Copy as cURL
        </DropdownMenuItem>
        {hasResponseBody && (
          <DropdownMenuItem onClick={() => copy(tryPrettyJson(entry.responseBody!))}>
            <CopyIcon className="size-3 shrink-0" />
            Copy response body
          </DropdownMenuItem>
        )}
        {hasRequestBody && (
          <DropdownMenuItem onClick={() => copy(tryPrettyJson(entry.requestBody!))}>
            <CopyIcon className="size-3 shrink-0" />
            Copy request body
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => copy(JSON.stringify(entry, null, 2))}>
          <CopyIcon className="size-3 shrink-0" />
          Copy full request data
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {hasResponseBody && (
          <DropdownMenuItem
            onClick={() => downloadBody(entry.responseBody!, `${downloadName}-response`)}
          >
            <DownloadIcon className="size-3 shrink-0" />
            Download response body
          </DropdownMenuItem>
        )}
        {hasRequestBody && (
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

"use client";

import { useId, useState } from "react";
import { XIcon } from "lucide-react";
import { cn } from "../helpers/cn";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { OptionButton } from "./OptionButton";
import {
  MOCKS_COOKIE_MAX_LENGTH,
  MOCK_MAX_STATUS,
  MOCK_MIN_STATUS,
  type MockRule,
} from "../../domain";

export type MockDraft = {
  method: string;
  urlIncludes: string;
  kind: "response" | "network-error";
  status: string;
  body: string;
  delayMs: string;
};

type MocksDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  themeClass: string;
  rules: MockRule[];
  initialDraft: MockDraft;
  onAdd: (rule: MockRule) => boolean;
  onRemove: (id: string) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40";

export function describeRule(rule: MockRule): string {
  const result =
    rule.action.type === "network-error" ? "network error" : String(rule.action.status);
  const delay = rule.delayMs ? ` (+${rule.delayMs}ms)` : "";
  return `${rule.method} ${rule.urlIncludes} → ${result}${delay}`;
}

function parseStatus(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= MOCK_MIN_STATUS && n <= MOCK_MAX_STATUS ? n : null;
}

function parseDelay(value: string): number | undefined | null {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function buildRule(draft: MockDraft): MockRule | null {
  const method = draft.method.trim().toUpperCase();
  const urlIncludes = draft.urlIncludes.trim();
  const delayMs = parseDelay(draft.delayMs);
  if (!method || !urlIncludes || delayMs === null) return null;

  let action: MockRule["action"];
  if (draft.kind === "network-error") {
    action = { type: "network-error" };
  } else {
    const status = parseStatus(draft.status);
    if (status === null) return null;
    action = draft.body
      ? { type: "response", status, body: draft.body }
      : { type: "response", status };
  }

  return {
    id: crypto.randomUUID(),
    method,
    urlIncludes,
    ...(delayMs ? { delayMs } : {}),
    action,
  };
}

export function MocksDialog({
  open,
  onOpenChange,
  themeClass,
  rules,
  initialDraft,
  onAdd,
  onRemove,
}: MocksDialogProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [tooLarge, setTooLarge] = useState(false);
  const id = useId();
  const rule = buildRule(draft);

  function update(patch: Partial<MockDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setTooLarge(false);
  }

  function handleAdd() {
    if (rule) setTooLarge(!onAdd(rule));
  }

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
          <DialogTitle className="text-sm font-semibold text-foreground">Mocks</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Force responses for server-side requests made while handling this browser&apos;s
            requests. Rules live in a session cookie and only affect you.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="flex flex-col gap-4 px-5 py-4 text-xs">
            <div className="flex flex-col gap-1.5">
              <p className="font-medium text-foreground">Active rules</p>
              {rules.length === 0 ? (
                <p className="text-muted-foreground">No active rules</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {rules.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="break-all text-foreground">{describeRule(r)}</span>
                      <Button
                        aria-label="Remove rule"
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground"
                        onClick={() => onRemove(r.id)}
                      >
                        <XIcon />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator className="bg-border" />

            <div className="flex flex-col gap-3">
              <p className="font-medium text-foreground">New rule</p>
              <div className="flex gap-2">
                <div className="flex w-24 flex-col gap-1">
                  <label htmlFor={`${id}-method`} className="text-muted-foreground">
                    Method
                  </label>
                  <input
                    id={`${id}-method`}
                    value={draft.method}
                    onChange={(e) => update({ method: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor={`${id}-url`} className="text-muted-foreground">
                    URL contains
                  </label>
                  <input
                    id={`${id}-url`}
                    value={draft.urlIncludes}
                    onChange={(e) => update({ urlIncludes: e.target.value })}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Use * as the method to match any method.
              </p>

              <div className="flex gap-2">
                <OptionButton
                  active={draft.kind === "response"}
                  onClick={() => update({ kind: "response" })}
                >
                  Status code
                </OptionButton>
                <OptionButton
                  active={draft.kind === "network-error"}
                  onClick={() => update({ kind: "network-error" })}
                >
                  Network error
                </OptionButton>
              </div>

              {draft.kind === "response" && (
                <>
                  <div className="flex w-24 flex-col gap-1">
                    <label htmlFor={`${id}-status`} className="text-muted-foreground">
                      Status
                    </label>
                    <input
                      id={`${id}-status`}
                      type="number"
                      min={MOCK_MIN_STATUS}
                      max={MOCK_MAX_STATUS}
                      value={draft.status}
                      onChange={(e) => update({ status: e.target.value })}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-body`} className="text-muted-foreground">
                      Response body
                    </label>
                    <textarea
                      id={`${id}-body`}
                      rows={4}
                      value={draft.body}
                      onChange={(e) => update({ body: e.target.value })}
                      placeholder='{"error":"Something went wrong"}'
                      className={cn(INPUT_CLASS, "font-mono")}
                    />
                    <p className="text-muted-foreground text-[11px]">
                      Keep bodies short: all rules share a ~
                      {Math.floor(MOCKS_COOKIE_MAX_LENGTH / 1_000)} KB cookie, so this is meant for
                      error payloads, not full success responses.
                    </p>
                  </div>
                </>
              )}

              <div className="flex w-24 flex-col gap-1">
                <label htmlFor={`${id}-delay`} className="text-muted-foreground">
                  Delay (ms)
                </label>
                <input
                  id={`${id}-delay`}
                  type="number"
                  min={0}
                  value={draft.delayMs}
                  onChange={(e) => update({ delayMs: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>

              {tooLarge && (
                <p className="text-destructive text-[11px]">
                  Rules are too large to fit in the cookie. Shorten the response body or remove
                  other rules.
                </p>
              )}

              <div>
                <Button size="sm" disabled={!rule} onClick={handleAdd}>
                  Add rule
                </Button>
              </div>
            </div>
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

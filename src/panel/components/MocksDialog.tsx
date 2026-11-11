"use client";

import { useId, useState } from "react";
import { ClockIcon, InfoIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { cn } from "../helpers/cn";
import { statusClass } from "../helpers/formatters";
import { Button } from "./ui/button";
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

type ValidatedField = "method" | "urlIncludes" | "status" | "delayMs";

type FieldErrors = Partial<Record<ValidatedField, string>>;

type RuleRowProps = {
  rule: MockRule;
  onRemove: (rule: MockRule) => void;
};

type FieldProps = {
  id: string;
  label: string;
  className?: string;
  hint?: React.ReactNode;
  error?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
};

const MS_PER_SECOND = 1_000;
const BYTES_PER_KB = 1_000;
const NETWORK_ERROR_TONE = "text-red-400";

const ERROR_MESSAGES: Record<ValidatedField, string> = {
  method: "Enter a method, or * for any.",
  urlIncludes: "Enter part of the request URL.",
  status: `Use a status between ${MOCK_MIN_STATUS} and ${MOCK_MAX_STATUS}.`,
  delayMs: "Use a whole number of milliseconds.",
};

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring/40 aria-invalid:border-destructive aria-invalid:focus:ring-destructive/40";

export function describeRule(rule: MockRule): string {
  const result =
    rule.action.type === "network-error" ? "network error" : String(rule.action.status);
  const delay = rule.delayMs ? ` (+${rule.delayMs}ms)` : "";
  return `${rule.method} ${rule.urlIncludes} → ${result}${delay}`;
}

function formatDelay(ms: number): string {
  if (ms < MS_PER_SECOND) return `${ms} ms`;
  const seconds = ms / MS_PER_SECOND;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
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

function validateDraft(draft: MockDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.method.trim()) errors.method = ERROR_MESSAGES.method;
  if (!draft.urlIncludes.trim()) errors.urlIncludes = ERROR_MESSAGES.urlIncludes;
  if (draft.kind === "response" && parseStatus(draft.status) === null) {
    errors.status = ERROR_MESSAGES.status;
  }
  if (parseDelay(draft.delayMs) === null) errors.delayMs = ERROR_MESSAGES.delayMs;
  return errors;
}

function withoutErrorsFor(errors: FieldErrors, patch: Partial<MockDraft>): FieldErrors {
  const next = { ...errors };
  for (const field of Object.keys(patch)) delete next[field as ValidatedField];
  return next;
}

function buildRule(draft: MockDraft): MockRule {
  const delayMs = parseDelay(draft.delayMs);
  const status = parseStatus(draft.status) ?? MOCK_MIN_STATUS;
  const action: MockRule["action"] =
    draft.kind === "network-error"
      ? { type: "network-error" }
      : draft.body
        ? { type: "response", status, body: draft.body }
        : { type: "response", status };

  return {
    id: crypto.randomUUID(),
    method: draft.method.trim().toUpperCase(),
    urlIncludes: draft.urlIncludes.trim(),
    ...(delayMs ? { delayMs } : {}),
    action,
  };
}

function RuleRow({ rule, onRemove }: RuleRowProps) {
  const description = describeRule(rule);
  const isNetworkError = rule.action.type === "network-error";
  const outcome = rule.action.type === "network-error" ? "Network error" : rule.action.status;
  const outcomeTone =
    rule.action.type === "network-error" ? NETWORK_ERROR_TONE : statusClass(rule.action.status);

  return (
    <li
      aria-label={description}
      className="flex items-center gap-2 rounded-md border border-border bg-muted/30 py-1.5 pr-1.5 pl-2.5"
    >
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
        {rule.method}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={rule.urlIncludes}>
        {rule.urlIncludes}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono font-semibold",
          isNetworkError && "font-medium",
          outcomeTone
        )}
      >
        {outcome}
      </span>
      {rule.delayMs ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-muted-foreground"
          title={`Responds after ${rule.delayMs} ms`}
        >
          <ClockIcon className="size-3" />
          {formatDelay(rule.delayMs)}
        </span>
      ) : null}
      <Button
        aria-label={`Remove ${description}`}
        variant="ghost"
        size="xs"
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRemove(rule)}
      >
        <Trash2Icon />
        Remove
      </Button>
    </li>
  );
}

function Field({ id, label, className, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      {children(describedBy)}
      {error && (
        <p id={errorId} className="m-0 text-[11px] text-destructive">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="m-0 text-[11px] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [tooLarge, setTooLarge] = useState(false);
  const [removed, setRemoved] = useState<MockRule | null>(null);
  const id = useId();
  const delayMs = parseDelay(draft.delayMs);

  function update(patch: Partial<MockDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors((current) => withoutErrorsFor(current, patch));
    setTooLarge(false);
  }

  function handleAdd() {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setTooLarge(!onAdd(buildRule(draft)));
  }

  function handleRemove(rule: MockRule) {
    onRemove(rule.id);
    setRemoved(rule);
  }

  function handleUndo() {
    if (removed && onAdd(removed)) setRemoved(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-nfp
        style={{ maxWidth: 560 }}
        className={cn(
          themeClass,
          "flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground"
        )}
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pb-4">
          <DialogTitle className="text-sm font-semibold text-foreground">Mocks</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Force responses for server-side requests made while handling this browser&apos;s
            requests. Rules live in a session cookie and only affect you.
          </DialogDescription>
        </DialogHeader>

        <section
          aria-labelledby={`${id}-active`}
          className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/10 px-5 py-3 text-xs"
        >
          <h3 id={`${id}-active`} className="m-0 text-xs font-medium text-foreground">
            Active mocks ({rules.length})
          </h3>

          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-2.5 text-muted-foreground">
              <p className="m-0 font-medium text-foreground">No active mocks</p>
              <p className="m-0">Requests reach the real APIs.</p>
            </div>
          ) : (
            <ul className="m-0 flex max-h-40 list-none flex-col gap-1.5 overflow-y-auto p-0">
              {rules.map((r) => (
                <RuleRow key={r.id} rule={r} onRemove={handleRemove} />
              ))}
            </ul>
          )}

          {removed && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                Removed {describeRule(removed)}
              </span>
              <Button variant="outline" size="xs" className="shrink-0" onClick={handleUndo}>
                <Undo2Icon />
                Undo
              </Button>
            </div>
          )}

          {rules.length > 0 && (
            <p className="m-0 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <InfoIcon className="mt-px size-3 shrink-0" />
              Rules apply to the next server request. Reload the page to see them.
            </p>
          )}
        </section>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-5 px-5 py-4 text-xs">
            <h3 className="m-0 text-xs font-medium text-foreground">New rule</h3>

            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Match
              </legend>
              <div className="flex items-start gap-2">
                <Field
                  id={`${id}-method`}
                  label="Method"
                  className="w-24"
                  hint="* = any"
                  error={errors.method}
                >
                  {(describedBy) => (
                    <input
                      id={`${id}-method`}
                      value={draft.method}
                      onChange={(e) => update({ method: e.target.value })}
                      aria-invalid={errors.method ? true : undefined}
                      aria-describedby={describedBy}
                      className={cn(INPUT_CLASS, "font-mono")}
                    />
                  )}
                </Field>
                <Field
                  id={`${id}-url`}
                  label="URL contains"
                  className="flex-1"
                  hint="Matches any request whose URL contains this text."
                  error={errors.urlIncludes}
                >
                  {(describedBy) => (
                    <input
                      id={`${id}-url`}
                      value={draft.urlIncludes}
                      onChange={(e) => update({ urlIncludes: e.target.value })}
                      placeholder="/api/users"
                      aria-invalid={errors.urlIncludes ? true : undefined}
                      aria-describedby={describedBy}
                      className={cn(INPUT_CLASS, "font-mono")}
                    />
                  )}
                </Field>
              </div>
            </fieldset>

            <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <legend className="mb-2 p-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Response
              </legend>
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

              <div className="flex items-start gap-2">
                {draft.kind === "response" && (
                  <Field id={`${id}-status`} label="Status" className="w-24" error={errors.status}>
                    {(describedBy) => (
                      <input
                        id={`${id}-status`}
                        type="number"
                        min={MOCK_MIN_STATUS}
                        max={MOCK_MAX_STATUS}
                        value={draft.status}
                        onChange={(e) => update({ status: e.target.value })}
                        aria-invalid={errors.status ? true : undefined}
                        aria-describedby={describedBy}
                        className={INPUT_CLASS}
                      />
                    )}
                  </Field>
                )}
                <Field
                  id={`${id}-delay`}
                  label="Delay (ms)"
                  className="flex-1"
                  error={errors.delayMs}
                  hint={
                    delayMs
                      ? `Responds after ${formatDelay(delayMs)}. axios requests time out first if their timeout is shorter.`
                      : "Optional. Simulates a slow API."
                  }
                >
                  {(describedBy) => (
                    <input
                      id={`${id}-delay`}
                      type="number"
                      min={0}
                      value={draft.delayMs}
                      onChange={(e) => update({ delayMs: e.target.value })}
                      placeholder="0"
                      aria-invalid={errors.delayMs ? true : undefined}
                      aria-describedby={describedBy}
                      className={cn(INPUT_CLASS, "max-w-32")}
                    />
                  )}
                </Field>
              </div>

              {draft.kind === "response" && (
                <Field
                  id={`${id}-body`}
                  label="Response body"
                  hint={`Optional. Keep it short: all rules share a ~${Math.floor(
                    MOCKS_COOKIE_MAX_LENGTH / BYTES_PER_KB
                  )} KB cookie, so this is meant for error payloads.`}
                >
                  {(describedBy) => (
                    <textarea
                      id={`${id}-body`}
                      rows={4}
                      value={draft.body}
                      onChange={(e) => update({ body: e.target.value })}
                      placeholder='{"error":"Something went wrong"}'
                      aria-describedby={describedBy}
                      className={cn(INPUT_CLASS, "resize-y font-mono")}
                    />
                  )}
                </Field>
              )}
            </fieldset>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-3">
          {tooLarge && (
            <p role="alert" className="m-0 text-[11px] text-destructive">
              Rules are too large to fit in the cookie. Shorten the response body or remove other
              rules.
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <DialogClose
              render={
                <Button variant="outline" size="sm">
                  Close
                </Button>
              }
            />
            <Button size="sm" onClick={handleAdd}>
              Add rule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

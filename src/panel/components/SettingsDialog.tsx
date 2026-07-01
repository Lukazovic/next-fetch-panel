"use client";

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
import type { SheetSide, ColorScheme, PanelConfig } from "../panel.config";
import { buildThemeClass } from "../panel.constants";
import { OptionButton } from "./OptionButton";

type SettingsDialogProps = {
  config: PanelConfig;
  update: (p: Partial<PanelConfig>) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  theme: "light" | "dark";
};

export function SettingsDialog({ config, update, open, onOpenChange, theme }: SettingsDialogProps) {
  const isDark = theme === "dark";
  const themeClass = buildThemeClass(isDark);

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

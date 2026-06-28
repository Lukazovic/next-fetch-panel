"use client";

import * as React from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "../../cn";

function DropdownMenu(props: Menu.Root.Props) {
  return <Menu.Root {...props} />;
}

function DropdownMenuTrigger({ className, ...props }: Menu.Trigger.Props) {
  return (
    <Menu.Trigger
      data-slot="dropdown-menu-trigger"
      className={cn("cursor-pointer", className)}
      {...props}
    />
  );
}

function DropdownMenuContent({
  className,
  side = "bottom",
  align = "end",
  sideOffset = 4,
  zIndex = 10000,
  ...props
}: Menu.Popup.Props & {
  side?: Menu.Positioner.Props["side"];
  align?: Menu.Positioner.Props["align"];
  sideOffset?: number;
  zIndex?: number;
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner side={side} align={align} sideOffset={sideOffset} style={{ zIndex }}>
        <Menu.Popup
          className={cn(
            "min-w-42 rounded-md border border-border bg-background p-1 text-foreground shadow-md outline-none",
            "transition duration-75 data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95",
            className
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: Menu.Item.Props) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 text-[11px] outline-none transition-colors data-highlighted:bg-muted",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: Menu.Separator.Props) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Dialog, restyled: --surface-panel, --radius-panel, 1px
 * --border-strong, and the one permitted shadow. Also does duty as the
 * responsive drawer and sheet, via the `side` prop on DialogContent.
 *
 * `surface` picks what the content sits on. A real dialog takes `panel` —
 * --surface-panel, a strong border and --shadow-pop, the one shadow section 3
 * permits, because it floats. `bare` is for the drawers and sheets that mount
 * whole Panels inside themselves and would otherwise draw a second border
 * around a surface that already has one.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-surface-base/75",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        className,
      )}
      {...props}
    />
  );
}

type DialogSide = "center" | "right" | "left" | "bottom";
type DialogSurface = "panel" | "bare";

const SIDE_CLASSES: Record<DialogSide, string> = {
  center:
    "left-1/2 top-1/2 w-[min(440px,calc(100vw-24px))] max-h-[min(560px,calc(100dvh-48px))] -translate-x-1/2 -translate-y-1/2 rounded-panel border",
  right:
    "right-3 top-3 bottom-3 w-[min(352px,calc(100vw-24px))] rounded-panel border",
  left: "left-3 top-3 bottom-3 w-[min(288px,calc(100vw-24px))] rounded-panel border",
  bottom:
    "left-3 right-3 bottom-3 max-h-[min(70dvh,560px)] rounded-panel border",
};

const SURFACE_CLASSES: Record<DialogSurface, string> = {
  panel: "border-border-strong bg-surface-panel shadow-pop",
  bare: "border-0 bg-transparent p-0 shadow-none",
};

function DialogContent({
  className,
  children,
  side = "center",
  surface = "panel",
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: DialogSide;
  surface?: DialogSurface;
  showClose?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed z-50 flex min-h-0 flex-col overflow-hidden",
          "focus:outline-none",
          SIDE_CLASSES[side],
          SURFACE_CLASSES[surface],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "absolute right-3 top-3 inline-flex size-6 items-center justify-center rounded-chip",
              "text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
              "hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <X size={16} strokeWidth={1.5} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-border-subtle px-4 py-3 pr-10",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("type-h2 text-text-primary", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("type-body-sm text-text-secondary", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tooltip, restyled.
 *
 * A tooltip floats over the grid rather than sitting in it, so it is the one
 * kind of layer that takes --shadow-pop: --surface-raised, a strong border,
 * and the shadow section 3 reserves for floating layers.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "type-label z-50 max-w-56 rounded-control border",
          "border-border-strong bg-surface-raised px-2 py-1.5 text-text-primary shadow-pop",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };

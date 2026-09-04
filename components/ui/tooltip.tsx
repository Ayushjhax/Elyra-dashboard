"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tooltip, restyled.
 *
 * A tooltip is the clearest case of a layer that floats over the grid rather
 * than sitting in it, so it takes the luminance layer's frosted plane (1.6):
 * --glass-tint-raised over a 14px backdrop blur, with the columns beneath it
 * still faintly readable through the panel.
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
          "glass-raised px-2 py-1.5 text-text-primary shadow-pop",
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

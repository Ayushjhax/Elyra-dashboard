import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Controls name their outcome. Sentence case, never Title Case.
 * `accent` is Citron on Ink — the only lime fill in the interactive layer —
 * and it is flat: a solid fill reads as the primary action on a forest
 * ground without any light or gradient behind it.
 */
const button = cva(
  cn(
    "metallic inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "transition-[color,background-color,border-color] duration-[var(--dur-fast)] ease-brand",
    "disabled:pointer-events-none disabled:text-text-muted",
  ),
  {
    variants: {
      variant: {
        accent: cn(
          "bg-accent text-text-on-accent hover:bg-accent-hover",
          "disabled:bg-surface-raised",
        ),
        quiet:
          "border border-border-strong bg-surface-raised text-text-primary hover:bg-surface-hover",
        ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        danger:
          "border border-border-strong bg-surface-raised text-negative hover:bg-negative-bg",
      },
      size: {
        md: "type-label h-[var(--control-h)] rounded-control px-3",
        sm: "type-label h-8 rounded-control px-2.5",
        xs: "type-data-sm h-6 rounded-chip px-2",
        icon: "size-8 rounded-control",
      },
    },
    defaultVariants: { variant: "quiet", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof button>) {
  return (
    <button
      type="button"
      className={cn(button({ variant, size }), className)}
      {...props}
    />
  );
}

export { button as buttonVariants };

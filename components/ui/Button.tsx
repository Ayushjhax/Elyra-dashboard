import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Controls name their outcome. Sentence case, never Title Case.
 * `accent` is Citron on Ink — the only lime fill in the interactive layer.
 *
 * Because it is the only lit fill, it is also the only one that blooms: 1.6's
 * shadow-lift-accent, no offset and no black, so the button throws a little
 * of its own colour onto the surface behind it and reads as the brightest
 * thing on screen. Everything else stays flat.
 *
 * It also carries 1.7's --grad-accent rather than a flat Citron. On a black
 * ground a flat fill reads as a sticker; a fill that shades reads as a lit
 * object. bg-accent stays underneath as the fallback, and a disabled button
 * drops the image with the fill, so it loses both the gradient and the bloom.
 */
const button = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap",
    "transition-[color,background-color,border-color,box-shadow] duration-[var(--dur-fast)] ease-brand",
    "disabled:pointer-events-none disabled:text-text-muted",
  ),
  {
    variants: {
      variant: {
        accent: cn(
          "fill-accent bg-accent text-text-on-accent shadow-lift-accent",
          "hover:fill-accent-bright hover:bg-accent-hover",
          "disabled:bg-none disabled:bg-surface-raised disabled:shadow-none",
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

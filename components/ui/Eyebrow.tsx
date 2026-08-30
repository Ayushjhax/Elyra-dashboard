import { cn } from "@/lib/utils";

/**
 * Section label in the brand's `eyebrow` style: 11/14, +0.10em, uppercase,
 * --text-muted. The only place Title Case is not used.
 */
export function Eyebrow({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("type-eyebrow text-text-muted", className)}
      {...props}
    >
      {children}
    </span>
  );
}

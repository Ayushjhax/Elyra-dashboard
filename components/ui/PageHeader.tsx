import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The header of a page that takes the workspace's place — the routes in
 * `FULL_BLEED_ROUTES` (lib/layout.ts): a lime icon, the page's name, one line
 * under it, and the page's own controls on the right.
 *
 * One component, so the four pages line up with each other and with the
 * shell's padding: the same icon size and stroke, the same gap, the same
 * left edge. A page adds no inset of its own around it.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** The page's controls, at the right; they wrap under the title on a phone. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={32} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
        <div className="min-w-0">
          <h1 className="type-h1 text-text-primary">{title}</h1>
          <p className="type-body text-text-secondary">{subtitle}</p>
        </div>
      </div>
      {actions}
    </header>
  );
}

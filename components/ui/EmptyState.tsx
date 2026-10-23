import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty states are invitations, not error messages. Title states the fact,
 * the line under it says what to do about it.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className="mb-1 inline-flex size-9 items-center justify-center rounded-pill border border-border-subtle bg-surface-raised text-text-muted"
        >
          <Icon size={16} strokeWidth={1.5} />
        </span>
      )}
      <p className="type-panel-title text-text-primary">{title}</p>
      <p className="type-body-sm max-w-[38ch] text-balance text-text-secondary">
        {body}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

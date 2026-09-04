import type { LucideIcon } from "lucide-react";
import { AmbientGlow } from "@/components/ui/Glow";
import { GlowMark, type MarkTone } from "@/components/ui/GlowMark";
import { cn } from "@/lib/utils";

/**
 * Empty states are invitations, not error messages. Title states the fact,
 * the line under it says what to do about it.
 *
 * `mark` swaps the 18px icon for the lemniscate and its bloom. It is for a
 * whole empty panel — a watchlist with nothing in it, a ledger with no fills —
 * where there is room for the drawing to breathe and nothing for it to
 * compete with. A small empty region inside a populated panel keeps the icon.
 */
export function EmptyState({
  icon: Icon,
  mark,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  mark?: MarkTone;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 py-8 text-center",
        className,
      )}
    >
      {mark && (
        <>
          <AmbientGlow
            tone={mark === "agent" ? "agent" : "forest"}
            breathe
            className="left-1/2 top-1/2 size-[min(420px,150%)] -translate-x-1/2 -translate-y-1/2"
          />
          <GlowMark tone={mark} className="mb-1 w-[min(220px,70%)]" />
        </>
      )}

      {!mark && Icon && (
        <Icon
          size={18}
          strokeWidth={1.5}
          aria-hidden
          className="mb-1 text-text-muted"
        />
      )}
      <p className="type-panel-title text-text-primary">{title}</p>
      <p className="type-body-sm max-w-[38ch] text-balance text-text-secondary">
        {body}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

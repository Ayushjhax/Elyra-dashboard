"use client";

import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { AssetAccountStatus, AssetAccountType } from "@/lib/assets/types";

/* ---------------------------------------------------------------------------
   The few pieces Assets needs that Portfolio does not.

   Everything else — Money, Quantity, Delta, Card, CardHead, Segmented,
   ShareBar, Unavailable, the skeletons and the privacy hook — is imported
   from components/portfolio/primitives and used UNMODIFIED. Those are
   generic financial primitives that happen to live in a route-named folder;
   reusing them keeps the two capital surfaces visually identical and, more
   importantly, keeps the privacy mask in one place. Nothing in this
   directory edits them, so Portfolio cannot be affected by anything here.
--------------------------------------------------------------------------- */

/**
 * The accent each capital account carries.
 *
 * §"ACCOUNT CARD VISUAL DIFFERENTIATION": tiny variations inside the brand,
 * not four different colours. Every value below is a brand token at low
 * alpha, used as a hairline on the card's leading edge and a barely-there
 * wash behind its title — enough to tell the four apart at a glance, not
 * enough to read as decoration.
 */
export const ACCOUNT_ACCENT: Record<AssetAccountType, { rail: string; wash: string }> = {
  /* Elyra Green — the brand's own, for the account that holds the wallet. */
  spot: { rail: "rgba(46, 81, 41, 0.9)", wash: "rgba(46, 81, 41, 0.10)" },
  /* Moss, one step lighter. */
  "solana-perps": { rail: "rgba(69, 112, 61, 0.9)", wash: "rgba(69, 112, 61, 0.10)" },
  /* Slate — deliberately the neutral one, so the venue holding leverage does
     not read as the loudest thing on the page. */
  hyperliquid: { rail: "rgba(92, 95, 82, 0.9)", wash: "rgba(92, 95, 82, 0.10)" },
  /* Olive, the lime family's quietest member. */
  prediction: { rail: "rgba(168, 180, 78, 0.75)", wash: "rgba(168, 180, 78, 0.08)" },
};

const STATUS_LABEL: Record<AssetAccountStatus, string> = {
  ready: "Synced",
  error: "Unavailable",
  empty: "Not connected",
};

const STATUS_TONE: Record<AssetAccountStatus, string> = {
  ready: "text-positive",
  error: "text-negative",
  empty: "text-text-muted",
};

/**
 * An account's state, as a word rather than a colour.
 *
 * §36 and §"positive/negative not color-only": the dot is redundant with the
 * label on purpose, so the state survives greyscale and a colour-blind
 * reader.
 */
export function AccountStatus({
  status,
  className,
}: {
  status: AssetAccountStatus;
  className?: string;
}) {
  return (
    <span className={cn("type-label flex items-center gap-1", STATUS_TONE[status], className)}>
      <span
        aria-hidden
        className={cn(
          "size-1 shrink-0 rounded-pill",
          status === "ready" ? "bg-positive" : status === "error" ? "bg-negative" : "bg-text-muted",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * One of the four capital actions.
 *
 * `tone` carries §3's hierarchy — Deposit primary, Swap and Transfer
 * secondary, Withdraw subtle — through the shell's existing Button variants
 * rather than new styling. A disabled action still renders, with `title`
 * saying why: an action that vanishes when it is unavailable teaches the
 * operator nothing about what the product can do.
 */
export function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled,
  title,
}: {
  icon: LucideIcon;
  label: string;
  tone: "primary" | "secondary" | "subtle";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      size="sm"
      variant={tone === "primary" ? "accent" : tone === "secondary" ? "quiet" : "ghost"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "min-w-0 flex-1 justify-center",
        tone === "subtle" && "border border-border-subtle",
      )}
    >
      <Icon size={13} strokeWidth={1.5} aria-hidden />
      <span className="truncate">{label}</span>
    </Button>
  );
}

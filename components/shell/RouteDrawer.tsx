"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Copy, X, type LucideIcon } from "lucide-react";
import { Panel, PanelBody } from "@/components/ui/Panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The utility drawer a route opens as, beside the chart.

   Dashboard and Portfolio are routes, so "the drawer" is the route column
   (lib/layout.ts owns its width — 400px to start, the operator's to drag) and
   closing it is going Home. What a drawer owes the keyboard is added here,
   once: Escape closes it from anywhere inside, and focus goes back to the
   rail link that opened it rather than falling to the document.

   The header sits outside the scroll body, so it stays put while the cards
   move under it.
--------------------------------------------------------------------------- */

/** The rail link for this route, if it is on screen to take focus. */
function railLink(pathname: string): HTMLElement | null {
  const links = document.querySelectorAll<HTMLElement>(`nav a[href="${pathname}"]`);
  for (const link of links) if (link.offsetParent !== null) return link;
  return null;
}

/** Leave for Home, handing focus back to whatever opened this. */
function useCloseRoute(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(() => {
    router.push("/");
    railLink(pathname)?.focus();
  }, [router, pathname]);
}

export function RouteDrawer({
  label,
  icon,
  title,
  subtitle,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useCloseRoute();
  const pathname = usePathname();

  return (
    <Panel
      ref={ref}
      label={label}
      className="min-h-0 flex-1"
      onKeyDown={(event) => {
        /* Only from inside this panel's own DOM: a dialog it opened is
           portalled out, and its Escape is the dialog's to handle. A control
           that used Escape itself (an open menu) prevents the default. */
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) return;
        event.preventDefault();
        close();
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center text-accent">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="type-h1 truncate text-text-primary">{title}</h1>
          <p className="type-body-sm truncate text-text-secondary">{subtitle}</p>
        </div>
        {/* A link, so it is still Home on a middle click; the click handler
            only moves focus back to the rail once the link has done its job. */}
        <Link
          href="/"
          aria-label={`Close ${title.toLowerCase()} and return to the chart`}
          title="Close (Esc)"
          onClick={() => {
            requestAnimationFrame(() => railLink(pathname)?.focus());
          }}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-control text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary active:bg-surface-raised",
          )}
        >
          <X size={18} strokeWidth={1.5} aria-hidden />
        </Link>
      </header>

      <PanelBody className="@container">
        <div className="flex flex-col gap-3 p-4 @max-[340px]:p-3">{children}</div>
      </PanelBody>
    </Panel>
  );
}

/** A card in a drawer: a small lime icon, a heading, and whatever sits at its right. */
export function DrawerCard({
  icon: Icon,
  title,
  right,
  className,
  children,
  ...props
}: {
  icon: LucideIcon;
  title: string;
  right?: React.ReactNode;
} & Omit<React.ComponentProps<"section">, "title">) {
  return (
    <section
      aria-label={title}
      className={cn("min-w-0 rounded-panel border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3", className)}
      {...props}
    >
      <header className="mb-3 flex min-h-7 items-center gap-2.5">
        <Icon size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
        <h2 className="type-h2 min-w-0 flex-1 truncate text-text-primary">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

/** A label that opens on focus as well as hover — Radix's tooltip does both. */
export function Tip({ label, children }: { label: React.ReactNode; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A square icon button with a comfortable hit area and its name in a tooltip. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: { label: string } & React.ComponentProps<"button">) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
          "transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:bg-surface-hover hover:text-text-primary active:bg-surface-panel",
          "disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tip>
  );
}

/**
 * Copies a value, says so for a moment, and says so when it could not.
 *
 * The clipboard is refused in an insecure context, in some embedded views
 * and when the person has denied it; that is a normal outcome to report, not
 * an exception to swallow.
 */
export function CopyButton({
  value,
  label,
  text,
  className,
}: {
  value: string;
  /** What is being copied, in words: "wallet address". */
  label: string;
  /** Shown beside the icon, for a copy that is the main action rather than a row's aside. */
  text?: string;
  className?: string;
}) {
  const { state, copy: write } = useCopy();
  /* Hover and focus open the tooltip as usual; a result holds it open. */
  const [pointing, setPointing] = useState(false);
  const copy = () => void write(value);

  const tip = state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : `Copy ${label}`;
  const announce = (
    /* Said aloud as well as shown: neither a tooltip nor a label change is announced. */
    <span aria-live="polite" className="sr-only">
      {state === "copied" ? `Copied the ${label}` : state === "failed" ? `Could not copy the ${label}` : ""}
    </span>
  );

  if (text !== undefined) {
    return (
      <>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "type-body-sm inline-flex h-9 items-center justify-center gap-2 rounded-control border px-3 font-medium",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover active:bg-surface-panel",
            state === "copied"
              ? "border-sage/60 text-positive"
              : state === "failed"
                ? "border-negative/50 text-negative"
                : "border-accent-quiet text-text-primary hover:border-accent",
            className,
          )}
        >
          {state === "copied" ? (
            <Check size={15} strokeWidth={1.75} aria-hidden />
          ) : (
            <Copy size={15} strokeWidth={1.5} aria-hidden />
          )}
          {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy — select the address instead" : text}
        </button>
        {announce}
      </>
    );
  }

  return (
    <Tooltip open={pointing || state !== "idle"} onOpenChange={setPointing}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-control",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
            state === "copied" ? "text-positive" : state === "failed" ? "text-negative" : "text-text-muted",
            className,
          )}
        >
          {state === "copied" ? (
            <Check size={15} strokeWidth={1.75} aria-hidden />
          ) : (
            <Copy size={15} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
      {announce}
    </Tooltip>
  );
}

/** A label above a value, the unit every metric grid in a drawer is made of. */
export function Metric({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="type-label text-text-secondary">{label}</span>
      <div className="type-body min-w-0 font-medium tabular-nums text-text-primary">{children}</div>
    </div>
  );
}

/** A connection-style status: a dot and its words. The words carry it; the dot only echoes them. */
export function StatusDot({
  tone,
  children,
  className,
}: {
  /** Accent is "ready to use" — available, not yet holding anything. */
  tone: "positive" | "accent" | "caution" | "negative" | "muted";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-1.5 whitespace-nowrap",
        {
          positive: "text-positive",
          accent: "text-accent",
          caution: "text-caution",
          negative: "text-negative",
          muted: "text-text-muted",
        }[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-pill", {
          positive: "bg-sage",
          accent: "bg-accent",
          caution: "bg-caution",
          negative: "bg-negative",
          muted: "bg-text-muted",
        }[tone])}
      />
      {children}
    </span>
  );
}

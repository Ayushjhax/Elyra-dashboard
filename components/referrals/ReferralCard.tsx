"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Send, Share2, X } from "lucide-react";
import { Card, CardHead, Skeleton } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The referral link, and the two things anyone does with it.

   The URL field is the most important control on the page, so it is the
   widest and the highest-contrast thing in the card. Everything else defers
   to it.

   ── Copy and share, without a library ──────────────────────────────────

   `navigator.clipboard` with a `document.execCommand` fallback for insecure
   origins, where the modern API is simply absent. `navigator.share` where it
   exists — which is phones — and a small menu of two links where it does not.

   Both paths have a failure mode that has to be handled rather than thrown:
   clipboard permission can be denied, and `share` rejects when the user
   dismisses the sheet. A dismissed share is a normal outcome, not an error.
--------------------------------------------------------------------------- */

const COPIED_MS = 1_800;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Permission denied, or an insecure origin. Fall through. */
  }

  /* The fallback that still works where the Clipboard API is unavailable. */
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

function ShareMenu({
  url,
  onClose,
  onCopy,
}: {
  url: string;
  onClose: () => void;
  onCopy: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const message = encodeURIComponent("Join me on Elyra");

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Share your referral link"
      className={cn(
        "absolute right-0 top-full z-40 mt-1 flex min-w-44 flex-col gap-0.5",
        "rounded-card border border-border-subtle bg-surface-raised p-1",
      )}
    >
      <a
        role="menuitem"
        href={`https://x.com/intent/tweet?text=${message}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="type-label flex items-center gap-2 rounded-chip px-2 py-1.5 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
      >
        <X size={11} strokeWidth={1.5} aria-hidden />
        Share on X
      </a>
      <a
        role="menuitem"
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${message}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="type-label flex items-center gap-2 rounded-chip px-2 py-1.5 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
      >
        <Send size={11} strokeWidth={1.5} aria-hidden />
        Share on Telegram
      </a>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCopy();
          onClose();
        }}
        className="type-label flex items-center gap-2 rounded-chip px-2 py-1.5 text-left text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
      >
        <Link2 size={11} strokeWidth={1.5} aria-hidden />
        Copy link
      </button>
    </div>
  );
}

export function ReferralCard({
  name,
  handle,
  code,
  url,
  totalPoints,
}: {
  name: string;
  handle: string | null;
  code: string | null;
  url: string | null;
  totalPoints: number;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    if (url === null) return;
    const ok = await writeClipboard(url);
    setFailed(!ok);
    setCopied(ok);
  }

  async function share(): Promise<void> {
    if (url === null) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Elyra", text: "Join me on Elyra", url });
        return;
      } catch {
        /* Dismissed, or unsupported for this payload. Fall back to the menu
           rather than reporting a failure the user caused on purpose. */
      }
    }
    setMenuOpen(true);
  }

  const initials = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="min-w-0">
      <CardHead title="Your referral" sub="Share this link to start earning" />

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-pill border border-border-subtle bg-surface-raised"
          >
            <span className="type-data-sm text-text-secondary">{initials || "—"}</span>
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="type-data-sm truncate text-text-primary">{name}</span>
            {handle !== null && (
              <span className="type-label truncate text-text-muted">{handle}</span>
            )}
          </div>
          <div className="ml-auto flex flex-col items-end">
            <span className="type-label uppercase tracking-[0.08em] text-text-muted">
              Points
            </span>
            <span className="type-data tabular-nums text-text-primary">
              {totalPoints.toLocaleString("en-US")}
            </span>
          </div>
        </div>

        {/* The primary field. Widest, highest contrast, monospaced so the code
            is legible character by character when someone reads it aloud. */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="referral-url"
            className="type-label uppercase tracking-[0.08em] text-text-muted"
          >
            Referral link
          </label>
          <div className="flex items-center gap-2 rounded-card border border-border-strong bg-surface-raised px-3 py-2.5">
            <Link2 size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent-quiet" />
            <input
              id="referral-url"
              readOnly
              value={url ?? "Issuing your code…"}
              onFocus={(event) => event.currentTarget.select()}
              className="type-mono-addr min-w-0 flex-1 bg-transparent text-text-primary focus-visible:outline-none"
            />
          </div>
          {code !== null && (
            <p className="type-label text-text-muted">
              Your code is <span className="text-text-secondary">{code}</span> — it never
              changes.
            </p>
          )}
        </div>

        <div className="relative mt-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="accent"
            onClick={() => void copy()}
            disabled={url === null}
            className="min-w-28"
          >
            {copied ? (
              <>
                <Check size={13} strokeWidth={2} aria-hidden />
                Copied
              </>
            ) : (
              <>
                <Copy size={13} strokeWidth={1.5} aria-hidden />
                Copy link
              </>
            )}
          </Button>

          <Button size="sm" variant="quiet" onClick={() => void share()} disabled={url === null}>
            <Share2 size={13} strokeWidth={1.5} aria-hidden />
            Share
          </Button>

          {/* Announced, so a screen reader learns the copy succeeded — the
              button's label change alone is not reliably announced. */}
          <span aria-live="polite" className="sr-only">
            {copied ? "Referral link copied to clipboard." : ""}
          </span>

          {failed && (
            <span className="type-label text-negative">
              Couldn&rsquo;t copy — select the link above and copy it manually.
            </span>
          )}

          {menuOpen && url !== null && (
            <ShareMenu url={url} onClose={() => setMenuOpen(false)} onCopy={() => void copy()} />
          )}
        </div>
      </div>
    </Card>
  );
}

export function ReferralCardSkeleton() {
  return (
    <Card className="min-w-0">
      <CardHead title="Your referral" />
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-9 rounded-pill" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
        <Skeleton className="h-10 w-full rounded-card" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>
    </Card>
  );
}

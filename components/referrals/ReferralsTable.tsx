"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Card, CardHead, Segmented, SkeletonRows } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { ReferralListItem } from "@/lib/referrals/stats";
import type { ReferralStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Who you referred.

   A real <table> on desktop for the semantics, and a list of compact rows
   below 46rem — not the same table scrolling sideways. §"Do NOT horizontally
   scroll the desktop table."

   Both views render from one array and one filter, so they cannot disagree
   about what is in the list.

   Identity here is only what is needed to recognise a row: a display name or
   a stable masked stand-in, and initials. No email, no wallet address, no
   balances — the server never sends them (see lib/referrals/stats.ts).
--------------------------------------------------------------------------- */

const FILTERS = [
  { value: "all", label: "All" },
  { value: "activated", label: "Activated" },
  { value: "pending", label: "Pending" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

const STATUS_LABEL: Record<ReferralStatus, string> = {
  activated: "Activated",
  pending: "Pending",
  not_eligible: "Not eligible",
};

/** Status carries a word as well as a colour — §"color-independent". */
function StatusPill({ status }: { status: ReferralStatus }) {
  return (
    <span
      className={cn(
        "type-label rounded-chip border px-1.5 py-0.5 whitespace-nowrap",
        status === "activated"
          ? "border-positive/40 bg-positive-bg text-positive"
          : status === "pending"
            ? "border-border-subtle text-text-muted"
            : "border-negative/40 bg-negative-bg text-negative",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden
      className="grid size-6 shrink-0 place-items-center rounded-pill border border-border-subtle bg-surface-raised"
    >
      <span className="type-label text-text-muted">{initials}</span>
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (iso === null) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function points(value: number | null): React.ReactNode {
  if (value === null) return <span className="text-text-muted">—</span>;
  return <span className="tabular-nums text-positive">+{value} pts</span>;
}

export function ReferralsTable({
  referrals,
  loading,
  onCopyLink,
  canCopy,
}: {
  referrals: ReferralListItem[];
  loading: boolean;
  onCopyLink: () => void;
  canCopy: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (filter === "all") return referrals;
    if (filter === "activated") {
      return referrals.filter((row) => row.status === "activated");
    }
    return referrals.filter((row) => row.status === "pending");
  }, [referrals, filter]);

  const columns: Column<ReferralListItem>[] = [
    {
      key: "user",
      header: "User",
      width: "32%",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar initials={row.initials} />
          <span className="min-w-0 truncate text-text-primary">{row.name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "17%",
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: "joined",
      header: "Joined",
      width: "17%",
      className: "hidden @[40rem]:table-cell",
      render: (row) => (
        <span className="tabular-nums text-text-secondary">{formatDate(row.joinedAt)}</span>
      ),
    },
    {
      key: "activated",
      header: "Activated",
      width: "19%",
      className: "hidden @[52rem]:table-cell",
      render: (row) =>
        row.activatedAt === null ? (
          <span className="text-text-muted">Awaiting activation</span>
        ) : (
          <span className="tabular-nums text-text-secondary">
            {formatDate(row.activatedAt)}
          </span>
        ),
    },
    {
      key: "points",
      header: "Points",
      align: "right",
      width: "15%",
      render: (row) => points(row.pointsAwarded),
    },
  ];

  return (
    <Card className="min-w-0">
      <CardHead
        title="Your referrals"
        sub="Track who joined, activation progress, and points earned."
        right={
          referrals.length > 0 ? (
            <Segmented
              label="Filter referrals"
              options={FILTERS}
              value={filter}
              onChange={setFilter}
            />
          ) : undefined
        }
      />

      {loading ? (
        <SkeletonRows rows={4} />
      ) : referrals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <p className="type-body-sm text-text-secondary">No referrals yet.</p>
          <p className="type-label max-w-[38ch] text-balance text-text-muted">
            Share your link to start earning points.
          </p>
          <Button
            size="sm"
            variant="quiet"
            className="mt-1"
            onClick={onCopyLink}
            disabled={!canCopy}
          >
            <Copy size={12} strokeWidth={1.5} aria-hidden />
            Copy referral link
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="type-label px-4 py-8 text-center text-text-muted">
          No {filter} referrals.
        </p>
      ) : (
        <>
          {/* Desktop: a semantic table. */}
          <div className="hidden @[34rem]:block">
            <DataTable
              caption="People you referred, with their activation status and the points they earned"
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.id}
            />
          </div>

          {/* Mobile: compact rows, not the table squeezed. */}
          <ul className="flex list-none flex-col @[34rem]:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-1.5 border-b border-border-subtle px-3 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <Avatar initials={row.initials} />
                  <span className="type-data-sm min-w-0 flex-1 truncate text-text-primary">
                    {row.name}
                  </span>
                  <span className="type-data-sm shrink-0">{points(row.pointsAwarded)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusPill status={row.status} />
                  <span className="type-label text-text-muted">
                    Joined {formatDate(row.joinedAt)}
                  </span>
                  {row.activatedAt !== null && (
                    <span className="type-label text-text-muted">
                      · Activated {formatDate(row.activatedAt)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

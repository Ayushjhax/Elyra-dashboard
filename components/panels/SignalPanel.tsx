"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { SignalCard } from "@/components/panels/SignalCard";
import { SIGNALS } from "@/lib/mock/signals";
import { formatRelativeTime } from "@/lib/format";
import type { Signal } from "@/lib/types";

/** Agent output, so the bar is lime. It never means "up". */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="type-label shrink-0 text-text-muted">Confidence</span>
      <div
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Agent confidence"
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-hover"
      >
        <div
          className="fill-agent h-full rounded-pill bg-agent-accent shadow-lift-agent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="type-data-sm shrink-0 text-text-secondary">{pct}%</span>
    </div>
  );
}

/* Live signals first; expired ones stay below as a record. */
const ORDERED = [...SIGNALS].sort((a, b) =>
  a.status === b.status ? 0 : a.status === "active" ? -1 : 1,
);

export function SignalPanel() {
  const [openSignal, setOpenSignal] = useState<Signal | null>(null);

  return (
    <Panel label="Signal suggestion" glow="agent">
      <PanelHeader>
        <Eyebrow>Signals</Eyebrow>
        <span className="type-label text-text-muted">
          {SIGNALS.filter((signal) => signal.status === "active").length} active ·{" "}
          {SIGNALS.length}
        </span>
      </PanelHeader>

      <PanelBody>
        <ul className="list-none">
          {ORDERED.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onViewSetup={setOpenSignal}
            />
          ))}
        </ul>
      </PanelBody>

      <Dialog
        open={openSignal !== null}
        onOpenChange={(open) => !open && setOpenSignal(null)}
      >
        <DialogContent aria-describedby="signal-setup-help">
          <DialogHeader>
            <DialogTitle>{openSignal?.thesis ?? ""}</DialogTitle>
            <DialogDescription id="signal-setup-help">
              {openSignal
                ? `${openSignal.source} · ${openSignal.symbol} · raised ${formatRelativeTime(openSignal.createdAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-4 py-4">
              <p className="type-body text-text-secondary">{openSignal?.setup}</p>
              {openSignal && (
                <div className="mt-4">
                  <ConfidenceBar value={openSignal.confidence} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="quiet" onClick={() => setOpenSignal(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { signalPrompt } from "@/lib/mock/chat";
import { SIGNALS } from "@/lib/mock/signals";
import { formatRelativeTime } from "@/lib/format";
import { useAssetsBySymbols } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

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
          className="h-full rounded-pill bg-agent-accent"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="type-data-sm shrink-0 text-text-secondary">{pct}%</span>
    </div>
  );
}

function SignalCard({
  signal,
  onViewSetup,
}: {
  signal: Signal;
  onViewSetup: (signal: Signal) => void;
}) {
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const bySymbol = useAssetsBySymbols([signal.symbol]);
  const askElyra = useElyraStore((state) => state.askElyra);
  const setRightDrawerOpen = useElyraStore((state) => state.setRightDrawerOpen);

  return (
    <li>
      <article
        className={cn(
          "agent-rail flex flex-col gap-2 border-b border-border-subtle py-3 pl-2.5 pr-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <Eyebrow>
          {signal.source} · {formatRelativeTime(signal.createdAt)}
        </Eyebrow>

        <p className="type-body-sm text-text-primary">{signal.thesis}</p>

        <button
          type="button"
          onClick={() => {
              const asset = bySymbol.get(signal.symbol.toUpperCase());
              if (asset) setSelectedAssetId(asset.id);
            }}
          className={cn(
            "flex w-fit items-center gap-1.5 rounded-chip py-0.5 pr-1.5",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-raised",
          )}
        >
          <CoinMark symbol={signal.symbol} size={16} />
          <span className="type-data-sm text-text-secondary">{signal.symbol}</span>
        </button>

        <ConfidenceBar value={signal.confidence} />

        <div className="flex items-center gap-1.5">
          <Button size="xs" variant="quiet" onClick={() => onViewSetup(signal)}>
            View setup
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              {
              const asset = bySymbol.get(signal.symbol.toUpperCase());
              if (asset) setSelectedAssetId(asset.id);
            };
              askElyra(signalPrompt(signal.symbol, signal.thesis));
              setRightDrawerOpen(true);
            }}
          >
            Ask Elyra
          </Button>
        </div>
      </article>
    </li>
  );
}

export function SignalPanel() {
  const [openSignal, setOpenSignal] = useState<Signal | null>(null);

  return (
    <Panel label="Signal suggestion">
      <PanelHeader>
        <Eyebrow>Signal suggestion</Eyebrow>
        <span className="type-label text-text-muted">{SIGNALS.length}</span>
      </PanelHeader>

      <PanelBody>
        <ul className="list-none">
          {SIGNALS.map((signal) => (
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
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 py-4">
              <p className="type-body text-text-secondary">{openSignal?.setup}</p>
              {openSignal && (
                <div className="mt-4">
                  <ConfidenceBar value={openSignal.confidence} />
                </div>
              )}
            </div>
          </ScrollArea>
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

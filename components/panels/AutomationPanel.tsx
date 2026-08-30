"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
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
import { RULES } from "@/lib/mock/automations";
import { formatRelativeTime } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import type { Rule, RuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<RuleStatus, string> = {
  armed: "bg-positive",
  paused: "bg-neutral-flat",
  triggered: "bg-negative",
};

const STATUS_LABEL: Record<RuleStatus, string> = {
  armed: "Armed",
  paused: "Paused",
  triggered: "Triggered",
};

/** A toggle built to the brand rather than pulled from a kit. */
function RuleToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative h-4 w-7 shrink-0 rounded-pill border transition-colors duration-[var(--dur-fast)] ease-brand",
        checked
          ? "border-accent-quiet bg-accent-quiet"
          : "border-border-strong bg-surface-raised",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-2.5 -translate-y-1/2 rounded-pill transition-all duration-[var(--dur-fast)] ease-brand",
          checked ? "left-3.5 bg-text-on-accent" : "left-0.5 bg-text-muted",
        )}
      />
    </button>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  const disabled = useElyraStore((state) => state.disabledRules.includes(rule.id));
  const toggleRule = useElyraStore((state) => state.toggleRule);
  const enabled = rule.enabled && !disabled;
  const status: RuleStatus = enabled ? rule.status : "paused";

  return (
    <li>
      {/* Agent-owned, so every card carries the lime rail. */}
      <article
        className={cn(
          "agent-rail flex flex-col gap-1.5 border-b border-border-subtle py-2.5 pl-2.5 pr-3",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
          !enabled && "opacity-70",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-pill", STATUS_DOT[status])}
          />
          <h4 className="type-data min-w-0 flex-1 truncate text-text-primary">
            {rule.name}
          </h4>
          <RuleToggle
            checked={enabled}
            onChange={() => toggleRule(rule.id)}
            label={`${enabled ? "Pause" : "Arm"} ${rule.name}`}
          />
        </div>
        <p className="type-body-sm text-text-secondary">{rule.condition}</p>
        <div className="flex items-center gap-2">
          <span className="type-label text-text-muted">{STATUS_LABEL[status]}</span>
          <span aria-hidden className="text-text-muted">
            ·
          </span>
          <span className="type-data-sm text-text-muted">
            {rule.lastRunAt ? `Ran ${formatRelativeTime(rule.lastRunAt)}` : "Never run"}
          </span>
        </div>
      </article>
    </li>
  );
}

function NewRuleStub({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="new-rule-help">
        <DialogHeader>
          <DialogTitle>New rule</DialogTitle>
          <DialogDescription id="new-rule-help">
            The rule builder is not wired up in this build.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className="type-body text-text-secondary">
            A rule is a condition and an action: a market signal Elyra watches,
            and the position change it makes when that signal holds. Rules run on
            their own and are the only way the agent moves size.
          </p>
          <p className="type-body mt-3 text-text-secondary">
            Until the builder ships, the seven rules on this panel can be armed
            and paused, and their last run is recorded in Activity.
          </p>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AutomationPanel() {
  const [open, setOpen] = useState(false);

  return (
    <Panel label="Automation">
      <PanelHeader>
        <Eyebrow>Automation</Eyebrow>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          New rule
        </Button>
      </PanelHeader>

      <PanelBody>
        <ul className="list-none">
          {RULES.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </ul>
      </PanelBody>

      <NewRuleStub open={open} onOpenChange={setOpen} />
    </Panel>
  );
}

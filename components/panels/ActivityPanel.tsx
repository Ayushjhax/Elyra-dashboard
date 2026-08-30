"use client";

import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Ban,
  ClipboardList,
  Sparkles,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { ACTIVITY } from "@/lib/mock/activity";
import { formatDayGroup, formatRelativeTime } from "@/lib/format";
import type { ActivityItem, ActivityKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  fill: ArrowLeftRight,
  order: ClipboardList,
  cancel: Ban,
  agent: Sparkles,
  rule: Zap,
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  liquidation: TriangleAlert,
};

type Group = { label: string; items: ActivityItem[] };

/** Reverse-chronological, grouped by day, newest first. */
function groupByDay(items: ActivityItem[]): Group[] {
  const sorted = [...items].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
  const groups: Group[] = [];
  for (const item of sorted) {
    const label = formatDayGroup(item.at);
    const last = groups.at(-1);
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export function ActivityPanel() {
  const groups = groupByDay(ACTIVITY);

  return (
    <Panel label="Activity">
      <PanelHeader>
        <Eyebrow>Activity</Eyebrow>
        <span className="type-label text-text-muted">{ACTIVITY.length}</span>
      </PanelHeader>

      <PanelBody>
        {groups.map((group) => (
          <section key={group.label}>
            <h3 className="sticky top-0 z-[9] border-b border-border-subtle bg-surface-panel px-3 py-1.5">
              <Eyebrow>{group.label}</Eyebrow>
            </h3>
            <ul className="list-none">
              {group.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <li key={item.id}>
                    <div
                      title={item.text}
                      className={cn(
                        "flex items-center gap-2 border-b border-border-subtle py-2 pr-3",
                        "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                        /* The agent caused this one. */
                        item.agent ? "agent-rail pl-2.5" : "pl-3",
                      )}
                    >
                      <Icon
                        size={16}
                        strokeWidth={1.5}
                        aria-hidden
                        className={cn(
                          "shrink-0",
                          item.agent ? "text-agent-accent" : "text-text-muted",
                        )}
                      />
                      <p className="type-body-sm min-w-0 flex-1 truncate text-text-secondary">
                        {item.text}
                      </p>
                      <time
                        dateTime={item.at}
                        className="type-data-sm shrink-0 text-text-muted"
                      >
                        {formatRelativeTime(item.at)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </PanelBody>
    </Panel>
  );
}

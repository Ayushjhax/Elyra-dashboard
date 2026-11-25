"use client";

import { useState } from "react";
import { Card, CopyButton, Label, Problem, field, rating } from "@/components/arena/parts";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { MIN_RATED } from "@/lib/arena/calls";
import { MIN_PUZZLES_RANKED, type LadderRow } from "@/lib/arena/ladder";
import type { ArenaResponse, LadderView } from "@/lib/arena/types";
import type { ArenaFeed } from "@/lib/arena/useArena";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The ladders — the puzzle's rating and calls' calibration, for everyone who
   is public and within each group — and the handle and groups that decide
   who appears where. Judgment only: no ladder ranks profit, size, leverage
   or how often someone trades.
--------------------------------------------------------------------------- */

function LadderList({ rows, kind, empty }: { rows: LadderRow[]; kind: "puzzle" | "calls"; empty: string }) {
  const t = useT();
  if (rows.length === 0) return <p className="type-body-sm text-text-secondary">{empty}</p>;
  return (
    <ol className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
      {rows.map((row) => (
        <li
          key={row.handle}
          className={cn(
            "grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-baseline gap-3 px-2.5 py-1.5",
            row.me && "bg-surface-hover",
          )}
        >
          <span className="type-data-sm text-text-muted">{row.rank}</span>
          <span className="type-data-sm min-w-0 truncate text-text-primary">
            @{row.handle}
            {row.me && <span className="type-label text-text-muted"> · {t("you")}</span>}
          </span>
          <span className="type-label text-text-muted">
            {row.sample} {kind === "puzzle" ? (row.sample === 1 ? t("puzzle") : t("puzzles")) : row.sample === 1 ? t("call") : t("calls")}
          </span>
          <span className="type-data-sm text-right text-text-primary">{kind === "puzzle" ? rating(row.value) : row.value.toFixed(3)}</span>
        </li>
      ))}
    </ol>
  );
}

function Ladders({ data }: { data: ArenaResponse }) {
  const t = useT();
  const [scope, setScope] = useState("everyone");
  const ladder: LadderView | undefined = data.ladders.find((entry) => entry.scope === scope) ?? data.ladders[0];
  if (ladder === undefined) {
    return (
      <Card title={t("Ladder")}>
        <p className="type-body-sm text-text-secondary">{t("The ladder is not available right now.")}</p>
      </Card>
    );
  }
  return (
    <Card
      title={t("Ladder")}
      right={
        <InfoTip
          text={t(
            "Ranked on judgment only. The puzzle ladder is the daily puzzle's rating, highest first. The calls ladder is the Brier score of settled calls, lowest first: 0 is perfect, always saying 50% scores 0.25.",
          )}
        />
      }
    >
      {data.ladders.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Whose ladder")}>
          {data.ladders.map((entry) => (
            <Button key={entry.scope} size="xs" variant={entry.scope === ladder.scope ? "accent" : "quiet"} aria-pressed={entry.scope === ladder.scope} onClick={() => setScope(entry.scope)}>
              {entry.scope === "everyone" ? t("Everyone") : entry.name}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="type-eyebrow text-text-muted">{t("Puzzle rating")}</h3>
        <LadderList rows={ladder.puzzle} kind="puzzle" empty={t("Nobody ranks yet. A player ranks after {count} puzzles.", { count: MIN_PUZZLES_RANKED })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="type-eyebrow text-text-muted">{t("Call calibration")}</h3>
        <LadderList rows={ladder.calls} kind="calls" empty={t("Nobody ranks yet. A caller ranks after {count} settled calls.", { count: MIN_RATED })} />
      </div>
      {ladder.scope === "everyone" && !data.profile.public && (
        <p className="type-label text-text-muted">{t("You appear here once your profile is public. Your groups see you either way, by handle.")}</p>
      )}
    </Card>
  );
}

export function ProfileAndGroups({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  const t = useT();
  const [handle, setHandle] = useState(data.profile.handle ?? "");
  const [isPublic, setPublic] = useState(data.profile.public);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const run = (url: string, body: Record<string, unknown>, done?: () => void) =>
    void feed.write(url, "POST", body).then((result) => {
      setProblem(result.error);
      if (result.error === null) done?.();
    });
  return (
    <div className="flex flex-col gap-3">
      <Card title={t("Your Arena profile")}>
        <div className="flex flex-col gap-1">
          <Label htmlFor="arena-handle">{t("Handle")}</Label>
          <input id="arena-handle" className={field} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder={t("3–20 letters, numbers or _")} />
        </div>
        <label className="type-body-sm flex items-center gap-2 text-text-secondary">
          <input type="checkbox" className="size-4 shrink-0 accent-[var(--accent)]" checked={isPublic} onChange={(event) => setPublic(event.target.checked)} />
          {t("Public — show my public calls to everyone under this handle")}
        </label>
        <p className="type-label text-text-muted">{t("Others only ever see your handle, never your wallet. What a call says stays private unless you share it, but every settled call counts toward your calls ladder score: your groups see how many you have settled and their Brier score, and so does everyone if you are public.")}</p>
        <div>
          <Button size="sm" variant="quiet" onClick={() => run("/api/arena/profile", { handle, public: isPublic })}>
            {t("Save profile")}
          </Button>
        </div>
      </Card>
      <Card title={t("Groups")}>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run("/api/arena/groups", { action: "create", name }, () => setName(""));
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="group-name">{t("New group")}</Label>
            <input id="group-name" className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Name")} />
          </div>
          <Button type="submit" size="sm" variant="quiet">
            {t("Create")}
          </Button>
        </form>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run("/api/arena/groups", { action: "join", code }, () => setCode(""));
          }}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Label htmlFor="group-code">{t("Join with a code")}</Label>
            <input id="group-code" className={field} value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("8 letters")} />
          </div>
          <Button type="submit" size="sm" variant="quiet">
            {t("Join")}
          </Button>
        </form>
        {data.groups.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{t("No groups yet. Create one and send its code to friends.")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle">
            {data.groups.map((group) => (
              <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="type-data-sm text-text-primary">
                  {group.name} <span className="type-label text-text-muted">· {group.members} {group.members === 1 ? t("member") : t("members")}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="type-mono-addr text-text-secondary">{group.inviteCode}</span>
                  <CopyButton text={group.inviteCode} label={t("Copy the invite code for {name}", { name: group.name })} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Problem text={problem} />
    </div>
  );
}

export function LadderTab({ data, feed }: { data: ArenaResponse; feed: ArenaFeed }) {
  return (
    <div className="flex flex-col gap-3">
      <Ladders data={data} />
      <ProfileAndGroups data={data} feed={feed} />
    </div>
  );
}

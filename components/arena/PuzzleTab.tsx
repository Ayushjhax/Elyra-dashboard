"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { Card, Label, Problem, ShareLine, Stats, rating } from "@/components/arena/parts";
import { PuzzleChart } from "@/components/arena/PuzzleChart";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HIDDEN_BARS } from "@/lib/arena/puzzle";
import type { PuzzleView } from "@/lib/arena/types";
import type { ArenaFeed } from "@/lib/arena/useArena";
import { marketFor } from "@/lib/autotrade/rules";
import { cn } from "@/lib/utils";

/* Play: the daily chart puzzle — one real chart a day, the same for everyone, scored on calibration. */

export function PuzzleTab({ puzzle, error, feed }: { puzzle: PuzzleView | null; error: string | null; feed: ArenaFeed }) {
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [confidence, setConfidence] = useState(60);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (puzzle === null) {
    return <EmptyState icon={Swords} title="No puzzle right now" body={error ?? "Today's chart is being prepared. Try again shortly."} />;
  }
  const answer = puzzle.answer;
  const reveal = puzzle.reveal;
  const vsBot = puzzle.rating - puzzle.bots.momentum;

  return (
    <Card title={`Puzzle #${puzzle.number}`} right={<span className="type-label text-text-muted">{puzzle.date} UTC</span>}>
      <p className="type-body-sm text-text-secondary">
        A real chart, market and date hidden, prices rebased to 100. Will it be higher or lower {HIDDEN_BARS} hours after the last bar?
      </p>
      <PuzzleChart visible={puzzle.visible} reveal={reveal?.bars ?? null} />
      {reveal === null && <p className="type-label text-text-muted">The shaded region is the next {HIDDEN_BARS} hours, hidden until you answer.</p>}

      {answer === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (direction === null) {
              setProblem("Choose up or down.");
              return;
            }
            setBusy(true);
            void feed
              .write("/api/arena/puzzle", "POST", { direction, confidence })
              .then((result) => setProblem(result.error))
              .finally(() => setBusy(false));
          }}
        >
          <div className="flex gap-2" role="group" aria-label="Direction">
            {(["up", "down"] as const).map((option) => (
              <Button key={option} type="button" size="sm" variant={direction === option ? "accent" : "quiet"} aria-pressed={direction === option} onClick={() => setDirection(option)}>
                {option === "up" ? "Higher" : "Lower"}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="puzzle-confidence">Confidence: {confidence}%</Label>
            <input
              id="puzzle-confidence"
              type="range"
              min={50}
              max={99}
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <p className="type-label text-text-muted">
              50% never moves your rating. High confidence gains a little when right and costs a lot when wrong.
            </p>
          </div>
          <div>
            <Button type="submit" size="sm" variant="accent" disabled={busy}>
              Lock in
            </Button>
          </div>
          <Problem text={problem} />
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className={cn("type-h2", answer.correct ? "text-positive" : "text-negative")}>
            {answer.correct ? "Correct" : "Wrong"} — {reveal?.outcome === "up" ? "it rose" : "it fell"} {Math.abs(reveal?.changePct ?? 0).toFixed(2)}%
          </p>
          {reveal !== null && (
            <p className="type-body-sm text-text-secondary">
              It was {marketFor(reveal.market)?.label ?? reveal.market}, to {new Date(reveal.endsAt).toISOString().slice(0, 16).replace("T", " ")} UTC.
            </p>
          )}
          <p className="type-data text-text-primary">
            Rating {rating(answer.ratingBefore)} → {rating(answer.ratingAfter)}
          </p>
          <ShareLine text={answer.share} label="Copy your result" />
        </div>
      )}

      <Stats
        items={[
          ["Rating", rating(puzzle.rating)],
          ["Streak", `${puzzle.streak} ${puzzle.streak === 1 ? "day" : "days"}`],
          ["Played", String(puzzle.played)],
        ]}
      />

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        <h3 className="type-eyebrow text-text-muted">Beat the bot</h3>
        <p className="type-body-sm text-text-secondary">
          Coin-flip bot {rating(puzzle.bots.coinFlip)} · Momentum bot {rating(puzzle.bots.momentum)}
          {puzzle.bots.momentumToday !== null && (
            <> (today it said {puzzle.bots.momentumToday.direction === "up" ? "higher" : "lower"} at {puzzle.bots.momentumToday.confidence}%)</>
          )}
        </p>
        <p className="type-label text-text-muted">
          {puzzle.played === 0
            ? "Play to get a rating to compare."
            : vsBot >= 0
              ? `You are ${rating(vsBot)} ahead of the momentum bot.`
              : `The momentum bot is ${rating(-vsBot)} ahead of you.`}
        </p>
      </div>
    </Card>
  );
}

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
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* Play: the daily chart puzzle — one real chart a day, the same for everyone, scored on calibration. */

export function PuzzleTab({ puzzle, error, feed }: { puzzle: PuzzleView | null; error: string | null; feed: ArenaFeed }) {
  const t = useT();
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [confidence, setConfidence] = useState(60);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (puzzle === null) {
    return <EmptyState icon={Swords} title={t("No puzzle right now")} body={error ?? t("Today's chart is being prepared. Try again shortly.")} />;
  }
  const answer = puzzle.answer;
  const reveal = puzzle.reveal;
  const vsBot = puzzle.rating - puzzle.bots.momentum;

  return (
    <Card title={t("Puzzle #{number}", { number: puzzle.number })} right={<span className="type-label text-text-muted">{t("{date} UTC", { date: puzzle.date })}</span>}>
      <p className="type-body-sm text-text-secondary">
        {t("A real chart, market and date hidden, prices rebased to 100. Will it be higher or lower {HIDDEN_BARS} hours after the last bar?", { HIDDEN_BARS })}
      </p>
      <PuzzleChart visible={puzzle.visible} reveal={reveal?.bars ?? null} />
      {reveal === null && (
        <p className="type-label text-text-muted">{t("The shaded region is the next {HIDDEN_BARS} hours, hidden until you answer.", { HIDDEN_BARS })}</p>
      )}

      {answer === null ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (direction === null) {
              setProblem(t("Choose up or down."));
              return;
            }
            setBusy(true);
            void feed
              .write("/api/arena/puzzle", "POST", { direction, confidence })
              .then((result) => setProblem(result.error))
              .finally(() => setBusy(false));
          }}
        >
          <div className="flex gap-2" role="group" aria-label={t("Direction")}>
            {(["up", "down"] as const).map((option) => (
              <Button key={option} type="button" size="sm" variant={direction === option ? "accent" : "quiet"} aria-pressed={direction === option} onClick={() => setDirection(option)}>
                {option === "up" ? t("Higher") : t("Lower")}
              </Button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="puzzle-confidence">{t("Confidence: {confidence}%", { confidence })}</Label>
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
              {t("50% never moves your rating. High confidence gains a little when right and costs a lot when wrong.")}
            </p>
          </div>
          <div>
            <Button type="submit" size="sm" variant="accent" disabled={busy}>
              {t("Lock in")}
            </Button>
          </div>
          <Problem text={problem} />
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className={cn("type-h2", answer.correct ? "text-positive" : "text-negative")}>
            {answer.correct ? t("Correct") : t("Wrong")} — {reveal?.outcome === "up" ? t("it rose") : t("it fell")} {Math.abs(reveal?.changePct ?? 0).toFixed(2)}%
          </p>
          {reveal !== null && (
            <p className="type-body-sm text-text-secondary">
              {t("It was {value}, to {value2} UTC.", {
                value: marketFor(reveal.market)?.label ?? reveal.market,
                value2: new Date(reveal.endsAt).toISOString().slice(0, 16).replace("T", " "),
              })}
            </p>
          )}
          <p className="type-data text-text-primary">
            {t("Rating {ratingBefore} → {ratingAfter}", { ratingBefore: rating(answer.ratingBefore), ratingAfter: rating(answer.ratingAfter) })}
          </p>
          <ShareLine text={answer.share} label={t("Copy your result")} />
        </div>
      )}

      <Stats
        items={[
          [t("Rating"), rating(puzzle.rating)],
          [t("Streak"), puzzle.streak === 1 ? t("1 day") : t("{count} days", { count: puzzle.streak })],
          [t("Played"), String(puzzle.played)],
        ]}
      />

      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        <h3 className="type-eyebrow text-text-muted">{t("Beat the bot")}</h3>
        <p className="type-body-sm text-text-secondary">
          {t("Coin-flip bot {coinFlip} · Momentum bot {momentum}", { coinFlip: rating(puzzle.bots.coinFlip), momentum: rating(puzzle.bots.momentum) })}
          {puzzle.bots.momentumToday !== null && (
            <>
              {" "}
              {puzzle.bots.momentumToday.direction === "up"
                ? t("(today it said higher at {confidence}%)", { confidence: puzzle.bots.momentumToday.confidence })
                : t("(today it said lower at {confidence}%)", { confidence: puzzle.bots.momentumToday.confidence })}
            </>
          )}
        </p>
        <p className="type-label text-text-muted">
          {puzzle.played === 0
            ? t("Play to get a rating to compare.")
            : vsBot >= 0
              ? t("You are {vsBot} ahead of the momentum bot.", { vsBot: rating(vsBot) })
              : t("The momentum bot is {value} ahead of you.", { value: rating(-vsBot) })}
        </p>
      </div>
    </Card>
  );
}

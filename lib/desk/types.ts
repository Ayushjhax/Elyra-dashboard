import type { DeskStatus, HorizonId, Round, ScoreRow, Stage } from "@/lib/desk/protocol";

/* /api/desk, as the website reads it (and the app can, later). Pure. */

export interface DeskSeatView {
  id: string;
  title: string;
  lens: string;
  lab: string;
  /** The model this deployment seats, or null when the seat is empty. */
  model: string | null;
  tier: "free" | "paid";
  votes: boolean;
  seated: boolean;
}

export interface DeskTurnView {
  seat: string;
  title: string;
  lab: string;
  /** The model that answered, as its provider reported it. */
  model: string;
  round: Round;
  p: number | null;
  thesis: string;
  /** Independent: what would change its mind. */
  note: string;
  changed: boolean | null;
  /** It cited a figure that is not on the fact sheet; its reasoning is withheld, its vote stands. */
  flagged: boolean;
  error: string | null;
  /** Its weight in the vote. */
  weight: number | null;
  brier: number | null;
}

export interface DeskRunView {
  id: string;
  market: string;
  horizon: HorizonId;
  statement: string;
  note: string | null;
  stage: Stage;
  createdAt: string;
  resolvesAt: string;
  startPrice: number;
  facts: string[];
  assignments: Record<string, string>;
  /** The pooled independent views, percent. */
  pIndependent: number | null;
  /** The Desk's answer: the pooled reviewed views, percent. */
  pFinal: number | null;
  spread: number | null;
  memo: string | null;
  dissent: { title: string; p: number } | null;
  status: DeskStatus;
  settledPrice: number | null;
  settledAt: string | null;
  error: string | null;
  turns: DeskTurnView[];
}

export interface DeskResponse {
  seats: DeskSeatView[];
  runs: DeskRunView[];
  scoreboard: ScoreRow[];
  runsLeft: number;
  runsPerDay: number;
  error: string | null;
}

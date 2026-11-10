import type { Calibration, CallStatus, Direction, Visibility } from "@/lib/arena/calls";
import type { Bar, UpDown } from "@/lib/arena/puzzle";
import type { ReviewFacts, ReviewLabel } from "@/lib/arena/review";

/* /api/arena, as the website reads it (and the app can, later). Pure. */

export interface ArenaCallView {
  id: string;
  mine: boolean;
  /** The caller's chosen handle, or null when they have none. Never an address. */
  author: string | null;
  market: string;
  direction: Direction;
  price: number;
  resolvesAt: string;
  confidence: number;
  visibility: Visibility;
  statement: string;
  receipt: string;
  createdAt: string;
  status: CallStatus;
  settledPrice: number | null;
  settledSource: string | null;
  settledAt: string | null;
  brier: number | null;
  card: string | null;
  tails: number;
  fades: number;
  /** The viewer's own backing, if any. */
  myBacking: { stance: "tail" | "fade"; points: number; settledPoints: number | null } | null;
}

export interface ReviewView {
  id: string;
  positionId: string;
  label: ReviewLabel;
  facts: ReviewFacts;
  coaching: string;
  createdAt: string;
}

export interface PuzzleView {
  date: string;
  number: number;
  visible: Bar[];
  /** Present once answered: the hidden bars, the market and the moment. */
  reveal: { bars: Bar[]; market: string; endsAt: string; outcome: UpDown; changePct: number } | null;
  answer: { direction: UpDown; confidence: number; correct: boolean; ratingBefore: number; ratingAfter: number; share: string } | null;
  rating: number;
  streak: number;
  played: number;
  bots: { coinFlip: number; momentum: number; momentumToday: { direction: UpDown; confidence: number } | null };
}

export interface GroupView {
  id: string;
  name: string;
  inviteCode: string;
  members: number;
  owner: boolean;
}

export interface ArenaResponse {
  profile: { handle: string | null; public: boolean };
  groups: GroupView[];
  points: { week: string; budget: number; spent: number; seasonNet: number };
  puzzle: PuzzleView | null;
  /** Why there is no puzzle today, when there is none. */
  puzzleError: string | null;
  myCalls: ArenaCallView[];
  feed: ArenaCallView[];
  calibration: Calibration;
  reviews: ReviewView[];
  /** Reviews per label, for the distribution. */
  labelCounts: Record<ReviewLabel, number>;
  error: string | null;
}

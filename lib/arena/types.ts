import type { Calibration, CallStatus, Direction, Visibility } from "@/lib/arena/calls";
import type { LadderRow } from "@/lib/arena/ladder";
import type { LeagueStatus, MatchupResult, Outcome } from "@/lib/arena/league";
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

/* ---- leagues ---- */

export interface LeagueMarketScore {
  market: string;
  /** The market's move this round, percent; null without a price. */
  pct: number | null;
}

export interface LeagueSide {
  handle: string;
  me: boolean;
  pct: number | null;
  markets: LeagueMarketScore[];
}

export interface LeagueMatchupView {
  round: number;
  home: LeagueSide;
  /** Null is a bye. */
  away: LeagueSide | null;
  result: MatchupResult | null;
  /** Scored against the current mid: the round is under way. */
  live: boolean;
}

export interface LeagueRoundView {
  round: number;
  startsAt: string;
  endsAt: string;
  matchups: LeagueMatchupView[];
  recap: string | null;
}

export interface LeagueStandingView {
  rank: number;
  handle: string;
  me: boolean;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  pointsFor: number;
}

export interface LeagueRosterView {
  handle: string;
  me: boolean;
  /** What counts this round (round 1 before the season starts). */
  lineup: string[];
  /** What is held now — next round's lineup. */
  held: string[];
}

export interface LeagueView {
  id: string;
  name: string;
  inviteCode: string;
  /** Whether the viewer owns it. */
  owner: boolean;
  status: LeagueStatus;
  rosterSize: number;
  rounds: number;
  roundDays: number;
  pickSeconds: number;
  /** In draft order once slots are dealt; otherwise in joining order. */
  managers: { handle: string; me: boolean; owner: boolean }[];
  draft: {
    total: number;
    picks: { pick: number; round: number; handle: string; me: boolean; market: string; auto: boolean }[];
    onClock: { handle: string; me: boolean; deadline: string; pick: number } | null;
    /** Markets still on the board, in auto-pick order. */
    board: string[];
  };
  season: {
    startsAt: string;
    /** 0 before the first round, rounds + 1 after the last. */
    round: number;
  } | null;
  rosters: LeagueRosterView[];
  freeAgents: string[];
  movesLeft: number;
  schedule: LeagueRoundView[];
  standings: LeagueStandingView[];
  champion: string | null;
  /** The viewer's matchup in the round under way (or round 1 before the season). */
  myMatchup: LeagueMatchupView | null;
  /** Share text for the viewer's last settled matchup. */
  share: string | null;
}

/** One league as the Arena's front page shows it. */
export interface LeagueSummary {
  id: string;
  name: string;
  status: LeagueStatus;
  managers: number;
  round: number;
  rounds: number;
  roundDays: number;
  rank: number | null;
  record: string | null;
  onClock: { handle: string; me: boolean; deadline: string } | null;
  matchup: { opponent: string | null; mine: number | null; theirs: number | null; outcome: Outcome; live: boolean } | null;
  champion: string | null;
}

export interface LadderView {
  /** "everyone", or a group's id. */
  scope: string;
  name: string;
  puzzle: LadderRow[];
  calls: LadderRow[];
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
  leagues: LeagueSummary[];
  /** Everyone first, then each of the viewer's groups. */
  ladders: LadderView[];
  error: string | null;
}

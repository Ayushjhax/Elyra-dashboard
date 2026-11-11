# Arena with real money — design only

**Status: not built, and not to be built without legal sign-off.** Arena
ships on points and paper (`docs/ARENA.md`). This document describes how
real-money variants could work, which contracts they would need, and what a
lawyer must clear first. Nothing here is legal advice. Every question below
depends on jurisdiction and must be answered by counsel in each market Elyra
serves.

## The four ideas

### 1. No-loss arenas

Players deposit stablecoins into a yield vault. Only the yield funds the
prizes, and every depositor can withdraw their full principal at the end.
This is the prize-savings model.

- **Flow.** Deposit USDC, which goes into the vault and is lent to a yield
  source (for example a Solana lending market). At season end, the yield is
  paid to the top calibration scores, and every player's principal is
  claimable.
- **Contracts.**
  - A vault program with per-season accounts.
  - A principal ledger (one PDA per player per season).
  - A yield-source adapter.
  - A prize distributor that pays out against a results Merkle root
    published by an oracle authority.
- **Risks.**
  - Losses at the yield source can break the "no-loss" promise. The copy
    must not say "no-loss" unless principal is protected, for example by
    insurance or a first-loss reserve.
  - Smart-contract risk.
  - The oracle authority is trusted to publish correct results.

### 2. Buy-ins

Players pay a fixed entry fee into a pool, and the pool pays the top finishers.

- **Flow.** Pay the entry, which is held in escrow. When the event settles,
  the results root is published, winners claim, and Elyra's rake (if any)
  goes to the treasury.
- **Contracts.**
  - The same escrow and distributor as above, without the yield adapter.
  - Optionally a time-locked refund path if the event is cancelled.

### 3. Escrow payouts (head-to-head)

Two people stake against each other on a call or a Draft night matchup.

- **Flow.** Both deposit into a two-party escrow. At settlement, the oracle
  signs the outcome, the winner claims both stakes, and a void returns each
  stake.
- **Contracts.** A two-party escrow PDA, keyed by matchup ID, that holds an
  oracle-signed outcome, has a deadline, and refunds automatically.

### 4. Squad vaults

A group pools funds that an agent (from the AI arena) or a group lead
trades.

- **Flow.** Members deposit, a strategy trades, and members redeem
  pro-rata shares.
- **Contracts.**
  - A share-token vault.
  - A trading delegate restricted to an allowlist of venues and markets.
  - Withdrawal queues.
- **Why this is the most sensitive.** Pooling other people's money under a
  manager looks like a collective investment scheme or an unregistered fund
  in most places. It is the hardest of the four to clear and the last to
  consider.

## What every variant needs technically

- **A settlement oracle.**
  - Arena already settles calls on Hyperliquid's one-minute close and the
    puzzle on stored bars. A real-money version would publish each event's
    results as a Merkle root signed by a dedicated key held in a KMS, never
    the trading key.
  - Disputes need a window before claims open.
- **Receipts on-chain.** `arena_calls.onchain_signature` is reserved for
  anchoring the SHA-256 receipt in a Solana memo transaction. For money,
  anchoring should be mandatory, so the record cannot be changed later.
- **Identity and eligibility.** Know-your-customer checks, age checks
  (18 or 21 and over, depending on the place), geofencing by IP and wallet,
  and a list of restricted jurisdictions enforced on the server.
- **Responsible-play controls.** Deposit limits, cool-offs, self-exclusion,
  and loss reminders. These matter even more here than for paper, because
  Arena's own rule is never to reward trading more.
- **Audits.** An independent audit of every program before mainnet, plus a
  bug bounty.
- **Separation.** Arena points must never convert to money, so the
  points-only Arena stays legally distinct.

## What a lawyer must clear

| Question | Why it matters |
|---|---|
| **Gambling.** Is a paid entry with a prize decided by price moves a game of chance, of skill, or a bet? | Many jurisdictions treat consideration + chance + prize as gambling. Calibration scoring argues for skill, but price outcomes are uncertain. The answer differs by country and by US state. |
| **Prize promotions and sweepstakes.** Can a free-entry route keep a contest a lawful promotion? | Free-entry alternatives and registration or bonding of prize promotions (for example in NY and FL) may apply. |
| **Securities.** Are vault shares, squad vaults or pooled prize funds securities or collective investment schemes? | Squad vaults and yield-bearing deposits are the most exposed. |
| **Derivatives and event contracts.** Is a paid call on a future price a binary option or swap? | This could fall under the CFTC in the US, MiFID in the EU, or local derivatives rules. |
| **Money transmission and custody.** Does holding or routing deposits make Elyra a money transmitter or custodian? | Even non-custodial escrow can raise money-services business (MSB) and EU crypto-asset service provider (MiCA CASP) questions. |
| **Consumer protection and marketing.** Can the copy say "no-loss", and how are odds, fees and rake disclosed? | Misleading-claims rules apply, as do app store policies (Solana dApp Store, Google Play real-money gaming rules). |
| **Tax.** How are prizes reported to winners? | Reporting thresholds and withholding apply. |
| **Data and identity.** How long can KYC data be kept, and where can it be stored? | Retention and data residency rules apply. |

## Suggested order, if ever pursued

1. Free contests with sponsored prizes (no consideration), after promotion
   rules are cleared.
2. No-loss seasons, only with principal protection and counsel's sign-off.
3. Buy-ins and head-to-head escrow, only where skill-contest rules clearly
   allow them.
4. Squad vaults last, if at all.

Until a lawyer signs off on a specific variant, a specific jurisdiction and
specific copy, Arena stays points and paper.

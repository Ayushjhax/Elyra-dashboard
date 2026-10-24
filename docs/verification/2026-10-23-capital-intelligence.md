# Capital Intelligence mobile verification — 23 October 2026

Implemented in Elyra → Capital. Uses the existing authenticated API and the
same conversations, memories, portfolio, activity, prepared actions and signing
flow as the website.

## Device checks

Verified on the connected Solana Mobile Seeker, signed into the funded account,
using the local Expo development client and this repo's API. No sample data,
authentication bypass, wallet signature or on-chain transaction was used.

- Live portfolio equity, available capital, positions and activity source states.
- Empty state, editable starter prompts, source selection, native answer blocks,
  insights and currency formatting. Markdown table rows render as cards.
- Live streamed answers used account balances and the saved concentration limit.
- Created a 25% concentration limit, edited it to 30%, observed the warning in a
  live swap answer, then removed it. The original empty preferences list is restored.
- History listed the test conversation, reopened its stored answers, and deleted
  that conversation. The list was empty afterwards.
- A prepared 0.001 SOL → USDC swap opened Swap with the correct pair and amount.
  The fresh confirmation check displayed resolved fields and concentration
  warnings; the swap API returned a quote. Stopped before signing.
- An oversized edited amount was clamped by the confirmation route. The app
  replaced the requested amount with the resolved amount, cleared the quote and
  required another explicit review. It did not quote or sign the oversized request
  after the fix.
- A request to close a nonexistent SOL perpetual showed “Prepared · not ready”
  and “No open position was found on SOL.”
- Dismissed the temporary prepared swap. No open test action remains.
- Inspected screenshots at 360dp, 412dp and an 800dp tablet viewport using Android
  display overrides on the same phone. Restored its native size and density.

## Regressions found during verification

- An oversized proposal can be **ready with a reduced quantity**. Matching that
  server-resolved quantity is now required before quoting and again before signing.
- Plural “balances” / “holdings” and “concentration” were missing from intent
  routing. These now request allocation and risk rather than leaving the answer
  without the holdings it needs. Shared web/mobile regression tests cover this;
  the live device recheck included both SOL and USDC and correctly reported no
  saved concentration limit after the temporary preference was removed.
- Partial position reads and failed activity refreshes now keep their failure
  state even when cached rows exist. Tiny prepared-action dollar values retain
  precision through `formatPriceUsd`.

## Automated checks

Both projects pass `pnpm typecheck`, `pnpm lint` and `pnpm test`: 1,305 web
tests and 67 mobile tests (mobile runs with `--runInBand`). The mobile tests cover streaming, early conversation IDs,
retries, stop, rejected/truncated requests, duplicate sends, late answers after an
account change, late history reads, deletion failures, revalidation failures and
changed/clamped inputs.

## Local evidence

Account screenshots are kept outside the repository at
`/tmp/elyra-capital-verification/`:

- `context.png`, `memory-created.png`, `cleanup.png`
- `history.png`, `history-cleanup.png`
- `prepared-review.png`, `swap-revalidation.png`, `clamped-review.png`
- `not-ready-reason.png`, `balances-routing-fixed.png`, `sources-excluded.png`
- `capital-360dp.png`, `capital-412dp.png`, `capital-800dp.png`

Physical-device verification covers the pre-sign review flow. Signing, MWA and
on-chain submission were not exercised in this task. The emulator booted but was
terminated by host memory pressure (exit 137); emulator UI verification did not
complete.

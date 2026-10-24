# Mobile portfolio and featured graphic

The Portfolio screen now leads with value, a seven-day chart, Available and
Open PnL. Compact capital actions follow it. Positions, orders and history
appear before the portfolio detail links, with separate Spot, Perps,
Prediction and DeFi filters. Position cards show their actual source,
side, leverage, PnL and relevant facts. Venue positions remain read-only.
The overview is bounded to five rows per tab, with a link to the full account,
orders or activity view.

An unavailable PnL remains unavailable and explains itself on tap. A disconnected
perps account offers Manage connections; a failed venue read offers retry.
Hiding balances also hides the history chart and its accessible historical
values, position sizes, margin, PnL and prediction balances. Market prices remain
visible.

## Checks

- Web: typecheck, lint and 103 test files / 1,329 tests passed.
- Mobile: typecheck, lint and 30 test suites / 209 tests passed.
- Seven new component tests cover missing PnL, historical-value privacy,
  a short perpetual with leverage and venue access, size/margin/PnL privacy,
  disconnected and failed perp sources, and prediction-value privacy.
- Real Seeker, development build with Metro: the funded account loaded at
  its native 400dp width. Spot positions, account summary, chart, compact
  actions, the PnL explanation and the disconnected-perps state were inspected.
- Populated financial layouts were also inspected at 360dp, 412dp and a
  simulated 640dp tablet width on the Seeker. The tablet switches position
  cards to a table. Native font measurement clipped a chart caption and an
  action label; their layout bounds were corrected.
- Balance hiding was exercised on the real device: amounts and position size
  were masked and the history chart disappeared, while market prices remained.
  Balances were shown again afterward. The device's original display size and
  1.0 font scale were restored.
- The funded account did not report open perps or an unrealized PnL, so it
  cannot validate a populated live perp card. Populated perps are covered by
  the component tests.
- At 360dp and 1.3 font scale, the API read timed out after restarting the
  development client. The failure layout remained readable and the market
  filters scrolled horizontally. This screenshot is failure-state coverage,
  not a populated financial-layout pass.

## Graphic

`output/imagegen/elyra-editors-choice-redesigned-1200x1200.png` is verified
exactly 1200 × 1200 pixels. The promotional screen is labeled Demo account;
its SOL and BTC perps, USDC holding and PnL figures are illustrative. No sample
positions were added to the actual app or the signed-in account.

Built-in image generation used the existing poster and the real redesigned
screen as references. The prompts are
`output/imagegen/elyra-editors-choice-v2-1200x1200-prompt.txt` and
`output/imagegen/elyra-editors-choice-v2-polish-prompt.txt`.

No deployment, account connection, signing or trade was performed.

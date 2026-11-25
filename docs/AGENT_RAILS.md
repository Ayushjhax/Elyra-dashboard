# Agent rails

AI agents are getting good at deciding what to do with money. They are not
getting a safe way to do it. Handing an agent a private key is handing it
everything; handing it nothing makes it an analyst that cannot act.

Elyra's position is the layer in between: the permissioned path between an
agent and the person's money. The agent holds an Elyra key, never a wallet
key. The person grants that key a **mandate**. Every transaction the agent
wants becomes an **intent** that Elyra decides against the mandate, screens,
routes to the person for a signature (or, for perp orders the mandate lets
run, carries out through a key that cannot withdraw), proves on-chain and
records in a hash-chained **ledger**.

## Why this, and not another analysis agent

Intelligence is becoming a commodity. What an agent depends on is not:

| What we own | How the rails build it |
|---|---|
| A distribution channel | Elyra's MCP server and REST mirror. Any agent — Claude, ChatGPT, Cursor, a bot — plugs in with one key and gets market context plus the rails. |
| An important workflow | Granting permission and approving what an agent asked for. Every agent transaction passes through the Agents page and the person's wallet. |
| Proprietary data | The ledger: every intent, decision, approval and settlement, with the balance changes the chain recorded. A history of what agents do with money, per person, verifiable. |
| Control of AI-generated transactions | Agents propose; Elyra decides. Nothing reaches a wallet that is outside the mandate, unpriced or to a sanctioned payee. |
| Essential infrastructure | Agent identity (keys), permissions (mandates), stablecoin payments and settlement (Solana Pay), compliance screening (OFAC), receipts. |

## The primitives

- **Agent identity.** An agent key (`lib/agentApi/keys.ts`): a hashed bearer
  key, owned by one person, revocable, rate-limited per minute and per day.
- **Mandate** (`agent_mandates`, `lib/rails/policy.ts`). Per key:
  - the kinds it may ask for: `swap`, `payment`, `perp_order`, `payment_request`;
  - an optional asset list;
  - a per-intent and a daily cap in USD (at most $10,000 and $50,000);
  - optional allowed payees;
  - an end date (at most 90 days);
  - whether perp orders run without review, and whether they may go live.

  Saving one replaces the last, and both are in the ledger.
- **Intent** (`agent_intents`, `lib/rails/intents.ts`). What an agent asked
  for, normalised (symbols through the swap allowlist, amounts in base units;
  a payment request's payee and amount read from the request, never the
  agent), priced, screened and decided:
  - `rejected` — outside the mandate, unpriceable, or the payee is
    sanctioned or could not be screened. Fails closed.
  - `pending` — the person reviews it in Elyra → Agents.
  - `auto` — a perp order inside a mandate that lets perps run.

  Then `approved` → `executed` (proven on-chain), or `declined` / `expired` /
  `failed`.
- **Ledger** (`rails_ledger`, `lib/rails/ledger.ts`). Append-only per
  person. Each event's hash is SHA-256 over the canonical JSON of the event
  and the previous hash, and the database refuses a second event at a
  position or after a predecessor, so the chain cannot fork. The agent's
  receipt is its proposal's hash. The person exports it as CSV; anyone can
  re-verify it with SHA-256 alone.
- **Payment requests** (`payment_requests`, `lib/rails/requests.ts`). How an
  agent — or the person — gets paid in USDC on Solana. A standard Solana Pay
  transfer request with a fresh reference key, a public pay page
  (`/pay/[id]`), settled when a transaction carrying the reference raises the
  recipient's USDC by at least the amount. Checked on read and on the
  five-minute tick.
- **Screening** (`lib/rails/screening.ts`). Payees against OFAC's SDN
  digital-currency addresses, read live (Treasury's list, via 0xB10C's
  daily extraction), cached six hours, failing closed.

## How each kind is carried out

| Kind | Who acts | How |
|---|---|---|
| Swap | The person signs | The swap dialog, prefilled. Re-quoted by Jupiter, simulated against their accounts by `guardSwap`, signed in their wallet, proven by signature and signer. |
| Payment | The person signs | The transfer is built by the server from the intent (payee, amount and Solana Pay reference are the intent's), signed in their wallet, broadcast by `/api/transfer/submit`, and proven only when the chain shows the payee's USDC rising by the amount. It settles the request it paid. |
| Perp order | Elyra, on approval or within the mandate | `openMarketTrade` (`lib/autotrade/trade.ts`), the same path as a market order by hand: `LIMITS`, `accountGate`, TP/SL in the same request, through the Hyperliquid API wallet the person approved, which cannot withdraw. Paper unless the mandate allows live and the server is live. |
| Payment request | Anyone pays | From any Solana Pay wallet, or from Elyra as another agent's payment intent. |

## Invariants

- Elyra holds no wallet key. A swap or a payment needs the person's signature,
  every time.
- An agent cannot choose whose wallet pays, raise its own limits, see another
  account's intents, or pay a request to anyone but its recipient.
- Nothing is recorded as executed without the chain's proof. One signature
  settles one intent (`agent_intents.signature` is unique) and one request
  (`payment_requests.paid_signature`).
- Text an agent writes — the memo, a request label — is shown as text,
  attributed to the agent, never acted on and never put in a notification.
- Every decision, refusals included, is in the ledger.

## Built on the rails

- **AI funds** (`docs/AI_FUNDS.md`): an agent key as the portfolio manager of
  a fund over the person's own capital, held to a charter instead of a
  mandate, with every decision in the same ledger.

## Next

- **Autonomous stablecoin payments** within a mandate, without custody:
  Privy's server-side signers with wallet policies, so an agent can pay up to
  its cap with no click, and the policy is enforced by the wallet provider as
  well as by Elyra.
- **Pay-per-call for Elyra's own tools** (x402 on Base): agents paying Elyra in
  USDC for premium data — the rails as a revenue line.
- **Agent-to-agent commerce**: one Elyra account's agent paying another's
  request is already supported; a directory of agents that accept requests
  would make it a network.
- **EVM and Sui payments**, using the sealed-transaction paths those chains
  already have.
- **The Android app**: the Agents page and the pay page.

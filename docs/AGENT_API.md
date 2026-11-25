# Elyra for AI agents

Elyra's live market context, for any AI agent: Claude, ChatGPT, Cursor or
a bot you wrote yourself. Agents reach it over MCP (`/api/mcp`) or plain
HTTP (`/api/v1/tools`). The market and account tools are read-only.

A key whose owner has granted it a **mandate** also gets the **rails**: tools
that ask for transactions — swaps, USDC payments, perp orders — and ask to be
paid. Each ask is held to the mandate, recorded in the owner's ledger and
answered with a receipt. Swaps and payments are signed by the owner in their
own wallet; Elyra holds no key. See [Agent rails](#agent-rails) and
`docs/AGENT_RAILS.md`.

## Get a key

In Elyra, open **Connections**, find **AI agents** and choose
**Create key**. Name the key after the agent that will use it.

- **Market data only** is the default.
- Tick **Also let it read my portfolio…** only if the agent should see your
  own holdings, positions, orders and activity.

The key (`elyra_ak_…`) is shown once. Elyra stores only a SHA-256
fingerprint of it, so if you lose a key, revoke it and create another.
Revoking takes effect immediately.

## Connect

**Claude Code**

```sh
claude mcp add --transport http elyra https://api.getelyra.xyz/api/mcp \
  --header "Authorization: Bearer elyra_ak_…"
```

**Any MCP client that takes a JSON config** (Cursor, Windsurf and others)

```json
{
  "mcpServers": {
    "elyra": {
      "type": "http",
      "url": "https://api.getelyra.xyz/api/mcp",
      "headers": { "Authorization": "Bearer elyra_ak_…" }
    }
  }
}
```

**Plain HTTP**

```sh
curl https://api.getelyra.xyz/api/v1/tools -H "Authorization: Bearer elyra_ak_…"
curl -X POST https://api.getelyra.xyz/api/v1/tools/get_market_snapshot \
  -H "Authorization: Bearer elyra_ak_…" -H "content-type: application/json" \
  -d '{"symbols":["BTC","NVDA"]}'
```

The REST call returns one of these:

| Status | Body or meaning |
|---|---|
| 200 | `{ ok: true, result }` |
| 200 | `{ ok: false, result: { error } }` when the data source failed |
| 401 | No key, or the key is not valid |
| 403 | The tool needs the account scope |
| 404 | No such tool |
| 429 | Over a limit |

## What an agent can reach

**Market data** (every key):

- Prices from Pyth: crypto, US and Asian equities, FX and metals.
- Candle summaries, perpetual funding and open interest.
- Polymarket events, markets, order books, history, execution estimates and
  Elyra's prediction signals and strategy backtests.
- Solana token prices and Raydium pools.
- SEC-filing company research.
- Technical strategy backtests.
- Data-source health.

**Your account** (keys created with that box ticked):

- Portfolio overview, holdings and risk.
- Positions, open orders and recent fills across your connected venues.
- Solana DeFi positions.
- Prediction-market positions, exposure and activity.
- Your watchlist, past signals and alerts.

The authority is the allowlist in `lib/agentApi/tools.ts`. A tool Elyra's
assistant gains later is not exposed to agents until someone adds it there.

Market tools run with no account attached, so a signal or backtest an agent
runs is not saved to your history. Account tools read the wallets on your
profile, never an address an agent passes in.

## Agent rails

Granted in Elyra → **Agents**, per key: which kinds the key may ask for, the
assets, a per-transaction and a daily cap in USD, the payees it may pay, an
end date, and whether perp orders run without review (paper unless live is
also allowed). Without a live mandate a key sees none of these tools.

| Tool | Needs | What it does |
|---|---|---|
| `rails_mandate` | a mandate | What this key may ask for, and how much of today's cap is left. Call it first. |
| `rails_propose_swap` | `swap` | Ask the owner to swap listed tokens in their Solana wallet (Jupiter). Simulated against their accounts before they sign. |
| `rails_propose_payment` | `payment` | Ask the owner to pay USDC on Solana: `to` + `amount`, a `solanaPayUrl`, or an Elyra `requestId`. The payee is screened against the OFAC list. |
| `rails_propose_perp_order` | `perp_order` | A Hyperliquid market order with TP/SL in percent. Runs at once if the mandate lets perps run; otherwise the owner approves it. |
| `rails_intent_status` | a mandate | One of this key's intents: status, reasons, what settled on-chain, receipt. |
| `rails_list_intents` | a mandate | This key's recent intents. |
| `rails_create_payment_request` | `payment_request` | Ask to be paid USDC to the owner's Solana wallet: returns a pay page and a `solana:` URL. |
| `rails_payment_request_status` | `payment_request` | One of this key's requests, checked against the chain. |

Every proposal returns the **intent** with a `status`:

- `pending` — waiting for the owner. Poll `rails_intent_status`; it lapses at
  `expiresAt` (30 minutes).
- `approved` — the owner accepted and is signing.
- `executed` — done, proven on-chain (`result` holds the signature and the
  balance changes the chain recorded), or the perp position opened.
- `rejected` — outside the mandate; `reasons` say why. Nothing happened.
- `declined`, `expired`, `failed`.

`receipt` is the SHA-256 of the proposal's event in the owner's ledger. An
intent is refused, and recorded as refused, when it is outside the mandate,
cannot be priced, or pays an address that is sanctioned or cannot be
screened. Invalid input (an unknown token, a bad amount) is an error and is
not recorded.

A payment request is a standard Solana Pay transfer request with a reference
key, paid from any Solana Pay wallet. Elyra settles it when a transaction
carrying the reference raises the recipient's USDC by at least the amount —
read from the chain, never from the payer — and the money goes straight to
the owner's wallet.

## AI funds

A key can also be the **manager of an AI fund** its owner launched in Elyra →
**Funds** (`docs/AI_FUNDS.md`). While it manages an open fund — one at a time —
the key sees four more tools; they act on that fund only and take no fund id.

| Tool | What it does |
|---|---|
| `fund_overview` | The owner's brief, the charter, the book marked to market now (NAV, cash, NAV per unit, high-water mark, drawdown, today, exposure, free margin), open positions, recent trades, `canOpen`, `blockers` and `maxNewPositionUsd`. Read-only. Call it before every decision. |
| `fund_open_position` | A market long or short on one of the charter's Hyperliquid perps, with TP/SL in percent and an optional `thesis` for the journal. Returns `opened`, `refused` (every reason) or `failed`, and a `receipt`. Paper or live is the fund's. |
| `fund_close_position` | Close one of the fund's positions by `positionId`, with an optional `reason`. |
| `fund_write_note` | Add to the fund's journal (2,000 characters). Shown to the owner as the agent's words; never acted on. |

Every order is held to the charter (markets, shorts, largest position as a
share of NAV, gross exposure, leverage, open positions, the daily loss limit,
the drawdown limit), then to Elyra's trading limits and the owner's own
account limits. Every decision, refusals included, is in the owner's ledger;
the receipt is its hash. Elyra halts the fund and closes everything at its
drawdown limit whether or not the agent is running. The agent cannot move
capital, change the charter or choose paper or live.

## Limits

- 60 calls a minute and 2,000 a day per key (UTC).
- Up to 10 active keys per account.

`tools/list`, `ping` and `initialize` don't count toward the limits;
every `tools/call` does.

## The MCP server

- **Transport.** Streamable HTTP, stateless, tools only, protocol versions
  2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05.
- **Requests.** Each POST is answered with one JSON body. A notification
  gets 202. GET and DELETE get 405.
- **Origins.** A browser `Origin` other than Elyra's own is refused with 403.
  An unsupported `MCP-Protocol-Version` gets 400.
- **Authentication.** A bearer key only. OAuth (so that claude.ai custom
  connectors can sign in without pasting a key) is the natural next step.

The code lives in:

- `lib/agentApi/mcp.ts` (JSON-RPC)
- `lib/rails/` (mandates, intents, the ledger, payment requests)
- `lib/agentApi/keys.ts` (keys and limits)
- `app/api/mcp/route.ts` (transport)

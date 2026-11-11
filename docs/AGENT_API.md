# Elyra for AI agents

Elyra's live market context, for any AI agent: Claude, ChatGPT, Cursor or
a bot you wrote yourself. Agents reach it over MCP (`/api/mcp`) or plain
HTTP (`/api/v1/tools`). Everything is read-only: no tool places, changes or
cancels an order, moves funds, or changes a setting.

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
- `lib/agentApi/keys.ts` (keys and limits)
- `app/api/mcp/route.ts` (transport)

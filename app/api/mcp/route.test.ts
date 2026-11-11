import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Elyra's agent API against the fake database: keys are hashed, scoped,
   limited and revocable; the MCP endpoint follows the Streamable HTTP rules
   (Origin, protocol version, 202 for notifications, 405 for GET); outside
   agents see only allowlisted read tools; market tools run with no account
   at all; and account tools read only the key owner's own addresses. The
   tool registry is a stand-in that records the context each call ran with.
--------------------------------------------------------------------------- */

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  user: null as null | { userId: string; profileStore: string },
  calls: [] as Array<{ name: string; args: Record<string, unknown>; context: Record<string, unknown> }>,
  failNext: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: async () => state.user,
  hasProfile: (user: { userId: string | null; profileStore: string }) => user.userId !== null && user.profileStore === "ready",
  databaseUnavailableMessage: (feature: string) => `${feature} needs the database.`,
}));
vi.mock("@/lib/prediction/account", () => ({ predictionAccount: async (userId: string) => ({ address: `poly-${userId}` }) }));
vi.mock("@/lib/agent/tools/registry", () => {
  const def = (name: string) => ({ name, description: `${name} description`, parameters: { type: "object", properties: {} } });
  return {
    toolDefinitions: () => [def("get_market_snapshot"), def("backtest_run"), def("portfolio_overview"), def("prediction_create_alert"), def("prediction_delete_alert")],
    executeTool: async (name: string, args: Record<string, unknown>, context: Record<string, unknown>) => {
      state.calls.push({ name, args, context });
      if (state.failNext) {
        state.failNext = false;
        return { ok: false, result: { error: "Pyth is unreachable", note: "Say so rather than estimating it." } };
      }
      return { ok: true, result: { tool: name, price: 101.5 } };
    },
  };
});

const { CALLS_PER_DAY, CALLS_PER_MINUTE, KEY_PREFIX, generateKey, hashKey, looksLikeKey } = await import("@/lib/agentApi/keys");
const { resetRateLimits } = await import("@/lib/personalized/session");
const mcp = await import("@/app/api/mcp/route");
const restList = await import("@/app/api/v1/tools/route");
const restCall = await import("@/app/api/v1/tools/[name]/route");
const keys = await import("@/app/api/agent-keys/route");
const keyById = await import("@/app/api/agent-keys/[id]/route");

const as = (userId: string | null) => {
  state.user = userId === null ? null : { userId, profileStore: "ready" };
};

async function newKey(userId: string, account = false): Promise<{ key: string; id: string }> {
  as(userId);
  const response = await keys.POST(new Request("http://test/api/agent-keys", { method: "POST", body: JSON.stringify({ name: "Claude Code", account }) }));
  expect(response.status).toBe(201);
  const body = (await response.json()) as { key: string; created: { id: string } };
  return { key: body.key, id: body.created.id };
}

function rpc(key: string | null, body: unknown, headers: Record<string, string> = {}) {
  return mcp.POST(
    new Request("http://test/api/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        ...(key === null ? {} : { authorization: `Bearer ${key}` }),
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const call = (key: string, name: string, args: unknown = {}, id = 7) => rpc(key, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const result = async (response: Response) => ((await response.json()) as { result: Record<string, unknown> }).result;

beforeEach(() => {
  state.db = new FakeSupabase();
  state.db.seed("profiles", [
    { id: "owner", wallet_address: "0xowner", solana_address: "SoLowner" },
    { id: "other", wallet_address: "0xother", solana_address: "SoLother" },
  ]);
  state.calls = [];
  state.failNext = false;
  resetRateLimits();
});

describe("keys", () => {
  it("are elyra_ak_ plus 32 base-62 characters, unique, and stored only as a hash", async () => {
    const key = generateKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(looksLikeKey(key)).toBe(true);
    expect(new Set(Array.from({ length: 200 }, generateKey)).size).toBe(200);

    const created = await newKey("owner");
    const [row] = state.db.rows("agent_keys");
    expect(row.key_hash).toBe(hashKey(created.key));
    expect(JSON.stringify(row)).not.toContain(created.key);
    expect(row.prefix).toBe(created.key.slice(0, KEY_PREFIX.length + 4));
    expect(row.scopes).toEqual(["market"]);
  });

  it("are listed and revoked only by their owner, and a revoked key stops working at once", async () => {
    const created = await newKey("owner");
    as("other");
    expect(((await (await keys.GET(new Request("http://test/api/agent-keys"))).json()) as { keys: unknown[] }).keys).toEqual([]);
    expect((await keyById.DELETE(new Request("http://test"), { params: Promise.resolve({ id: created.id }) })).status).toBe(404);

    expect((await rpc(created.key, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    as("owner");
    expect((await keyById.DELETE(new Request("http://test"), { params: Promise.resolve({ id: created.id }) })).status).toBe(200);
    expect((await rpc(created.key, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });

  it("need a name and a session, and stop at ten active keys", async () => {
    as(null);
    expect((await keys.POST(new Request("http://test", { method: "POST", body: "{}" }))).status).toBe(401);
    as("owner");
    expect((await keys.POST(new Request("http://test", { method: "POST", body: JSON.stringify({ name: " " }) }))).status).toBe(400);
    for (let index = 0; index < 10; index += 1) await newKey("owner");
    const eleventh = await keys.POST(new Request("http://test", { method: "POST", body: JSON.stringify({ name: "one more" }) }));
    expect(eleventh.status).toBe(400);
  });
});

describe("the MCP endpoint's transport rules", () => {
  it("refuses a missing or malformed key with 401 and a Bearer challenge", async () => {
    const missing = await rpc(null, { jsonrpc: "2.0", id: 1, method: "ping" });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect((await rpc("elyra_ak_short", { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
    expect((await rpc(generateKey(), { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(401);
  });

  it("refuses a foreign browser origin with 403, and an unsupported protocol version with 400", async () => {
    const { key } = await newKey("owner");
    expect((await rpc(key, { jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await rpc(key, { jsonrpc: "2.0", id: 1, method: "ping" }, { origin: "https://getelyra.xyz" })).status).toBe(200);
    expect((await rpc(key, { jsonrpc: "2.0", id: 1, method: "ping" }, { "mcp-protocol-version": "1999-01-01" })).status).toBe(400);
    expect((await rpc(key, { jsonrpc: "2.0", id: 1, method: "ping" }, { "mcp-protocol-version": "2025-06-18" })).status).toBe(200);
  });

  it("answers GET and DELETE with 405, notifications with 202, and bad JSON with a parse error", async () => {
    expect(mcp.GET().status).toBe(405);
    expect(mcp.DELETE().status).toBe(405);
    const { key } = await newKey("owner");
    const accepted = await rpc(key, { jsonrpc: "2.0", method: "notifications/initialized" });
    expect(accepted.status).toBe(202);
    expect(await accepted.text()).toBe("");
    const bad = await rpc(key, "{not json");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: number } }).error.code).toBe(-32700);
  });

  it("negotiates the protocol version and declares tools only", async () => {
    const { key } = await newKey("owner");
    const known = await result(await rpc(key, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }));
    expect(known).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "elyra" } });
    const unknown = await result(await rpc(key, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1.0.0" } }));
    expect(unknown.protocolVersion).toBe("2025-11-25");
    const missing = (await (await rpc(key, { jsonrpc: "2.0", id: 3, method: "resources/list" })).json()) as { error: { code: number } };
    expect(missing.error.code).toBe(-32601);
  });

  it("handles a batch, answering requests and skipping notifications", async () => {
    const { key } = await newKey("owner");
    const response = await rpc(key, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    ]);
    const body = (await response.json()) as Array<{ id: number }>;
    expect(body.map((entry) => entry.id)).toEqual([1, 2]);
  });
});

describe("what an agent can reach", () => {
  it("lists only allowlisted read tools, and account tools only for an account key", async () => {
    const market = await newKey("owner");
    const account = await newKey("owner", true);
    const names = async (key: string) =>
      ((await result(await rpc(key, { jsonrpc: "2.0", id: 1, method: "tools/list" }))).tools as Array<{ name: string; annotations: { readOnlyHint: boolean } }>);
    const marketTools = await names(market.key);
    expect(marketTools.map((tool) => tool.name)).toEqual(["get_market_snapshot", "backtest_run"]);
    expect(marketTools.every((tool) => tool.annotations.readOnlyHint)).toBe(true);
    expect((await names(account.key)).map((tool) => tool.name)).toEqual(["get_market_snapshot", "backtest_run", "portfolio_overview"]);
  });

  it("never exposes a tool that writes, even to an account key", async () => {
    const { key } = await newKey("owner", true);
    for (const name of ["prediction_create_alert", "prediction_delete_alert"]) {
      const body = (await (await call(key, name, { market: "x" })).json()) as { error: { code: number; message: string } };
      expect(body.error).toEqual({ code: -32602, message: `Unknown tool: ${name}` });
    }
    expect(state.calls).toEqual([]);
  });

  it("runs market tools with no account, so nothing is read from or saved to anyone's records", async () => {
    const { key } = await newKey("owner", true);
    const ran = await result(await call(key, "backtest_run", { strategy: "rsi" }));
    expect(ran.isError).toBe(false);
    expect(ran.structuredContent).toEqual({ tool: "backtest_run", price: 101.5 });
    expect(JSON.parse((ran.content as Array<{ text: string }>)[0].text)).toEqual({ tool: "backtest_run", price: 101.5 });
    expect(state.calls[0].context).toEqual({ userId: "", sessionWallet: null, solanaAddress: null, polymarketAddress: null });
  });

  it("reads only the key owner's own addresses for account tools, whatever the arguments say", async () => {
    const { key } = await newKey("owner", true);
    await call(key, "portfolio_overview", { userId: "other", address: "SoLother" });
    expect(state.calls[0].context).toEqual({ userId: "owner", sessionWallet: "0xowner", solanaAddress: "SoLowner", polymarketAddress: "poly-owner" });
  });

  it("refuses an account tool to a market-only key, as a readable tool error", async () => {
    const { key } = await newKey("owner");
    const refused = await result(await call(key, "portfolio_overview"));
    expect(refused.isError).toBe(true);
    expect(state.calls).toEqual([]);
  });

  it("passes a failed source through as a tool error the model can read", async () => {
    const { key } = await newKey("owner");
    state.failNext = true;
    const failed = await result(await call(key, "get_market_snapshot", { symbols: ["BTC"] }));
    expect(failed.isError).toBe(true);
    expect((failed.content as Array<{ text: string }>)[0].text).toContain("Pyth is unreachable");
  });
});

describe("limits", () => {
  it(`stops a key at ${CALLS_PER_MINUTE} calls a minute`, async () => {
    const { key } = await newKey("owner");
    for (let index = 0; index < CALLS_PER_MINUTE; index += 1) {
      expect((await result(await call(key, "get_market_snapshot", {}, index))).isError).toBe(false);
    }
    const limited = await result(await call(key, "get_market_snapshot"));
    expect(limited.isError).toBe(true);
    expect((limited.content as Array<{ text: string }>)[0].text).toContain("a minute");
  });

  it(`stops a key at ${CALLS_PER_DAY.toLocaleString("en-US")} calls a day, counted in the database`, async () => {
    const { key, id } = await newKey("owner");
    state.db.seed("agent_key_usage", [{ key_id: id, day: new Date().toISOString().slice(0, 10), calls: CALLS_PER_DAY }]);
    const limited = await result(await call(key, "get_market_snapshot"));
    expect(limited.isError).toBe(true);
    expect((limited.content as Array<{ text: string }>)[0].text).toContain("for today");
    expect(state.calls).toEqual([]);
  });

  it("does not count pings, listing or initialisation", async () => {
    const { key, id } = await newKey("owner");
    await rpc(key, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    await rpc(key, { jsonrpc: "2.0", id: 2, method: "ping" });
    expect(state.db.rows("agent_key_usage").filter((row) => row.key_id === id)).toEqual([]);
  });
});

describe("the REST mirror", () => {
  const rest = (key: string | null, name: string, body: string) =>
    restCall.POST(
      new Request(`http://test/api/v1/tools/${name}`, { method: "POST", headers: key === null ? {} : { authorization: `Bearer ${key}` }, body }),
      { params: Promise.resolve({ name }) },
    );

  it("lists the key's tools and calls one with the same rules", async () => {
    const { key } = await newKey("owner");
    const listed = (await (await restList.GET(new Request("http://test/api/v1/tools", { headers: { authorization: `Bearer ${key}` } }))).json()) as { tools: Array<{ name: string }> };
    expect(listed.tools.map((tool) => tool.name)).toEqual(["get_market_snapshot", "backtest_run"]);

    const ok = await rest(key, "get_market_snapshot", JSON.stringify({ symbols: ["BTC"] }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, result: { tool: "get_market_snapshot", price: 101.5 } });
    expect(state.calls[0].args).toEqual({ symbols: ["BTC"] });

    expect((await rest(key, "portfolio_overview", "{}")).status).toBe(403);
    expect((await rest(key, "prediction_create_alert", "{}")).status).toBe(404);
    expect((await rest(key, "get_market_snapshot", "[1]")).status).toBe(400);
    expect((await rest(null, "get_market_snapshot", "{}")).status).toBe(401);
  });
});

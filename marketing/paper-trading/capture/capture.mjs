/* Captures the paper-trading screens from the scratch site at 2x (3200×1800).
   node capture.mjs <base> <outDir> [only] */
import { chromium } from "playwright-core";
import os from "node:os";
import fs from "node:fs";
import { automationBody, liveMids, makeState, paperBody, portfolioBody, tradeView, walletBody } from "./mocks.mjs";

const base = process.argv[2] ?? "http://localhost:3151";
const outDir = process.argv[3] ?? "shots";
const only = process.argv[4] ?? null;
fs.mkdirSync(outDir, { recursive: true });

const mids = await liveMids();
const state = makeState(mids);
console.log("mids", { SOL: mids.SOL, BTC: mids.BTC, ETH: mids.ETH });

const browser = await chromium.launch({ executablePath: `${os.homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell` });

async function session({ paper = "none", width = 1600, height = 900, scale = 2, mobile = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
  const ctl = { paper, extraOpen: [], fresh: null, empty: paper === "none" };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  await context.route("**/api/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    if (p === "/api/paper" && m === "GET") return json(route, paperBody(ctl.paper, state, mids, ctl.fresh));
    if (p === "/api/paper" && m === "PATCH") {
      const body = JSON.parse(req.postData() ?? "{}");
      if (!body.active) ctl.paperOff = true;
      const out = paperBody(ctl.paper, state, mids, ctl.fresh);
      if (out.account) out.account.active = body.active;
      return json(route, out);
    }
    if (p === "/api/paper/claim") { ctl.paper = "fresh"; return json(route, paperBody("fresh", state, mids), 201); }
    if (p === "/api/automation" && m === "GET") return json(route, automationBody(state, mids, ctl.extraOpen, ctl.empty));
    if (p === "/api/automation/trade" && m === "POST") {
      const b = JSON.parse(req.postData() ?? "{}");
      const mid = mids[b.coin];
      const entry = Number((mid * (b.side === "long" ? 1.0005 : 0.9995)).toPrecision(6));
      const size = b.sizeUsd / entry;
      const pos = tradeView({ id: "new-1", ruleId: null, ruleName: "Market order", coin: b.coin, side: b.side, size, entry, takeProfit: Number((entry * (1 + (b.side === "long" ? 1 : -1) * b.takeProfitPct / 100)).toPrecision(6)), stopLoss: Number((entry * (1 - (b.side === "long" ? 1 : -1) * b.stopLossPct / 100)).toPrecision(6)), at: 0, reason: "Market order from the chart" }, { expectedPrice: Number(mid.toPrecision(6)), slippageBps: 5.0 });
      ctl.extraOpen = [pos];
      ctl.fresh = { open: [{ coin: b.coin, side: b.side, size, entry, lev: b.leverage }], closed: [] };
      return json(route, { position: pos, error: null }, 201);
    }
    if (p === "/api/wallet") return json(route, walletBody(mids));
    if (p === "/api/wallet/activity") return json(route, { items: [], notes: [], error: null, unconfigured: false });
    if (p === "/api/portfolio") return json(route, portfolioBody(mids));
    if (p === "/api/portfolio/history") return json(route, { points: [], basis: "none", uncovered: [], coveragePct: 0, error: null });
    if (p === "/api/alerts") return json(route, { alerts: [], delivery: null, appDelivery: "none", error: null });
    if (p === "/api/actions") return json(route, { actions: [], error: null });
    if (p === "/api/market-reports") return json(route, { reports: [], error: null });
    if (p === "/api/telegram/link") return json(route, { linked: false, error: null });
    if (p === "/api/tracker/stream") return route.fulfill({ status: 204, body: "" });
    if (p.startsWith("/api/funds")) return json(route, { funds: [], error: null });
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
  return { context, page, ctl };
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log("shot", name);
};
const want = (name) => only === null || only.split(",").includes(name);

/* Waits for the chart's prices to land: the header's High shows a number. */
async function settle(page, ms = 12000) {
  await page.waitForTimeout(ms);
  await page.getByText(/Pyth · updated/).first().waitFor({ timeout: 90000 }).catch(() => console.log("prices did not land"));
  await page.waitForTimeout(2500);
}

if (want("flow")) {
  const { context, page } = await session({ paper: "none" });
  await page.goto(`${base}/`, { waitUntil: "load" });
  await settle(page, 16000);
  await shot(page, "01-home-live");
  await page.getByRole("radio", { name: "Paper", exact: true }).click();
  await page.waitForTimeout(900);
  await shot(page, "02-claim");
  await page.getByRole("button", { name: /Claim \$100,000/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, "03-home-paper");
  /* The ticket, for the chart's market. */
  await page.getByRole("button", { name: "Trade", exact: true }).first().click();
  await page.waitForTimeout(4000);
  const dialog = page.getByRole("dialog");
  const fields = dialog.locator("input");
  await fields.nth(0).fill("2500");
  await dialog.locator("select").selectOption("3");
  await page.waitForTimeout(3500);
  await shot(page, "04-ticket");
  await dialog.getByRole("radio", { name: "Limit", exact: true }).click();
  await page.waitForTimeout(800);
  await dialog.getByRole("button", { name: /^S1/ }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "05-limit");
  await dialog.getByRole("radio", { name: "Market", exact: true }).click();
  await page.waitForTimeout(600);
  await dialog.getByRole("button", { name: /now$/ }).click();
  await page.waitForTimeout(2500);
  await dialog.evaluate((el) => el.querySelector("[role=status]")?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(600);
  await shot(page, "06-filled");
  await context.close();
}

if (want("trading")) {
  const { context, page } = await session({ paper: "trading" });
  await page.goto(`${base}/`, { waitUntil: "load" });
  await settle(page, 16000);
  await shot(page, "07-home-trading");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.waitForTimeout(1000);
  await shot(page, "08-account");
  await page.getByRole("button", { name: "Reset balance" }).click();
  await page.waitForTimeout(700);
  await shot(page, "09-reset");
  await context.close();
}

if (want("automation")) {
  const { context, page } = await session({ paper: "trading" });
  await page.goto(`${base}/automation`, { waitUntil: "load" });
  await settle(page, 12000);
  await shot(page, "10-automation");
  const analysis = page.getByText("Paper trade analysis").first();
  await analysis.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "11-automation-analysis");
  const trades = page.getByText("Trade now").first();
  await trades.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "12-automation-trade-now");
  await context.close();
}

if (want("cards")) {
  const { context, page } = await session({ paper: "trading", width: 1600, height: 2600 });
  await page.goto(`${base}/automation`, { waitUntil: "load" });
  await settle(page, 10000);
  for (const [label, name] of [["Paper trade analysis", "card-analysis"], ["Trades", "card-trades"], ["Trade now", "card-trade-now"], ["Rules", "card-rules"], ["Limit orders", "card-limits"]]) {
    const el = page.locator(`section[aria-label="${label}"]`).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await el.screenshot({ path: `${outDir}/${name}.png` }).then(() => console.log("shot", name)).catch((e) => console.log("miss", name, e.message.slice(0, 80)));
  }
  await context.close();
}

await browser.close();

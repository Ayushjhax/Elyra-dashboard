"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import {
  CandlestickChart,
  Check,
  ChevronDown,
  LineChart,
  Maximize,
  Minimize,
  MousePointer2,
  RotateCcw,
  SlidersHorizontal,
  MousePointerClick,
  PenTool,
  Pointer,
  Star,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Tip } from "@/components/shell/RouteDrawer";
import { TradePanel } from "@/components/trade/TradePanel";
import { clearTicketRequest, useTicketRequest } from "@/lib/trade/ticketRequest";
import { AssetSelectDialog } from "@/components/panels/AssetSelectDialog";
import { ChartAlerts } from "@/components/panels/ChartAlerts";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { EmptyState } from "@/components/ui/EmptyState";
import { Popover } from "@/components/ui/Popover";
import { formatCompactUsd, formatPrice, formatPriceUsd } from "@/lib/format";
import { WORKSPACE_GAP, WORKSPACE_PAD } from "@/lib/layout";
import { priceDecimals } from "@/lib/market/precision";
import { legendSource } from "@/lib/market/chartBrief";
import { EMA_PERIOD, intervalLabel } from "@/lib/market/chartFacts";
import { INTERVALS, TV_SCRIPT, chartWidgetConfig } from "@/lib/market/chartWidget";
import { nearestLevels } from "@/lib/market/levels";
import { useChartFacts } from "@/lib/market/useChartFacts";
import { useLevels } from "@/lib/market/useLevels";
import { useAssets, usePrice, type FeedStatus } from "@/lib/market/usePrices";
import type { PriceRow, PriceSource } from "@/lib/market/pyth/types";
import { useElyraStore } from "@/lib/store";
import type { Interval } from "@/lib/types";
import { useMinute, useSecond } from "@/lib/useClock";
import { useFirstScreenFit } from "@/lib/useFirstScreenFit";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";
import { intlLocale, type Locale } from "@/lib/i18n/locales";

/**
 * TradingView's free widget, in its `tv.js` form.
 *
 * The newer `embed-widget-advanced-chart.js` accepts `backgroundColor` and
 * `gridColor` but silently drops `overrides`, which leaves the candles in
 * TradingView's default teal/red — a direct contradiction of the brand's
 * market semantics. `tv.js` honours all four, so the chart can be Sage up and
 * Clay down like every other price in the product.
 *
 * The crosshair, the OHLC legend, scroll-to-zoom and drag-to-pan are the
 * widget's own. Everything around it — the market, the interval, the series
 * style and the studies — is the store's, so it survives a reload and a trip
 * to another route.
 */
type TradingViewGlobal = {
  widget: new (config: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

/** Loaded once for the life of the page, however often the chart remounts. */
let scriptPromise: Promise<TradingViewGlobal> | null = null;

function loadTradingView(): Promise<TradingViewGlobal> {
  if (window.TradingView) return Promise.resolve(window.TradingView);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TV_SCRIPT;
    script.async = true;
    script.onload = () =>
      window.TradingView
        ? resolve(window.TradingView)
        : reject(new Error("tv.js loaded without a widget constructor"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("tv.js failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Widget colours come out of the stylesheet, not out of this file. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const noSubscription = () => () => {};

/**
 * Whether this browser can put the chart card full screen. Safari on an
 * iPhone cannot — the API is not there — so the button would do nothing; it
 * is drawn on the server and dropped once the browser says so.
 */
function useCanFullscreen(): boolean {
  return useSyncExternalStore(noSubscription, () => document.fullscreenEnabled === true, () => true);
}

type Status = "loading" | "ready" | "error";

/** Each price source's own name, untranslated, like "Pyth". */
const SOURCE_NAME: Record<PriceSource, string> = {
  pyth: "Pyth",
  yahoo: "Yahoo Finance",
  binance: "Binance",
  okx: "OKX",
  hyperliquid: "Hyperliquid",
};

const TOOL = cn(
  "metallic chart-control type-label inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

/**
 * The toolbar's content width (inside its padding) under which its tools
 * drop their labels and keep only their icons — each then named by a
 * tooltip on hover and keyboard focus. Measured: the intervals, four
 * labelled tools, the three icon actions and Trade need about 867px on one
 * row, so this leaves room for an armed-alert count beside "Alerts".
 */
const LABELLED_TOOLBAR_PX = 880;

/**
 * Whether an element is narrower than `width`. Measured rather than a
 * container query because the answer decides markup — a label, or a tooltip
 * naming an icon — not only styling. ResizeObserver reports before paint.
 */
function useNarrowerThan(ref: RefObject<HTMLElement | null>, width: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, width]);
  return narrow;
}

/** One labelled figure in the header. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="type-label whitespace-nowrap text-text-muted">{label}</span>
      <span className="type-data whitespace-nowrap text-text-primary">{value}</span>
    </div>
  );
}

function Indicators({ iconOnly }: { iconOnly: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const indicators = useElyraStore((state) => state.chartIndicators);
  const toggleIndicator = useElyraStore((state) => state.toggleIndicator);
  const count = Number(indicators.ema) + Number(indicators.volume) + Number(indicators.levels !== false);

  const rows: Array<{ key: keyof typeof indicators; label: string; hint: string }> = [
    { key: "ema", label: t("Moving average (EMA 20)"), hint: t("Exponential, on the price pane") },
    { key: "volume", label: t("Volume"), hint: t("Bars under the price") },
    { key: "levels", label: t("Pivot levels"), hint: t("Prior day's support and resistance, listed under the toolbar") },
  ];

  return (
    <Popover
      id="chart-indicators"
      label={t("Indicators")}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-64 p-1.5"
      trigger={
        <Tip label={iconOnly ? t("Indicators") : null}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="chart-indicators"
            aria-haspopup="dialog"
            onClick={() => setOpen(!open)}
            aria-label={t("Indicators, {count} on", { count })}
            className={cn(
              TOOL,
              iconOnly ? "px-2" : "px-2.5",
              open
                ? "bg-surface-hover text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <SlidersHorizontal size={15} strokeWidth={1.5} aria-hidden />
            {!iconOnly && <span>{t("Indicators")}</span>}
            {count > 0 && <span className="type-data-sm text-text-muted">{count}</span>}
          </button>
        </Tip>
      }
    >
      {rows.map((row) => (
        <label
          key={row.key}
          className="flex cursor-pointer items-start gap-2.5 rounded-control px-2.5 py-2 hover:bg-surface-hover"
        >
          <input
            type="checkbox"
            checked={indicators[row.key] !== false}
            onChange={() => toggleIndicator(row.key)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="type-body-sm block text-text-primary">{row.label}</span>
            <span className="type-label block text-text-muted">{row.hint}</span>
          </span>
        </label>
      ))}
    </Popover>
  );
}

/**
 * A compact single-choice menu in the toolbar — the chart type, the drawing
 * tools. The trigger names what is on; the list is a radio group, focus
 * lands on the current choice, and choosing returns focus to the trigger.
 */
function ToolbarMenu<T extends string>({
  id,
  label,
  icon: Icon,
  triggerLabel,
  options,
  value,
  onChange,
  iconOnly,
  pressed = false,
  note,
}: {
  id: string;
  /** What is being chosen: "Chart type". */
  label: string;
  icon: LucideIcon;
  /** The trigger's own text: the current choice, or the tool's name. */
  triggerLabel: string;
  options: ReadonlyArray<{ value: T; label: string; icon: LucideIcon }>;
  value: T;
  onChange: (value: T) => void;
  iconOnly: boolean;
  /** The tool is on, so the trigger shows as pressed. */
  pressed?: boolean;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <Popover
      id={id}
      label={label}
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-60 p-1.5"
      trigger={
        <Tip label={iconOnly ? `${label}: ${current.label}` : null}>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-haspopup="dialog"
            aria-label={`${label}: ${current.label}`}
            onClick={() => setOpen(!open)}
            className={cn(
              TOOL,
              iconOnly ? "gap-1 px-2" : "px-2.5",
              open || pressed
                ? "bg-surface-hover text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <Icon size={15} strokeWidth={1.5} aria-hidden />
            {!iconOnly && <span>{triggerLabel}</span>}
            <ChevronDown
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn(
                "text-text-muted transition-transform duration-[var(--dur-fast)] ease-brand motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </button>
        </Tip>
      }
    >
      <div role="radiogroup" aria-label={label} className="flex flex-col">
        {options.map((option) => {
          const on = option.value === current.value;
          const OptionIcon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-autofocus={on ? "" : undefined}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className={cn(
                "type-body-sm flex items-center gap-2.5 rounded-control px-2.5 py-2 text-left",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                on ? "text-text-primary" : "text-text-secondary",
              )}
            >
              <OptionIcon size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
              <span className="min-w-0 flex-1">{option.label}</span>
              <Check size={14} strokeWidth={1.75} aria-hidden className={cn("shrink-0", on ? "text-accent" : "opacity-0")} />
            </button>
          );
        })}
      </div>
      {note !== undefined && <p className="type-label border-t border-border-subtle px-2.5 pb-1 pt-2 mt-1 text-text-muted">{note}</p>}
    </Popover>
  );
}

/**
 * The chart's legend, outside the plot: the live quote, the last COMPLETED
 * candle's close at the chart's interval, and — when the study is on — the
 * EMA 20 of those closes, each labelled so a forming candle's latest trade is
 * never read as a close. TradingView's own legend inside the plot shows the
 * candle under the crosshair; the widget takes no labels from outside it.
 * The decision brief reads the same figures (lib/market/useChartFacts.ts).
 */
function ChartLegend({
  symbol,
  assetLoading,
  row,
  interval,
  showEma,
}: {
  /** The market's ticker when the exchange sources list it (crypto), else null. */
  symbol: string | null;
  assetLoading: boolean;
  row: PriceRow | undefined;
  interval: Interval;
  showEma: boolean;
}) {
  const t = useT();
  const { data, loading } = useChartFacts(symbol, interval);
  const now = useMinute();
  const label = intervalLabel(interval);
  const close = data?.close ?? null;
  const ema = data?.ema ?? null;
  const pending = assetLoading || (symbol !== null && loading);

  const value = (figure: number | null) =>
    pending ? (
      <span aria-hidden className="skeleton inline-block h-3.5 w-16 align-middle" />
    ) : (
      <span className={cn("type-data-sm", figure === null ? "text-text-muted" : "text-text-primary")}>
        {figure === null ? "—" : formatPriceUsd(figure)}
      </span>
    );

  return (
    <dl className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-baseline gap-1.5">
        <dt className="type-label text-text-secondary">{t("Live quote")}</dt>
        <dd className="type-data-sm text-text-primary">{row ? formatPriceUsd(row.price) : "—"}</dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="type-label text-text-secondary">{t("{interval} candle close", { interval: label })}</dt>
        <dd>{value(symbol === null ? null : (close?.value ?? null))}</dd>
      </div>
      {showEma && (
        <div className="flex items-center gap-1.5">
          {/* The study's own line colour, so the figure is matched to it. */}
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-pill bg-accent-quiet" />
          <dt className="type-label text-text-secondary">{t("EMA {period} · {interval}", { period: data?.period ?? EMA_PERIOD, interval: label })}</dt>
          <dd>{value(symbol === null ? null : ema)}</dd>
        </div>
      )}
      {row && data !== null && data.source !== null && (
        <div className="hidden @3xl:block">
          <dt className="sr-only">{t("Source")}</dt>
          <dd className="type-label text-text-muted">{legendSource(row, data, interval, now, t)}</dd>
        </div>
      )}
      {symbol === null && !assetLoading && (
        <div>
          <dt className="sr-only">{t("Source")}</dt>
          <dd className="type-label text-text-muted">{t("No exchange candles for this market")}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Prior-day pivots as a row of labelled levels, with the two either side of
 * the price marked. Listed rather than drawn: the chart is TradingView's
 * iframe and takes no lines from outside it — the drawing tools are how an
 * operator puts a level on the chart itself.
 */
function PivotRow({ id, symbol, price }: { id: string; symbol: string | null; price: number | null }) {
  const t = useT();
  const { data, loading } = useLevels(symbol);
  if (symbol === null) return null;

  if (loading) {
    return (
      <div id={id} aria-hidden className="flex items-center gap-3 border-b border-border-subtle px-4 py-2">
        <span className="skeleton h-3.5 w-64" />
      </div>
    );
  }
  if (!data?.levels) {
    return (
      <p id={id} className="type-label border-b border-border-subtle px-4 py-2 text-text-muted">
        {t("Pivot levels unavailable{value}.", { value: data?.error ? ` — ${data.error}` : "" })}
      </p>
    );
  }

  const levels = data.levels;
  const near = price === null ? null : nearestLevels(levels, price);
  const entries: Array<[string, number]> = [
    ["S2", levels.s2],
    ["S1", levels.s1],
    ["P", levels.pivot],
    ["R1", levels.r1],
    ["R2", levels.r2],
  ];

  return (
    <div
      id={id}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border-subtle px-4 py-2"
      title={t("{source}, candle of {value} UTC", { source: data.source, value: new Date(levels.basedOn).toISOString().slice(0, 10) })}
    >
      <span className="type-label shrink-0 text-text-muted">{t("Pivots · prior day")}</span>
      {entries.map(([name, value]) => {
        const marked =
          near !== null &&
          (near.above?.value === value || near.below?.value === value);
        return (
          <span key={name} className="flex shrink-0 items-baseline gap-1.5">
            {/* Neutral: Sage and Clay mean a price moved, not that a level
                is above or below it. */}
            <span className="type-label text-text-secondary">{name}</span>
            <span className={cn("type-data-sm", marked ? "text-text-primary" : "text-text-muted")}>
              {formatPriceUsd(value)}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Seconds since the feed last published, in words. */
function age(publishedAt: string, now: number, locale: Locale): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(publishedAt)) / 1000));
  const zh = locale === "zh-CN";
  if (seconds < 60) return zh ? `${seconds}秒前` : `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return zh ? `${minutes}分钟前` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return zh ? `${hours}小时前` : `${hours}h ago`;
}

/**
 * The feed's source, how fresh its last reading is, and the time zone the
 * chart is drawn in. Its own component because it ticks every second, and
 * the chart card around it has no reason to re-render that often.
 */
function FeedFooter({
  row,
  status,
  engaged,
}: {
  row: PriceRow | null;
  status: FeedStatus;
  engaged: boolean;
}) {
  const t = useT();
  const now = useSecond();
  const ageMs = row && now !== null ? now - Date.parse(row.publishedAt) : null;
  const stale = status === "error" || (ageMs !== null && ageMs > 60_000);
  const decimals = priceDecimals(row?.price);
  /* A feed Pyth's plan does not cover is priced from a stand-in, named here (lib/market/pyth/standIn.ts). */
  const label =
    status === "loading" && !row ? t("Connecting to Pyth") : status === "error" && !row ? t("Pyth unavailable") : SOURCE_NAME[row?.source ?? "pyth"];
  const clock =
    now === null
      ? "—"
      : new Date(now).toLocaleTimeString(intlLocale(t.locale), { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

  return (
    <div className="@container border-t border-border-subtle">
      <div className="flex items-center gap-4 px-4 py-2.5 compact:px-5">
        <span className="type-label flex min-w-0 flex-1 items-center gap-1.5 text-text-muted">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-pill",
              !row ? "bg-text-muted" : stale ? "bg-negative" : "bg-positive",
            )}
          />
          <span className="shrink-0">
            {label}
            {row && now !== null
              ? stale
                ? t(" · stale, updated {age}", { age: age(row.publishedAt, now, t.locale) })
                : t(" · updated {age}", { age: age(row.publishedAt, now, t.locale) })
              : ""}
          </span>
          {row && (
            <span className="hidden truncate @2xl:inline">
              {t(" · ±{confidence} confidence · {publisherCount} publishers", { confidence: formatPrice(row.confidence, decimals), publisherCount: row.publisherCount })}
              {row.marketSession && row.marketSession !== "regular" ? t(" · {marketSession} session", { marketSession: t(row.marketSession) }) : ""}
            </span>
          )}
        </span>
        <span className="type-label hidden shrink-0 text-text-muted pointer-fine:@4xl:inline">
          {engaged ? t("Scroll zooms · move away to release") : t("Click the chart to zoom and inspect")}
        </span>
        <span className="type-data-sm shrink-0 text-text-muted">{t("{clock} UTC", { clock })}</span>
      </div>
    </div>
  );
}

export function ChartPanel({ focus = false }: { focus?: boolean }) {
  const t = useT();
  const assetId = useElyraStore((state) => state.selectedAssetId);
  const askElyra = useElyraStore((state) => state.askElyra);
  const interval = useElyraStore((state) => state.interval);
  const setInterval = useElyraStore((state) => state.setInterval);
  const chartStyle = useElyraStore((state) => state.chartStyle);
  const setChartStyle = useElyraStore((state) => state.setChartStyle);
  const indicators = useElyraStore((state) => state.chartIndicators);
  const drawing = useElyraStore((state) => state.chartDrawing);
  const setDrawing = useElyraStore((state) => state.setChartDrawing);
  const favorite = useElyraStore((state) => state.favorites.includes(assetId));
  const toggleFavorite = useElyraStore((state) => state.toggleFavorite);

  const { byId, loading: assetLoading } = useAssets([assetId]);
  const asset = byId.get(assetId);
  const symbol = asset?.symbol ?? "—";
  const { row, status: feedStatus, error: feedError, direction, seq } = usePrice(assetId);
  const flash = useFlash(seq, direction);

  const [pickerOpen, setPickerOpen] = useState(false);
  /* Prior-day pivots sit behind a control, collapsed until asked for. */
  const [pivotsOpen, setPivotsOpen] = useState(false);
  const pivotsId = useId();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const iconOnly = useNarrowerThan(toolbarRef, LABELLED_TOOLBAR_PX);
  /* The exchange sources list crypto only; nothing else has candles or pivots. */
  const candleSymbol = asset?.assetType === "crypto" ? symbol : null;
  /* The order ticket for the chart's market (components/trade/TradePanel), opened
     here or asked for from elsewhere — a signal card's Paper trade (lib/trade/ticketRequest). */
  const [trading, setTrading] = useState(false);
  const ticketRequest = useTicketRequest();
  const [status, setStatus] = useState<Status>("loading");
  const [reloads, setReloads] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = useCanFullscreen();
  /* Whether the chart has the pointer's gestures. Off until the operator
     clicks into it — see the guard over the plot below. */
  const [engaged, setEngaged] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const containerId = `tv-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  /* The card opens one screen tall: its foot level with the agent's, or — in
     focus mode, with nothing under it — on the workspace's bottom padding. */
  useFirstScreenFit(plotRef, cardRef, focus ? WORKSPACE_PAD : WORKSPACE_GAP);

  /* Derived server-side from the asset's class — see lib/market/pyth/tradingview.ts.
     Null means Pyth carries the asset but TradingView has no dependable symbol
     for it, which is a supported outcome rather than a failure. */
  const tvSymbol = asset?.tradingViewSymbol ?? null;
  const mount = `${assetId}-${interval}-${chartStyle}-${indicators.ema}-${indicators.volume}-${drawing}-${reloads}`;

  /* Reset to the skeleton during render when the chart is about to be rebuilt,
     so the effect only ever reports the outcome. */
  const [mountedFor, setMountedFor] = useState(mount);
  if (mountedFor !== mount) {
    setMountedFor(mount);
    setStatus("loading");
  }

  const shownStatus: Status =
    assetLoading || !asset ? "loading" : tvSymbol ? status : "error";

  /* A touch screen has no pointer to leave the chart with, so a tap anywhere
     else hands scrolling back to the page. */
  useEffect(() => {
    if (!engaged) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!plotRef.current?.contains(event.target as Node)) setEngaged(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEngaged(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [engaged]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === cardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !tvSymbol) return;

    let cancelled = false;
    host.replaceChildren();

    const mountPoint = document.createElement("div");
    mountPoint.id = containerId;
    mountPoint.style.height = "100%";
    mountPoint.style.width = "100%";
    host.appendChild(mountPoint);

    const background = token("--surface-panel");
    const grid = token("--border-subtle");
    /* Candles are fills with no text on them, so they take the raw palette
       Sage and Clay — the lifted text tokens are for numbers. */
    const up = token("--sage");
    const down = token("--clay");
    const axisText = token("--text-secondary");
    const line = token("--accent");
    const ema = token("--accent-quiet");

    /* The script loading is not the same as the chart existing — wait for the
       iframe the widget injects, and give up after 10 seconds. The iframe also
       gets tabindex -1: the wrapper alone would not stop the embed from taking
       a tab stop and swallowing the keyboard. */
    let settled = false;
    const finish = (next: Status) => {
      if (settled || cancelled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      setStatus(next);
    };

    const observer = new MutationObserver(() => {
      const frame = host.querySelector("iframe");
      if (!frame) return;
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("title", `${symbol} chart`);
      finish("ready");
    });
    observer.observe(host, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => finish("error"), 10_000);

    loadTradingView()
      .then((TradingView) => {
        if (cancelled) return;
        new TradingView.widget(
          chartWidgetConfig({
            containerId,
            symbol: tvSymbol,
            interval,
            style: chartStyle,
            ema: indicators.ema,
            volume: indicators.volume,
            drawing,
            colors: { background, grid, up, down, axisText, line, ema },
            /* The legend above the plot carries the EMA's figure (ChartLegend). */
            studyValues: false,
          }),
        );
      })
      .catch(() => finish("error"));

    return () => {
      cancelled = true;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      host.replaceChildren();
    };
  }, [tvSymbol, interval, chartStyle, indicators.ema, indicators.volume, drawing, symbol, containerId]);

  const toggleFullscreen = () => {
    const card = cardRef.current;
    if (!card) return;
    if (document.fullscreenElement === card) void document.exitFullscreen();
    else void card.requestFullscreen?.().catch(() => {});
  };

  /* A price that failed to refresh is still shown, because the last observed
     price is real — but it is labelled, so nobody reads a stale number as a
     live one. */
  const stale = feedStatus === "error" && row !== undefined;

  return (
    <section
      ref={cardRef}
      aria-label={t("{symbol} market and chart", { symbol })}
      className={cn(
        "flex min-w-0 flex-col rounded-panel border border-border-subtle bg-surface-panel",
        fullscreen && "h-dvh rounded-none border-0",
      )}
    >
      {/* Market header — one row where there is room for it: the market
          and its selector, the price and its move, then the 24h range and
          volume and the favourite. It wraps rather than shrinking type. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-label={(asset === undefined || asset === null ? t("Change market, currently loading") : t("Change market, currently {name}", { name: asset.name }))}
          className="-ml-1.5 flex min-w-0 items-center gap-2.5 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover"
        >
          <CoinMark symbol={symbol} logo={asset?.logo ?? null} size={32} />
          <span className="flex min-w-0 flex-col items-start">
            <span className="flex items-center gap-1.5">
              <span className="type-h2 truncate text-text-primary">
                {asset ? `${asset.symbol} / ${asset.quoteCurrency}` : <span className="skeleton inline-block h-4 w-24 align-middle" />}
              </span>
              <ChevronDown size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
            </span>
            <span className="type-label truncate text-text-muted">{asset?.name ?? ""}</span>
          </span>
        </button>

        <div className="flex items-center gap-2.5">
          {/* Named, so the quote is never mistaken for a candle's close —
              the legend under the toolbar carries the close separately. */}
          {row && (
            <span
              className={cn(
                "type-label inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border px-2",
                stale ? "border-border-subtle text-text-muted" : "border-accent-quiet text-text-primary",
              )}
            >
              <span aria-hidden className={cn("size-1.5 rounded-pill", stale ? "bg-negative" : "bg-positive")} />
              {stale ? t("Last quote") : t("Live quote")}
            </span>
          )}
          {row ? (
            <span
              aria-live="polite"
              aria-label={stale ? t("Last quote {price}", { price: formatPriceUsd(row.price) }) : t("Live quote {price}", { price: formatPriceUsd(row.price) })}
              className={cn(
                /* The figures stack, not Fustat outright: Fustat's tabular
                   period is a full digit wide and opened a gap either side of
                   it. Digits stay tabular Fustat; "$" and "." are General Sans. */
                "rounded-chip px-0.5 font-sans text-[26px] font-semibold leading-8 tracking-[-0.02em] tabular-nums",
                stale ? "text-text-secondary" : "text-text-primary",
                flash,
              )}
            >
              {formatPriceUsd(row.price)}
            </span>
          ) : feedStatus === "error" ? (
            <span className="type-price text-text-muted">—</span>
          ) : (
            <span aria-hidden className="skeleton inline-block h-7 w-36" />
          )}
          {row?.change24hPct !== null && row?.change24hPct !== undefined && (
            <span className="flex items-baseline gap-1">
              <DeltaText value={row.change24hPct} className="type-data" />
              <span className="type-label text-text-muted">24h</span>
            </span>
          )}
        </div>

        <div
          className="ml-auto flex items-center gap-4"
          title={t("Rolling 24 hours, from the exchange sources")}
        >
          <Stat label={t("High")} value={row?.high24h ? formatPriceUsd(row.high24h) : "—"} />
          <Stat label={t("Low")} value={row?.low24h ? formatPriceUsd(row.low24h) : "—"} />
          <Stat label={t("Volume")} value={row?.volume24h ? formatCompactUsd(row.volume24h) : "—"} />
          <Tip label={favorite ? t("Remove {symbol} from favourites", { symbol }) : t("Add {symbol} to favourites", { symbol })}>
            <button
              type="button"
              role="switch"
              aria-checked={favorite}
              aria-label={favorite ? t("Remove {symbol} from favourites", { symbol }) : t("Add {symbol} to favourites", { symbol })}
              onClick={() => toggleFavorite(assetId)}
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-control",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                favorite ? "text-accent" : "text-text-muted hover:text-text-secondary",
              )}
            >
              <Star size={18} strokeWidth={1.5} aria-hidden fill={favorite ? "currentColor" : "none"} />
            </button>
          </Tip>
        </div>
      </div>

      {feedStatus === "error" && (
        <p role="status" className="type-label border-t border-border-subtle bg-negative-bg px-5 py-2 text-text-secondary">
          {row ? `${t("Showing the last price Pyth returned.")} ${feedError ?? ""}`.trim() : (feedError ?? t("Pyth prices are unavailable."))}
        </p>
      )}

      {/* Toolbar. On a narrow card it wraps — the intervals take their own
          row and the tools sit under them — rather than squeezing the
          intervals into a scroller one button wide. Only the intervals may
          scroll sideways: the menus have to sit outside any scroller, or
          their popovers would be clipped by it.

          Under LABELLED_TOOLBAR_PX the tools keep only their icons, each
          named by a tooltip on hover and keyboard focus. Trade stays
          labelled at every width: it is the toolbar's one primary action. */}
      <div
        ref={toolbarRef}
        className="@container flex flex-wrap items-center gap-x-1.5 gap-y-2 border-y border-border-subtle px-3 py-2 compact:px-4"
      >
        <div
          role="group"
          aria-label={t("Chart interval")}
          className="flex min-w-0 basis-full items-center gap-1 overflow-x-auto @2xl:basis-auto"
        >
          {INTERVALS.map((value) => {
            const active = value === interval;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setInterval(value)}
                className={cn(
                  "metallic chart-control type-data-sm h-8 min-w-9 shrink-0 rounded-control px-2",
                  "transition-colors duration-[var(--dur-fast)] ease-brand",
                  active
                    ? "bg-accent text-text-on-accent"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                {intervalLabel(value)}
              </button>
            );
          })}
        </div>

        <span aria-hidden className="mx-0.5 hidden h-5 w-px shrink-0 bg-border-subtle @2xl:block" />

        <ToolbarMenu
          id="chart-type"
          label={t("Chart type")}
          icon={chartStyle === "line" ? LineChart : CandlestickChart}
          triggerLabel={chartStyle === "line" ? t("Line") : t("Candles")}
          options={[
            { value: "candles", label: t("Candles"), icon: CandlestickChart },
            { value: "line", label: t("Line"), icon: LineChart },
          ]}
          value={chartStyle}
          onChange={setChartStyle}
          iconOnly={iconOnly}
        />
        <Indicators iconOnly={iconOnly} />
        <ChartAlerts symbol={symbol} price={row?.price ?? null} iconOnly={iconOnly} />
        <ToolbarMenu
          id="chart-draw"
          label={t("Drawing tools")}
          icon={PenTool}
          triggerLabel={t("Draw")}
          options={[
            { value: "off", label: t("Pointer only"), icon: MousePointer2 },
            { value: "on", label: t("Drawing toolbar"), icon: PenTool },
          ]}
          value={drawing ? "on" : "off"}
          onChange={(value) => setDrawing(value === "on")}
          pressed={drawing}
          iconOnly={iconOnly}
          note={t("Drawings stay on the chart until it reloads.")}
        />

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Asks Elyra for this market's whole picture — price, safety, sentiment, technicals; the person sends it. */}
          <Tip label={t("Ask Elyra to analyze {symbol}", { symbol })}>
            <button
              type="button"
              onClick={() => askElyra(t("Analyze {symbol} right now", { symbol }))}
              disabled={asset === undefined}
              aria-label={t("Ask Elyra to analyze {symbol}", { symbol })}
              className={cn(TOOL, "px-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary")}
            >
              <Sparkles size={15} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            </button>
          </Tip>
          <Tip label={t("Reload the chart")}>
            <button
              type="button"
              aria-label={t("Reload the chart")}
              onClick={() => setReloads((value) => value + 1)}
              className={cn(TOOL, "px-2 text-text-muted hover:bg-surface-hover hover:text-text-primary")}
            >
              <RotateCcw size={15} strokeWidth={1.5} aria-hidden />
            </button>
          </Tip>
          {canFullscreen && (
            <Tip label={fullscreen ? t("Exit full screen") : t("Full screen")}>
              <button
                type="button"
                aria-pressed={fullscreen}
                aria-label={fullscreen ? t("Exit full screen") : t("Full screen")}
                onClick={toggleFullscreen}
                className={cn(TOOL, "px-2 text-text-muted hover:bg-surface-hover hover:text-text-primary")}
              >
                {fullscreen ? (
                  <Minimize size={15} strokeWidth={1.5} aria-hidden />
                ) : (
                  <Maximize size={15} strokeWidth={1.5} aria-hidden />
                )}
              </button>
            </Tip>
          )}
          {/* The established order flow (components/trade/TradePanel): the
              ticket for this market, on the account the header's Live /
              Paper switch shows, with every check it already makes. */}
          <button
            type="button"
            onClick={() => setTrading(true)}
            disabled={asset === undefined}
            aria-haspopup="dialog"
            aria-label={t("Trade {symbol}", { symbol })}
            className={cn(
              "type-label inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-accent px-3.5 font-semibold text-text-on-accent",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover disabled:opacity-50",
            )}
          >
            <Zap size={15} strokeWidth={1.75} aria-hidden />
            {t("Trade")}
          </button>
        </div>
      </div>

      {/* The legend, and the prior-day pivots behind their control. */}
      <div className="@container flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border-subtle px-3 py-1.5 compact:px-4">
        {indicators.levels !== false && candleSymbol !== null && (
          <button
            type="button"
            aria-expanded={pivotsOpen}
            aria-controls={pivotsId}
            onClick={() => setPivotsOpen(!pivotsOpen)}
            className={cn(
              TOOL,
              "h-7 gap-1 border border-border-subtle px-2",
              pivotsOpen ? "bg-surface-hover text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {t("Pivots")}
            <ChevronDown
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn("text-text-muted transition-transform duration-[var(--dur-fast)] ease-brand motion-reduce:transition-none", pivotsOpen && "rotate-180")}
            />
          </button>
        )}
        <ChartLegend symbol={candleSymbol} assetLoading={asset === undefined} row={row} interval={interval} showEma={indicators.ema} />
      </div>

      {indicators.levels !== false && candleSymbol !== null && pivotsOpen && (
        <PivotRow id={pivotsId} symbol={candleSymbol} price={row?.price ?? null} />
      )}

      {/* The plot. Its height is CSS — see .chart-plot, fed the first
          screen's room by useFirstScreenFit — and the widget's iframe is 100%
          of it, so a column opening or closing beside the centre resizes the
          chart without rebuilding it. */}
      <div
        ref={plotRef}
        className={cn("chart-plot relative min-h-0", fullscreen && "!h-auto flex-1")}
        data-focus={focus ? "true" : undefined}
        onPointerLeave={(event) => {
          /* A finger "leaves" every time it lifts — before the click it was
             lifting from — so for touch, leaving means nothing. The release
             button and a tap elsewhere hand the page back instead. */
          if (event.pointerType !== "touch") setEngaged(false);
        }}
      >
        <div
          key={mount}
          ref={hostRef}
          tabIndex={-1}
          aria-label={(chartStyle === "line" ? t("{symbol} line chart, {interval}", { symbol, interval }) : t("{symbol} candlestick chart, {interval}", { symbol, interval }))}
          role="img"
          className={cn(
            "tradingview-widget-container size-full",
            shownStatus === "ready" ? "opacity-100" : "opacity-0",
          )}
        />

        {/* The scroll guard.

            The chart is an iframe, and an iframe swallows every wheel and
            trackpad gesture over it — so a page scroll that happened to pass
            across the chart zoomed the chart instead of moving the page. This
            transparent layer sits over the plot until the operator clicks it:
            until then a scroll over the chart scrolls the workspace like
            anywhere else, and after it the chart has zoom, pan and the
            crosshair until the pointer leaves (or a tap lands elsewhere, or
            Escape). Full screen has no page to scroll, so it is never guarded.

            A touch screen has no hover to show the hint on, so there it is
            always shown; and no pointer to leave with, so the engaged chart
            carries its own way back to scrolling the page. */}
        {shownStatus === "ready" && !engaged && !fullscreen && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("Interact with the chart")}
            onClick={() => setEngaged(true)}
            className="group/guard absolute inset-0 z-10 cursor-pointer bg-transparent"
          >
            <span
              aria-hidden
              className={cn(
                "type-label pointer-events-none absolute bottom-10 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5",
                "whitespace-nowrap rounded-pill border border-border-strong bg-surface-raised px-3 py-1.5 text-text-secondary shadow-pop",
                "opacity-0 transition-opacity duration-[var(--dur-base)] ease-brand group-hover/guard:opacity-100",
                "pointer-coarse:opacity-100",
              )}
            >
              <MousePointerClick size={13} strokeWidth={1.5} className="pointer-coarse:hidden" />
              <Pointer size={13} strokeWidth={1.5} className="hidden pointer-coarse:block" />
              <span className="pointer-coarse:hidden">{t("Click to zoom, pan and inspect")}</span>
              <span className="hidden pointer-coarse:inline">{t("Tap to zoom, pan and inspect")}</span>
            </span>
          </button>
        )}

        {shownStatus === "ready" && engaged && !fullscreen && (
          <button
            type="button"
            onClick={() => setEngaged(false)}
            className={cn(
              "type-label absolute bottom-10 left-1/2 z-10 hidden h-9 -translate-x-1/2 items-center gap-1.5 pointer-coarse:inline-flex",
              "whitespace-nowrap rounded-pill border border-border-strong bg-surface-raised px-3.5 text-text-primary shadow-pop",
            )}
          >
            <Check size={14} strokeWidth={1.5} aria-hidden />
            {t("Release chart")}
          </button>
        )}

        {shownStatus === "loading" && (
          <div aria-hidden className="absolute inset-0 flex flex-col gap-2 p-4">
            <div className="skeleton min-h-0 flex-1 rounded-card" />
          </div>
        )}

        {shownStatus === "error" && (
          <div className="absolute inset-0">
            <EmptyState
              icon={CandlestickChart}
              title={tvSymbol ? t("Chart unavailable") : t("No chart for this market")}
              body={
                tvSymbol
                  ? t("The {symbol} chart did not load. Check the connection and reload, or switch interval to retry.", { symbol })
                  : t("Pyth prices {symbol}, but TradingView has no matching market, so there is no chart to show. The live price above is unaffected.", { symbol })
              }
            />
          </div>
        )}
      </div>

      <FeedFooter row={row ?? null} status={feedStatus} engaged={engaged} />

      <AssetSelectDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      {(trading || ticketRequest !== null) && asset !== undefined && (
        <TradePanel
          key={`${asset.symbol}:${ticketRequest?.at ?? "chart"}`}
          symbol={asset.symbol}
          row={row}
          initialSide={ticketRequest?.side}
          paper={ticketRequest?.paper === true}
          onClose={() => {
            setTrading(false);
            clearTicketRequest();
          }}
        />
      )}
    </section>
  );
}

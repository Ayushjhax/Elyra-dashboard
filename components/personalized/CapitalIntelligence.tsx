"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronUp, Clock3, PanelRightOpen, Plus, Sparkles } from "lucide-react";
import { Composer } from "@/components/personalized/Composer";
import { ContextCards } from "@/components/personalized/ContextRail";
import { ConversationPanel, type Starter } from "@/components/personalized/Conversation";
import { HistoryDrawer } from "@/components/personalized/HistoryDrawer";
import { PreferenceEditor, type EditorIntent } from "@/components/personalized/PreferenceEditor";
import { useElyraAuth, type ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tip } from "@/components/shell/RouteDrawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ComposerAttachment } from "@/lib/attachments";
import { usePersonalizedChat, usePersonalizedMemory, type ChatFeed, type MemoryFeed } from "@/lib/personalized/client";
import { accountContextOn, sourceStatuses } from "@/lib/personalized/sources";
import { isContextSource, type ContextSource } from "@/lib/personalized/types";
import { ALL_ACCOUNTS, drawerView } from "@/lib/portfolio/drawer";
import { usePortfolio, type PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/voice/useDictation";
import { useWalletActivity, type ActivityFeed } from "@/lib/wallet/useWalletActivity";
import { useWalletDashboard, type WalletDashboard } from "@/lib/wallet/useWalletDashboard";

/* ---------------------------------------------------------------------------
   Capital Intelligence — the conversation, and the context it reads.

   Everything on this page is a read the app already makes, through the
   shared stores: `usePortfolio`, `useWalletDashboard`, `useWalletActivity`.
   The page adds the conversation (`/api/personalized/chat`) and saved
   preferences (`/api/personalized/memory`) and nothing else, so opening it
   costs no second portfolio aggregation.

   From 64rem of its own width the context rail sits beside the conversation
   and can be folded away; below that it is a drawer, opened from the header.
--------------------------------------------------------------------------- */

const outlined = cn(
  "type-body inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control border px-4 font-medium",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover active:bg-surface-panel",
);

const STARTER_PROMPT: Record<Exclude<Starter, "preferences">, { text: string; select?: string }> = {
  portfolio: { text: "Review my portfolio: what I hold, how it's allocated, and anything that stands out." },
  research: { text: "I want to research SOL before I act — what drives it, the main risks, and what should I watch?", select: "SOL" },
  deposit: { text: "Help me plan my first deposit: how to get funds in, and what to think about before I do." },
};

function RailHeading({ onCollapse }: { onCollapse?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
      <h2 className="type-h1 text-text-primary">Your context</h2>
      {onCollapse !== undefined && (
        <Tip label="Fold the context away">
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse your context"
            aria-expanded
            className="grid size-8 place-items-center rounded-control border border-border-subtle text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
          >
            <ChevronUp size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </Tip>
      )}
    </div>
  );
}

export function CapitalIntelligence() {
  return (
    <CapitalIntelligenceView
      auth={useElyraAuth()}
      chat={usePersonalizedChat()}
      memory={usePersonalizedMemory()}
      portfolio={usePortfolio()}
      wallet={useWalletDashboard()}
      activity={useWalletActivity(10)}
    />
  );
}

/** The page with its data passed in, so it renders the same from fixtures. */
export function CapitalIntelligenceView({
  auth,
  chat,
  memory,
  portfolio,
  wallet,
  activity,
}: {
  auth: Pick<ElyraAuth, "available" | "ready" | "authenticated" | "login">;
  chat: ChatFeed;
  memory: MemoryFeed;
  portfolio: PortfolioFeed;
  wallet: WalletDashboard;
  activity: ActivityFeed;
}) {

  const rawSources = useElyraStore((state) => state.contextSources);
  const setSources = useElyraStore((state) => state.setContextSources);
  const collapsed = useElyraStore((state) => state.contextRailCollapsed);
  const setCollapsed = useElyraStore((state) => state.setContextRailCollapsed);
  /* Persisted state is someone else's input; only known sources survive it. */
  const sources = useMemo<ContextSource[]>(() => (Array.isArray(rawSources) ? rawSources.filter(isContextSource) : []), [rawSources]);

  const [draft, setDraftState] = useState("");
  const draftRef = useRef("");
  const setDraft = useCallback((next: string) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorIntent | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation(useMemo(() => ({ read: () => draftRef.current, write: setDraft }), [setDraft]));

  const view = useMemo(() => (portfolio.snapshot === null ? null : drawerView(portfolio.snapshot, ALL_ACCOUNTS)), [portfolio.snapshot]);
  const positions = view === null ? 0 : view.perps.length + view.defi.length + (view.prediction?.activeMarkets ?? 0);
  const positionsFailed =
    portfolio.snapshot?.notes.some(
      (note) => note.kind === "failed" && ["venues", "hyperliquid", "defi", "prediction"].includes(note.scope),
    ) ?? false;

  const statuses = useMemo(
    () =>
      sourceStatuses({
        wallet: {
          loading: wallet.isLoading && wallet.snapshot === null,
          hasAddress: wallet.address !== null,
          unconfigured: wallet.unconfigured,
          read: wallet.snapshot !== null,
          stale: wallet.stale,
          error: wallet.error,
        },
        portfolio: {
          loading: portfolio.loading && portfolio.snapshot === null,
          read: portfolio.snapshot !== null,
          positions,
          positionsFailed,
          error: portfolio.error,
        },
        activity: {
          loading: activity.isLoading,
          unconfigured: activity.unconfigured,
          count: activity.items.length,
          error: activity.error,
        },
        memory: { loading: memory.loading, count: memory.memories.length, error: memory.error },
      }),
    [wallet, portfolio.loading, portfolio.snapshot, portfolio.error, positions, positionsFailed, activity, memory],
  );

  const signedIn = auth.ready && auth.authenticated;
  const contextOn = accountContextOn(signedIn, wallet.address !== null, sources);

  const focusComposer = useCallback((select?: string) => {
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node === null) return;
      node.focus();
      const at = select === undefined ? -1 : node.value.indexOf(select);
      if (at >= 0) node.setSelectionRange(at, at + (select?.length ?? 0));
      else node.setSelectionRange(node.value.length, node.value.length);
    });
  }, []);

  const onStarter = (starter: Starter) => {
    if (starter === "preferences") {
      setEditor({ mode: "new" });
      return;
    }
    const prompt = STARTER_PROMPT[starter];
    setDraft(prompt.text);
    focusComposer(prompt.select);
  };

  const send = async () => {
    const request = { text: draft, attachments, sources };
    const sentDraft = draft;
    const sentFiles = attachments;
    setDraft("");
    setAttachments([]);
    setSendError(null);
    const result = await chat.send(request);
    if (!result.ok) {
      /* Refused before it ran: the question comes back to be fixed, unless
         the person has already started writing something else. */
      if (draftRef.current.length === 0) setDraft(sentDraft);
      setAttachments((current) => (current.length === 0 ? sentFiles : current));
      setSendError(result.error);
    }
  };

  const newChat = () => {
    /* The transcript starts over; the draft, the files staged with it and
       the source selection stay — they are the person's, not the old chat's. */
    chat.reset();
    setSendError(null);
    focusComposer();
  };

  const cards = (
    <ContextCards
      portfolio={portfolio}
      view={view}
      memory={memory}
      statuses={statuses}
      address={wallet.address}
      cluster={wallet.cluster}
      onEditPreference={setEditor}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 @container">
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <Sparkles size={30} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
          <div className="min-w-0">
            <h1 className="type-h1 text-text-primary">Capital Intelligence</h1>
            <p className="type-body text-text-secondary">Your capital. A clearer perspective.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* On a phone the three buttons do not fit one row with their
              labels, so this one, the least asked-for, keeps only its icon. */}
          {signedIn && (
            <button
              type="button"
              onClick={() => setContextOpen(true)}
              aria-label="Context"
              className={cn(
                outlined,
                "border-border-strong text-text-primary @max-[36rem]:w-10 @max-[36rem]:px-0 @[64rem]:hidden",
              )}
            >
              <PanelRightOpen size={17} strokeWidth={1.5} aria-hidden />
              <span className="@max-[36rem]:hidden">Context</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            disabled={!signedIn}
            className={cn(outlined, "border-border-strong text-text-primary disabled:opacity-50")}
          >
            <Clock3 size={17} strokeWidth={1.5} aria-hidden />
            History
          </button>
          <button
            type="button"
            onClick={newChat}
            disabled={!signedIn}
            className={cn(outlined, "border-accent text-text-primary hover:border-accent-hover disabled:opacity-50")}
          >
            <Plus size={17} strokeWidth={1.5} aria-hidden className="text-accent" />
            New chat
          </button>
        </div>
      </header>

      {!auth.ready ? (
        <div aria-busy="true" aria-label="Loading" className="min-h-0 flex-1 rounded-panel border border-border-subtle bg-surface-panel" />
      ) : !signedIn ? (
        <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-panel border border-border-subtle bg-surface-panel px-6 text-center">
          <h2 className="type-display text-text-primary">What&rsquo;s your next move?</h2>
          <p className="type-body max-w-md text-text-secondary">
            {auth.available
              ? "Elyra grounds every answer in your own balances, positions and the preferences you save. Sign in to begin."
              : "Sign-in isn't configured on this deployment, so there is no account for Elyra to read."}
          </p>
          {auth.available && (
            <button type="button" onClick={auth.login} className={cn(outlined, "border-accent text-text-primary")}>
              Connect wallet
            </button>
          )}
        </section>
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 gap-4",
            collapsed ? "@[64rem]:grid-cols-[minmax(0,1fr)_auto]" : "@[64rem]:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]",
          )}
        >
          <ConversationPanel
            chat={chat}
            contextOn={contextOn}
            onStarter={onStarter}
            onPrompt={(prompt) => {
              setDraft(prompt);
              focusComposer();
            }}
            wallet={statuses.wallet}
            view={view}
            portfolioLoading={portfolio.loading}
            composer={
              <Composer
                draft={draft}
                onDraftChange={(next) => {
                  setDraft(next);
                  if (sendError !== null) setSendError(null);
                }}
                attachments={attachments}
                onAttachmentsChange={setAttachments}
                selected={sources}
                onSelectedChange={setSources}
                statuses={statuses}
                pending={chat.pending}
                canSend={signedIn && !chat.opening}
                onSend={() => void send()}
                onStop={chat.stop}
                error={sendError}
                dictation={dictation}
                inputRef={inputRef}
              />
            }
          />

          {collapsed ? (
            <aside aria-label="Your context" className="hidden min-h-0 @[64rem]:flex">
              <Tip label="Show your context">
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  aria-label="Expand your context"
                  aria-expanded={false}
                  className="flex w-12 flex-col items-center gap-3 rounded-panel border border-border-subtle bg-surface-panel py-4 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
                >
                  <PanelRightOpen size={18} strokeWidth={1.5} aria-hidden />
                  <span className="type-label [writing-mode:vertical-rl]">Your context</span>
                </button>
              </Tip>
            </aside>
          ) : (
            <aside
              aria-label="Your context"
              className="hidden min-h-0 flex-col overflow-y-auto rounded-panel border border-border-subtle bg-surface-panel p-3 @[64rem]:flex"
            >
              <RailHeading onCollapse={() => setCollapsed(true)} />
              {cards}
            </aside>
          )}
        </div>
      )}

      {/* Below 64rem the rail is a drawer. */}
      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <DialogContent side="right" surface="panel" className="w-[min(400px,calc(100vw-24px))] p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Your context</DialogTitle>
            <DialogDescription>Your portfolio, saved preferences and the data sources Elyra can read.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-4">
            <RailHeading />
            {cards}
          </div>
        </DialogContent>
      </Dialog>

      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} activeId={chat.conversationId} onOpenConversation={chat.open} />
      <PreferenceEditor intent={editor} onClose={() => setEditor(null)} memory={memory} />
    </div>
  );
}

"use client";

import { Conversation } from "@/components/personalized/Conversation";
import { ContextRail } from "@/components/personalized/ContextRail";
import { Unavailable } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import {
  usePersonalizedChat,
  usePersonalizedContext,
  usePersonalizedMemory,
} from "@/lib/personalized/client";

/* ---------------------------------------------------------------------------
   Personalized — Elyra's capital intelligence layer.

   Two columns: the conversation at ~70% and the context rail at ~30%. The
   rail is what makes the chat credible — an assistant claiming to know your
   exposure is believable sitting beside a panel that shows it, computed
   deterministically from the same read the answer was grounded in.

   Like Assets, this route takes the whole main column rather than opening as
   a strip beside the chart; see FULL_BLEED_ROUTES in lib/layout.ts.

   Every figure on this page comes from `/api/personalized/context`, which
   reuses the same `composePortfolio` aggregation Portfolio and Assets read.
   Nothing here calls a model provider, and neither API key is reachable from
   this bundle — the browser only ever talks to `/api/personalized/*`.
--------------------------------------------------------------------------- */

export default function PersonalizedPage() {
  const auth = useElyraAuth();
  const context = usePersonalizedContext();
  const memory = usePersonalizedMemory();
  const chat = usePersonalizedChat();

  return (
    <Panel label="Personalized" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Personalized</Eyebrow>
        <span className="type-label ml-auto truncate text-text-muted">
          Capital Intelligence
        </span>
      </PanelHeader>

      {!auth.ready ? (
        <div className="min-h-0 flex-1" />
      ) : !context.signedIn ? (
        <EmptyState
          mark="agent"
          title="Sign in to personalize"
          body="Elyra grounds every answer in your own balances, positions and preferences. None of that is readable until you connect a wallet."
          action={
            auth.available ? (
              <Button size="sm" variant="accent" onClick={auth.login}>
                Connect wallet
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col @container">
          <div className="flex flex-col gap-0.5 border-b border-border-subtle px-4 pb-3 pt-3">
            <h1 className="type-h2 text-text-primary">Capital Intelligence</h1>
            <p className="type-body-sm text-text-secondary">
              A private assistant grounded in your portfolio, activity and preferences.
            </p>
          </div>

          {context.error !== null && (
            <Unavailable
              tone="warning"
              title="Your account could not be read"
              body={`${context.error} Elyra can still answer general questions, but nothing below is personalized.`}
              onRetry={context.refetch}
            />
          )}

          {/* 70/30 at width, stacked below it. Container queries, because this
              page's width is the shell column's rather than the viewport's. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 @[56rem]:grid-cols-[1.9fr_0.9fr]">
            <div className="flex min-h-0 flex-col @[56rem]:border-r @[56rem]:border-border-subtle">
              <Conversation
                chat={chat}
                welcome={context.welcome}
                prompts={context.suggestedPrompts}
                contextLoading={context.loading}
              />
            </div>

            <aside
              aria-label="Your current state"
              className="flex min-h-0 flex-col border-t border-border-subtle @[56rem]:border-t-0"
            >
              <ContextRail
                context={context.context}
                memory={memory}
                loading={context.loading}
              />
            </aside>
          </div>
        </div>
      )}
    </Panel>
  );
}

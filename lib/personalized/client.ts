"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type { Attachment, SentAttachment } from "@/lib/attachments";
import type {
  ContextSource,
  MemoryType,
  PersonalizedAnswer,
  PersonalizedContext,
  PersonalizedConversation,
  PersonalizedInsight,
  PersonalizedMemory,
  PersonalizedMessage,
  PersonalizedStreamEvent,
} from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   The browser's side of Personalized.

   Two hooks. `usePersonalizedContext` loads everything the rail and the
   greeting need in one request; `usePersonalizedChat` owns the transcript and
   the stream.

   No provider is called from here and no key is readable here — the browser
   talks only to `/api/personalized/*`, which is what keeps ANTHROPIC_API_KEY
   and GEMINI_API_KEY server-side.
--------------------------------------------------------------------------- */

interface ContextPayload {
  context: PersonalizedContext | null;
  insights: PersonalizedInsight[];
  suggestedPrompts: string[];
  welcome: string[];
  error: string | null;
}

export interface ContextFeed extends ContextPayload {
  loading: boolean;
  signedIn: boolean;
  authReady: boolean;
  refetch: () => void;
}

const EMPTY: ContextPayload = {
  context: null,
  insights: [],
  suggestedPrompts: [],
  welcome: [],
  error: null,
};

export function usePersonalizedContext(): ContextFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [payload, setPayload] = useState<ContextPayload | null>(null);
  const [nonce, setNonce] = useState(0);

  const signedIn = auth.ready && auth.authenticated;

  /* Pure fetch with no setState of its own — `react-hooks/set-state-in-effect`
     rejects any setState reachable before an effect's first await, so every
     write sits behind a real `.then()` boundary. Same constraint the panels
     in components/panels document. */
  const load = useCallback(async (): Promise<ContextPayload> => {
    if (!signedIn) return EMPTY;
    try {
      const response = await authedFetch("/api/personalized/context", {
        cache: "no-store",
      });
      return (await response.json()) as ContextPayload;
    } catch (error: unknown) {
      return {
        ...EMPTY,
        error: error instanceof Error ? error.message : "Could not read your account.",
      };
    }
  }, [authedFetch, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setPayload(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  return {
    ...(payload ?? EMPTY),
    loading: !auth.ready || (signedIn && payload === null),
    signedIn,
    authReady: auth.ready,
    refetch: useCallback(() => setNonce((value) => value + 1), []),
  };
}

/* ---------------------------------------------------------------------------
   The conversation

   One transcript, one stream. Every question carries what it may read (the
   composer's source selection) and any files staged with it; the files are
   kept in memory for a retry and never stored.

   Three outcomes are kept apart, because each asks something different of
   the person:
   - REJECTED — the server refused the request before running anything (a
     malformed body, a rate limit). The question is taken back out of the
     transcript and returned to the composer to fix and resend.
   - FAILED — it ran and did not finish. The question stays, marked, with a
     Retry that re-asks it in place: same conversation, no second copy.
   - STOPPED — the person pressed Stop. Marked the same way, retryable.
--------------------------------------------------------------------------- */

export interface ChatRequest {
  text: string;
  attachments: Attachment[];
  sources: ContextSource[];
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer: PersonalizedAnswer | null;
  /** What was attached, for the bubble. Never the file's contents. */
  attachments?: SentAttachment[];
  /** User turns only: how the turn ended when it did not end in an answer. */
  outcome?: { state: "failed" | "stopped"; error: string | null };
  /** User turns only: kept so a retry asks exactly the same thing. */
  request?: ChatRequest;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export interface ChatFeed {
  turns: ChatTurn[];
  /** High-level progress, shown while a turn is in flight. Never reasoning. */
  status: string | null;
  pending: boolean;
  /** A conversation from history is being read. */
  opening: boolean;
  /** Reading a conversation from history failed. */
  openError: string | null;
  conversationId: string | null;
  title: string | null;
  send: (request: ChatRequest) => Promise<SendResult>;
  retry: (turnId: string) => void;
  stop: () => void;
  reset: () => void;
  open: (conversation: PersonalizedConversation) => void;
}

let turnCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${(turnCounter += 1)}`;

const MAX_TITLE = 60;

function titleFrom(text: string, attachments: readonly Attachment[]): string {
  const source = text.trim() || (attachments[0] === undefined ? "New conversation" : `About ${attachments[0].name}`);
  const line = source.split("\n")[0];
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1)}…` : line;
}

export function usePersonalizedChat(): ChatFeed {
  const auth = useElyraAuth();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  /* Read synchronously, so two Enters in one frame cannot both get through
     before `pending` has rendered. */
  const busyRef = useRef(false);
  const conversationRef = useRef<string | null>(null);
  /* Bumped by reset and open, so a stream that outlives its conversation
     cannot write into the next one. */
  const generation = useRef(0);

  const setConversation = useCallback((id: string | null) => {
    conversationRef.current = id;
    setConversationId(id);
  }, []);

  /* Aborting on unmount stops model calls that nobody will read. */
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (request: ChatRequest, userTurnId: string, retry: boolean): Promise<SendResult> => {
      busyRef.current = true;
      setPending(true);
      setStatus("Thinking…");
      const controller = new AbortController();
      abortRef.current = controller;
      const ticket = generation.current;
      const current = () => generation.current === ticket;
      const mark = (outcome: ChatTurn["outcome"]) =>
        setTurns((list) => list.map((turn) => (turn.id === userTurnId ? { ...turn, outcome } : turn)));

      let answered = false;
      let result: SendResult = { ok: true };
      try {
        const token = await auth.getAccessToken();
        const response = await fetch("/api/personalized/chat", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: request.text,
            attachments: request.attachments.map(({ name, mediaType, data }) => ({ name, mediaType, data })),
            sources: request.sources,
            conversationId: conversationRef.current,
            retry,
          }),
        });

        if (!response.ok || response.body === null) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          const error = body.error ?? `The request was refused (${response.status}).`;
          if (!current()) return { ok: false, error };
          if (retry) {
            mark({ state: "failed", error });
          } else {
            /* Nothing ran and nothing was stored: the question goes back to
               the composer rather than sitting in the transcript unanswered. */
            setTurns((list) => list.filter((turn) => turn.id !== userTurnId));
          }
          return { ok: false, error };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        /* SSE frames are separated by a blank line and can split across
           chunk boundaries, so the tail is carried forward rather than parsed
           as a partial frame. */
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!current()) {
            controller.abort();
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((part) => part.startsWith("data: "));
            if (line === undefined) continue;
            let event: PersonalizedStreamEvent;
            try {
              event = JSON.parse(line.slice(6)) as PersonalizedStreamEvent;
            } catch {
              continue;
            }

            if (event.type === "status") setStatus(event.status);
            else if (event.type === "conversation") setConversation(event.conversationId);
            else if (event.type === "answer") {
              answered = true;
              setTurns((list) => [
                ...list.map((turn) => (turn.id === userTurnId ? { ...turn, outcome: undefined } : turn)),
                { id: nextId("a"), role: "assistant", content: event.answer.message, answer: event.answer },
              ]);
            } else if (event.type === "done") {
              if (event.conversationId.length > 0) setConversation(event.conversationId);
            } else if (event.type === "error") {
              mark({ state: "failed", error: event.error });
            }
          }
        }
        if (!answered && current() && !controller.signal.aborted) {
          setTurns((list) =>
            list.map((turn) =>
              turn.id === userTurnId && turn.outcome === undefined
                ? { ...turn, outcome: { state: "failed", error: "The answer did not arrive." } }
                : turn,
            ),
          );
        }
      } catch (streamError: unknown) {
        if (current()) {
          if (controller.signal.aborted) mark({ state: "stopped", error: null });
          else mark({ state: "failed", error: streamError instanceof Error ? streamError.message : "The connection dropped." });
        }
        result = { ok: true };
      } finally {
        if (current()) {
          setPending(false);
          setStatus(null);
          busyRef.current = false;
          abortRef.current = null;
        }
      }
      return result;
    },
    [auth, setConversation],
  );

  const send = useCallback(
    async (request: ChatRequest): Promise<SendResult> => {
      const text = request.text.trim();
      if ((text.length === 0 && request.attachments.length === 0) || busyRef.current) {
        return { ok: false, error: "Nothing to send yet." };
      }
      const turn: ChatTurn = {
        id: nextId("u"),
        role: "user",
        content: text,
        answer: null,
        attachments: request.attachments.map(({ name, kind, ...rest }) => ({
          name,
          kind,
          previewUrl: "previewUrl" in rest && typeof rest.previewUrl === "string" ? rest.previewUrl : null,
        })),
        request: { ...request, text },
      };
      setTurns((list) => [...list, turn]);
      setTitle((current) => current ?? titleFrom(text, request.attachments));
      return run({ ...request, text }, turn.id, false);
    },
    [run],
  );

  const retry = useCallback(
    (turnId: string) => {
      if (busyRef.current) return;
      const turn = turns.find((entry) => entry.id === turnId);
      if (turn?.request === undefined) return;
      setTurns((list) => list.map((entry) => (entry.id === turnId ? { ...entry, outcome: undefined } : entry)));
      void run(turn.request, turnId, true);
    },
    [run, turns],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    busyRef.current = false;
    setTurns([]);
    setConversation(null);
    setTitle(null);
    setOpenError(null);
    setOpening(false);
    setPending(false);
    setStatus(null);
  }, [setConversation]);

  const open = useCallback(
    (conversation: PersonalizedConversation) => {
      reset();
      const ticket = generation.current;
      setConversation(conversation.id);
      setTitle(conversation.title);
      setOpening(true);
      void (async () => {
        try {
          const token = await auth.getAccessToken();
          const response = await fetch(`/api/personalized/conversations/${conversation.id}`, {
            cache: "no-store",
            headers: token ? { authorization: `Bearer ${token}` } : {},
          });
          const body = (await response.json()) as { messages?: PersonalizedMessage[]; error?: string };
          if (generation.current !== ticket) return;
          if (!response.ok) {
            setOpenError(body.error ?? "That conversation could not be opened.");
            return;
          }
          setTurns(
            (body.messages ?? []).map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              answer: message.answer,
            })),
          );
        } catch {
          if (generation.current === ticket) setOpenError("That conversation could not be opened.");
        } finally {
          if (generation.current === ticket) setOpening(false);
        }
      })();
    },
    [auth, reset, setConversation],
  );

  /* Another account must never see this one's conversation — or keep a
     stream running into it. Signing out, or in as someone else, starts over. */
  const account = auth.authenticated ? (auth.account?.id ?? "signed-in") : null;
  const accountRef = useRef(account);
  useEffect(() => {
    if (accountRef.current === account) return;
    accountRef.current = account;
    reset();
  }, [account, reset]);

  return { turns, status, pending, opening, openError, conversationId, title, send, retry, stop, reset, open };
}

/* ---------------------------------------------------------------------------
   Memory — saved preferences
--------------------------------------------------------------------------- */

export interface MemoryFeed {
  memories: PersonalizedMemory[];
  loading: boolean;
  /** The list could not be read. Distinct from an empty list. */
  error: string | null;
  /** Resolves with null on success, or the reason it was not saved. */
  save: (type: MemoryType, value: unknown) => Promise<string | null>;
  update: (id: string, value: unknown) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
  refetch: () => void;
}

export function usePersonalizedMemory(): MemoryFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [loaded, setLoaded] = useState<{ memories: PersonalizedMemory[]; error: string | null; account: string | null } | null>(null);
  const [nonce, setNonce] = useState(0);

  const signedIn = auth.ready && auth.authenticated;
  const account = signedIn ? (auth.account?.id ?? "signed-in") : null;

  const load = useCallback(async (): Promise<{ memories: PersonalizedMemory[]; error: string | null; account: string | null }> => {
    if (!signedIn) return { memories: [], error: null, account };
    try {
      const response = await authedFetch("/api/personalized/memory", { cache: "no-store" });
      const body = (await response.json()) as { memories?: PersonalizedMemory[]; error?: string };
      if (!response.ok) return { memories: [], error: body.error ?? "Saved preferences could not be read.", account };
      return { memories: body.memories ?? [], error: null, account };
    } catch {
      return { memories: [], error: "Saved preferences could not be read.", account };
    }
  }, [authedFetch, signedIn, account]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const write = useCallback(
    async (url: string, init: RequestInit, fallback: string): Promise<string | null> => {
      try {
        const response = await authedFetch(url, init);
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) return body.error ?? fallback;
        refetch();
        return null;
      } catch {
        return fallback;
      }
    },
    [authedFetch, refetch],
  );

  /* Another account's preferences are never shown, even for the frame
     before the new list arrives. */
  const current = loaded !== null && loaded.account === account ? loaded : null;

  return {
    memories: current?.memories ?? [],
    loading: signedIn && current === null,
    error: current?.error ?? null,
    save: useCallback(
      (type: MemoryType, value: unknown) =>
        write("/api/personalized/memory", { method: "POST", body: JSON.stringify({ type, value }) }, "That preference could not be saved."),
      [write],
    ),
    update: useCallback(
      (id: string, value: unknown) =>
        write(`/api/personalized/memory/${id}`, { method: "PATCH", body: JSON.stringify({ value }) }, "That preference could not be updated."),
      [write],
    ),
    remove: useCallback(
      (id: string) => write(`/api/personalized/memory/${id}`, { method: "DELETE" }, "That preference could not be removed."),
      [write],
    ),
    refetch,
  };
}

/* ---------------------------------------------------------------------------
   History
--------------------------------------------------------------------------- */

export interface ConversationsFeed {
  conversations: PersonalizedConversation[];
  loading: boolean;
  error: string | null;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

/** Read when `enabled` turns on (the drawer opening), and again on refetch. */
export function usePersonalizedConversations(enabled: boolean): ConversationsFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [loaded, setLoaded] = useState<{ conversations: PersonalizedConversation[]; error: string | null; nonce: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  const signedIn = auth.ready && auth.authenticated;

  useEffect(() => {
    if (!enabled || !signedIn) return;
    let cancelled = false;
    const asked = nonce;
    void (async () => {
      try {
        const response = await authedFetch("/api/personalized/conversations", { cache: "no-store" });
        const body = (await response.json()) as { conversations?: PersonalizedConversation[]; error?: string };
        const next = response.ok
          ? { conversations: body.conversations ?? [], error: null, nonce: asked }
          : { conversations: [], error: body.error ?? "Your conversations could not be read.", nonce: asked };
        if (!cancelled) setLoaded(next);
      } catch {
        if (!cancelled) setLoaded({ conversations: [], error: "Your conversations could not be read.", nonce: asked });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, enabled, signedIn, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await authedFetch(`/api/personalized/conversations/${id}`, { method: "DELETE" });
      } finally {
        refetch();
      }
    },
    [authedFetch, refetch],
  );

  const current = loaded !== null && loaded.nonce === nonce ? loaded : null;
  return {
    conversations: current?.conversations ?? loaded?.conversations ?? [],
    loading: enabled && signedIn && current === null,
    error: current?.error ?? null,
    remove,
    refetch,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import type {
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
--------------------------------------------------------------------------- */

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer: PersonalizedAnswer | null;
}

export interface ChatFeed {
  turns: ChatTurn[];
  /** High-level progress, shown while a turn is in flight. Never reasoning. */
  status: string | null;
  pending: boolean;
  error: string | null;
  conversationId: string | null;
  send: (message: string) => void;
  stop: () => void;
  reset: () => void;
  open: (conversationId: string) => void;
}

let turnCounter = 0;
const nextId = (prefix: string): string => `${prefix}-${(turnCounter += 1)}`;

export function usePersonalizedChat(): ChatFeed {
  const auth = useElyraAuth();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  /* Aborting on unmount stops three model calls that nobody will read. */
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (trimmed.length === 0 || pending) return;

      const userTurn: ChatTurn = {
        id: nextId("u"),
        role: "user",
        content: trimmed,
        answer: null,
      };
      setTurns((current) => [...current, userTurn]);
      setPending(true);
      setError(null);
      setStatus("Thinking…");

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          const token = await auth.getAccessToken();
          const response = await fetch("/api/personalized/chat", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ message: trimmed, conversationId }),
          });

          if (!response.ok || response.body === null) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            setError(body.error ?? `The request failed (${response.status}).`);
            setPending(false);
            setStatus(null);
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          /* SSE frames are separated by a blank line and can split across
             chunk boundaries, so the tail is carried forward rather than
             parsed as a partial frame. */
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
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
              else if (event.type === "answer") {
                setTurns((current) => [
                  ...current,
                  {
                    id: nextId("a"),
                    role: "assistant",
                    content: event.answer.message,
                    answer: event.answer,
                  },
                ]);
              } else if (event.type === "done") {
                if (event.conversationId.length > 0) setConversationId(event.conversationId);
              } else if (event.type === "error") {
                setError(event.error);
              }
            }
          }
        } catch (streamError: unknown) {
          /* An abort is the operator pressing Stop — an outcome, not a fault. */
          if (!controller.signal.aborted) {
            setError(
              streamError instanceof Error
                ? streamError.message
                : "The connection dropped.",
            );
          }
        } finally {
          setPending(false);
          setStatus(null);
          abortRef.current = null;
        }
      })();
    },
    [auth, conversationId, pending],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPending(false);
    setStatus(null);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setConversationId(null);
    setError(null);
    setPending(false);
    setStatus(null);
  }, []);

  const open = useCallback(
    (id: string) => {
      abortRef.current?.abort();
      setPending(true);
      setTurns([]);
      setConversationId(id);
      void (async () => {
        try {
          const token = await auth.getAccessToken();
          const response = await fetch(`/api/personalized/conversations/${id}`, {
            cache: "no-store",
            headers: token ? { authorization: `Bearer ${token}` } : {},
          });
          const body = (await response.json()) as { messages?: PersonalizedMessage[] };
          setTurns(
            (body.messages ?? []).map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              answer: message.answer,
            })),
          );
        } catch {
          setError("That conversation could not be opened.");
        } finally {
          setPending(false);
        }
      })();
    },
    [auth],
  );

  return { turns, status, pending, error, conversationId, send, stop, reset, open };
}

/* ---------------------------------------------------------------------------
   Memory
--------------------------------------------------------------------------- */

export interface MemoryFeed {
  memories: PersonalizedMemory[];
  loading: boolean;
  error: string | null;
  save: (type: string, value: unknown) => Promise<string | null>;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

export function usePersonalizedMemory(): MemoryFeed {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [memories, setMemories] = useState<PersonalizedMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const signedIn = auth.ready && auth.authenticated;

  const load = useCallback(async (): Promise<PersonalizedMemory[]> => {
    if (!signedIn) return [];
    try {
      const response = await authedFetch("/api/personalized/memory", { cache: "no-store" });
      const body = (await response.json()) as { memories?: PersonalizedMemory[] };
      return body.memories ?? [];
    } catch {
      return [];
    }
  }, [authedFetch, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setMemories(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce]);

  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  const save = useCallback(
    async (type: string, value: unknown): Promise<string | null> => {
      try {
        const response = await authedFetch("/api/personalized/memory", {
          method: "POST",
          body: JSON.stringify({ type, value }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "Could not save that preference.");
          return body.error ?? "Could not save that preference.";
        }
        setError(null);
        refetch();
        return null;
      } catch {
        const message = "Could not save that preference.";
        setError(message);
        return message;
      }
    },
    [authedFetch, refetch],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await authedFetch(`/api/personalized/memory/${id}`, { method: "DELETE" });
        refetch();
      } catch {
        setError("Could not remove that preference.");
      }
    },
    [authedFetch, refetch],
  );

  return {
    memories: memories ?? [],
    loading: signedIn && memories === null,
    error,
    save,
    remove,
    refetch,
  };
}

/* ---------------------------------------------------------------------------
   History
--------------------------------------------------------------------------- */

export function usePersonalizedConversations(nonce: number): {
  conversations: PersonalizedConversation[];
  remove: (id: string) => Promise<void>;
} {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const [conversations, setConversations] = useState<PersonalizedConversation[]>([]);
  const [localNonce, setLocalNonce] = useState(0);

  const signedIn = auth.ready && auth.authenticated;

  const load = useCallback(async (): Promise<PersonalizedConversation[]> => {
    if (!signedIn) return [];
    try {
      const response = await authedFetch("/api/personalized/conversations", {
        cache: "no-store",
      });
      const body = (await response.json()) as { conversations?: PersonalizedConversation[] };
      return body.conversations ?? [];
    } catch {
      return [];
    }
  }, [authedFetch, signedIn]);

  useEffect(() => {
    let cancelled = false;
    void load().then((next) => {
      if (!cancelled) setConversations(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load, nonce, localNonce]);

  const remove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await authedFetch(`/api/personalized/conversations/${id}`, { method: "DELETE" });
        setLocalNonce((value) => value + 1);
      } catch {
        /* The list simply does not change. */
      }
    },
    [authedFetch],
  );

  return { conversations, remove };
}

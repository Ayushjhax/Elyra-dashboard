import { create } from "zustand";
import {
  CONTEXT_SOURCES,
  type ContextSource,
  type PersonalizedAnswer,
  type PersonalizedConversation,
  type PersonalizedMemory,
  type PersonalizedMessage,
  type PersonalizedStreamEvent,
  type MemoryType,
} from "@/lib/personalized/types";
import type { AttachmentPayload } from "@/lib/attachments";
import { api, ApiError, streamSse } from "~/lib/api";
import { currentAccount, onAccountChange } from "~/lib/session";
import { createAccountStore } from "~/lib/stores/createAccountStore";

export interface ChatRequest {
  text: string;
  sources: ContextSource[];
  attachments: AttachmentPayload[];
}
export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer: PersonalizedAnswer | null;
  request?: ChatRequest;
  outcome?: { state: "failed" | "stopped"; error: string | null };
}
interface ChatState {
  turns: ChatTurn[];
  draft: string;
  sources: ContextSource[];
  pending: boolean;
  status: string | null;
  opening: boolean;
  error: string | null;
  openError: string | null;
  conversationId: string | null;
  title: string | null;
}
const initial = (): ChatState => ({
  turns: [],
  draft: "",
  sources: [...CONTEXT_SOURCES],
  pending: false,
  status: null,
  opening: false,
  error: null,
  openError: null,
  conversationId: null,
  title: null,
});
// Session memory only: navigation never discards a reply or draft, sign-out does.
export const usePersonalizedChat = create<ChatState>(initial);
let generation = 0;
let active: AbortController | null = null;
let counter = 0;
const id = () => `capital-${++counter}`;
const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Could not reach Elyra.";
export const setDraft = (draft: string) =>
  usePersonalizedChat.setState({ draft, error: null });
export function toggleSource(source: ContextSource) {
  usePersonalizedChat.setState(({ sources }) => ({
    sources: sources.includes(source)
      ? sources.filter((s) => s !== source)
      : [...sources, source],
  }));
}
export function resetChat() {
  generation++;
  active?.abort();
  active = null;
  usePersonalizedChat.setState(initial());
}
onAccountChange(resetChat);
function mark(turnId: string, outcome: ChatTurn["outcome"]) {
  usePersonalizedChat.setState(({ turns }) => ({
    turns: turns.map((turn) =>
      turn.id === turnId ? { ...turn, outcome } : turn,
    ),
  }));
}
async function run(request: ChatRequest, turnId: string, retry: boolean) {
  const ticket = generation;
  const controller = new AbortController();
  active = controller;
  const current = () => ticket === generation && active === controller;
  usePersonalizedChat.setState({
    pending: true,
    status: "Thinking…",
    error: null,
  });
  let answered = false;
  let opened = false;
  let failed = false;
  try {
    for await (const frame of streamSse("/api/personalized/chat", {
      method: "POST",
      signal: controller.signal,
      body: {
        message: request.text,
        attachments: request.attachments,
        sources: request.sources,
        conversationId: usePersonalizedChat.getState().conversationId,
        retry,
      },
    })) {
      if (!current() || controller.signal.aborted) break;
      opened = true;
      let event: PersonalizedStreamEvent;
      try {
        event = JSON.parse(frame.data) as PersonalizedStreamEvent;
      } catch {
        continue;
      }
      if (event.type === "status")
        usePersonalizedChat.setState({ status: event.status });
      else if (event.type === "conversation" || event.type === "done") {
        if (event.conversationId)
          usePersonalizedChat.setState({
            conversationId: event.conversationId,
          });
      } else if (event.type === "answer" && !answered) {
        answered = true;
        usePersonalizedChat.setState(({ turns }) => ({
          turns: [
            ...turns.map((turn) =>
              turn.id === turnId ? { ...turn, outcome: undefined } : turn,
            ),
            {
              id: id(),
              role: "assistant",
              content: event.answer.message,
              answer: event.answer,
            },
          ],
        }));
      } else if (event.type === "error" && !answered) {
        failed = true;
        mark(turnId, { state: "failed", error: event.error });
      }
    }
    if (current() && !answered && !failed)
      mark(turnId, {
        state: controller.signal.aborted ? "stopped" : "failed",
        error: controller.signal.aborted ? null : "The answer did not arrive.",
      });
  } catch (failure) {
    if (!current() || answered) return;
    if (controller.signal.aborted)
      mark(turnId, { state: "stopped", error: null });
    else if (
      !opened &&
      failure instanceof ApiError &&
      failure.status > 0 &&
      !retry
    ) {
      // Refused before anything ran: return the question to the composer.
      usePersonalizedChat.setState(({ turns }) => ({
        turns: turns.filter((turn) => turn.id !== turnId),
        draft: request.text,
        error: message(failure),
      }));
    } else mark(turnId, { state: "failed", error: message(failure) });
  } finally {
    if (current()) {
      active = null;
      usePersonalizedChat.setState({ pending: false, status: null });
    }
  }
}
export async function sendPersonalized(
  text = usePersonalizedChat.getState().draft,
  attachments: AttachmentPayload[] = [],
) {
  const state = usePersonalizedChat.getState();
  if (
    currentAccount() === null ||
    state.pending ||
    state.opening ||
    state.openError !== null ||
    (!text.trim() && attachments.length === 0)
  )
    return;
  const request: ChatRequest = {
    text: text.trim(),
    sources: [...state.sources],
    attachments,
  };
  const turnId = id();
  usePersonalizedChat.setState({
    turns: [
      ...state.turns,
      {
        id: turnId,
        role: "user",
        content: request.text,
        answer: null,
        request,
      },
    ],
    draft: "",
    title: state.title ?? request.text.slice(0, 60),
  });
  await run(request, turnId, false);
}
export async function retryPersonalized(turnId: string) {
  const state = usePersonalizedChat.getState();
  const turn = state.turns.find((entry) => entry.id === turnId);
  if (state.pending || state.opening || !turn?.request || !turn.outcome) return;
  mark(turnId, undefined);
  await run(turn.request, turnId, true);
}
export function stopPersonalized() {
  active?.abort();
}
export async function openConversation(conversation: PersonalizedConversation) {
  resetChat();
  const ticket = generation;
  const controller = new AbortController();
  active = controller;
  usePersonalizedChat.setState({
    opening: true,
    conversationId: conversation.id,
    title: conversation.title,
  });
  try {
    const body = await api.get<{ messages: PersonalizedMessage[] }>(
      `/api/personalized/conversations/${encodeURIComponent(conversation.id)}`,
      { signal: controller.signal },
    );
    if (ticket === generation)
      usePersonalizedChat.setState({
        turns: body.messages.map((entry) => ({
          id: entry.id,
          role: entry.role,
          content: entry.content,
          answer: entry.answer,
        })),
      });
  } catch (failure) {
    if (ticket === generation)
      usePersonalizedChat.setState({ openError: message(failure) });
  } finally {
    if (ticket === generation) {
      active = null;
      usePersonalizedChat.setState({ opening: false });
    }
  }
}

export const memoryStore = createAccountStore<PersonalizedMemory[]>({
  pollMs: 60_000,
  load: async (signal) =>
    (
      await api.get<{ memories: PersonalizedMemory[] }>(
        "/api/personalized/memory",
        { signal },
      )
    ).memories,
});
export const historyStore = createAccountStore<PersonalizedConversation[]>({
  pollMs: 60_000,
  load: async (signal) =>
    (
      await api.get<{ conversations: PersonalizedConversation[] }>(
        "/api/personalized/conversations",
        { signal },
      )
    ).conversations,
});
export async function writeMemory(
  type: MemoryType,
  value: unknown,
  memoryId?: string,
) {
  const account = currentAccount();
  if (!account) throw new Error("Sign in to save preferences.");
  if (memoryId)
    await api.patch(
      `/api/personalized/memory/${encodeURIComponent(memoryId)}`,
      { value },
    );
  else await api.post("/api/personalized/memory", { type, value });
  if (currentAccount() === account) await memoryStore.refresh();
}
export async function removeMemory(memoryId: string) {
  const account = currentAccount();
  await api.delete(`/api/personalized/memory/${encodeURIComponent(memoryId)}`);
  if (currentAccount() === account) await memoryStore.refresh();
}
export async function deleteConversation(conversationId: string) {
  const ticket = generation;
  const account = currentAccount();
  await api.delete(
    `/api/personalized/conversations/${encodeURIComponent(conversationId)}`,
  );
  if (currentAccount() !== account) return;
  if (
    generation === ticket &&
    usePersonalizedChat.getState().conversationId === conversationId
  )
    resetChat();
  await historyStore.refresh();
}

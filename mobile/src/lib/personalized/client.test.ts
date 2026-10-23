import type {
  PersonalizedConversation,
  PersonalizedStreamEvent,
} from "@/lib/personalized/types";
import { api, ApiError, streamSse } from "~/lib/api";
import {
  deleteConversation,
  openConversation,
  resetChat,
  retryPersonalized,
  sendPersonalized,
  setDraft,
  stopPersonalized,
  toggleSource,
  usePersonalizedChat,
} from "~/lib/personalized/client";
import { setAccount } from "~/lib/session";
jest.mock("~/lib/api", () => {
  const actual = jest.requireActual("~/lib/api");
  return {
    ...actual,
    streamSse: jest.fn(),
    api: { get: jest.fn(), delete: jest.fn() },
  };
});
const stream = streamSse as jest.Mock;
const get = api.get as jest.Mock;
const remove = api.delete as jest.Mock;
const state = () => usePersonalizedChat.getState();
const conversation: PersonalizedConversation = {
  id: "conversation-1",
  title: "My account",
  createdAt: "2026-10-23T00:00:00Z",
  updatedAt: "2026-10-23T00:00:00Z",
};
const events = (list: PersonalizedStreamEvent[]) =>
  (async function* () {
    for (const event of list) yield { data: JSON.stringify(event) };
  })();
const answer = {
  message: "Your balances are available.",
  contextUsed: ["portfolio"],
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  setAccount("account-a");
  resetChat();
  jest.clearAllMocks();
});
afterEach(() => {
  resetChat();
  setAccount(null);
});
it("sends the selected sources, stores the early conversation id, and appends one complete answer", async () => {
  toggleSource("positions");
  stream.mockReturnValue(
    events([
      { type: "status", status: "Reading…" },
      { type: "conversation", conversationId: "c1" },
      { type: "answer", answer },
      { type: "done", conversationId: "c1", messageId: "m1" },
    ]),
  );
  await sendPersonalized("My balances?");
  expect(stream.mock.calls[0][1].body).toMatchObject({
    sources: ["portfolio", "activity", "memory"],
    conversationId: null,
    retry: false,
  });
  expect(state()).toMatchObject({
    pending: false,
    conversationId: "c1",
    status: null,
  });
  expect(state().turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
});
it("retries a failed turn in the same conversation with its original sources and without a second user turn", async () => {
  stream.mockReturnValueOnce(
    events([
      { type: "conversation", conversationId: "c1" },
      { type: "error", error: "Provider failed" },
    ]),
  );
  await sendPersonalized("My positions?");
  toggleSource("positions");
  stream.mockReturnValueOnce(events([{ type: "answer", answer }]));
  await retryPersonalized(state().turns[0].id);
  expect(stream.mock.calls[1][1].body).toMatchObject({
    retry: true,
    conversationId: "c1",
    sources: ["portfolio", "positions", "activity", "memory"],
  });
  expect(state().turns).toHaveLength(2);
  expect(state().turns[0].outcome).toBeUndefined();
});
it("returns a rejected question to the composer and keeps HTTP rejection distinct from a stream failure", async () => {
  stream.mockImplementation(async function* () {
    throw new ApiError("Too many requests", 429);
  });
  await sendPersonalized("My account?");
  expect(state()).toMatchObject({
    draft: "My account?",
    error: "Too many requests",
    turns: [],
    pending: false,
  });
});
it("marks a truncated stream failed rather than silently successful", async () => {
  stream.mockReturnValue(events([{ type: "status", status: "Reading…" }]));
  await sendPersonalized("My account?");
  expect(state().turns[0].outcome).toMatchObject({
    state: "failed",
    error: "The answer did not arrive.",
  });
});
it("stops and allows retry of the original question", async () => {
  stream.mockImplementation((_path, { signal }) =>
    (async function* () {
      yield {
        data: JSON.stringify({ type: "conversation", conversationId: "c1" }),
      };
      await new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    })(),
  );
  const sending = sendPersonalized("My account?");
  await tick();
  stopPersonalized();
  await sending;
  expect(state().turns[0].outcome).toEqual({ state: "stopped", error: null });
  expect(state().pending).toBe(false);
});
it("drops late answers and finalizers after reset, without settling the next generation", async () => {
  let release!: () => void;
  stream.mockReturnValueOnce(
    (async function* () {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield { data: JSON.stringify({ type: "answer", answer }) };
    })(),
  );
  const first = sendPersonalized("Old account?");
  await tick();
  setAccount("account-b");
  setDraft("New draft");
  release();
  await first;
  expect(state()).toMatchObject({
    turns: [],
    draft: "New draft",
    pending: false,
    conversationId: null,
  });
});
it("ignores duplicate sends in the same frame", async () => {
  stream.mockReturnValue(events([{ type: "answer", answer }]));
  await Promise.all([sendPersonalized("First"), sendPersonalized("Second")]);
  expect(stream).toHaveBeenCalledTimes(1);
});
it("opening a conversation blocks sends until history finishes, and ignores a late opening after reset", async () => {
  let release!: (value: unknown) => void;
  get.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const opening = openConversation(conversation);
  await sendPersonalized("Must wait");
  expect(stream).not.toHaveBeenCalled();
  resetChat();
  release({
    messages: [{ id: "old", role: "user", content: "Old", answer: null }],
  });
  await opening;
  expect(state()).toMatchObject({
    turns: [],
    conversationId: null,
    opening: false,
  });
});
it("keeps a failed history read blocked even when editing the composer", async () => {
  get.mockRejectedValueOnce(new Error("History unavailable"));
  await openConversation(conversation);
  setDraft("Follow up");
  await sendPersonalized();
  expect(state().openError).toBe("History unavailable");
  expect(stream).not.toHaveBeenCalled();
});
it("opens saved messages and sends follow ups with their conversation id", async () => {
  get.mockResolvedValueOnce({
    messages: [
      { id: "saved", role: "assistant", content: answer.message, answer },
    ],
  });
  await openConversation(conversation);
  stream.mockReturnValue(events([{ type: "answer", answer }]));
  await sendPersonalized("And today?");
  expect(stream.mock.calls[0][1].body.conversationId).toBe(conversation.id);
  expect(state().turns[0].answer).toEqual(answer);
});
it("does not clear the current conversation when a delete fails", async () => {
  get.mockResolvedValueOnce({ messages: [] });
  await openConversation(conversation);
  remove.mockRejectedValueOnce(new Error("Delete failed"));
  await expect(deleteConversation(conversation.id)).rejects.toThrow(
    "Delete failed",
  );
  expect(state().conversationId).toBe(conversation.id);
});

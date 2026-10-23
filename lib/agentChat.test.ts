import { afterEach, describe, expect, it, vi } from "vitest";
import { endConversation, sendToAgent } from "@/lib/agentChat";
import { useElyraStore } from "@/lib/store";

afterEach(() => {
  vi.unstubAllGlobals();
  endConversation();
});

describe("endConversation", () => {
  it("clears the transcript, the draft and anything staged", () => {
    const store = useElyraStore.getState();
    store.appendMessage({ id: "u1", role: "user", text: "What do I hold?", at: "2026-10-17T00:00:00Z" });
    store.setComposerDraft("and my perps?");
    store.addComposerAttachments([{ id: "f1", name: "a.csv", kind: "file", mediaType: "text/csv", data: "YQ==", size: 1 } as never]);

    endConversation();

    const after = useElyraStore.getState();
    expect(after.messages).toEqual([]);
    expect(after.composerDraft).toBe("");
    expect(after.composerAttachments).toEqual([]);
  });

  it("stops a reply still arriving, and nothing lands after", async () => {
    /* A request that only ends when it is aborted. */
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );

    const sending = sendToAgent("What do I hold?", async () => "token");
    await vi.waitFor(() => expect(useElyraStore.getState().agentPending).toBe(true));

    endConversation();
    await sending;

    const after = useElyraStore.getState();
    expect(after.messages).toEqual([]);
    expect(after.agentPending).toBe(false);
    expect(after.streamingId).toBeNull();
  });
});

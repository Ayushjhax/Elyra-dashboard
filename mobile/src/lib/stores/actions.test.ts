import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { OpenAction } from "@/lib/actions/types";
import { api, ApiError } from "~/lib/api";
import { setAccount } from "~/lib/session";
import { __actionsStore, useOpenActions } from "~/lib/stores/actions";

/* The review cards' promises: a swap the wallet signed never comes back as
   open, even when recording it fails; a signature the server says proves
   nothing puts the action back; a refused dismiss restores the card. */

jest.mock("~/lib/api", () => {
  const actual = jest.requireActual("~/lib/api");
  return { ...actual, api: { get: jest.fn(), post: jest.fn() } };
});

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

function action(id: string): OpenAction {
  return {
    id,
    surface: "agent",
    status: "prepared",
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    action: {
      id,
      kind: "swap",
      summary: "Swap 0.01 SOL to USDC",
      fields: [],
      readiness: "ready",
      reason: null,
      warnings: [],
      preparedAt: new Date().toISOString(),
      params: { symbol: "SOL", toSymbol: "USDC", quantity: 0.01 },
    },
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ actions: [action("a1"), action("a2")], error: null });
});

afterEach(async () => {
  await act(() => setAccount(null));
});

async function signedIn() {
  await act(() => setAccount("did:privy:test"));
  const view = await renderHook(() => useOpenActions());
  await waitFor(() => expect(view.result.current.actions.map((entry) => entry.id)).toEqual(["a1", "a2"]));
  return view;
}

it("keeps a signed swap off the list when recording it fails, and retries on the next read", async () => {
  const view = await signedIn();
  post.mockRejectedValueOnce(new ApiError("Database unavailable", 503));

  await act(async () => {
    await view.result.current.confirm("a1", "sig1");
  });
  expect(view.result.current.actions.map((entry) => entry.id)).toEqual(["a2"]);
  expect(view.result.current.error).toMatch(/swap went through/);
  expect(__actionsStore.unrecorded.get("a1")).toBe("sig1");

  /* The server still lists it as open; it must stay hidden while the retry runs. */
  post.mockResolvedValueOnce({ ok: true });
  await act(async () => {
    await __actionsStore.store.refetch();
  });
  expect(view.result.current.actions.map((entry) => entry.id)).toEqual(["a2"]);
  await waitFor(() => expect(__actionsStore.unrecorded.size).toBe(0));
  expect(post).toHaveBeenLastCalledWith("/api/actions", { id: "a1", op: "confirm", signature: "sig1" });
  await view.unmount();
});

it("puts the action back when the server says the signature proves nothing", async () => {
  const view = await signedIn();
  post.mockRejectedValueOnce(new ApiError("That signature does not prove the swap.", 422));

  await act(async () => {
    await view.result.current.confirm("a1", "bogus");
  });
  expect(__actionsStore.unrecorded.size).toBe(0);
  await waitFor(() => expect(view.result.current.actions.map((entry) => entry.id)).toEqual(["a1", "a2"]));
  await view.unmount();
});

it("restores a card whose dismiss the server refused", async () => {
  const view = await signedIn();
  post.mockRejectedValueOnce(new ApiError("Database unavailable", 503));

  await act(async () => {
    await view.result.current.dismiss("a2");
  });
  expect(view.result.current.actions.map((entry) => entry.id)).toEqual(["a1", "a2"]);
  expect(view.result.current.error).toBe("That could not be saved. Try again.");
  await view.unmount();
});

it("forgets an unrecorded swap when the account changes", async () => {
  const view = await signedIn();
  post.mockRejectedValueOnce(new ApiError("Database unavailable", 503));
  await act(async () => {
    await view.result.current.confirm("a1", "sig1");
  });
  expect(__actionsStore.unrecorded.size).toBe(1);

  await act(() => setAccount("did:privy:other"));
  expect(__actionsStore.unrecorded.size).toBe(0);
  await view.unmount();
});

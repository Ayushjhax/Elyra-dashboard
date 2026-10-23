import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createAccountStore } from "~/lib/stores/createAccountStore";
import { setAccount } from "~/lib/session";

/* The guarantees every account store gives: one read however many screens
   subscribe, nothing read while signed out, and a read that started for one
   account never landing under another. */

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

afterEach(async () => {
  await act(() => setAccount(null));
});

it("reads once for many subscribers, and not at all while signed out", async () => {
  const load = jest.fn(async () => ({ total: 1 }));
  const store = createAccountStore({ load, pollMs: 60_000 });

  const first = await renderHook(() => store.useFeed());
  const second = await renderHook(() => store.useFeed());
  expect(load).not.toHaveBeenCalled();
  expect(first.result.current.signedIn).toBe(false);

  await act(() => setAccount("did:privy:a"));
  await waitFor(() => expect(first.result.current.data).toEqual({ total: 1 }));
  expect(second.result.current.data).toEqual({ total: 1 });
  expect(load).toHaveBeenCalledTimes(1);

  await first.unmount();
  await second.unmount();
});

it("drops a read that started before the account changed", async () => {
  const forA = deferred<{ owner: string }>();
  const load = jest
    .fn()
    .mockImplementationOnce(() => forA.promise)
    .mockImplementation(async () => ({ owner: "b" }));
  const store = createAccountStore({ load, pollMs: 60_000 });

  await act(() => setAccount("did:privy:a"));
  const view = await renderHook(() => store.useFeed());
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

  await act(() => setAccount("did:privy:b"));
  /* A's answer lands after the switch. It must not be shown as B's. */
  await act(async () => forA.resolve({ owner: "a" }));

  await waitFor(() => expect(view.result.current.data).toEqual({ owner: "b" }));
  await view.unmount();
});

it("keeps the last good value on a failed refresh, labelled stale", async () => {
  const load = jest
    .fn()
    .mockResolvedValueOnce({ total: 5 })
    .mockRejectedValueOnce(new Error("The RPC did not answer."));
  const store = createAccountStore({ load, pollMs: 60_000 });

  await act(() => setAccount("did:privy:c"));
  const view = await renderHook(() => store.useFeed());
  await waitFor(() => expect(view.result.current.data).toEqual({ total: 5 }));

  await act(async () => {
    await store.refetch();
  });
  expect(view.result.current.data).toEqual({ total: 5 });
  expect(view.result.current.stale).toBe(true);
  expect(view.result.current.error).toBe("The RPC did not answer.");
  await view.unmount();
});

it("empties at once when the person signs out", async () => {
  const store = createAccountStore({ load: async () => ({ total: 9 }), pollMs: 60_000 });
  await act(() => setAccount("did:privy:d"));
  const view = await renderHook(() => store.useFeed());
  await waitFor(() => expect(view.result.current.data).toEqual({ total: 9 }));

  await act(() => setAccount(null));
  expect(view.result.current.data).toBeNull();
  expect(view.result.current.signedIn).toBe(false);
  await view.unmount();
});

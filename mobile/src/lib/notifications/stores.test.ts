import { act, renderHook, waitFor } from "@testing-library/react-native";
import { api } from "~/lib/api";
import { setAccount } from "~/lib/session";
import {
  inboxStore,
  markNotificationsRead,
  useInbox,
} from "~/lib/notifications/stores";
jest.mock("~/lib/api", () => {
  const actual = jest.requireActual("~/lib/api");
  return { ...actual, api: { get: jest.fn(), post: jest.fn() } };
});
const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const row = (id: string, at: string, readAt: string | null = null) => ({
  id,
  kind: "system",
  title: "An update",
  body: "Your account update",
  data: { route: "/notifications" },
  createdAt: at,
  readAt,
});
beforeEach(() => {
  jest.clearAllMocks();
  setAccount("account-a");
});
afterEach(async () => {
  await act(() => setAccount(null));
});
it("keeps older pages on refresh without duplicating entries", async () => {
  get.mockResolvedValueOnce({
    accountId: "a",
    notifications: [row("2", "2026-10-23T12:00:00Z")],
    nextCursor: "older",
    unread: 2,
  });
  const hook = await renderHook(() => useInbox());
  await waitFor(() => expect(hook.result.current.entries).toHaveLength(1));
  get.mockResolvedValueOnce({
    accountId: "a",
    notifications: [
      row("2", "2026-10-23T12:00:00Z"),
      row("1", "2026-10-22T12:00:00Z"),
    ],
    nextCursor: null,
    unread: 2,
  });
  await act(() => hook.result.current.more());
  expect(hook.result.current.entries.map((entry) => entry.id)).toEqual([
    "2",
    "1",
  ]);
  get.mockResolvedValueOnce({
    accountId: "a",
    notifications: [
      row("3", "2026-10-23T13:00:00Z"),
      row("2", "2026-10-23T12:00:00Z"),
    ],
    nextCursor: "older",
    unread: 3,
  });
  await act(() => inboxStore.refresh());
  expect(hook.result.current.entries.map((entry) => entry.id)).toEqual([
    "3",
    "2",
    "1",
  ]);
  await hook.unmount();
});
it("keeps a row unread when the mark-read request fails", async () => {
  get.mockResolvedValue({
    accountId: "a",
    notifications: [row("1", "2026-10-23T12:00:00Z")],
    nextCursor: null,
    unread: 1,
  });
  const hook = await renderHook(() => useInbox());
  await waitFor(() => expect(hook.result.current.unread).toBe(1));
  post.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    await expect(markNotificationsRead(["1"])).rejects.toThrow("Offline");
  });
  expect(hook.result.current.entries[0].readAt).toBeNull();
  expect(hook.result.current.unread).toBe(1);
  await hook.unmount();
});
it("drops a late inbox read on account change", async () => {
  let release!: (value: unknown) => void;
  get
    .mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    )
    .mockResolvedValue({
      accountId: "b",
      notifications: [],
      unread: 0,
      nextCursor: null,
    });
  const hook = await renderHook(() => useInbox());
  await act(async () => {
    setAccount("account-b");
    release({
      accountId: "a",
      notifications: [row("old", "2026-10-23T12:00:00Z")],
      unread: 1,
      nextCursor: null,
    });
  });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  expect(hook.result.current.entries).toEqual([]);
  expect(hook.result.current.unread).toBe(0);
  await hook.unmount();
});

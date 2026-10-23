import { act, renderHook, waitFor } from "@testing-library/react-native";
import { api, ApiError } from "~/lib/api";
import { setAccount } from "~/lib/session";
import { refetchAlerts, useAlerts } from "~/lib/stores/alerts";
import { useWatchlist } from "~/lib/stores/watchlist";

/* The alerts store's race guard — a read that overlapped a write is not
   believed — and the watchlist's rollback when the server refuses a change. */

jest.mock("~/lib/api", () => {
  const actual = jest.requireActual("~/lib/api");
  return { ...actual, api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } };
});

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const remove = api.delete as jest.Mock;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
});

afterEach(async () => {
  await act(() => setAccount(null));
});

it("drops an alerts read that overlapped a write, and reads again after it", async () => {
  const stale = deferred<unknown>();
  get
    .mockImplementationOnce(async () => ({ alerts: [], delivery: null, appDelivery: "inbox", error: null }))
    .mockImplementationOnce(() => stale.promise)
    .mockImplementation(async () => ({
      alerts: [{ id: "new", symbol: "SOL", direction: "above", target: 200, createdPrice: 150, triggeredAt: null }],
      delivery: null,
      appDelivery: "inbox",
      error: null,
    }));
  post.mockResolvedValue({ ok: true });

  await act(() => setAccount("did:privy:alerts"));
  const view = await renderHook(() => useAlerts());
  await waitFor(() => expect(view.result.current.loading).toBe(false));

  /* A poll starts, then the person saves an alert while it is in flight. */
  let refetch!: Promise<void>;
  await act(async () => {
    refetch = refetchAlerts();
  });
  let saving!: Promise<string | null>;
  await act(async () => {
    saving = view.result.current.create({ symbol: "SOL", direction: "above", target: 200, currentPrice: 150 });
  });
  /* The overlapping read lands with the list from before the write. */
  await act(async () => {
    stale.resolve({ alerts: [], delivery: null, appDelivery: "inbox", error: null });
    await refetch;
    expect(await saving).toBeNull();
  });
  await waitFor(() => expect(view.result.current.alerts.map((alert) => alert.id)).toEqual(["new"]));
  expect(view.result.current.appDelivery).toBe("inbox");
  await view.unmount();
});

it("puts a removed market back when the server refuses, with the reason", async () => {
  get.mockResolvedValue({ symbols: ["SOL", "BTC"] });
  remove.mockRejectedValueOnce(new ApiError("The watchlist could not be saved.", 503));

  await act(() => setAccount("did:privy:watch"));
  const view = await renderHook(() => useWatchlist());
  await waitFor(() => expect(view.result.current.symbols).toEqual(["SOL", "BTC"]));

  await act(async () => {
    await view.result.current.remove("BTC");
  });
  expect(view.result.current.symbols).toEqual(["SOL", "BTC"]);
  expect(view.result.current.writeError).toBe("The watchlist could not be saved.");
  await view.unmount();
});

it("installs the server's answer after an add", async () => {
  get.mockResolvedValue({ symbols: ["SOL"] });
  post.mockResolvedValueOnce({ symbols: ["SOL", "ETH"] });

  await act(() => setAccount("did:privy:watch2"));
  const view = await renderHook(() => useWatchlist());
  await waitFor(() => expect(view.result.current.symbols).toEqual(["SOL"]));

  await act(async () => {
    await view.result.current.add("ETH");
  });
  expect(view.result.current.symbols).toEqual(["SOL", "ETH"]);
  expect(view.result.current.writeError).toBeNull();
  await view.unmount();
});

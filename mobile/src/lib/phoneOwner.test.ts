import { claimPhoneFor, useAppStore } from "~/lib/store";

/* Starred markets, recent searches and the inbox's seen time are a person's:
   the same person signing back in keeps them, anyone else starts clean. */

beforeAll(async () => {
  await useAppStore.persist.rehydrate();
});

function seed() {
  useAppStore.setState({
    favorites: ["SOL"],
    recentSearches: [{ id: 1, symbol: "SOL" }],
    notificationsSeenAt: "2026-10-24T00:00:00.000Z",
    avatar: "data:image/jpeg;base64,AAAA",
    balancesHidden: true,
  });
}

it("keeps them for the account they belong to", () => {
  useAppStore.setState({ owner: null });
  claimPhoneFor("account-a");
  seed();
  claimPhoneFor("account-a");
  expect(useAppStore.getState().favorites).toEqual(["SOL"]);
  expect(useAppStore.getState().recentSearches).toHaveLength(1);
});

it("clears them when another account signs in, and keeps the phone's own settings", () => {
  useAppStore.setState({ owner: "account-a" });
  seed();
  claimPhoneFor("account-b");
  const state = useAppStore.getState();
  expect(state.owner).toBe("account-b");
  expect(state.favorites).toEqual([]);
  expect(state.recentSearches).toEqual([]);
  expect(state.notificationsSeenAt).toBeNull();
  expect(state.avatar).toBeNull();
  expect(state.balancesHidden).toBe(true);
});

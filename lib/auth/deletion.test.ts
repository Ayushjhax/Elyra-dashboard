import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "@/lib/test/supabase-fake";

/* ---------------------------------------------------------------------------
   Deleting an account: the stored PDFs, the profile row, then the Privy
   user — and a retry after any of them finishes the job instead of failing.
--------------------------------------------------------------------------- */

class NotFound extends Error {}

const state = vi.hoisted(() => ({
  db: null as unknown as FakeSupabase,
  files: new Map<string, string[]>(),
  removed: [] as string[],
  bucketMissing: false,
  privyUsers: new Set<string>(),
  privyFails: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@privy-io/node", () => ({ NotFoundError: NotFound }));
vi.mock("@/lib/supabase/server", () => ({ serviceClient: () => state.db }));
vi.mock("@/lib/research/store", () => ({ RESEARCH_BUCKET: "research-reports" }));
vi.mock("@/lib/auth/session", () => ({ forgetAddresses: () => {} }));
vi.mock("@/lib/auth/privy", () => ({
  PRIVY_TIMEOUT_MS: 5000,
  privyClient: () => ({
    users: () => ({
      delete: async (did: string) => {
        if (state.privyFails) throw new Error("Privy is down");
        if (!state.privyUsers.delete(did)) throw new NotFound("not found");
      },
    }),
  }),
}));

function withStorage(db: FakeSupabase): FakeSupabase {
  return Object.assign(db, {
    storage: {
      from: () => ({
        list: async (folder: string) =>
          state.bucketMissing
            ? { data: null, error: { message: "Bucket not found" } }
            : { data: (state.files.get(folder) ?? []).map((name) => ({ name })), error: null },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          for (const path of paths) {
            const [folder, name] = path.split("/");
            state.files.set(folder, (state.files.get(folder) ?? []).filter((entry) => entry !== name));
          }
          return { data: [], error: null };
        },
      }),
    },
  });
}

beforeEach(() => {
  state.db = withStorage(new FakeSupabase());
  state.db.seed("profiles", [
    { id: "user-a", privy_did: "did:privy:a" },
    { id: "user-b", privy_did: "did:privy:b" },
  ]);
  state.db.seed("research_reports", [
    { id: "r1", user_id: "user-a", pdf_path: "user-a/r1.pdf" },
    { id: "r2", user_id: "user-b", pdf_path: "user-b/r2.pdf" },
  ]);
  state.files = new Map([
    ["user-a", ["r1.pdf", "old.pdf"]],
    ["user-b", ["r2.pdf"]],
  ]);
  state.removed = [];
  state.bucketMissing = false;
  state.privyUsers = new Set(["did:privy:a", "did:privy:b"]);
  state.privyFails = false;
});

describe("deleteAccount", () => {
  it("removes the account's files, its profile and its Privy user — and nobody else's", async () => {
    const { deleteAccount } = await import("@/lib/auth/deletion");

    const result = await deleteAccount("did:privy:a");

    expect(result).toEqual({ ok: true, profileDeleted: true, filesDeleted: 2, privyDeleted: true });
    expect(state.removed.sort()).toEqual(["user-a/old.pdf", "user-a/r1.pdf"]);
    expect(state.db.rows("profiles").map((row) => row.id)).toEqual(["user-b"]);
    expect(state.privyUsers.has("did:privy:a")).toBe(false);
    expect(state.privyUsers.has("did:privy:b")).toBe(true);
    expect(state.files.get("user-b")).toEqual(["r2.pdf"]);
  });

  it("is idempotent: a second call finds nothing left and still succeeds", async () => {
    const { deleteAccount } = await import("@/lib/auth/deletion");

    await deleteAccount("did:privy:a");
    const again = await deleteAccount("did:privy:a");

    expect(again).toEqual({ ok: true, profileDeleted: false, filesDeleted: 0, privyDeleted: false });
  });

  it("finishes on retry when Privy failed after the data was deleted", async () => {
    const { deleteAccount } = await import("@/lib/auth/deletion");

    state.privyFails = true;
    const first = await deleteAccount("did:privy:a");
    expect(first).toMatchObject({ ok: false, step: "privy" });
    expect(state.db.rows("profiles").map((row) => row.id)).toEqual(["user-b"]);

    state.privyFails = false;
    const retry = await deleteAccount("did:privy:a");
    expect(retry).toEqual({ ok: true, profileDeleted: false, filesDeleted: 0, privyDeleted: true });
  });

  it("treats a deployment with no reports bucket as having stored nothing", async () => {
    const { deleteAccount } = await import("@/lib/auth/deletion");

    state.bucketMissing = true;
    state.db.seed("research_reports", []);
    const result = await deleteAccount("did:privy:a");

    expect(result).toMatchObject({ ok: true, profileDeleted: true });
  });
});

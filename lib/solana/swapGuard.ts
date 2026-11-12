import "server-only";

import { getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import { RpcUnconfiguredError, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, rpcCall } from "@/lib/solana/rpc";
import {
  decodeLookupTable,
  decodeTokenAccount,
  judgeSwapEffects,
  type SwapVerdict,
  type TokenAccountView,
} from "@/lib/solana/swapEffects";

/* ---------------------------------------------------------------------------
   The swap guard: simulate Jupiter's transaction and judge what it would do
   to the person's own accounts (lib/solana/swapEffects.ts), before the
   bytes are handed to their wallet.

     1. Decode the transaction and list every account it declares — its
        static keys and every entry it loads from a lookup table.
     2. Read those accounts now: the person's wallet, and each token account
        among them that the person owns.
     3. Simulate the transaction and read the same accounts after it.
     4. Judge the difference.

   Fails closed. If the transaction cannot be decoded, an account cannot be
   read or the simulation cannot run, nothing is offered to sign — the
   person is told why and can try again. A swap that was not checked is not
   a swap this app hands over.
--------------------------------------------------------------------------- */

interface RawAccount {
  lamports: number;
  owner: string;
  data: [string, string] | null;
}

interface SimulationResult {
  value: {
    err: unknown;
    logs: string[] | null;
    accounts: Array<RawAccount | null> | null;
  };
}

class GuardError extends Error {}

function bytesOf(account: RawAccount | null): Uint8Array | null {
  if (account === null || account.data === null || account.data[1] !== "base64") return null;
  return Uint8Array.from(Buffer.from(account.data[0], "base64"));
}

/** getMultipleAccounts, in pages the RPC accepts, in the order asked. */
async function readAccounts(addresses: readonly string[]): Promise<Array<RawAccount | null>> {
  const out: Array<RawAccount | null> = [];
  for (let start = 0; start < addresses.length; start += 100) {
    const page = await rpcCall<{ value: Array<RawAccount | null> }>("getMultipleAccounts", [
      addresses.slice(start, start + 100),
      { encoding: "base64", commitment: "confirmed" },
    ]);
    out.push(...page.value);
  }
  return out;
}

/** Every account the transaction declares: static keys, then lookup-table entries. */
async function declaredAccounts(transaction: string): Promise<string[]> {
  let message;
  try {
    const decoded = getTransactionDecoder().decode(getBase64Encoder().encode(transaction));
    message = getCompiledTransactionMessageDecoder().decode(decoded.messageBytes);
  } catch {
    throw new GuardError("The swap transaction could not be read, so it was not offered to sign.");
  }

  const declared = new Set<string>(message.staticAccounts);
  const lookups = message.version === 0 ? (message.addressTableLookups ?? []) : [];
  if (lookups.length > 0) {
    const tables = await readAccounts(lookups.map((lookup) => lookup.lookupTableAddress));
    lookups.forEach((lookup, index) => {
      const bytes = bytesOf(tables[index]);
      if (bytes === null) throw new GuardError("A lookup table the swap loads could not be read, so it was not offered to sign.");
      const entries = decodeLookupTable(bytes);
      for (const position of [...lookup.writableIndexes, ...lookup.readonlyIndexes]) {
        const entry = entries[position];
        if (entry === undefined) throw new GuardError("The swap loads an account its lookup table does not hold, so it was not offered to sign.");
        declared.add(entry);
      }
    });
  }
  return [...declared];
}

/** The token accounts among `raw` that `owner` owns, keyed by address. */
function ownedTokenAccounts(addresses: readonly string[], raw: ReadonlyArray<RawAccount | null>, owner: string): TokenAccountView[] {
  return addresses.flatMap((address, index) => {
    const account = raw[index];
    if (account === null || (account.owner !== TOKEN_PROGRAM_ID && account.owner !== TOKEN_2022_PROGRAM_ID)) return [];
    const bytes = bytesOf(account);
    const view = bytes === null ? null : decodeTokenAccount(address, bytes);
    return view !== null && view.owner === owner ? [view] : [];
  });
}

/** The simulation's error, as a line a person can read. */
function simulationError(err: unknown, logs: string[] | null): string {
  const log = [...(logs ?? [])].reverse().find((line) => /error|failed|insufficient/i.test(line));
  const text = log ?? (typeof err === "string" ? err : JSON.stringify(err));
  return text.slice(0, 200);
}

/**
 * Simulates `transaction`, returning the state after it of each address in
 * `watch`, in order. A node that caps how many accounts one simulation may
 * return says so ("max N"); the watch list is then split across simulations.
 */
async function simulate(transaction: string, watch: readonly string[]): Promise<Array<RawAccount | null>> {
  const run = (addresses: readonly string[]) =>
    rpcCall<SimulationResult>("simulateTransaction", [
      transaction,
      {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "confirmed",
        accounts: { encoding: "base64", addresses },
      },
    ]);

  const settle = (result: SimulationResult, expected: number): Array<RawAccount | null> => {
    const { err, logs, accounts } = result.value;
    if (err !== null && err !== undefined) {
      throw new GuardError(`This swap would fail if sent now, so it was not offered to sign: ${simulationError(err, logs)}`);
    }
    if (accounts === null || accounts.length !== expected) {
      throw new GuardError("The swap's effect on your wallet could not be read, so it was not offered to sign. Try again.");
    }
    return accounts;
  };

  try {
    return settle(await run(watch), watch.length);
  } catch (error: unknown) {
    const cap = error instanceof Error ? /too many accounts provided; max (\d+)/i.exec(error.message) : null;
    if (cap === null || Number(cap[1]) < 1) throw error;
    const size = Number(cap[1]);
    const out: Array<RawAccount | null> = [];
    for (let start = 0; start < watch.length; start += size) {
      const chunk = watch.slice(start, start + size);
      out.push(...settle(await run(chunk), chunk.length));
    }
    return out;
  }
}

export async function guardSwap(input: {
  owner: string;
  /** The unsigned transaction Jupiter built, base64. */
  transaction: string;
  sellMint: string;
  /** Base units, decimal. */
  sellAmount: string;
  label?: (mint: string) => string;
}): Promise<SwapVerdict> {
  try {
    const declared = (await declaredAccounts(input.transaction)).filter((address) => address !== input.owner);
    const [walletBefore, ...before] = await readAccounts([input.owner, ...declared]);
    const mine = ownedTokenAccounts(declared, before, input.owner);

    const watch = [input.owner, ...mine.map((account) => account.address)];
    const after = await simulate(input.transaction, watch);

    const post = new Map<string, TokenAccountView | null>();
    mine.forEach((account, index) => {
      const raw = after[index + 1];
      const bytes = bytesOf(raw);
      post.set(account.address, raw === null || bytes === null ? null : decodeTokenAccount(account.address, bytes));
    });

    return judgeSwapEffects({
      owner: input.owner,
      sellMint: input.sellMint,
      sellAmount: BigInt(input.sellAmount),
      pre: { lamports: BigInt(walletBefore?.lamports ?? 0), accounts: mine },
      post: {
        lamports: after[0] === null ? null : BigInt(after[0].lamports),
        program: after[0]?.owner ?? null,
        accounts: post,
      },
      label: input.label,
    });
  } catch (error: unknown) {
    if (error instanceof GuardError) return { ok: false, error: error.message };
    if (error instanceof RpcUnconfiguredError) {
      return { ok: false, error: "Solana is not configured on this server, so the swap cannot be checked before signing." };
    }
    return { ok: false, error: "The swap could not be checked against your wallet just now, so it was not offered to sign. Try again." };
  }
}

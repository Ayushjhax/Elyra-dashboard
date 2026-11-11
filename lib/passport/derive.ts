import type { AssetPassport, PassportControl, PassportFact, PassportSource, Verification } from "@/lib/passport/types";
import { accountExplorerUrl } from "@/lib/solana/address";
import { fromBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Building an Asset Passport from what Elyra can actually read. Pure.

   Three inputs, each kept to what it can support:

     · the mint account, read from the chain — authoritative for what the
       token's program lets its authorities DO, and for nothing else;
     · Jupiter's listing — a third party's index: a name, tags, a verified
       flag, a holder count;
     · Elyra's own verified list (lib/trade.ts) — matched by mint address,
       for the asset class and the issuer, with the issuer's documentation.

   What none of them can support is never written: rights, redemption,
   maturity and eligibility are "Not verified" with a pointer to the issuer's
   terms, or "Unknown". No field says "backed", "regulated" or "redeemable"
   — those are claims only an issuer's legal documents can make.
--------------------------------------------------------------------------- */

export interface MintAccountFacts {
  program: "spl-token" | "spl-token-2022";
  decimals: number;
  /** Base units, as the chain stores them. */
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  /** Token-2022 extensions as the RPC parses them: `{ extension, state }`. */
  extensions: { extension: string; state: Record<string, unknown> }[];
}

export interface ListingFacts {
  name: string | null;
  symbol: string | null;
  icon: string | null;
  verified: boolean;
  tags: string[];
  holderCount: number | null;
  updatedAt: string | null;
}

export type IssuerKey = "ondo" | "backed";

export interface CuratedFacts {
  symbol: string;
  name: string;
  assetClass: "crypto" | "meme" | "stablecoin" | "yield" | "metal" | "equity" | "index" | "bond";
  issuer: IssuerKey | null;
}

/** Issuers on Elyra's verified list, and their own documentation (checked to resolve on 2026-11-10). */
export const ISSUERS: Record<IssuerKey, { name: string; docs: string }> = {
  ondo: { name: "Ondo Global Markets", docs: "https://docs.ondo.finance/ondo-global-markets" },
  backed: { name: "Backed Finance (xStocks)", docs: "https://docs.xstocks.com" },
};

/** How Elyra's list files an asset class — a category, not a description of rights. */
const CLASS_LABEL: Record<CuratedFacts["assetClass"], string> = {
  crypto: "Crypto asset",
  meme: "Memecoin",
  stablecoin: "Dollar stablecoin",
  yield: "Yield-bearing dollar token",
  metal: "Gold-linked token",
  equity: "Tokenised stock",
  index: "Tokenised index fund",
  bond: "Tokenised bond fund",
};

/** Jupiter tags that describe what a token is, rather than how it is listed. */
const DESCRIPTIVE_TAGS = new Set(["rwa", "stocks", "equities", "etf", "bonds", "treasuries", "commodities", "gold", "stablecoin", "lst"]);

function fact(label: string, value: string | null, verification: Verification, source: PassportFact["source"], note: string | null = null, url: string | null = null): PassportFact {
  return { label, value, verification, source, note, url };
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Only a plain https link from token metadata is ever shown; anything else is dropped. */
export function safeHttpsUrl(value: unknown): string | null {
  const text = str(value);
  if (text === null) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** What the mint lets someone do, in plain language. Live controls first. */
export function mintControls(account: MintAccountFacts): PassportControl[] {
  const controls: PassportControl[] = [];

  controls.push(
    account.mintAuthority !== null
      ? {
          id: "mint",
          title: "New tokens can be minted",
          detail: "The mint authority can create more of this token at any time, which changes the total supply.",
          authority: account.mintAuthority,
          live: true,
        }
      : { id: "mint", title: "Supply is fixed", detail: "There is no mint authority: no one can create more of this token.", authority: null, live: false },
  );
  controls.push(
    account.freezeAuthority !== null
      ? {
          id: "freeze",
          title: "Holders' accounts can be frozen",
          detail: "The freeze authority can freeze any holder's token account; tokens in a frozen account cannot move until it is thawed.",
          authority: account.freezeAuthority,
          live: true,
        }
      : { id: "freeze", title: "No freeze authority", detail: "No address can freeze holders' accounts.", authority: null, live: false },
  );

  for (const { extension, state } of account.extensions) {
    switch (extension) {
      case "pausableConfig": {
        const paused = state.paused === true;
        controls.push({
          id: extension,
          title: paused ? "Transfers are paused now" : "Transfers can be paused",
          detail: `The pause authority can stop every transfer, mint and burn of this token at once. It is ${paused ? "paused" : "not paused"} now.`,
          authority: str(state.authority),
          live: true,
        });
        break;
      }
      case "permanentDelegate": {
        const delegate = str(state.delegate);
        controls.push({
          id: extension,
          title: "A permanent delegate can move holders' tokens",
          detail: "This address can transfer or burn tokens from any holder's account without the holder signing.",
          authority: delegate,
          live: delegate !== null,
        });
        break;
      }
      case "transferHook": {
        const program = str(state.programId);
        controls.push(
          program !== null
            ? { id: extension, title: "Every transfer runs a program", detail: `Each transfer first calls program ${short(program)}, which can refuse it.`, authority: str(state.authority), live: true }
            : {
                id: extension,
                title: "No transfer program is set",
                detail: "Transfers do not call an extra program now. The hook's authority can set one later, after which it could refuse transfers.",
                authority: str(state.authority),
                live: false,
              },
        );
        break;
      }
      case "defaultAccountState":
        if (state.accountState === "frozen") {
          controls.push({
            id: extension,
            title: "New holders start frozen",
            detail: "A new account for this token starts frozen and cannot move tokens until the freeze authority thaws it — the mechanism behind allowlists.",
            authority: account.freezeAuthority,
            live: true,
          });
        }
        break;
      case "scaledUiAmountConfig": {
        const multiplier = str(state.multiplier);
        const next = str(state.newMultiplier);
        const at = typeof state.newMultiplierEffectiveTimestamp === "number" ? state.newMultiplierEffectiveTimestamp : null;
        const change =
          next !== null && multiplier !== null && next !== multiplier && at !== null
            ? ` It is set to change to ${next} from ${new Date(at * 1000).toISOString().slice(0, 10)}.`
            : "";
        controls.push({
          id: extension,
          title: "Displayed balances use a multiplier",
          detail: `Wallets show the stored amount multiplied by ${multiplier ?? "a factor"}. Its authority can change the multiplier; the mechanism is commonly used for corporate actions such as dividends or splits.${change}`,
          authority: str(state.authority),
          live: true,
        });
        break;
      }
      case "nonTransferable":
        controls.push({ id: extension, title: "Cannot be transferred", detail: "Holders cannot send this token to anyone.", authority: null, live: true });
        break;
      case "transferFeeConfig": {
        const newer = (state.newerTransferFee ?? {}) as Record<string, unknown>;
        const bps = typeof newer.transferFeeBasisPoints === "number" ? newer.transferFeeBasisPoints : null;
        controls.push({
          id: extension,
          title: "Transfers pay a fee",
          detail: `${bps === null ? "A share" : `${bps / 100}%`} of each transfer is withheld as a fee. Its authority can change the rate.`,
          authority: str(state.transferFeeConfigAuthority),
          live: bps === null || bps > 0,
        });
        break;
      }
      case "interestBearingConfig": {
        const rate = typeof state.currentRate === "number" ? state.currentRate : null;
        controls.push({
          id: extension,
          title: "Displayed balances accrue interest",
          detail: `Wallets show balances growing at ${rate === null ? "a rate" : `${rate / 100}% a year`} set by the rate authority. The stored amount does not change.`,
          authority: str(state.rateAuthority),
          live: true,
        });
        break;
      }
      case "confidentialTransferMint":
        controls.push({
          id: extension,
          title: "Confidential transfers are supported",
          detail: "Transfers can hide their amounts. New confidential accounts need its authority's approval unless approval is automatic.",
          authority: str(state.authority),
          live: false,
        });
        break;
      case "mintCloseAuthority": {
        const authority = str(state.closeAuthority);
        controls.push({ id: extension, title: "The mint can be closed", detail: "Its close authority can close the mint account once the supply is zero.", authority, live: authority !== null });
        break;
      }
      case "tokenMetadata": {
        const authority = str(state.updateAuthority);
        if (authority !== null) {
          controls.push({ id: extension, title: "Name and metadata can be changed", detail: "The update authority can change this token's name, symbol and metadata link.", authority, live: true });
        }
        break;
      }
      case "metadataPointer":
      case "tokenGroup":
      case "tokenGroupMember":
      case "groupPointer":
      case "groupMemberPointer":
        /* Where metadata lives, not what anyone can do — shown as a source. */
        break;
      default:
        controls.push({
          id: extension,
          title: `On-chain extension: ${extension}`,
          detail: "Elyra does not describe this extension yet. The explorer shows its settings.",
          authority: null,
          live: false,
        });
    }
  }

  return [...controls.filter((control) => control.live), ...controls.filter((control) => !control.live)];
}

function holdersFact(listing: ListingFacts | null): PassportFact {
  if (listing === null) return fact("Holders", null, "unknown", null, "Not reported.");
  const count = listing.holderCount;
  return count === null ? fact("Holders", null, "unknown", "jupiter", "Not reported.") : fact("Holders", count.toLocaleString("en-US"), "jupiter", "jupiter");
}

function formatSupply(account: MintAccountFacts): string {
  const whole = Number(fromBaseUnits(account.supply, account.decimals));
  return Number.isFinite(whole) ? whole.toLocaleString("en-US", { maximumFractionDigits: 2 }) : account.supply;
}

export function buildPassport(input: {
  mint: string;
  account: MintAccountFacts;
  listing: ListingFacts | null;
  /** Why the listing is missing, when it is. */
  listingUnavailable: string | null;
  curated: CuratedFacts | null;
  readAt: string;
}): AssetPassport {
  const { mint, account, listing, curated, readAt } = input;
  const explorer = accountExplorerUrl(mint);
  const metadata = account.extensions.find((entry) => entry.extension === "tokenMetadata")?.state ?? null;
  const chainName = str(metadata?.name);
  const chainSymbol = str(metadata?.symbol);
  const metadataUrl = safeHttpsUrl(metadata?.uri);
  const metadataHost = metadataUrl === null ? null : new URL(metadataUrl).hostname;
  const scaled = account.extensions.some((entry) => entry.extension === "scaledUiAmountConfig");
  const issuer = curated?.issuer ? ISSUERS[curated.issuer] : null;

  const named = (label: string, onChain: string | null, listed: string | null, elyra: string | null): PassportFact =>
    onChain !== null
      ? fact(label, onChain, "on-chain", "chain", "From the token's own on-chain metadata.")
      : listed !== null
        ? fact(label, listed, "jupiter", "jupiter")
        : elyra !== null
          ? fact(label, elyra, "elyra-list", "elyra")
          : fact(label, null, "unknown", null, "No source Elyra has gives one.");

  const identity: PassportFact[] = [
    named("Name", chainName, listing?.name ?? null, curated?.name ?? null),
    named("Symbol", chainSymbol, listing?.symbol ?? null, curated?.symbol ?? null),
    fact("Network", "Solana mainnet", "on-chain", "chain"),
    fact("Mint address", mint, "on-chain", "chain", null, explorer),
    fact("Token program", account.program === "spl-token-2022" ? "Token-2022 (supports extensions)" : "SPL Token", "on-chain", "chain"),
    fact("Decimals", String(account.decimals), "on-chain", "chain"),
    fact("Supply", formatSupply(account), "on-chain", "chain", scaled ? "The stored supply; wallets display amounts multiplied by the factor below." : null),
    listing === null
      ? fact("Listed as verified on Jupiter", null, "unknown", "jupiter", input.listingUnavailable)
      : fact("Listed as verified on Jupiter", listing.verified ? "Yes" : "No", "jupiter", "jupiter"),
    holdersFact(listing),
  ];

  const descriptiveTags = (listing?.tags ?? []).filter((tag) => DESCRIPTIVE_TAGS.has(tag.toLowerCase()));
  const represents: PassportFact =
    curated !== null
      ? fact("What it is", `${CLASS_LABEL[curated.assetClass]} — ${curated.name}`, "elyra-list", "elyra", "How Elyra's verified list files this mint, matched by its address. It is a category, not a statement of what a holder is entitled to.")
      : descriptiveTags.length > 0
        ? fact("What it is", `Jupiter tags it: ${descriptiveTags.join(", ")}`, "jupiter", "jupiter", "A listing tag, not a description of rights.")
        : fact("What it is", null, "unknown", null, "Elyra has no verified description of this token. Its name is not evidence: anyone can create a token with any name.");

  const issuerFact: PassportFact =
    issuer !== null
      ? fact("Issuer", issuer.name, "elyra-list", "elyra", "Matched to this mint by address on Elyra's verified list.", issuer.docs)
      : metadataHost !== null
        ? fact("Issuer", null, "not-verified", "metadata", `The token's on-chain metadata links to ${metadataHost}, set by its update authority. That is a pointer, not proof of who issued it.`, metadataUrl)
        : fact("Issuer", null, "unknown", null, "No source Elyra has names an issuer.");

  const termsNote = issuer !== null ? `Set by ${issuer.name}'s own terms, which Elyra has not read or verified.` : "No source Elyra has documents this.";
  const terms: PassportFact[] = ["Rights or claims", "Redemption", "Maturity", "Eligibility", "Legal transfer restrictions"].map((label) =>
    fact(label, null, issuer !== null ? "not-verified" : "unknown", issuer !== null ? "issuer" : null, termsNote, issuer?.docs ?? null),
  );

  const controls = mintControls(account);

  const context = [
    "This passport reports what the Solana mint account and Jupiter's listing say, and how Elyra's own list files the mint. None of it proves legal ownership, a claim on an underlying asset, redemption rights, or that you are eligible to hold this token — only the issuer's terms can say that, and Elyra has not verified them.",
  ];
  if (controls.some((control) => control.live && control.authority !== null)) {
    context.push("The controls marked live can be used by the addresses shown at any time, whatever the token's documentation says.");
  }
  if (issuer !== null) {
    context.push(`Elyra matched this token to ${issuer.name} by its mint address. Tokens with the same name and symbol exist; only this address is the one on Elyra's list.`);
  }
  if (listing !== null && !listing.verified) {
    context.push("Jupiter does not mark this token as verified. A token's name, symbol and logo can be copied by anyone.");
  }
  if (listing === null && curated === null) {
    context.push("Neither Jupiter nor Elyra's list knows this mint: beyond the on-chain controls, everything here is unknown.");
  }

  const sources: PassportSource[] = [
    { id: "chain", label: "Solana mint account", url: explorer, asOf: readAt, unavailable: null },
    { id: "jupiter", label: "Jupiter token index", url: null, asOf: listing?.updatedAt ?? null, unavailable: listing === null ? input.listingUnavailable : null },
    { id: "elyra", label: "Elyra's verified mint list", url: null, asOf: null, unavailable: curated === null ? "This mint is not on Elyra's list." : null },
  ];
  if (issuer !== null) sources.push({ id: "issuer", label: `${issuer.name} documentation`, url: issuer.docs, asOf: null, unavailable: null });
  if (metadataUrl !== null && metadataHost !== null) {
    sources.push({ id: "metadata", label: `Metadata link set on-chain (${metadataHost})`, url: metadataUrl, asOf: null, unavailable: null });
  }

  return {
    mint,
    network: "solana-mainnet",
    symbol: chainSymbol ?? listing?.symbol ?? curated?.symbol ?? null,
    name: chainName ?? listing?.name ?? curated?.name ?? null,
    icon: listing?.icon ?? null,
    identity,
    represents,
    issuer: issuerFact,
    terms,
    controls,
    context,
    sources,
    readAt,
  };
}

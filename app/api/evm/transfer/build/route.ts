import { NextResponse } from "next/server";
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { readEvmAsset } from "@/lib/evm/assets";
import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { evmClient } from "@/lib/evm/rpc";
import { badRequest, chainFrom, startEvmRoute } from "@/lib/evm/route";
import { feeQuote, firstLine, maxFeeWei, prepareTx, sealTx } from "@/lib/evm/tx";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Step one of a send on Ethereum or Robinhood Chain: build it, unsigned.

   The same rules as the Solana send (/api/transfer/build), for the same
   reasons. The sender is the session's. The recipient is the one field with
   no safety net — a send to the wrong address is simply gone — so it is
   refused by shape before anything is built, and three mistakes that are
   easy to make on EVM chains are refused or named outright:

     - the zero address, which burns;
     - the token's own contract, where tokens sent are lost for good — the
       classic mistake of pasting the token address instead of a wallet;
     - any other contract is allowed (a Safe, an exchange deposit) but the
       confirm screen says it is a contract.

   What is sendable is what the chain says the wallet holds, read here —
   decimals included — never what the request claims. `max` sends it all;
   for ETH that is the balance less the most the network fee can cost, sized
   against the very gas and fee caps the transaction is then built with.

   Nothing is sent from here. The response is a fully specified transaction
   and a seal over it; only the person's wallet can make it real.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ZERO = "0x0000000000000000000000000000000000000000";

export async function POST(request: Request) {
  const start = await startEvmRoute(request);
  if (!start.ok) return start.response;
  const { address: from, body } = start;

  const chain = chainFrom(body.chain);
  if (chain === null) return badRequest("Choose Ethereum or Robinhood Chain.");
  const network = EVM_CHAINS[chain].name;
  /* The gas coin: ETH, or BNB on BNB Chain. */
  const gas = EVM_CHAINS[chain].nativeSymbol;

  const toText = typeof body.to === "string" ? body.to.trim() : "";
  if (!isEvmAddress(toText)) {
    return badRequest("That is not a valid address — an EVM address is 0x followed by 40 hex characters.");
  }
  const to = getAddress(toText);
  if (to.toLowerCase() === ZERO) return badRequest("That is the zero address. Anything sent there is burned.");
  if (to.toLowerCase() === from.toLowerCase()) return badRequest("That is your own address — nothing would move.");

  const assetParam = typeof body.asset === "string" && body.asset.trim().length > 0 ? body.asset.trim() : "native";
  const max = body.max === true;
  const amountText = typeof body.amount === "string" ? body.amount : "";

  try {
    const asset = await readEvmAsset(chain, from, assetParam).catch((cause: unknown) => {
      throw new Error(`Could not read your balance on ${network}: ${firstLine(cause, "the RPC did not answer")}`);
    });
    if (asset === null) return badRequest(`That is not a token this wallet can send on ${network}.`);

    if (asset.address !== "native" && to.toLowerCase() === asset.address.toLowerCase()) {
      return badRequest(
        `That is the ${asset.symbol} token contract itself, not a wallet. Tokens sent to it are lost — paste the recipient's own address.`,
      );
    }
    if (asset.balance <= BigInt(0)) return badRequest(`This wallet holds no ${asset.symbol} on ${network}.`);

    const client = evmClient(chain);
    const [code, ethBalance] = await Promise.all([
      client.getCode({ address: to }).catch(() => undefined),
      asset.address === "native" ? Promise.resolve(asset.balance) : client.getBalance({ address: from }),
    ]);
    const toIsContract = code !== undefined && code !== "0x";

    let value: bigint;
    let tokenAmount: bigint;
    let callTo: string;
    let data: Hex;

    if (asset.address === "native") {
      /* Priced with a probe of the same shape; ETH sends cost the same gas
         whatever the amount. */
      const pricing = await feeQuote(chain, { from, to, value: BigInt(1), data: "0x" });
      const fee = maxFeeWei({ gas: pricing.gas.toString(), maxFeePerGas: pricing.maxFeePerGas.toString() });
      const sendable = asset.balance - fee;
      if (sendable <= BigInt(0)) {
        return badRequest(
          `There is not enough ${gas} on ${network} to cover the network fee (up to ${fromBaseUnits(fee, 18)} ${gas}), so nothing can be sent.`,
        );
      }
      const requested = max ? sendable.toString() : toBaseUnits(amountText, 18);
      if (requested === null) return badRequest("That is not an amount I can send.");
      if (BigInt(requested) > sendable) {
        return badRequest(
          `That is more than this wallet can send. ${fromBaseUnits(sendable, 18)} ${gas} is available once the network fee is covered.`,
        );
      }
      value = BigInt(requested);
      tokenAmount = value;
      callTo = to;
      data = "0x";

      const tx = await prepareTx(chain, { from, to: callTo, value, data, purpose: "transfer" }, pricing);
      return respond({ tx, asset, tokenAmount, to, toIsContract, network, chain });
    }

    const requested = max ? asset.balance.toString() : toBaseUnits(amountText, asset.decimals);
    if (requested === null) return badRequest("That is not an amount I can send.");
    if (BigInt(requested) > asset.balance) {
      return badRequest(`That is more than this wallet holds. ${fromBaseUnits(asset.balance, asset.decimals)} ${asset.symbol} is available.`);
    }
    tokenAmount = BigInt(requested);
    value = BigInt(0);
    callTo = asset.address;
    data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, tokenAmount] });

    const tx = await prepareTx(chain, { from, to: callTo, value, data, purpose: "transfer" }).catch((cause: unknown) => {
      throw new Error(`${network} would reject this send: ${firstLine(cause, "the simulation failed")}`);
    });
    const fee = maxFeeWei(tx);
    if (ethBalance < fee) {
      return badRequest(
        `This wallet needs up to ${fromBaseUnits(fee, 18)} ${gas} on ${network} to pay the network fee, and holds ${fromBaseUnits(ethBalance, 18)}.`,
      );
    }
    return respond({ tx, asset, tokenAmount, to, toIsContract, network, chain });
  } catch (error: unknown) {
    return NextResponse.json({ error: firstLine(error, "The send could not be prepared.") }, { status: 503 });
  }
}

function respond(input: {
  tx: Awaited<ReturnType<typeof prepareTx>>;
  asset: NonNullable<Awaited<ReturnType<typeof readEvmAsset>>>;
  tokenAmount: bigint;
  to: string;
  toIsContract: boolean;
  network: string;
  chain: EvmChainKey;
}) {
  const amount = fromBaseUnits(input.tokenAmount, input.asset.decimals);
  return NextResponse.json({
    tx: input.tx,
    seal: sealTx(input.tx),
    /* The only wallet that may sign it. */
    signer: input.tx.from,
    summary: `Send ${amount} ${input.asset.symbol} on ${input.network}`,
    chain: input.chain,
    to: input.to,
    amount,
    symbol: input.asset.symbol,
    verified: input.asset.verified,
    toIsContract: input.toIsContract,
    /* The most the fee can cost; the actual charge is usually lower. */
    networkFeeMax: fromBaseUnits(maxFeeWei(input.tx), 18),
  });
}

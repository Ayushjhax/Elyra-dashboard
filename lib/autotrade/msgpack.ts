/* ---------------------------------------------------------------------------
   The msgpack subset Hyperliquid hashes an action with.

   An order is signed over keccak256(msgpack(action) ‖ nonce ‖ vault flag), so
   these bytes must match Python's `msgpack.packb` exactly — the reference
   implementation the exchange checks against. lib/autotrade/hyperliquid.test.ts
   holds this to the official SDK's production vectors.

   Only what actions contain: null, booleans, integers, strings, arrays and
   maps with string keys, in insertion order. Floats are refused: Hyperliquid
   carries every price and size as a string, and a float here would mean a
   number reached the wire unrounded.
--------------------------------------------------------------------------- */

export type Packable = null | boolean | number | bigint | string | Packable[] | { [key: string]: Packable | undefined };

const encoder = new TextEncoder();

function pushUint(out: number[], value: bigint, bytes: number): void {
  for (let shift = (bytes - 1) * 8; shift >= 0; shift -= 8) {
    out.push(Number((value >> BigInt(shift)) & BigInt(0xff)));
  }
}

function packInt(out: number[], input: number | bigint): void {
  const value = typeof input === "bigint" ? input : BigInt(input);
  if (value >= BigInt(0)) {
    if (value < BigInt(0x80)) out.push(Number(value));
    else if (value <= BigInt(0xff)) { out.push(0xcc); pushUint(out, value, 1); }
    else if (value <= BigInt(0xffff)) { out.push(0xcd); pushUint(out, value, 2); }
    else if (value <= BigInt(0xffffffff)) { out.push(0xce); pushUint(out, value, 4); }
    else if (value <= BigInt("18446744073709551615")) { out.push(0xcf); pushUint(out, value, 8); }
    else throw new RangeError("Integer too large for msgpack.");
    return;
  }
  const twos = (bits: number) => (BigInt(1) << BigInt(bits)) + value;
  if (value >= BigInt(-32)) out.push(Number(twos(8)));
  else if (value >= BigInt(-128)) { out.push(0xd0); pushUint(out, twos(8), 1); }
  else if (value >= BigInt(-32768)) { out.push(0xd1); pushUint(out, twos(16), 2); }
  else if (value >= BigInt(-2147483648)) { out.push(0xd2); pushUint(out, twos(32), 4); }
  else { out.push(0xd3); pushUint(out, twos(64), 8); }
}

function packLength(out: number[], length: number, fix: number, fixMax: number, codes: [number, number, number | null]): void {
  if (length <= fixMax) out.push(fix | length);
  else if (codes[2] !== null && length <= 0xff) { out.push(codes[2]); pushUint(out, BigInt(length), 1); }
  else if (length <= 0xffff) { out.push(codes[0]); pushUint(out, BigInt(length), 2); }
  else { out.push(codes[1]); pushUint(out, BigInt(length), 4); }
}

function pack(out: number[], value: Packable): void {
  if (value === null) { out.push(0xc0); return; }
  if (typeof value === "boolean") { out.push(value ? 0xc3 : 0xc2); return; }
  if (typeof value === "bigint") { packInt(out, value); return; }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`Refusing to pack a non-integer number (${value}); send it as a string.`);
    packInt(out, value);
    return;
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    /* str8 exists for strings; arrays and maps have no 8-bit form. */
    packLength(out, bytes.length, 0xa0, 31, [0xda, 0xdb, 0xd9]);
    for (const byte of bytes) out.push(byte);
    return;
  }
  if (Array.isArray(value)) {
    packLength(out, value.length, 0x90, 15, [0xdc, 0xdd, null]);
    for (const item of value) pack(out, item);
    return;
  }
  const entries = Object.entries(value).filter(([, item]) => item !== undefined) as [string, Packable][];
  packLength(out, entries.length, 0x80, 15, [0xde, 0xdf, null]);
  for (const [key, item] of entries) {
    pack(out, key);
    pack(out, item);
  }
}

export function msgpack(value: Packable): Uint8Array {
  const out: number[] = [];
  pack(out, value);
  return Uint8Array.from(out);
}

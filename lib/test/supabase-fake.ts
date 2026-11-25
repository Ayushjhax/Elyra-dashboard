/* ---------------------------------------------------------------------------
   An in-memory stand-in for the Supabase client.

   Test-only. Nothing in the app imports it.

   It implements exactly the query surface the code under test uses, and no
   more — a fuller fake would be a second database to keep correct. The
   important behaviours it does model faithfully:

     - `upsert` with `ignoreDuplicates` returns the row only when this call
       inserted it, which is what the webhook's idempotency check reads.
     - `claim_agent_run` refuses past the limit, atomically, like the real
       function.
     - Filters are applied to every operation including update and delete, so
       a test can catch a missing `.eq("user_id", ...)` — which is the whole
       point of the cross-tenant test.
--------------------------------------------------------------------------- */

export type Row = Record<string, unknown>;

interface Result<T> {
  data: T;
  error: { message: string; code?: string } | null;
  /** Set when the select asked for `{ count: "exact" }`. */
  count?: number | null;
}

let counter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<Result<Row[]>> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitTo: number | null = null;
  private offset = 0;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row[] = [];
  private conflictKeys: string[] = [];
  private ignoreDuplicates = false;
  private returning = false;
  private counting: { head: boolean } | null = null;

  constructor(
    private readonly store: Map<string, Row[]>,
    private readonly table: string,
    /** Every table this fake ever touched, for assertions. */
    private readonly log: Array<{ table: string; op: string; filters: number }>,
  ) {}

  private rows(): Row[] {
    return this.store.get(this.table) ?? [];
  }

  private matching(): Row[] {
    return this.rows().filter((row) => this.filters.every((f) => f(row)));
  }

  /* --- filters --- */

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  lt(column: string, value: string) {
    this.filters.push((row) => String(row[column]) < value);
    return this;
  }

  gt(column: string, value: string) {
    this.filters.push((row) => String(row[column]) > value);
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push((row) => row[column] !== null && row[column] !== undefined && String(row[column]) >= value);
    return this;
  }

  in(column: string, values: readonly unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitTo = count;
    return this;
  }

  /** Rows `from` to `to` inclusive, after ordering — PostgREST's range. */
  range(from: number, to: number) {
    this.offset = from;
    this.limitTo = to - from + 1;
    return this;
  }

  /* --- operations --- */

  /**
   * Column lists are accepted and ignored: whole rows come back. Tests here
   * assert on which rows a query returns, never on projection.
   */
  select(columns?: string, options?: { count?: "exact"; head?: boolean }) {
    void columns;
    this.returning = true;
    if (options?.count === "exact") this.counting = { head: options.head === true };
    return this;
  }

  insert(values: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Row) {
    this.mode = "update";
    this.payload = [values];
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  upsert(
    values: Row | Row[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ) {
    this.mode = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.conflictKeys = (options?.onConflict ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter((key) => key.length > 0);
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }

  /* --- terminators --- */

  async maybeSingle(): Promise<Result<Row | null>> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    return { data: data[0] ?? null, error: null };
  }

  async single(): Promise<Result<Row>> {
    const { data, error } = await this.run();
    if (error) return { data: {} as Row, error };
    if (data.length === 0) {
      return { data: {} as Row, error: { message: "No rows", code: "PGRST116" } };
    }
    return { data: data[0], error: null };
  }

  then<A, B = never>(
    onFulfilled?: ((value: Result<Row[]>) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onFulfilled, onRejected);
  }

  private async run(): Promise<Result<Row[]>> {
    this.log.push({
      table: this.table,
      op: this.mode,
      filters: this.filters.length,
    });

    const rows = this.rows();
    this.store.set(this.table, rows);

    if (this.mode === "select") {
      let found = this.matching();
      if (this.orderBy !== null) {
        const { column, ascending } = this.orderBy;
        found = [...found].sort((a, b) => {
          /* Numbers compare as numbers, as in Postgres: 10 comes after 9. */
          if (typeof a[column] === "number" && typeof b[column] === "number") {
            const delta = (a[column] as number) - (b[column] as number);
            return ascending ? delta : -delta;
          }
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (this.counting !== null) {
        /* { count: "exact" } counts every match, before any limit. */
        return { data: this.counting.head ? [] : found.slice(0, this.limitTo ?? found.length), error: null, count: found.length };
      }
      if (this.offset > 0) found = found.slice(this.offset);
      if (this.limitTo !== null) found = found.slice(0, this.limitTo);
      return { data: found, error: null };
    }

    if (this.mode === "insert") {
      const inserted: Row[] = [];
      for (const value of this.payload) {
        const row = { id: uuid(), created_at: new Date().toISOString(), ...value };
        /* Primary-key style collision, so the link-code route's 23505 retry
           and the profile race are both exercisable. */
        const clash = rows.find((existing) => collides(existing, row));
        if (clash) {
          return {
            data: [],
            error: { message: "duplicate key value", code: "23505" },
          };
        }
        rows.push(row);
        inserted.push(row);
      }
      return { data: inserted, error: null };
    }

    if (this.mode === "upsert") {
      const written: Row[] = [];
      for (const value of this.payload) {
        const keys =
          this.conflictKeys.length > 0
            ? this.conflictKeys
            : Object.keys(value).slice(0, 1);

        const index = rows.findIndex((existing) =>
          keys.every((key) => existing[key] === value[key]),
        );

        if (index === -1) {
          const row = { id: uuid(), created_at: new Date().toISOString(), ...value };
          /* A new row still meets every other unique key, as in Postgres. */
          if (rows.some((existing) => collides(existing, row))) {
            return { data: [], error: { message: "duplicate key value violates unique constraint", code: "23505" } };
          }
          rows.push(row);
          written.push(row);
        } else if (!this.ignoreDuplicates) {
          const merged = { ...rows[index], ...value };
          if (rows.some((existing, other) => other !== index && collides(existing, merged))) {
            return { data: [], error: { message: "duplicate key value violates unique constraint", code: "23505" } };
          }
          rows[index] = merged;
          written.push(rows[index]);
        }
        /* ignoreDuplicates and a conflict: nothing written, nothing
           returned. This is the signal the webhook reads. */
      }
      return { data: written, error: null };
    }

    if (this.mode === "update") {
      const updated: Row[] = [];
      for (const row of this.matching()) {
        Object.assign(row, this.payload[0]);
        updated.push(row);
      }
      return { data: updated, error: null };
    }

    const keep: Row[] = [];
    const removed: Row[] = [];
    for (const row of rows) {
      if (this.filters.every((f) => f(row))) removed.push(row);
      else keep.push(row);
    }
    this.store.set(this.table, keep);
    return { data: removed, error: null };
  }
}

/**
 * The unique constraints the real schema carries.
 *
 * Kept in step with the migrations by hand. The ones here are the ones tests
 * depend on for idempotency: a code, an update_id, a prepared-action token,
 * and the (user, kind, dedupe_key) triple that stops a notification being
 * sent twice.
 */
function collides(a: Row, b: Row): boolean {
  for (const key of ["code", "update_id", "token"]) {
    if (a[key] !== undefined && a[key] === b[key]) return true;
  }
  if (a.privy_did !== undefined && a.privy_did === b.privy_did) return true;

  if (
    a.dedupe_key !== undefined &&
    a.dedupe_key === b.dedupe_key &&
    a.user_id === b.user_id &&
    a.kind === b.kind
  ) {
    return true;
  }

  /* trading_positions (0018): one entry per rule per bar. */
  /* NULL rule ids (limit-order fills) never collide, as in Postgres. */
  if (a.rule_id !== undefined && a.rule_id !== null && a.signal_at !== undefined && a.rule_id === b.rule_id && a.signal_at === b.signal_at) {
    return true;
  }

  /* agent_keys (0022): a key's hash is unique. */
  if (a.key_hash !== undefined && a.key_hash === b.key_hash) return true;

  /* Arena (0021). Rows are compared only within one table, so each key
     names the columns that make it unique there. */
  /* trade_reviews: one review per position. */
  if (a.position_id !== undefined && a.position_id !== null && a.label !== undefined && a.position_id === b.position_id) return true;
  /* arena_groups.invite_code; arena_profiles.handle (NULLs never collide). */
  if (a.invite_code !== undefined && a.invite_code === b.invite_code) return true;
  if (a.handle !== undefined && a.handle !== null && a.handle === b.handle) return true;
  /* arena_puzzle_days (pk puzzle_date) and arena_puzzle_answers (pk user, date). */
  if (a.puzzle_date !== undefined && a.puzzle_date === b.puzzle_date && a.user_id === b.user_id) return true;
  /* arena_call_backings: one backing per person per call. */
  if (a.call_id !== undefined && a.call_id === b.call_id && a.user_id === b.user_id) return true;
  /* arena_group_members: pk (group, user). */
  if (a.group_id !== undefined && a.group_id === b.group_id && a.user_id === b.user_id) return true;

  /* rails_ledger (0024): one event per position, one successor per event, unique hashes. */
  if (a.prev_hash !== undefined && a.seq !== undefined) {
    if (a.user_id === b.user_id && (a.seq === b.seq || a.prev_hash === b.prev_hash)) return true;
    if (a.hash === b.hash) return true;
  }
  /* payment_requests (0024): a reference names one request; a signature pays one. */
  if (a.reference !== undefined && a.reference === b.reference) return true;
  if (a.paid_signature !== undefined && a.paid_signature !== null && a.paid_signature === b.paid_signature) return true;

  /* trading_positions (0025): one open position per coin per fund. */
  if (
    a.fund_id !== undefined &&
    a.fund_id !== null &&
    a.fund_id === b.fund_id &&
    a.coin === b.coin &&
    ["opening", "open"].includes(String(a.status)) &&
    ["opening", "open"].includes(String(b.status))
  ) {
    return true;
  }
  /* ai_funds (0025): a key manages one open fund. */
  if (a.objective !== undefined && a.key_id !== undefined && a.key_id !== null && a.key_id === b.key_id && a.status !== "closed" && b.status !== "closed") {
    return true;
  }
  /* ai_fund_marks (0025): primary key (fund, hour). */
  if (a.bucket !== undefined && a.fund_id === b.fund_id && a.bucket === b.bucket) return true;

  /* scout_fires (0035): a rule acts on a signal once. */
  if (a.signal_key !== undefined && a.rule_id !== undefined && a.rule_id === b.rule_id && a.signal_key === b.signal_key) return true;

  /* portfolio_fills (0017): one row per token a swap moved. */
  if (a.signature !== undefined && a.signature === b.signature && a.mint !== undefined && a.mint === b.mint) {
    return true;
  }

  return false;
}

export class FakeSupabase {
  readonly tables = new Map<string, Row[]>();
  readonly queries: Array<{ table: string; op: string; filters: number }> = [];
  /** Set to refuse every claim, for the usage-limit test. */
  claimAllowed = true;

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), ...rows]);
  }

  rows(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  from(table: string) {
    return new Query(this.tables, table, this.queries);
  }

  async rpc(name: string, args: Record<string, unknown>) {
    if (name === "claim_agent_key_call") {
      /* 0022: one call against an agent key's daily cap. */
      const keyId = String(args.p_key_id);
      const limit = Number(args.p_limit);
      const day = new Date().toISOString().slice(0, 10);
      const usage = this.tables.get("agent_key_usage") ?? [];
      this.tables.set("agent_key_usage", usage);
      const row = usage.find((entry) => entry.key_id === keyId && entry.day === day);
      if (row === undefined) {
        usage.push({ key_id: keyId, day, calls: 1 });
        return { data: [{ allowed: true, calls: 1 }], error: null };
      }
      const calls = Number(row.calls);
      if (calls >= limit) return { data: [{ allowed: false, calls }], error: null };
      row.calls = calls + 1;
      return { data: [{ allowed: true, calls: calls + 1 }], error: null };
    }
    if (name !== "claim_agent_run") {
      return { data: null, error: { message: `unknown rpc ${name}` } };
    }

    const userId = String(args.p_user_id);
    const limit = Number(args.p_limit);
    const day = new Date().toISOString().slice(0, 10);
    const rows = this.tables.get("usage_counters") ?? [];
    this.tables.set("usage_counters", rows);

    const existing = rows.find(
      (row) => row.user_id === userId && row.day === day,
    );

    if (!this.claimAllowed) {
      return { data: [{ allowed: false, runs: limit }], error: null };
    }

    if (existing === undefined) {
      rows.push({ user_id: userId, day, runs: 1 });
      return { data: [{ allowed: true, runs: 1 }], error: null };
    }

    const runs = Number(existing.runs);
    if (runs >= limit) {
      return { data: [{ allowed: false, runs }], error: null };
    }

    existing.runs = runs + 1;
    return { data: [{ allowed: true, runs: runs + 1 }], error: null };
  }
}

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
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          return ascending ? left.localeCompare(right) : right.localeCompare(left);
        });
      }
      if (this.counting !== null) {
        /* { count: "exact" } counts every match, before any limit. */
        return { data: this.counting.head ? [] : found.slice(0, this.limitTo ?? found.length), error: null, count: found.length };
      }
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
          rows.push(row);
          written.push(row);
        } else if (!this.ignoreDuplicates) {
          rows[index] = { ...rows[index], ...value };
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

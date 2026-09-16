import { describe as suite, expect, it } from "vitest";
import { describe, isUnreachable, unreachableReason } from "@/lib/supabase/reachability";

/* ---------------------------------------------------------------------------
   The shape these tests are about.

   supabase-js reports a transport failure through the same object as a query
   failure, with `code` set to the EMPTY STRING rather than left undefined.
   That single detail is what produced ": TypeError: fetch failed" in the
   smart-money panel: `error.code ?? "error"` treats "" as present, so the
   template rendered a bare colon and a symptom.

   The literals below are copied from what a deleted project actually
   returned, rather than invented, because the whole defect lived in the
   difference between "" and undefined.
--------------------------------------------------------------------------- */

/** Verbatim, from a Supabase project whose ref no longer resolves. */
const DELETED_PROJECT = {
  message: "TypeError: fetch failed",
  details:
    "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND " +
    "icognxnelokoxohgqdsb.supabase.co (ENOTFOUND)\nError: getaddrinfo " +
    "ENOTFOUND icognxnelokoxohgqdsb.supabase.co",
  hint: "",
  code: "",
};

/** A real query error: the table is absent from PostgREST's schema cache. */
const MISSING_TABLE = {
  message: "Could not find the table 'public.smart_money_findings' in the schema cache",
  details: null,
  hint: null,
  code: "PGRST205",
};

suite("unreachableReason", () => {
  it("names DNS failure as a project that does not exist", () => {
    const reason = unreachableReason(DELETED_PROJECT);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/NXDOMAIN/);
    /* The actionable half. A reader with no other context has to be able to
       act on this line alone, which is what the old message failed at. */
    expect(reason).toMatch(/supabase\.com/);
  });

  it("distinguishes a paused project from a deleted one", () => {
    /* Stated in the message because the two are otherwise indistinguishable
       to whoever is reading it, and only one of them can be un-paused. */
    expect(unreachableReason(DELETED_PROJECT)).toMatch(/paused project still resolves/i);
  });

  it("reports a refused connection without claiming the project is gone", () => {
    const reason = unreachableReason({
      message: "TypeError: fetch failed",
      details: "Error: connect ECONNREFUSED 127.0.0.1:54321",
      hint: "",
      code: "",
    });
    expect(reason).not.toBeNull();
    expect(reason).not.toMatch(/NXDOMAIN/);
  });

  it("returns null for a query error, which is a bug rather than an outage", () => {
    expect(unreachableReason(MISSING_TABLE)).toBeNull();
    expect(isUnreachable(MISSING_TABLE)).toBe(false);
  });

  it("reads a cause chain, where fetch actually puts the errno", () => {
    const error = new Error("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND db.example.supabase.co"),
    });
    expect(isUnreachable(error)).toBe(true);
  });
});

suite("describe", () => {
  it("never renders the empty code as a leading colon", () => {
    /* The regression itself. */
    expect(describe(DELETED_PROJECT)).not.toMatch(/^:/);
    expect(describe(DELETED_PROJECT)).not.toBe(": TypeError: fetch failed");
  });

  it("keeps the code on a query error, which is how one is told from another", () => {
    expect(describe(MISSING_TABLE)).toMatch(/^PGRST205: /);
  });

  it("does not invent a message when there is none", () => {
    expect(describe({ code: "", message: "" })).toBe("Unknown database error");
  });
});

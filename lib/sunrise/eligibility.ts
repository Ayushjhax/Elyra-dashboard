/* ---------------------------------------------------------------------------
   Who may trade the tokenized stocks Sunrise lists. Pure.

   Sunrise's terms (app.sunrise.xyz/terms-of-service, "Backpack/Trek
   Tokenized Equities Disclosures", last updated 7 April 2026): "Tokens are
   not available to U.S. persons, PRC residents as defined in the
   documentation, or other Prohibited Persons or restricted jurisdictions
   under Backpack and Trek documentation and applicable law." The same terms
   have the person represent they are not in a US-sanctioned jurisdiction.

   Sunrise's API refuses a trade it can tell is ineligible (`geo_blocked`,
   `address_blocked`), but it is called from Elyra's server, and nothing in
   its API carries the person's location — so it cannot see where the
   person is. Elyra therefore holds every trade of one of these tokens to
   two checks of its own, at quote and again at submit:

     1. The request's country (Vercel's `x-vercel-ip-country`) is not one
        of RESTRICTED_REGIONS. An unknown country is refused, not assumed.
     2. The person has confirmed, for this trade, that they are not a US
        person, not a PRC resident and not otherwise restricted.

   An IP is not a residence, and a confirmation is not a check of one; the
   two together are what Elyra can do, and the surface says the rest is
   theirs to know. Mainland China, Hong Kong and Macau are all refused
   until the issuer's definition of "PRC resident" is confirmed — the
   cautious reading, since the website also speaks Chinese. The list is not
   a setting: widening access means reading the issuer's documents first.
--------------------------------------------------------------------------- */

export const RESTRICTED_REGIONS: Readonly<Record<string, string>> = {
  /* US persons: the states and every US territory. */
  US: "the United States",
  PR: "Puerto Rico",
  GU: "Guam",
  VI: "the US Virgin Islands",
  AS: "American Samoa",
  MP: "the Northern Mariana Islands",
  UM: "the US Minor Outlying Islands",
  /* PRC residents. */
  CN: "mainland China",
  HK: "Hong Kong",
  MO: "Macau",
  /* Jurisdictions under comprehensive US sanctions. */
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea",
  SY: "Syria",
};

export type Eligibility =
  | { ok: true }
  | { ok: false; code: "region" | "unknown_region" | "unconfirmed"; reason: string };

export const CONFIRMATION =
  "I am not a US person or a resident of mainland China, Hong Kong or Macau, and I am not otherwise restricted from holding these tokens.";

/** Whether this request may trade a Sunrise-listed stock token. */
export function eligibility(country: string | null | undefined, confirmed: boolean): Eligibility {
  const code = typeof country === "string" ? country.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code)) {
    return {
      ok: false,
      code: "unknown_region",
      reason: "Elyra could not tell which country this request comes from, so tokenized stocks are not offered.",
    };
  }
  const place = RESTRICTED_REGIONS[code];
  if (place !== undefined) {
    return {
      ok: false,
      code: "region",
      reason: `Tokenized stocks are not available from ${place}. Their issuer does not offer them to US persons, PRC residents or sanctioned jurisdictions.`,
    };
  }
  if (!confirmed) {
    return { ok: false, code: "unconfirmed", reason: `Confirm first: ${CONFIRMATION}` };
  }
  return { ok: true };
}

/** The country a request comes from, as the platform reports it; null when it does not. */
export function requestCountry(headers: Headers): string | null {
  const value = headers.get("x-vercel-ip-country");
  return value !== null && /^[A-Za-z]{2}$/.test(value.trim()) ? value.trim().toUpperCase() : null;
}

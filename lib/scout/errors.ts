/** A refusal or failure Scout explains to the person, with the HTTP status that fits it. */
export class ScoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** For a page that refused to be read: the host that refused, after redirects. */
    readonly host: string | null = null,
  ) {
    super(message);
    this.name = "ScoutError";
  }
}

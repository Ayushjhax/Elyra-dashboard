/** A refusal or failure Scout explains to the person, with the HTTP status that fits it. */
export class ScoutError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ScoutError";
  }
}

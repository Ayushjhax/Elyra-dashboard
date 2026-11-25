"use client";

/* ---------------------------------------------------------------------------
   Share: a card of the period's performance, drawn in the browser.

   A return and nothing else that identifies the account: no dollar amount,
   no balance, no address. What someone chooses to post should not tell the
   world what they hold. The card says the return is net of deposits and
   withdrawals, and over which window.

   Colours and type come from the brand's own tokens, read from the page at
   the moment of drawing (app/globals.css) — nothing here holds a colour.
   Shared through the system sheet where the browser offers one with files,
   saved as a PNG otherwise.
--------------------------------------------------------------------------- */

const WIDTH = 1200;
const HEIGHT = 630;

function token(name: string, fallback = ""): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export interface CardText {
  /** "Elyra" — the wordmark is text, so the card needs no image. */
  brand: string;
  /** "30-day return". */
  title: string;
  /** "+4.21%". */
  value: string;
  /** "Net of deposits and withdrawals". */
  caption: string;
  /** "Bitcoin +2.10% over the same days", or null. */
  benchmark: string | null;
  /** "25 Nov 2026". */
  date: string;
  rising: boolean | null;
}

export async function drawCard(text: CardText): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("This browser cannot draw the card.");

  const base = token("--surface-base");
  const panel = token("--surface-raised");
  const border = token("--border-subtle");
  const primary = token("--text-primary");
  const secondary = token("--text-secondary");
  const muted = token("--text-muted");
  const accent = token("--accent");
  const display = token("--font-display", "sans-serif");
  const sans = token("--font-sans", "sans-serif");
  const tone = text.rising === null ? primary : text.rising ? token("--positive") : token("--negative");

  /* Fonts the page has not used yet may still be loading. */
  await document.fonts?.ready;

  context.fillStyle = base;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = panel;
  context.strokeStyle = border;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(48, 48, WIDTH - 96, HEIGHT - 96, 16);
  context.fill();
  context.stroke();

  context.fillStyle = accent;
  context.font = `600 40px ${display}`;
  context.textBaseline = "alphabetic";
  context.fillText(text.brand, 104, 140);

  context.fillStyle = secondary;
  context.font = `500 34px ${sans}`;
  context.fillText(text.title, 104, 250);

  context.fillStyle = tone;
  context.font = `600 128px ${display}`;
  context.fillText(text.value, 100, 390);

  context.fillStyle = muted;
  context.font = `400 28px ${sans}`;
  context.fillText(text.caption, 104, 450);
  if (text.benchmark !== null) context.fillText(text.benchmark, 104, 494);

  context.textAlign = "right";
  context.fillText(text.date, WIDTH - 104, 140);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error("The card could not be drawn.")) : resolve(blob)), "image/png");
  });
}

/** The system share sheet where it takes files; a download otherwise. */
export async function shareCard(blob: Blob, filename: string, title: string): Promise<"shared" | "saved"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
}

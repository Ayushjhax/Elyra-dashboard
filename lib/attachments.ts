/* ---------------------------------------------------------------------------
   Files the person hands the agent.

   Three kinds, each sent the way the model reads it natively: an image as an
   image block, a PDF as a document block, and a text file (CSV, TXT,
   Markdown, JSON) as a plain-text document. Nothing else is accepted.

   Client-safe and pure: the composer reads these limits before it encodes
   anything, and the route runs `validateAttachments` on whatever arrives,
   because the body is the client's to forge. A file is checked by its first
   bytes, not only by the type it claims — a renamed executable is not an
   image because its name ends in .png.

   The byte budget is the request body's, not the model's. A serverless
   function takes about 4.5MB, base64 adds a third, so the files together
   stay under 3MB. The composer downscales images to the size the model
   reads anyway, which keeps a screenshot well inside it.
--------------------------------------------------------------------------- */

export type AttachmentKind = "image" | "pdf" | "text";

export const ATTACHMENT_LIMITS = {
  maxFiles: 4,
  /** Decoded bytes across every file in one message. */
  maxTotalBytes: 3 * 1024 * 1024,
  /** Characters across every text file in one message. */
  maxTextChars: 120_000,
  /** Longest edge the composer scales an image to — the size the model reads. */
  maxImageEdge: 1568,
  maxNameLength: 120,
} as const;

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown", "application/json"] as const;

/** For a file the browser could not type, by its extension. */
const TEXT_EXTENSIONS: Record<string, (typeof TEXT_TYPES)[number]> = {
  txt: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  tsv: "text/csv",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
};

/** What the file input offers. */
export const ACCEPT = [
  ...IMAGE_TYPES,
  "application/pdf",
  ...TEXT_TYPES,
  ...Object.keys(TEXT_EXTENSIONS).map((extension) => `.${extension}`),
].join(",");

/** As sent in the request body. `data` is base64 for an image or a PDF, the text itself otherwise. */
export interface AttachmentPayload {
  name: string;
  mediaType: string;
  data: string;
}

export interface Attachment extends AttachmentPayload {
  kind: AttachmentKind;
}

/** Staged in the composer: the payload, plus what the chip shows. */
export interface ComposerAttachment extends Attachment {
  id: string;
  /** Decoded bytes for an image or PDF; characters for a text file. */
  size: number;
  /** A data URL for an image's thumbnail. Null for documents. */
  previewUrl: string | null;
}

/** How a sent attachment is shown in the conversation. */
export interface SentAttachment {
  name: string;
  kind: AttachmentKind;
  previewUrl: string | null;
}

export function kindOf(mediaType: string): AttachmentKind | null {
  if ((IMAGE_TYPES as readonly string[]).includes(mediaType)) return "image";
  if (mediaType === "application/pdf") return "pdf";
  if ((TEXT_TYPES as readonly string[]).includes(mediaType)) return "text";
  return null;
}

/** A browser-reported type, or one inferred from the name when it reported none. */
export function mediaTypeFor(name: string, reported: string): string | null {
  const base = reported.split(";")[0].trim().toLowerCase();
  if (kindOf(base) !== null) return base;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (TEXT_EXTENSIONS[extension]) return TEXT_EXTENSIONS[extension];
  if (extension === "pdf") return "application/pdf";
  return null;
}

/** A name safe to show and to send: no path, no control characters, bounded. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned.length > 0 ? cleaned : "file").slice(0, ATTACHMENT_LIMITS.maxNameLength);
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decoded length of a base64 string, without decoding it. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

/** The first bytes of a base64 string. */
function head(data: string, count: number): number[] {
  const chunk = data.slice(0, Math.ceil(count / 3) * 4);
  let binary: string;
  try {
    binary = atob(chunk);
  } catch {
    return [];
  }
  return Array.from(binary.slice(0, count), (char) => char.charCodeAt(0));
}

/** Whether the bytes are what the media type claims. */
export function matchesSignature(mediaType: string, data: string): boolean {
  const bytes = head(data, 12);
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value);
  switch (mediaType) {
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      /* RIFF....WEBP */
      return starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
    default:
      return false;
  }
}

/**
 * Everything the route needs to trust a body's attachments, or the sentence
 * that says why it cannot.
 */
export function validateAttachments(raw: unknown): { attachments: Attachment[] } | { error: string } {
  if (raw === undefined || raw === null) return { attachments: [] };
  if (!Array.isArray(raw)) return { error: "Attachments must be a list." };
  if (raw.length > ATTACHMENT_LIMITS.maxFiles) {
    return { error: `Attach up to ${ATTACHMENT_LIMITS.maxFiles} files at a time.` };
  }

  const attachments: Attachment[] = [];
  let bytes = 0;
  let chars = 0;

  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") return { error: "An attachment was malformed." };
    const { name, mediaType, data } = entry as Record<string, unknown>;
    if (typeof name !== "string" || typeof mediaType !== "string" || typeof data !== "string") {
      return { error: "An attachment was malformed." };
    }
    const kind = kindOf(mediaType);
    const label = cleanName(name);
    if (kind === null) return { error: `${label}: only images, PDFs and text files can be attached.` };
    if (data.length === 0) return { error: `${label} is empty.` };

    if (kind === "text") {
      chars += data.length;
      if (chars > ATTACHMENT_LIMITS.maxTextChars) {
        return { error: `Text files are limited to ${ATTACHMENT_LIMITS.maxTextChars.toLocaleString("en-US")} characters in total.` };
      }
    } else {
      if (!BASE64.test(data)) return { error: `${label} was not encoded correctly.` };
      if (!matchesSignature(mediaType, data)) return { error: `${label} is not the ${kind === "pdf" ? "PDF" : "image"} it claims to be.` };
      bytes += base64Bytes(data);
      if (bytes > ATTACHMENT_LIMITS.maxTotalBytes) {
        return { error: "Attachments are limited to 3MB together." };
      }
    }

    attachments.push({ name: label, mediaType, data, kind });
  }

  return { attachments };
}

/** How an attachment is remembered in the stored conversation — never its contents. */
export function describeAttachments(attachments: ReadonlyArray<{ name: string; kind: AttachmentKind }>): string {
  if (attachments.length === 0) return "";
  const kinds: Record<AttachmentKind, string> = { image: "image", pdf: "PDF", text: "text file" };
  return `[Attached: ${attachments.map((entry) => `${entry.name} (${kinds[entry.kind]})`).join(", ")}]`;
}

/**
 * Whether one more file fits beside what is already staged, checked before
 * it is sent so the person hears why at the moment they add it. `size` is
 * decoded bytes for an image or PDF and characters for a text file. Null
 * when it fits; the sentence to show when it does not. The route checks
 * again — this is a courtesy, not the authority.
 */
export function stagingError(
  candidate: { name: string; kind: AttachmentKind; size: number },
  staged: ReadonlyArray<{ kind: AttachmentKind; size: number }>,
): string | null {
  const name = cleanName(candidate.name);
  if (staged.length >= ATTACHMENT_LIMITS.maxFiles) {
    return `Up to ${ATTACHMENT_LIMITS.maxFiles} files at a time — ${name} was not added.`;
  }
  if (candidate.size <= 0) return `${name} is empty.`;
  if (candidate.kind === "text") {
    const chars = staged.filter((file) => file.kind === "text").reduce((sum, file) => sum + file.size, 0);
    if (chars + candidate.size > ATTACHMENT_LIMITS.maxTextChars) {
      return `${name} is too long — text files can carry ${ATTACHMENT_LIMITS.maxTextChars.toLocaleString("en-US")} characters in all.`;
    }
    return null;
  }
  const bytes = staged.filter((file) => file.kind !== "text").reduce((sum, file) => sum + file.size, 0);
  if (bytes + candidate.size > ATTACHMENT_LIMITS.maxTotalBytes) {
    return `${name} is too large — attachments can be 3MB together.`;
  }
  return null;
}

/** "1.2 MB", "84 KB", "3,201 chars". */
export function describeSize(file: { kind: AttachmentKind; size: number }): string {
  if (file.kind === "text") return `${file.size.toLocaleString("en-US")} chars`;
  if (file.size >= 1024 * 1024) return `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(file.size / 1024))} KB`;
}

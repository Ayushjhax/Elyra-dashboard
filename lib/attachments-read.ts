import {
  ATTACHMENT_LIMITS,
  base64Bytes,
  cleanName,
  describeSize,
  kindOf,
  mediaTypeFor,
  stagingError,
  type ComposerAttachment,
} from "@/lib/attachments";

export { describeSize };

/* ---------------------------------------------------------------------------
   Turning picked, dropped or pasted files into staged attachments.

   Browser-only. Every limit is checked here first, so the person hears
   "too large" at the moment they add a file rather than after they send.
   The route checks again; nothing here is trusted by it.

   Images are scaled to the longest edge the model reads (1568px) — a 4K
   screenshot carries no more for it than a scaled one, and is several
   times the bytes — and re-encoded as WebP, which keeps chart text sharp.
   A GIF is left alone, since re-encoding would keep only its first frame.
--------------------------------------------------------------------------- */

/** Below this an image within the edge limit is sent as it is. */
const KEEP_AS_IS_BYTES = 900_000;

let counter = 0;
const nextId = () => `att_${Date.now().toString(36)}_${(counter += 1)}`;

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The image to send: as it is when it is already small, scaled otherwise. */
async function prepareImage(file: File, mediaType: string): Promise<Blob> {
  if (mediaType === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    /* Undecodable here; the server's byte check will say so plainly. */
    return file;
  }
  const scale = Math.min(1, ATTACHMENT_LIMITS.maxImageEdge / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= KEEP_AS_IS_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  /* A browser that cannot encode WebP hands back PNG, which is lossless and
     still small at this size. */
  const webp = await canvasBlob(canvas, "image/webp", 0.9);
  if (webp !== null && webp.type === "image/webp") return webp;
  return (await canvasBlob(canvas, "image/png", 1)) ?? file;
}

export interface ReadResult {
  added: ComposerAttachment[];
  errors: string[];
}

/**
 * Reads files into attachments, within what is already staged. Each file
 * that cannot be added says why; the rest are added.
 */
export async function readAttachments(
  files: readonly File[],
  staged: readonly ComposerAttachment[],
): Promise<ReadResult> {
  const added: ComposerAttachment[] = [];
  const errors: string[] = [];
  /* What is staged, plus what this call has added so far. */
  const sizes = () => [...staged, ...added];

  for (const file of files) {
    const name = cleanName(file.name || "pasted-image.png");
    /* Counted before the file is read: a fifth file is refused unread. */
    if (sizes().length >= ATTACHMENT_LIMITS.maxFiles) {
      errors.push(`Up to ${ATTACHMENT_LIMITS.maxFiles} files at a time — ${name} was not added.`);
      continue;
    }
    const mediaType = mediaTypeFor(name, file.type);
    const kind = mediaType === null ? null : kindOf(mediaType);
    if (mediaType === null || kind === null) {
      errors.push(`${name}: only images, PDFs and text files can be attached.`);
      continue;
    }

    try {
      if (kind === "text") {
        const text = await file.text();
        const refused = stagingError({ name, kind, size: text.trim().length === 0 ? 0 : text.length }, sizes());
        if (refused !== null) {
          errors.push(refused);
          continue;
        }
        added.push({ id: nextId(), name, mediaType, kind, data: text, size: text.length, previewUrl: null });
      } else {
        const blob = kind === "image" ? await prepareImage(file, mediaType) : file;
        const url = await dataUrl(blob);
        const data = url.slice(url.indexOf(",") + 1);
        const size = base64Bytes(data);
        const refused = stagingError({ name, kind, size }, sizes());
        if (refused !== null) {
          errors.push(refused);
          continue;
        }
        const sentType = kind === "image" ? blob.type || mediaType : mediaType;
        added.push({
          id: nextId(),
          name,
          mediaType: sentType,
          kind,
          data,
          size,
          previewUrl: kind === "image" ? `data:${sentType};base64,${data}` : null,
        });
      }
    } catch {
      errors.push(`${name} could not be read.`);
    }
  }

  return { added, errors };
}

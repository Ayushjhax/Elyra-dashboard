import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import {
  ATTACHMENT_LIMITS,
  cleanName,
  kindOf,
  mediaTypeFor,
  stagingError,
  type AttachmentKind,
  type ComposerAttachment,
} from "@/lib/attachments";

/* ---------------------------------------------------------------------------
   Turning picked photos and files into staged attachments — the app's
   lib/attachments-read.ts.

   Two ways in, both the system's own pickers, so the app holds no storage
   permission: the photo picker for images, the document picker for PDFs and
   text files (CSV, TXT, Markdown, JSON). Each file is checked against the
   shared rules (lib/attachments.ts) the moment it is added, so "too large"
   is heard then rather than after sending. The API checks again; nothing
   here is trusted by it.

   A photo is scaled to the longest edge the model reads (1568px) and
   re-encoded as WebP — a phone photo carries no more for it than a scaled
   one, and is several times the bytes. A GIF is left alone.
--------------------------------------------------------------------------- */

/** Below this an image within the edge limit is sent as it is. */
const KEEP_AS_IS_BYTES = 900_000;

let counter = 0;
const nextId = () => `att_${Date.now().toString(36)}_${(counter += 1)}`;

export interface PickResult {
  added: ComposerAttachment[];
  errors: string[];
}

/** The base64 to send for an image: as it is when small, scaled otherwise. */
async function prepareImage(
  uri: string,
  mediaType: string,
  width: number,
  height: number,
  bytes: number,
): Promise<{ data: string; mediaType: string }> {
  if (mediaType === "image/gif") return { data: await new File(uri).base64(), mediaType };
  /* The document picker does not say how large an image is; decode it once to find out. */
  const size = width > 0 && height > 0 ? { width, height } : await ImageManipulator.manipulate(uri).renderAsync();
  const longest = Math.max(size.width, size.height);
  if (longest <= ATTACHMENT_LIMITS.maxImageEdge && bytes > 0 && bytes <= KEEP_AS_IS_BYTES) {
    return { data: await new File(uri).base64(), mediaType };
  }
  const context = ImageManipulator.manipulate(uri);
  if (longest > ATTACHMENT_LIMITS.maxImageEdge) {
    context.resize(
      size.width >= size.height
        ? { width: ATTACHMENT_LIMITS.maxImageEdge, height: null }
        : { width: null, height: ATTACHMENT_LIMITS.maxImageEdge },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress: 0.9, base64: true });
  if (saved.base64 === undefined) throw new Error("The image could not be encoded.");
  return { data: saved.base64, mediaType: "image/webp" };
}

function decodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

interface Picked {
  uri: string;
  name: string;
  reported: string;
  width?: number;
  height?: number;
  size?: number;
}

/** Reads each picked file, within what is already staged. */
async function read(picked: Picked[], staged: readonly ComposerAttachment[]): Promise<PickResult> {
  const added: ComposerAttachment[] = [];
  const errors: string[] = [];
  const sizes = () => [...staged, ...added];

  for (const file of picked) {
    const name = cleanName(file.name);
    if (sizes().length >= ATTACHMENT_LIMITS.maxFiles) {
      errors.push(`Up to ${ATTACHMENT_LIMITS.maxFiles} files at a time — ${name} was not added.`);
      continue;
    }
    const mediaType = mediaTypeFor(name, file.reported);
    const kind: AttachmentKind | null = mediaType === null ? null : kindOf(mediaType);
    if (mediaType === null || kind === null) {
      errors.push(`${name}: only images, PDFs and text files can be attached.`);
      continue;
    }

    try {
      if (kind === "text") {
        const text = await new File(file.uri).text();
        const refused = stagingError({ name, kind, size: text.trim().length === 0 ? 0 : text.length }, sizes());
        if (refused !== null) {
          errors.push(refused);
          continue;
        }
        added.push({ id: nextId(), name, mediaType, kind, data: text, size: text.length, previewUrl: null });
        continue;
      }

      const encoded =
        kind === "image"
          ? await prepareImage(file.uri, mediaType, file.width ?? 0, file.height ?? 0, file.size ?? 0)
          : { data: await new File(file.uri).base64(), mediaType };
      const size = decodedBytes(encoded.data);
      const refused = stagingError({ name, kind, size }, sizes());
      if (refused !== null) {
        errors.push(refused);
        continue;
      }
      added.push({
        id: nextId(),
        name: kind === "image" && encoded.mediaType === "image/webp" ? name.replace(/\.[a-z0-9]+$/i, "") + ".webp" : name,
        mediaType: encoded.mediaType,
        kind,
        data: encoded.data,
        size,
        previewUrl: kind === "image" ? `data:${encoded.mediaType};base64,${encoded.data}` : null,
      });
    } catch {
      errors.push(`${name} could not be read.`);
    }
  }
  return { added, errors };
}

/** Photos, from the system photo picker. */
export async function pickImages(staged: readonly ComposerAttachment[]): Promise<PickResult> {
  const room = ATTACHMENT_LIMITS.maxFiles - staged.length;
  if (room <= 0) return { added: [], errors: [`Up to ${ATTACHMENT_LIMITS.maxFiles} files at a time.`] };
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    allowsMultipleSelection: room > 1,
    selectionLimit: room,
    quality: 1,
  });
  if (result.canceled) return { added: [], errors: [] };
  return read(
    result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${index + 1}.${(asset.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`,
      reported: asset.mimeType ?? "",
      width: asset.width,
      height: asset.height,
      size: asset.fileSize,
    })),
    staged,
  );
}

/** PDFs and text files, from the system document picker. */
export async function pickFiles(staged: readonly ComposerAttachment[]): Promise<PickResult> {
  if (staged.length >= ATTACHMENT_LIMITS.maxFiles) {
    return { added: [], errors: [`Up to ${ATTACHMENT_LIMITS.maxFiles} files at a time.`] };
  }
  const result = await DocumentPicker.getDocumentAsync({
    /* Android types a CSV several ways; anything not accepted is named, not
       silently dropped, by the check above. */
    type: ["application/pdf", "text/*", "application/json", "text/comma-separated-values", "image/*"],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { added: [], errors: [] };
  return read(
    result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, reported: asset.mimeType ?? "", size: asset.size })),
    staged,
  );
}

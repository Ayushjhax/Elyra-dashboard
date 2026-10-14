import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LIMITS,
  base64Bytes,
  cleanName,
  describeAttachments,
  matchesSignature,
  mediaTypeFor,
  validateAttachments,
} from "@/lib/attachments";

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
const PNG = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n").toString("base64");
const WEBP = b64([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe("validateAttachments", () => {
  it("accepts images, PDFs and text, and tags their kind", () => {
    const result = validateAttachments([
      { name: "chart.png", mediaType: "image/png", data: PNG },
      { name: "statement.pdf", mediaType: "application/pdf", data: PDF },
      { name: "fills.csv", mediaType: "text/csv", data: "time,price\n1,2" },
    ]);
    expect("attachments" in result && result.attachments.map((entry) => entry.kind)).toEqual(["image", "pdf", "text"]);
  });

  it("checks the bytes, not only the claimed type", () => {
    const result = validateAttachments([{ name: "evil.png", mediaType: "image/png", data: PDF }]);
    expect(result).toEqual({ error: "evil.png is not the image it claims to be." });
  });

  it("refuses types it does not read", () => {
    const result = validateAttachments([{ name: "run.exe", mediaType: "application/octet-stream", data: "TVo=" }]);
    expect("error" in result && result.error).toMatch(/only images, PDFs and text files/);
  });

  it("holds the file count and the byte budget", () => {
    const five = Array.from({ length: 5 }, () => ({ name: "a.txt", mediaType: "text/plain", data: "x" }));
    expect("error" in validateAttachments(five)).toBe(true);

    const bytes = Buffer.alloc(ATTACHMENT_LIMITS.maxTotalBytes + 10);
    bytes.write("%PDF-1.7\n");
    const pdf = bytes.toString("base64");
    expect(validateAttachments([{ name: "big.pdf", mediaType: "application/pdf", data: pdf }])).toEqual({
      error: "Attachments are limited to 3MB together.",
    });
  });

  it("strips paths and control characters from names", () => {
    const result = validateAttachments([{ name: "../../etc/pa\u0000sswd.txt", mediaType: "text/plain", data: "hi" }]);
    expect("attachments" in result && result.attachments[0].name).toBe("passwd.txt");
  });

  it("treats a missing list as no attachments", () => {
    expect(validateAttachments(undefined)).toEqual({ attachments: [] });
  });
});

describe("helpers", () => {
  it("recognises webp's RIFF container", () => {
    expect(matchesSignature("image/webp", WEBP)).toBe(true);
    expect(matchesSignature("image/webp", PNG)).toBe(false);
  });

  it("infers text types from the extension when the browser gave none", () => {
    expect(mediaTypeFor("trades.CSV", "")).toBe("text/csv");
    expect(mediaTypeFor("notes.md", "")).toBe("text/markdown");
    expect(mediaTypeFor("photo.heic", "image/heic")).toBeNull();
  });

  it("measures base64 without decoding", () => {
    expect(base64Bytes(Buffer.from("hello").toString("base64"))).toBe(5);
    expect(base64Bytes(Buffer.from("hell").toString("base64"))).toBe(4);
  });

  it("names attachments for the stored transcript, not their contents", () => {
    expect(describeAttachments([{ name: "a.png", kind: "image" }, { name: "b.pdf", kind: "pdf" }])).toBe(
      "[Attached: a.png (image), b.pdf (PDF)]",
    );
    expect(cleanName("")).toBe("file");
  });
});

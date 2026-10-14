import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { userId: string | null; privyDid: string } }));

vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => state.user }));

const CLIP = Buffer.from("OggS fake audio").toString("base64");
const post = (body: unknown) =>
  new Request("http://test/api/agent/transcribe", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetModules();
  state.user = { userId: "u1", privyDid: "did:privy:1" };
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe("/api/agent/transcribe", () => {
  it("says whether it can transcribe at all", async () => {
    delete process.env.GEMINI_API_KEY;
    const { GET } = await import("@/app/api/agent/transcribe/route");
    expect(await (await GET()).json()).toEqual({ available: false });
  });

  it("refuses without a session", async () => {
    state.user = null;
    const { POST } = await import("@/app/api/agent/transcribe/route");
    expect((await POST(post({ audio: CLIP, mediaType: "audio/ogg" }))).status).toBe(401);
  });

  it("refuses formats and sizes it does not take", async () => {
    const { POST } = await import("@/app/api/agent/transcribe/route");
    expect((await POST(post({ audio: CLIP, mediaType: "video/mp4" }))).status).toBe(400);
    expect((await POST(post({ audio: "not base64!", mediaType: "audio/ogg" }))).status).toBe(400);
    const long = Buffer.alloc(3 * 1024 * 1024).toString("base64");
    expect((await POST(post({ audio: long, mediaType: "audio/ogg" }))).status).toBe(413);
  });

  it("returns the words, cleaned, with the codec parameter dropped", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: '"What is SOL funding?"' }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("@/app/api/agent/transcribe/route");
    const response = await POST(post({ audio: CLIP, mediaType: "audio/webm;codecs=opus" }));
    expect(await response.json()).toEqual({ text: "What is SOL funding?" });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.contents[0].parts[0].inlineData.mimeType).toBe("audio/webm");
  });

  it("says when the quota is spent rather than failing silently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/agent/transcribe/route");
    const response = await POST(post({ audio: CLIP, mediaType: "audio/ogg" }));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/quota/);
  });

  it("caps recordings per user per hour", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "hi" }] } }] })));
    const { POST } = await import("@/app/api/agent/transcribe/route");
    let last = 0;
    for (let index = 0; index < 61; index += 1) last = (await POST(post({ audio: CLIP, mediaType: "audio/ogg" }))).status;
    expect(last).toBe(429);
  });
});

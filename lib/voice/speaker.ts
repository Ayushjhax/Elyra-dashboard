"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/i18n/locales";
import { VOICE_PERSONAS, type VoicePersona } from "@/lib/voice/personas";
import { speechChunks, toSpeakable } from "@/lib/voice/speakable";

/* ---------------------------------------------------------------------------
   Saying something out loud, in the browser. One speaker for the page, so a
   reply read aloud from the chat and the voice conversation never talk over
   each other: speaking anything stops whatever was being said.

   Elyra's voices come from /api/agent/speak as raw 16-bit PCM at 24 kHz,
   streamed. Each piece is played through Web Audio the moment it arrives,
   scheduled back to back, so the first words are heard while the rest are
   still being made; the next sentence is asked for while this one plays.
   Where the server has no voices, or a request fails, the browser's own
   speech synthesis says it instead, at the persona's rate and pitch.

   Audio needs a gesture before it may play: `unlockAudio` is called from
   the click that starts a voice conversation or a read-aloud.
--------------------------------------------------------------------------- */

export type SpeakOutcome = "done" | "stopped" | "failed";

interface SpeakerState {
  /** What is being said: a message id, "voice" for the conversation, or null. */
  speaking: string | null;
}

let state: SpeakerState = { speaking: null };
const listeners = new Set<() => void>();
const emit = (next: SpeakerState) => {
  state = next;
  for (const listener of listeners) listener();
};

export function useSpeaking(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state.speaking,
    () => null,
  );
}

/* ---- the server's voices, asked once ---- */

let serverVoices: Promise<boolean> | null = null;
function hasServerVoices(): Promise<boolean> {
  serverVoices ??= fetch("/api/agent/speak", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ available?: boolean }>)
    .then((body) => body.available === true)
    .catch(() => false);
  return serverVoices;
}

/* ---- audio ---- */

let context: AudioContext | null = null;
let playing: AudioBufferSourceNode[] = [];
let current: AbortController | null = null;

/** Call from a click: browsers start audio only after a gesture. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (context === null) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume().catch(() => undefined);
}

/** Stops anything being said, now. */
export function stopSpeaking(): void {
  current?.abort();
  current = null;
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      /* Already ended. */
    }
  }
  playing = [];
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (state.speaking !== null) emit({ speaking: null });
}

const SAMPLE_RATE = 24_000;
/** Play at least this much at a time: fewer, longer buffers schedule cleanly. */
const MIN_SAMPLES = 4_800;

/** Streams one piece from the server and schedules it; resolves when it has all arrived. */
async function streamPiece(
  text: string,
  persona: VoicePersona,
  token: string | null,
  signal: AbortSignal,
  clock: { at: number },
): Promise<void> {
  const audio = context as AudioContext;
  const response = await fetch("/api/agent/speak", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ text, persona: persona.id }),
  });
  if (!response.ok || response.body === null) throw new Error(`speak ${response.status}`);
  const reader = response.body.getReader();
  let carry: number | null = null;
  let pending: number[] = [];

  const schedule = (samples: number[]) => {
    if (samples.length === 0) return;
    const buffer = audio.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    const startAt = Math.max(clock.at, audio.currentTime + 0.03);
    source.start(startAt);
    clock.at = startAt + buffer.duration;
    playing.push(source);
    source.onended = () => {
      playing = playing.filter((entry) => entry !== source);
    };
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done || signal.aborted) break;
    let bytes = value;
    if (carry !== null) {
      const joined = new Uint8Array(bytes.length + 1);
      joined[0] = carry;
      joined.set(bytes, 1);
      bytes = joined;
      carry = null;
    }
    if (bytes.length % 2 === 1) {
      carry = bytes[bytes.length - 1];
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.length; offset += 2) pending.push(view.getInt16(offset, true) / 32_768);
    if (pending.length >= MIN_SAMPLES) {
      schedule(pending);
      pending = [];
    }
  }
  if (!signal.aborted) schedule(pending);
}

/** The browser's own voice, for a language, varied by persona where it has several. */
function browserVoice(persona: VoicePersona, locale: Locale): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const want = locale === "zh-CN" ? "zh" : "en";
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(want));
  if (voices.length === 0) return null;
  const index = VOICE_PERSONAS.findIndex((entry) => entry.id === persona.id);
  return voices[Math.max(0, index) % voices.length];
}

function sayInBrowser(text: string, persona: VoicePersona, locale: Locale, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("no speech synthesis"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale === "zh-CN" ? "zh-CN" : "en-US";
    utterance.rate = persona.rate;
    utterance.pitch = persona.pitch;
    const voice = browserVoice(persona, locale);
    if (voice !== null) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = (event) => (event.error === "interrupted" || event.error === "canceled" ? resolve() : reject(new Error(event.error)));
    signal.addEventListener("abort", () => resolve(), { once: true });
    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Says `text` — cleaned for speech first — as `persona`. `key` names what is
 * being said, for the button that shows it. Anything already being said
 * stops first.
 */
export async function speak(
  text: string,
  options: { persona: VoicePersona; locale: Locale; getToken: () => Promise<string | null>; key: string; addressWord?: string },
): Promise<SpeakOutcome> {
  stopSpeaking();
  const controller = new AbortController();
  current = controller;
  const signal = controller.signal;
  const pieces = speechChunks(toSpeakable(text, options.addressWord));
  if (pieces.length === 0) return "done";
  emit({ speaking: options.key });

  const finish = (outcome: SpeakOutcome): SpeakOutcome => {
    if (current === controller) {
      current = null;
      emit({ speaking: null });
    }
    return outcome;
  };

  let useServer = (await hasServerVoices()) && context !== null;
  const token = useServer ? await options.getToken().catch(() => null) : null;
  if (token === null) useServer = false;
  const clock = { at: 0 };

  for (let index = 0; index < pieces.length; index += 1) {
    if (signal.aborted) return finish("stopped");
    if (useServer) {
      try {
        await streamPiece(pieces[index], options.persona, token, signal, clock);
        continue;
      } catch {
        if (signal.aborted) return finish("stopped");
        /* The rest is said by the browser, after what was already queued. */
        useServer = false;
        await waitUntil(clock.at, signal);
      }
    }
    try {
      await sayInBrowser(pieces[index], options.persona, options.locale, signal);
    } catch {
      return finish("failed");
    }
  }
  if (useServer) await waitUntil(clock.at, signal);
  return finish(signal.aborted ? "stopped" : "done");
}

/** Resolves once the audio clock passes `at`, or on stop. */
function waitUntil(at: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (signal.aborted || context === null || context.currentTime >= at) resolve();
      else window.setTimeout(tick, 80);
    };
    tick();
  });
}

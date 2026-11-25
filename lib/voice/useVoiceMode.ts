"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendToAgent, type TokenGetter } from "@/lib/agentChat";
import type { Locale } from "@/lib/i18n/locales";
import { parseVoiceCommand, type VoiceCommand } from "@/lib/voice/command";
import type { VoicePersona } from "@/lib/voice/personas";
import { speak, stopSpeaking, unlockAudio } from "@/lib/voice/speaker";

/* ---------------------------------------------------------------------------
   A voice conversation with Elyra: listen, understand, answer out loud,
   listen again — until the person ends it.

   The person starts it and ends it; nothing listens outside it. Each turn:

   1. LISTEN. The browser's recogniser hears one utterance and stops at the
      pause after it (Chrome, Edge, Safari). Where there is none (Firefox,
      Brave) the microphone records until a second of silence and
      /api/agent/transcribe writes it out.
   2. UNDERSTAND, by code. `parseVoiceCommand` decides whether it was an
      order, an answer to a ticket (confirm, cancel) or anything else.
      An order becomes a ticket (`onOrder`, in the panel), read back aloud;
      a question goes to Elyra's agent, which is told the reply will be
      heard (`voice`) — and which never places anything.
   3. SPEAK, in the chosen persona's voice (lib/voice/speaker.ts).

   The microphone is off while Elyra speaks, so it never hears itself;
   tapping interrupts. Three turns in a row with nothing heard pause the
   conversation rather than leaving a microphone open to the room.
--------------------------------------------------------------------------- */

export type VoicePhase = "off" | "listening" | "transcribing" | "thinking" | "speaking" | "paused";

export interface VoiceHandlers {
  /**
   * An order was heard: make the ticket and return what to say back, and
   * whether to listen after — a swap opens the wallet's dialog, and the
   * microphone waits for it to close.
   */
  onOrder: (command: Exclude<VoiceCommand, { kind: "confirm" | "cancel" | "none" }>, heard: string) => { say: string; listen: boolean };
  /** "Confirm" with a ticket open: place it if a spoken confirmation may, and say what happened. */
  onConfirm: () => Promise<string>;
  /** "Cancel" with a ticket open. */
  onCancel: () => string;
  /** Whether a ticket is waiting for an answer. */
  hasTicket: () => boolean;
  /** Said when the agent gave no answer. */
  noAnswer: string;
  /** Said when another question is still being answered. */
  busy: string;
  /** Said when nothing was heard three times. */
  pausedLine: string;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined" || "brave" in navigator) return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const MISSES_BEFORE_PAUSE = 3;
const SILENCE_MS = 1_200;
const NOTHING_SAID_MS = 8_000;
const MAX_TURN_MS = 30_000;

export interface VoiceMode {
  phase: VoicePhase;
  /** Words being heard right now. */
  interim: string;
  /** The last thing the person said, in full. */
  heard: string;
  /** The last thing Elyra said. */
  said: string;
  error: string | null;
  /** Whether this browser can listen at all. */
  supported: boolean;
  start: () => void;
  end: () => void;
  /** Stop listening, keep the conversation. */
  pause: () => void;
  /** Listen again — also interrupts Elyra mid-sentence. */
  resume: () => void;
  /** Say something in the persona's voice, then listen. */
  say: (text: string) => void;
}

export function useVoiceMode(options: {
  persona: VoicePersona;
  locale: Locale;
  getToken: TokenGetter;
  swapSymbols: readonly string[];
  handlers: VoiceHandlers;
  errors: { blocked: string; noMic: string; failed: string };
}): VoiceMode {
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () =>
      typeof window !== "undefined" &&
      (recognitionCtor() !== null || (typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined")),
  );

  /* The loop runs across awaits; it reads the latest of everything here. */
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const generation = useRef(0);
  const active = useRef(false);
  const misses = useRef(0);
  const stopListening = useRef<() => void>(() => {});

  const live = (run: number) => active.current && generation.current === run;

  const speakThen = useCallback(async (run: number, text: string, after: "listen" | "pause" = "listen") => {
    if (!live(run)) return;
    setSaid(text);
    setPhase("speaking");
    const { persona, locale, getToken } = latest.current;
    await speak(text, { persona, locale, getToken, key: "voice" });
    if (!live(run)) return;
    if (after === "listen") listen(run);
    else setPhase("paused");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen is hoisted below and reads refs only
  }, []);

  const handle = useCallback(
    async (run: number, text: string) => {
      if (!live(run)) return;
      const words = text.trim();
      setInterim("");
      if (words.length === 0) {
        misses.current += 1;
        if (misses.current >= MISSES_BEFORE_PAUSE) {
          setPhase("paused");
          setSaid(latest.current.handlers.pausedLine);
          return;
        }
        listen(run);
        return;
      }
      misses.current = 0;
      setHeard(words);
      const { handlers, swapSymbols, getToken, persona } = latest.current;
      const command = parseVoiceCommand(words, { swapSymbols });

      if (handlers.hasTicket() && command.kind === "confirm") {
        setPhase("thinking");
        const line = await handlers.onConfirm();
        await speakThen(run, line);
        return;
      }
      if (handlers.hasTicket() && command.kind === "cancel") {
        await speakThen(run, handlers.onCancel());
        return;
      }
      if (command.kind === "perp" || command.kind === "swap" || command.kind === "close") {
        const reply = handlers.onOrder(command, words);
        await speakThen(run, reply.say, reply.listen ? "listen" : "pause");
        return;
      }

      setPhase("thinking");
      const answer = await sendToAgent(words, getToken, { voice: persona.id });
      if (!live(run)) return;
      await speakThen(run, answer === null ? handlers.busy : answer.text.trim().length > 0 ? answer.text : handlers.noAnswer);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen is hoisted below and reads refs only
    [speakThen],
  );

  /* ---- listening: the browser's recogniser ---- */
  const listenWithSpeech = (run: number, Ctor: RecognitionCtor) => {
    const recognition = new Ctor();
    const { locale } = latest.current;
    recognition.lang = locale === "zh-CN" ? "zh-CN" : navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    let final = "";
    let failed = false;
    recognition.onresult = (event) => {
      let partial = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) final += result[0].transcript;
        else partial += result[0].transcript;
      }
      if (live(run)) setInterim(`${final} ${partial}`.trim());
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      failed = true;
      if (!live(run)) return;
      setError(event.error === "not-allowed" || event.error === "service-not-allowed" ? latest.current.errors.blocked : latest.current.errors.failed);
      setPhase("paused");
    };
    recognition.onend = () => {
      if (!live(run) || failed) return;
      void handle(run, final);
    };
    stopListening.current = () => recognition.abort();
    setPhase("listening");
    try {
      recognition.start();
    } catch {
      setError(latest.current.errors.failed);
      setPhase("paused");
    }
  };

  /* ---- listening: record until a second of silence, then transcribe ---- */
  const listenWithRecorder = async (run: number) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (caught) {
      if (!live(run)) return;
      setError(caught instanceof DOMException && caught.name === "NotAllowedError" ? latest.current.errors.blocked : latest.current.errors.noMic);
      setPhase("paused");
      return;
    }
    if (!live(run)) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    const meter = new AudioContext();
    const analyser = meter.createAnalyser();
    analyser.fftSize = 1024;
    meter.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    let spoke = false;
    let loudAt = Date.now();
    const started = Date.now();
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      const now = Date.now();
      if (rms > 0.02) {
        spoke = true;
        loudAt = now;
      }
      if ((spoke && now - loudAt > SILENCE_MS) || (!spoke && now - started > NOTHING_SAID_MS) || now - started > MAX_TURN_MS) {
        if (recorder.state === "recording") recorder.stop();
      }
    }, 100);
    const release = () => {
      window.clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      void meter.close().catch(() => undefined);
    };
    recorder.onstop = () => {
      release();
      if (!live(run)) return;
      if (!spoke) {
        void handle(run, "");
        return;
      }
      setPhase("transcribing");
      void (async () => {
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const token = await latest.current.getToken();
          const response = await fetch("/api/agent/transcribe", {
            method: "POST",
            headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ audio, mediaType: blob.type.split(";")[0] }),
          });
          const body = (await response.json().catch(() => ({}))) as { text?: string };
          void handle(run, response.ok ? (body.text ?? "") : "");
        } catch {
          void handle(run, "");
        }
      })();
    };
    stopListening.current = () => {
      if (recorder.state === "recording") recorder.stop();
      release();
    };
    setPhase("listening");
    recorder.start();
  };

  function listen(run: number) {
    if (!live(run)) return;
    setError(null);
    setInterim("");
    const Ctor = recognitionCtor();
    if (Ctor !== null) listenWithSpeech(run, Ctor);
    else void listenWithRecorder(run);
  }

  const start = useCallback(() => {
    unlockAudio();
    generation.current += 1;
    active.current = true;
    misses.current = 0;
    setHeard("");
    setSaid("");
    setError(null);
    listen(generation.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen reads refs only
  }, []);

  const end = useCallback(() => {
    generation.current += 1;
    active.current = false;
    stopListening.current();
    stopListening.current = () => {};
    stopSpeaking();
    setPhase("off");
    setInterim("");
  }, []);

  const pause = useCallback(() => {
    generation.current += 1;
    stopListening.current();
    stopListening.current = () => {};
    stopSpeaking();
    setPhase("paused");
    setInterim("");
  }, []);

  const resume = useCallback(() => {
    if (!active.current) return;
    unlockAudio();
    generation.current += 1;
    misses.current = 0;
    stopListening.current();
    stopSpeaking();
    listen(generation.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen reads refs only
  }, []);

  const say = useCallback(
    (text: string) => {
      if (!active.current) return;
      generation.current += 1;
      stopListening.current();
      void speakThen(generation.current, text);
    },
    [speakThen],
  );

  /* Closing the panel, or leaving the page, ends the conversation: no
     microphone stays open behind a closed panel. */
  useEffect(
    () => () => {
      generation.current += 1;
      active.current = false;
      stopListening.current();
      stopSpeaking();
    },
    [],
  );

  return { phase, interim, heard, said, error, supported, start, end, pause, resume, say };
}

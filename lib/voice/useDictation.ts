"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useElyraStore } from "@/lib/store";
import { useAuthedFetch } from "@/lib/useAuthedFetch";

/* ---------------------------------------------------------------------------
   Speaking a question into the composer.

   Two ways in, chosen per browser:

   - SPEECH. Chrome, Edge and Safari recognise speech themselves. Words land
     in the composer as they are heard, and no audio touches this server.
   - RECORD. Firefox has no recogniser, and Brave's cannot reach its service
     (it fails with "network"). There the composer records a clip, up to a
     minute, and /api/agent/transcribe writes it out. Offered only when that
     route says it can.

   Either way the words go into the draft for the person to read, fix and
   send. Dictation never sends anything on its own — a misheard ticker in a
   question about money should be caught before it is asked.
--------------------------------------------------------------------------- */

export type DictationStatus = "idle" | "listening" | "recording" | "transcribing";
export type DictationMode = "speech" | "record" | null;

const MAX_RECORDING_MS = 60_000;
const RECORDER_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

/* The slice of the Web Speech API this uses. TypeScript's DOM lib does not
   ship it, and browsers expose it under two names. */
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Brave exposes a recogniser that always fails; skip straight to recording. */
function isBrave(): boolean {
  return typeof navigator !== "undefined" && "brave" in navigator;
}

function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

/* ---- Whether the server transcribes, asked once per page ---- */

let serverTranscribes: boolean | null = null;
let asked = false;
const serverListeners = new Set<() => void>();

function askServer(): void {
  if (asked) return;
  asked = true;
  void fetch("/api/agent/transcribe")
    .then((response) => response.json() as Promise<{ available?: boolean }>)
    .then((body) => {
      serverTranscribes = body.available === true;
    })
    .catch(() => {
      serverTranscribes = false;
    })
    .finally(() => {
      for (const listener of serverListeners) listener();
    });
}

/** The browser's recogniser failed in a way that will not fix itself. */
let speechBroken = false;

/* ---- The hook ---- */

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it for this site in your browser's settings.",
  "service-not-allowed": "This browser's speech service is unavailable here.",
  "audio-capture": "No microphone was found.",
  "no-speech": "Nothing was heard. Try again, a little closer to the microphone.",
  network: "This browser's speech service could not be reached.",
};

function joinDraft(base: string, spoken: string): string {
  const head = base.replace(/\s+$/, "");
  const words = spoken.trim();
  if (words.length === 0) return base;
  return head.length === 0 ? words : `${head} ${words}`;
}

export interface Dictation {
  mode: DictationMode;
  status: DictationStatus;
  /** Seconds into a recording. */
  elapsed: number;
  error: string | null;
  start: () => void;
  /** Ends dictation and keeps what was heard. */
  stop: () => void;
  /** Ends dictation and drops anything still to come — for sending. */
  cancel: () => void;
}

/**
 * Where dictated words go. The agent's composer by default; another composer
 * (Capital Intelligence) passes its own draft's reader and writer.
 */
export interface DictationTarget {
  read: () => string;
  write: (text: string) => void;
}

const STORE_TARGET: DictationTarget = {
  read: () => useElyraStore.getState().composerDraft,
  write: (text) => useElyraStore.getState().setComposerDraft(text),
};

export function useDictation(target: DictationTarget = STORE_TARGET): Dictation {
  /* Read through a ref, so a caller passing a fresh object each render does
     not restart anything — the latest reader and writer are simply used. */
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  const authedFetch = useAuthedFetch();
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(() => speechBroken);

  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);
  /** Bumped by cancel, so a late result for an abandoned dictation is dropped. */
  const generation = useRef(0);

  const server = useSyncExternalStore(
    (listener) => {
      serverListeners.add(listener);
      askServer();
      return () => serverListeners.delete(listener);
    },
    () => serverTranscribes,
    () => null,
  );
  const speechAvailable = useSyncExternalStore(
    () => () => {},
    () => recognitionCtor() !== null && !isBrave(),
    () => false,
  );
  const recordAvailable = useSyncExternalStore(
    () => () => {},
    canRecord,
    () => false,
  );

  const mode: DictationMode =
    speechAvailable && !broken ? "speech" : recordAvailable && server === true ? "record" : null;

  const clearTimers = () => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  };

  const startSpeech = useCallback(() => {
    const Ctor = recognitionCtor();
    if (Ctor === null) return;
    const run = generation.current;
    const base = targetRef.current.read();
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    let heard = "";
    rec.onresult = (event) => {
      if (generation.current !== run) return;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) heard += result[0].transcript;
        else interim += result[0].transcript;
      }
      targetRef.current.write(joinDraft(base, `${heard} ${interim}`));
    };
    rec.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "network" || event.error === "service-not-allowed") {
        speechBroken = true;
        setBroken(true);
        setError(
          canRecord()
            ? `${ERRORS[event.error]} The microphone will record and transcribe instead.`
            : ERRORS[event.error],
        );
        return;
      }
      setError(ERRORS[event.error] ?? "Voice input stopped unexpectedly.");
    };
    rec.onend = () => {
      recognition.current = null;
      setStatus("idle");
    };

    recognition.current = rec;
    setError(null);
    setStatus("listening");
    try {
      rec.start();
    } catch {
      recognition.current = null;
      setStatus("idle");
      setError("Voice input could not start.");
    }
  }, []);

  const startRecording = useCallback(async () => {
    const run = generation.current;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (caught) {
      const name = caught instanceof DOMException ? caught.name : "";
      setError(name === "NotAllowedError" ? ERRORS["not-allowed"] : ERRORS["audio-capture"]);
      return;
    }

    const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onstop = () => {
      clearTimers();
      for (const track of stream.getTracks()) track.stop();
      recorder.current = null;
      if (generation.current !== run) {
        setStatus("idle");
        return;
      }
      const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
      if (blob.size < 1_000) {
        setStatus("idle");
        setError(ERRORS["no-speech"]);
        return;
      }
      setStatus("transcribing");
      void (async () => {
        try {
          const audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          const response = await authedFetch("/api/agent/transcribe", {
            method: "POST",
            body: JSON.stringify({ audio, mediaType: blob.type }),
          });
          const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
          if (generation.current !== run) return;
          if (!response.ok) {
            setError(body.error ?? "The recording could not be transcribed.");
          } else if (!body.text) {
            setError(ERRORS["no-speech"]);
          } else {
            targetRef.current.write(joinDraft(targetRef.current.read(), body.text));
          }
        } catch {
          if (generation.current === run) setError("The recording could not be transcribed.");
        } finally {
          if (generation.current === run) setStatus("idle");
        }
      })();
    };

    recorder.current = rec;
    rec.start();
    setElapsed(0);
    setStatus("recording");
    const started = Date.now();
    const tick = () => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
      timers.current.push(window.setTimeout(tick, 1000));
    };
    timers.current.push(window.setTimeout(tick, 1000));
    timers.current.push(
      window.setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, MAX_RECORDING_MS),
    );
  }, [authedFetch]);

  const start = useCallback(() => {
    if (status !== "idle") return;
    if (mode === "speech" && !speechBroken) startSpeech();
    else if (mode === "record" || (speechBroken && canRecord() && server === true)) void startRecording();
  }, [mode, server, status, startRecording, startSpeech]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    generation.current += 1;
    recognition.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    clearTimers();
    setStatus("idle");
  }, []);

  /* The panel can unmount mid-dictation — the drawer closing, the column
     becoming a drawer. What was heard is already in the store's draft;
     the microphone must not stay open behind a closed panel. */
  useEffect(
    () => () => {
      generation.current += 1;
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  return { mode, status, elapsed, error, start, stop, cancel };
}

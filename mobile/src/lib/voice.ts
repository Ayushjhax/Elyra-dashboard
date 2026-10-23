import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { File } from "expo-file-system";
import { api, ApiError } from "~/lib/api";
import { useAppStore } from "~/lib/store";

/* ---------------------------------------------------------------------------
   Speaking a question into the composer — the website's useDictation, in
   its RECORD mode.

   The microphone records a clip, up to a minute, and /api/agent/transcribe
   writes it out. The words go into the DRAFT, after whatever was typed, for
   the person to read, fix and send. Dictation never sends anything on its
   own — a misheard ticker in a question about money should be caught before
   it is asked.

   The microphone is asked for on first use, after the reason is shown
   (`needsReason`), never at launch. A refusal the system will not ask again
   points to the app's settings rather than failing silently.
--------------------------------------------------------------------------- */

export type DictationStatus = "idle" | "recording" | "transcribing";

const MAX_RECORDING_MS = 60_000;

/* AAC in an MP4 container (audio/mp4), mono at speech quality: a minute is
   about half a megabyte, inside the route's 2.5MB cap. */
const OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
};

/** Whether this deployment transcribes at all, asked once. */
let availability: Promise<boolean> | null = null;
function transcriptionAvailable(): Promise<boolean> {
  availability ??= api
    .get<{ available: boolean }>("/api/agent/transcribe", { auth: false })
    .then((body) => body.available === true)
    .catch(() => {
      availability = null;
      return false;
    });
  return availability;
}

export interface Dictation {
  status: DictationStatus;
  /** Seconds recorded so far. */
  elapsed: number;
  error: string | null;
  /** The server cannot transcribe: the microphone is not offered. */
  unavailable: boolean;
  /** The reason should be shown before the system asks for the microphone. */
  needsReason: boolean;
  start: () => Promise<void>;
  /** After the reason was shown: ask the system, then record. */
  allow: () => Promise<void>;
  dismissReason: () => void;
  stop: () => Promise<void>;
  cancel: () => void;
}

export function useDictation(): Dictation {
  const recorder = useAudioRecorder(OPTIONS);
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [needsReason, setNeedsReason] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  /* A transcription that lands after cancel belongs to nobody. */
  const generation = useRef(0);
  /* The recorder stops itself at a minute; the clip is still transcribed.
     The timer reaches the latest `stop` through this ref. */
  const stopRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    void transcriptionAvailable().then((available) => {
      if (!cancelled) setUnavailable(!available);
    });
    return () => {
      cancelled = true;
      if (timer.current !== null) clearInterval(timer.current);
    };
  }, []);

  const clearTimer = () => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  };

  const transcribe = useCallback(async (uri: string, run: number) => {
    setStatus("transcribing");
    const clip = new File(uri);
    try {
      const audio = await clip.base64();
      const body = await api.post<{ text?: string }>("/api/agent/transcribe", { audio, mediaType: "audio/mp4" }, { timeoutMs: 45_000 });
      if (run !== generation.current) return;
      const words = (body.text ?? "").trim();
      if (words.length === 0) {
        setError("Nothing was heard. Try again, closer to the microphone.");
      } else {
        const store = useAppStore.getState();
        const draft = store.composerDraft;
        store.setComposerDraft(draft.trim().length > 0 ? `${draft.trimEnd()} ${words}` : words);
      }
    } catch (failure) {
      if (run === generation.current) {
        setError(failure instanceof ApiError ? failure.message : "The recording could not be transcribed.");
      }
    } finally {
      /* The clip is not kept: once it has been written out (or failed to
         be), the file goes. */
      try {
        if (clip.exists) clip.delete();
      } catch {
        /* Already gone. */
      }
      if (run === generation.current) setStatus("idle");
    }
  }, []);

  const stop = useCallback(async () => {
    if (status !== "recording") return;
    clearTimer();
    const run = generation.current;
    try {
      await recorder.stop();
    } catch {
      /* Already stopped by the one-minute limit. */
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (uri === null) {
      setStatus("idle");
      setError("Nothing was recorded.");
      return;
    }
    await transcribe(uri, run);
  }, [recorder, status, transcribe]);

  const record = useCallback(async () => {
    setError(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_RECORDING_MS / 1000 });
      generation.current += 1;
      startedAt.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      timer.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
        setElapsed(seconds);
        if (seconds * 1000 >= MAX_RECORDING_MS) void stopRef.current();
      }, 500);
    } catch {
      setStatus("idle");
      setError("The microphone could not start. Try again.");
    }
  }, [recorder]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (status !== "idle" || unavailable) return;
    setError(null);
    const permission = await getRecordingPermissionsAsync();
    if (permission.granted) {
      await record();
    } else if (permission.canAskAgain) {
      setNeedsReason(true);
    } else {
      setError("Microphone access is off for Elyra. Turn it on in the app's settings to dictate.");
      void Linking.openSettings();
    }
  }, [record, status, unavailable]);

  const allow = useCallback(async () => {
    setNeedsReason(false);
    const permission = await requestRecordingPermissionsAsync();
    if (permission.granted) await record();
    else setError("Without the microphone, type your question instead.");
  }, [record]);

  const cancel = useCallback(() => {
    generation.current += 1;
    clearTimer();
    if (status === "recording") void recorder.stop().catch(() => {});
    setStatus("idle");
  }, [recorder, status]);

  return {
    status,
    elapsed,
    error,
    unavailable,
    needsReason,
    start,
    allow,
    dismissReason: () => setNeedsReason(false),
    stop,
    cancel,
  };
}

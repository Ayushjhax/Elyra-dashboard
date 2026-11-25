"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_PERSONA, personaById, type VoicePersona, type VoicePersonaId } from "@/lib/voice/personas";

/* ---------------------------------------------------------------------------
   Which voice this browser speaks in. A per-viewer convenience, so it lives
   in this browser's storage and nowhere else; a private window, or storage
   that is blocked, simply starts on the default voice.
--------------------------------------------------------------------------- */

const KEY = "elyra.voice.persona";
const listeners = new Set<() => void>();
let chosen: VoicePersonaId | null = null;

function read(): VoicePersonaId {
  if (chosen !== null) return chosen;
  try {
    chosen = personaById(window.localStorage.getItem(KEY))?.id ?? DEFAULT_PERSONA;
  } catch {
    chosen = DEFAULT_PERSONA;
  }
  return chosen;
}

export function choosePersona(id: VoicePersonaId): void {
  chosen = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* Remembered for this page only. */
  }
  for (const listener of listeners) listener();
}

export function useVoicePersona(): VoicePersona {
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULT_PERSONA,
  );
  return personaById(id) ?? (personaById(DEFAULT_PERSONA) as VoicePersona);
}

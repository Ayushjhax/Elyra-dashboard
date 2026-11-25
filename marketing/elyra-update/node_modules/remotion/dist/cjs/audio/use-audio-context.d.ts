import type { LogLevel } from '../log';
export type RemotionAudioContextState = AudioContextState | 'running-to-suspended' | 'suspended-to-running';
type OwnedAudioContext = {
    audioContext: AudioContext;
    gainNode: GainNode;
    getState: () => RemotionAudioContextState;
    resume: () => Promise<void>;
    suspend: () => Promise<void>;
};
export declare const useSingletonAudioContext: ({ logLevel, latencyHint, audioEnabled, sampleRate, }: {
    logLevel: LogLevel;
    latencyHint: AudioContextLatencyCategory;
    audioEnabled: boolean;
    sampleRate: number;
}) => OwnedAudioContext | null;
export {};

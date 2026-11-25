import { type LogLevel } from '../log.js';
export type AudioContextResumeResult = 'resumed' | 'cancelled' | 'failed';
export declare const waitUntilActuallyResumed: (audioContext: AudioContext, logLevel: LogLevel, signal: AbortSignal, isAutoPlayAttempt: boolean) => Promise<AudioContextResumeResult>;

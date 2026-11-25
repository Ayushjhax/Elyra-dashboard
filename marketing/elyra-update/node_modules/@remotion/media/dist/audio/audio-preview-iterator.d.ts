import type { AudioBufferSlice } from '../make-iterator-with-priming';
export declare const HEALTHY_BUFFER_THRESHOLD_SECONDS = 1;
export type PreparedAudioChunk = {
    buffer: AudioBuffer;
    timestamp: number;
    originalUnloopedMediaTimestamp: number;
    sourceOffsetInSeconds: number;
    sourceDurationInSeconds: number;
};
export type QueuedPeriod = {
    from: number;
    until: number;
};
export type MakeAudioIteratorOptions = {
    startFromSecond: number;
    iterator: AsyncGenerator<AudioBufferSlice, void, unknown>;
    scheduleChunk: (chunk: PreparedAudioChunk) => AudioBufferSourceNode | null;
    unscheduleAudioNode: (node: AudioBufferSourceNode) => boolean | void;
};
export declare const makeAudioIterator: ({ startFromSecond, iterator, scheduleChunk, unscheduleAudioNode, }: MakeAudioIteratorOptions) => {
    destroy: () => void;
    getNextFn: () => Promise<IteratorResult<AudioBufferSlice, void>>;
    isDestroyed: () => boolean;
    scheduleAudio: (chunk: PreparedAudioChunk) => void;
    rescheduleAudio: (time: number) => boolean;
    guessNextTimestamp: () => number;
    getQueuedPeriod: () => {
        from: number;
        until: number;
    } | null;
};
export type AudioIterator = ReturnType<typeof makeAudioIterator>;
export declare const isAlreadyQueued: (time: number, queuedPeriod: {
    from: number;
    until: number;
} | undefined | null) => boolean;

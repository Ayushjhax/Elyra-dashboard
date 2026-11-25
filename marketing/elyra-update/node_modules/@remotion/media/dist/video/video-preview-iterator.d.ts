import type { WrappedCanvas } from 'mediabunny';
import type { PrewarmedVideoIteratorCache } from '../prewarm-iterator-for-looping';
export declare const createVideoIterator: (timeToSeek: number, cache: PrewarmedVideoIteratorCache) => Promise<{
    destroy: () => void;
    initialFrame: WrappedCanvas | null;
    isDestroyed: () => boolean;
    tryToSatisfySeek: (time: number, options: {
        pendingFrameBehavior: 'wait' | 'restart-iterator';
        onWait: () => void;
        shouldContinue: () => boolean;
    }) => Promise<{
        type: 'not-satisfied';
        reason: string;
    } | {
        type: 'satisfied';
        frame: WrappedCanvas;
    }>;
}>;
export type VideoIterator = Awaited<ReturnType<typeof createVideoIterator>>;

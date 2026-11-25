import type { Readable, Writable } from 'node:stream';
import type { RemotionRawFrame } from './remotion-shared-memory';
export declare const serializeRemotionSharedMemoryPool: (frame: RemotionRawFrame) => string;
export declare const serializeRemotionSharedMemoryFrame: ({ frame, pts, }: {
    frame: RemotionRawFrame;
    pts: number;
}) => string;
export declare const serializeRemotionSharedMemoryPoolRetirement: (poolId: number) => string;
export declare const parseRemotionSharedMemoryAck: (line: string) => {
    poolId: number;
    slot: number;
    frameId: string;
};
export declare const createRemotionSharedMemoryFfmpegBridge: ({ control, acknowledgements, }: {
    control: Writable;
    acknowledgements: Readable;
}) => {
    writeFrame: ({ frame, pts, }: {
        frame: RemotionRawFrame;
        pts: number;
    }) => Promise<{
        waitForAck: Promise<void>;
    }>;
    finish: () => Promise<void>;
    fail: (error: Error) => void;
};

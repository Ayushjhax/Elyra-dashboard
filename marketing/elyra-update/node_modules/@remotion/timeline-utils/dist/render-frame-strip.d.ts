import { type VideoFrameAndLastUsed } from './frame-database';
export declare const WEBCODECS_TIMESCALE = 1000000;
export declare const MAX_TIME_DEVIATION: number;
export declare const getFrameDistance: ({ src, frameTimestamp, frameDuration, slot, }: {
    src: string;
    frameTimestamp: number;
    frameDuration: number | null;
    slot: number;
}) => number;
export declare const getSlotTolerance: (slots: number[]) => number;
export declare const getCachedFrames: ({ src, height, }: {
    src: string;
    height: number | null;
}) => VideoFrameAndLastUsed[];
export declare const findBestCachedFrame: ({ src, frames, timestamp, }: {
    src: string;
    frames: VideoFrameAndLastUsed[];
    timestamp: number;
}) => {
    entry: VideoFrameAndLastUsed | null;
    distance: number;
};
export declare const getSlotsToExtract: ({ filledSlots, src, }: {
    filledSlots: Map<number, number | undefined>;
    src: string;
}) => number[];
export declare const getDurationOfOneFrame: ({ visualizationWidth, aspectRatio, segmentDuration, frameHeight, }: {
    visualizationWidth: number;
    aspectRatio: number;
    segmentDuration: number;
    frameHeight: number;
}) => number;
export declare const calculateTimestampSlots: ({ visualizationWidth, fromSeconds, segmentDuration, aspectRatio, frameHeight, }: {
    visualizationWidth: number;
    fromSeconds: number;
    segmentDuration: number;
    aspectRatio: number;
    frameHeight: number;
}) => number[];
export declare const ensureSlots: ({ filledSlots, naturalWidth, fromSeconds, toSeconds, aspectRatio, frameHeight, }: {
    filledSlots: Map<number, number | undefined>;
    naturalWidth: number;
    fromSeconds: number;
    toSeconds: number;
    aspectRatio: number;
    frameHeight: number;
}) => void;
export declare const drawSlot: ({ frame, ctx, filledSlots, visualizationWidth, timestamp, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, aspectRatio, clearBeforeDraw, }: {
    frame: VideoFrame;
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    filledSlots: Map<number, number | undefined>;
    visualizationWidth: number;
    timestamp: number;
    segmentDuration: number;
    fromSeconds: number;
    devicePixelRatio: number;
    frameHeight: number;
    horizontalOffset: number;
    aspectRatio?: number | null;
    clearBeforeDraw?: boolean;
}) => void;
export declare const fillWithCachedFrames: ({ ctx, naturalWidth, filledSlots, src, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, }: {
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    naturalWidth: number;
    filledSlots: Map<number, number | undefined>;
    src: string;
    segmentDuration: number;
    fromSeconds: number;
    devicePixelRatio: number;
    frameHeight: number;
    horizontalOffset: number;
}) => void;
export declare const fillFrameWhereItFits: ({ frame, src, filledSlots, ctx, visualizationWidth, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, }: {
    frame: VideoFrame;
    src: string;
    filledSlots: Map<number, number | undefined>;
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    visualizationWidth: number;
    segmentDuration: number;
    fromSeconds: number;
    devicePixelRatio: number;
    frameHeight: number;
    horizontalOffset: number;
}) => void;

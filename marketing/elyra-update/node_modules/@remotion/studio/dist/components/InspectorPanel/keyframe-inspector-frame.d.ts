export declare const clampInspectorKeyframeDisplayFrame: ({ durationInFrames, frame, }: {
    readonly durationInFrames: number;
    readonly frame: number;
}) => number;
export declare const getInspectorKeyframeSourceFrame: ({ displayFrame, keyframeDisplayOffset, keyframePlaybackRate, }: {
    readonly displayFrame: number;
    readonly keyframeDisplayOffset: number;
    readonly keyframePlaybackRate: number;
}) => number;

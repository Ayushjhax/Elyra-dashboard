import type { TimelineSceneRange } from './timeline-series-layout';
export declare const TIMELINE_CHILD_TRANSITION_SEAM_Y = 7;
type TimelineSceneClipOptions = {
    readonly sceneRange: TimelineSceneRange | null;
    readonly durationInFrames: number;
    readonly offsetInFrames: number;
    readonly pixelsPerFrame: number;
    readonly height: number;
    readonly seamY: number;
    readonly transitionCutout: {
        readonly top: number;
        readonly height: number;
        readonly radius: number;
        readonly minWidth: number;
    } | null;
    readonly cropHeight: number | null;
};
export declare const getTimelineSceneShape: ({ sceneRange, durationInFrames, offsetInFrames, pixelsPerFrame, height, seamY, transitionCutout, cropHeight, }: TimelineSceneClipOptions, includeOutline: boolean) => {
    readonly clipPath: string;
    readonly path: string;
    readonly edges: {
        readonly left: string | null;
        readonly right: string | null;
    };
} | null;
export declare const getTimelineSceneClipPath: (options: TimelineSceneClipOptions) => string | undefined;
export {};

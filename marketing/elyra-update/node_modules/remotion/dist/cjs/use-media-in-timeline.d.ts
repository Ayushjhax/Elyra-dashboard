import type { LoopDisplay, TSequence } from './CompositionManager.js';
export declare const useBasicMediaInTimeline: ({ src, displayName, trimBefore, trimAfter, playbackRate, sequenceDurationInFrames, mediaStartsAt, loop, muted, }: {
    src: string | undefined;
    displayName: string | null;
    trimBefore: number | undefined;
    trimAfter: number | undefined;
    playbackRate: number;
    sequenceDurationInFrames: number;
    mediaStartsAt: number;
    loop: boolean;
    muted: boolean;
}) => {
    duration: number;
    finalDisplayName: string;
    startMediaFrom: number;
    src: string;
    playbackRate: number;
    muted: boolean;
};
export type BasicMediaInTimelineReturnType = ReturnType<typeof useBasicMediaInTimeline>;
export declare const useMediaInTimelineRegistration: ({ src, mediaType, playbackRate, displayName, id, getStack, showInTimeline, premountDisplay, postmountDisplay, loopDisplay, documentationLink, muted, }: {
    src: string | undefined;
    mediaType: 'audio' | 'video';
    playbackRate: number;
    displayName: string | null;
    id: string;
    getStack: () => string | null;
    showInTimeline: boolean;
    premountDisplay: number | null;
    postmountDisplay: number | null;
    loopDisplay: LoopDisplay | undefined;
    documentationLink: string | null;
    muted: boolean;
}) => {
    automaticOutlineRef: import("react").RefObject<Element | null> | null;
    registration: TSequence | null;
};

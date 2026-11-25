import type { RefObject, SetStateAction } from 'react';
export type TimelineSeek = {
    readonly revision: RefObject<number>;
    readonly seekFrame: (frame: SetStateAction<Record<string, number>>) => void;
    readonly subscribe: (listener: () => void) => () => void;
};
export declare const useTimelineSeek: (setFrame: (frame: SetStateAction<Record<string, number>>) => void) => TimelineSeek;

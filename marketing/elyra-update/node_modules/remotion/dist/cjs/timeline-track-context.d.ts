export type TimelineTrack = {
    readonly id: string;
    readonly name: string;
};
export type TimelineTrackItem = TimelineTrack & {
    readonly role: 'track' | 'clip' | 'transition' | 'overlay';
    readonly seriesOffset: number | null;
};
export declare const TimelineTrackContext: import("react").Context<TimelineTrack | null>;

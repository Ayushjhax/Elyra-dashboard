export type TimelineMediaSource = {
    readonly src: string;
    readonly cacheKey: string;
    readonly requestInit: RequestInit | null;
};
export declare const normalizeTimelineMediaSource: (source: string | TimelineMediaSource) => TimelineMediaSource;
export declare const getTimelineMediaSource: ({ src, requestInit, }: {
    src: string;
    requestInit: RequestInit | null;
}) => Promise<TimelineMediaSource>;

import React from 'react';
export type TimelineSetZoomOptions = {
    anchorFrame: number | null;
    anchorContentX: number | null;
};
type TimelineZoomContextValue = {
    zoom: Record<string, number>;
    setZoom: (videoId: string, prev: (prevZoom: number) => number, options?: TimelineSetZoomOptions) => void;
};
export declare const TimelineZoomCtx: React.Context<TimelineZoomContextValue>;
export declare const TimelineZoomActiveContext: React.Context<boolean>;
export declare const TimelineZoomImperativeContext: React.Context<Pick<TimelineZoomContextValue, "setZoom"> & {
    getZoom: (videoId: string) => number | null;
    beginZoom: () => void;
    endZoom: () => void;
}>;
export declare const TimelineZoomContext: React.FC<{
    readonly children: React.ReactNode;
}>;
export {};

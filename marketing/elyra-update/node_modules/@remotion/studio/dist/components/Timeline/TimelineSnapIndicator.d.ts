import React from 'react';
type UpdateTimelineSnapFrame = (frame: number | null) => void;
export declare const TimelineSnapIndicatorContext: React.Context<React.RefObject<UpdateTimelineSnapFrame> | null>;
export declare const TimelineSnapIndicatorProvider: React.FC<{
    readonly children: React.ReactNode;
}>;
export declare const TimelineSnapIndicator: React.FC;
export {};

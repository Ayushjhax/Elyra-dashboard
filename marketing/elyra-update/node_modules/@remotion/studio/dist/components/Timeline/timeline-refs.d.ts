import React from 'react';
export declare const sliderAreaRef: React.RefObject<HTMLDivElement | null>;
export declare const scrollableRef: React.RefObject<HTMLDivElement | null>;
export declare const timelineVerticalScroll: React.RefObject<HTMLDivElement | null>;
export declare const timelineDurationRef: React.RefObject<{
    getDuration: (durationInFrames: number) => number | null;
} | null>;
export declare const timelineLayerLayoutsRef: {
    current: Map<string, {
        readonly marginLeft: number;
        readonly media: {
            readonly left: number;
            readonly width: number;
        } | null;
    }>;
};

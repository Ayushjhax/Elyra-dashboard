import React from 'react';
export declare const TimelineSequenceMountIndicator: React.FC<{
    readonly from: number;
    readonly displayDurationInFrames: number;
    readonly mountDurationInFrames: number;
    readonly mountType: 'premount' | 'postmount';
    readonly left: number;
    readonly width: number;
}>;

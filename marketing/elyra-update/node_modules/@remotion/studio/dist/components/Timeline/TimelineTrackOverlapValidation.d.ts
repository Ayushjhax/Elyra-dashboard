import React from 'react';
import type { TimelineTrackData } from '../../helpers/get-timeline-sequence-sort-key';
export declare const TimelineTrackOverlapValidation: React.FC<{
    timeline: readonly TimelineTrackData[];
    durationInFrames: number;
    fps: number;
}>;

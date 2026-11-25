import React from 'react';
import type { TimelineTrackWithDisplayGroup } from './timeline-display-groups';
export declare const TimelinePackedTrack: React.FC<{
    readonly track: TimelineTrackWithDisplayGroup;
    readonly items: readonly TimelineTrackWithDisplayGroup[];
    readonly auxiliaryRowOffsets: readonly number[];
    readonly auxiliaryRows: readonly (readonly TimelineTrackWithDisplayGroup[])[];
}>;

import React from 'react';
import type { SequenceNodePathInfo, TimelineTrackData } from '../../helpers/get-timeline-sequence-sort-key';
export declare const SequenceWrapAction: React.FC<{
    readonly nodePathInfo: SequenceNodePathInfo;
    readonly track: TimelineTrackData;
    readonly sourceActionsDisabled: boolean;
    readonly sourceLocation: {
        readonly source: string;
        readonly line: number;
    };
}>;

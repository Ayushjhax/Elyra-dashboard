import type { SequenceNodePathInfo, TimelineTrackData } from '../../helpers/get-timeline-sequence-sort-key';
export declare const findTrackForNodePathInfo: ({ tracks, nodePathInfo, }: {
    readonly tracks: readonly TimelineTrackData[];
    readonly nodePathInfo: SequenceNodePathInfo;
}) => TimelineTrackData | undefined;
export declare const createTrackLookupForNodePathInfo: (tracks: readonly TimelineTrackData[]) => (nodePathInfo: SequenceNodePathInfo) => TimelineTrackData | undefined;

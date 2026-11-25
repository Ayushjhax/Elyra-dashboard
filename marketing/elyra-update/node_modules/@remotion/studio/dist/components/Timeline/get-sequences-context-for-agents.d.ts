import type { SequenceNodePathInfo, TimelineTrackData } from '../../helpers/get-timeline-sequence-sort-key';
export declare const getSequencesContextForAgents: ({ nodePathInfos, tracks, }: {
    readonly nodePathInfos: readonly SequenceNodePathInfo[];
    readonly tracks: readonly TimelineTrackData[];
}) => Promise<string | null>;

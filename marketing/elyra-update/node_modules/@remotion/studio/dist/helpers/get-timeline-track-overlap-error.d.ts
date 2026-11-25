import type { TimelineTrackData } from './get-timeline-sequence-sort-key';
import type { MediaMetadata } from './use-media-metadata';
export declare const getTimelineTrackOverlapError: (timeline: readonly TimelineTrackData[], durationInFrames: number, fps: number, mediaMetadata: ReadonlyMap<string, MediaMetadata | null>) => Error | null;

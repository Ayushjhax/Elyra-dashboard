import type { TimelineTrackWithDisplayGroup } from './timeline-display-groups';
export declare const useSeriesReorder: (items: readonly TimelineTrackWithDisplayGroup[]) => {
    dropIndicatorLeft: number | null;
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
    onPointerDownCapture: (e: React.PointerEvent<HTMLDivElement>) => void;
};

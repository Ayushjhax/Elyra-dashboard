import type React from 'react';
import type { SequenceNodePathInfo } from '../../helpers/get-timeline-sequence-sort-key';
import { type TimelineDraggedKeyframe } from './TimelineKeyframeDragState';
import { type TimelineEasingSelection, type TimelineSelection, type TimelineSelectionInteraction } from './TimelineSelection';
type TimelineKeyframeSelection = TimelineSelection & {
    type: 'keyframe';
};
export declare const getKeyframesForTimelineEasingDrag: ({ currentSelections, interaction, selectionItem, selected, }: {
    readonly currentSelections: readonly TimelineSelection[];
    readonly interaction: TimelineSelectionInteraction;
    readonly selectionItem: TimelineEasingSelection;
    readonly selected: boolean;
}) => TimelineKeyframeSelection[];
export declare const getTimelineSelectionsAfterEasingKeyframeDrag: ({ delta, selections, targets, }: {
    readonly delta: number;
    readonly selections: readonly TimelineSelection[];
    readonly targets: readonly TimelineDraggedKeyframe[];
}) => TimelineSelection[];
export declare const useTimelineKeyframeDrag: ({ frame, nodePathInfo, onSelect, selectable, selected, }: {
    readonly frame: number;
    readonly nodePathInfo: SequenceNodePathInfo;
    readonly onSelect: (interaction?: TimelineSelectionInteraction) => void;
    readonly selectable: boolean;
    readonly selected: boolean;
}) => (e: React.PointerEvent<HTMLButtonElement>) => void;
export declare const useTimelineEasingKeyframeDrag: ({ onSelect, selectable, selected, selectionItem, }: {
    readonly onSelect: (interaction?: TimelineSelectionInteraction) => void;
    readonly selectable: boolean;
    readonly selected: boolean;
    readonly selectionItem: TimelineEasingSelection;
}) => (e: React.PointerEvent<HTMLButtonElement>) => void;
export {};

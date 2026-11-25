import React from 'react';
import type { orderOutlinesForRendering } from './selected-outline-order';
import type { SelectedOutlineDragTarget, SelectedOutlineLayoutTarget, SelectedOutlineTarget } from './selected-outline-types';
import type { TimelineSelection, TimelineSelectionInteraction } from './Timeline/TimelineSelection';
export declare const SelectedOutlineRenderer: React.NamedExoticComponent<{
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly dragging: boolean;
    readonly getAllDragTargets: () => readonly SelectedOutlineDragTarget[];
    readonly getLatestOutlineTargetByKey: (key: string) => SelectedOutlineTarget | undefined;
    readonly outlineTargets: readonly SelectedOutlineLayoutTarget[];
    readonly onDraggingChange: (dragging: boolean) => void;
    readonly onContextMenuOpenChange: (open: boolean) => void;
    readonly onSelect: (item: TimelineSelection, interaction?: TimelineSelectionInteraction) => void;
    readonly scale: number;
    readonly sequences: Parameters<typeof orderOutlinesForRendering>[0]['sequences'];
}>;

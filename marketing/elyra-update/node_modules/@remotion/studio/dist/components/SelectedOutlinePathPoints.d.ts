import React from 'react';
import type { SelectedOutline } from './selected-outline-geometry';
import type { SelectedOutlinePathDragTarget } from './selected-outline-types';
export declare const SelectedOutlinePathPoints: React.FC<{
    readonly outline: SelectedOutline;
    readonly pathDrag: SelectedOutlinePathDragTarget;
    readonly onDraggingChange: (dragging: boolean) => void;
}>;

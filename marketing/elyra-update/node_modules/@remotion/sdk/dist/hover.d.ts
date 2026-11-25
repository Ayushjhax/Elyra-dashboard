import type { Dispatch, SetStateAction } from 'react';
import type { SequenceNodePathInfo } from './get-timeline-sequence-sort-key';
export type CanvasHover = {
    readonly key: string;
    readonly nodePathKey: string;
    readonly source: 'canvas' | 'timeline';
};
export type CanvasHoverController = {
    readonly getSnapshot: () => CanvasHover | null;
    readonly subscribe: (listener: () => void) => () => void;
    readonly setHoveredSequence: Dispatch<SetStateAction<CanvasHover | null>>;
    readonly clear: (source: CanvasHover['source'] | null) => void;
};
export declare const createCanvasHoverController: () => CanvasHoverController;
export declare const useCanvasHover: (controller: CanvasHoverController) => CanvasHover | null;
export declare const useIsCanvasSequenceHovered: (controller: CanvasHoverController, nodePathKey: string | null) => boolean;
export declare const useCanvasSequenceHover: (controller: CanvasHoverController, nodePathInfo: SequenceNodePathInfo | null, source: CanvasHover['source']) => {
    hovered: boolean;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
};

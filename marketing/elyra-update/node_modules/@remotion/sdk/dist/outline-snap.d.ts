import type { CanvasOutline } from './outline-geometry';
export declare const canvasOutlineSnapThresholdPx = 10;
export type CanvasOutlineSnapAxis = 'x' | 'y';
export type CanvasOutlineSnapTargetType = 'canvas-left' | 'canvas-right' | 'canvas-top' | 'canvas-bottom' | 'canvas-horizontal-center' | 'canvas-vertical-center' | 'guide-vertical' | 'guide-horizontal';
export type CanvasOutlineSnapTarget = {
    readonly axis: CanvasOutlineSnapAxis;
    readonly position: number;
    readonly type: CanvasOutlineSnapTargetType;
};
/** A host-defined line in composition pixels that outlines snap to. */
export type CanvasOutlineSnapGuide = {
    readonly orientation: 'horizontal' | 'vertical';
    readonly position: number;
    readonly show: boolean;
};
export type CanvasOutlineSnapEdge = 'left' | 'right' | 'center-x' | 'top' | 'bottom' | 'center-y';
export type CanvasOutlineSnapPoint = {
    readonly distance: number;
    readonly edge: CanvasOutlineSnapEdge;
    readonly target: CanvasOutlineSnapTarget;
};
export type CanvasOutlineSnapResult = {
    readonly activeSnapPoints: readonly CanvasOutlineSnapPoint[];
    readonly snapOffsetX: number | null;
    readonly snapOffsetY: number | null;
};
export declare const getCanvasOutlineSnapTargets: ({ compositionHeight, compositionWidth, guides, }: {
    readonly compositionHeight: number;
    readonly compositionWidth: number;
    readonly guides: readonly CanvasOutlineSnapGuide[];
}) => readonly CanvasOutlineSnapTarget[];
/**
 * Finds the closest snap for the bounding box of the outlines after moving
 * them by the delta. Outlines are in overlay pixels, deltas and the result in
 * composition pixels.
 */
export declare const findCanvasOutlineSnap: ({ allowX, allowY, deltaX, deltaY, outlines, scale, targets, }: {
    readonly allowX: boolean;
    readonly allowY: boolean;
    readonly deltaX: number;
    readonly deltaY: number;
    readonly outlines: readonly CanvasOutline[];
    readonly scale: number;
    readonly targets: readonly CanvasOutlineSnapTarget[];
}) => CanvasOutlineSnapResult;
